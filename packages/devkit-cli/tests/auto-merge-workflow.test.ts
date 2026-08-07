import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));
const WORKFLOWS_DIR = `${TEMPLATES_DIR}_shared/.github/workflows`;
const AUTO_MERGE = `${WORKFLOWS_DIR}/auto-merge.yml`;
const CLAUDE_REVIEW = `${WORKFLOWS_DIR}/claude-review.yml`;

/**
 * 이 저장소 자신의 auto-merge.yml. 템플릿이 아니라 운영 설정이므로 동작을
 * 여기서 테스트하지는 않는다(설계 9.3절) — **템플릿과 같은지만** 본다.
 * 두 파일의 게이트는 손으로 옮긴 사본이라 드리프트가 실제로 한 번 났고,
 * 그쪽 사본이 곧바로 패키지를 게시하는 저장소의 것이다.
 */
const REPO_AUTO_MERGE = fileURLToPath(
  new URL('../../../.github/workflows/auto-merge.yml', import.meta.url),
);

/**
 * 워크플로 YAML 의 최상위 `name:` 값. 따옴표를 벗긴다.
 *
 * 던지는 것이 요구다 — 없을 때 빈 문자열을 돌려주면 아래 "이름이 일치한다"
 * 단언이 `''` 끼리 비교해 항상 통과하는 공허한 단언이 된다.
 */
function workflowName(yaml: string): string {
  const matched = /^name:[ \t]*(.+)$/m.exec(yaml);
  if (matched === null) throw new Error('워크플로에 최상위 name: 이 없다');
  return matched[1].trim().replace(/^['"]|['"]$/g, '');
}

async function readAutoMerge(): Promise<string> {
  return readFile(AUTO_MERGE, 'utf8');
}

describe('_shared 자동 머지 워크플로', () => {
  it('파일이 존재하고 claude-review.yml 과 함께 놓인다', async () => {
    const entries = await readdir(WORKFLOWS_DIR);
    expect(entries).toContain('auto-merge.yml');
    expect(entries).toContain('claude-review.yml');
  });

  it('트리거가 workflow_run 과 pull_request_review 둘 다다', async () => {
    // 하나만 두면 승인 경로 하나가 조용히 죽는다. GITHUB_TOKEN 이 일으킨
    // 이벤트는 새 워크플로 실행을 만들지 않으므로, Claude 봇의 승인은
    // pull_request_review 를 발화시키지 못한다(설계 2.1절).
    const doc = await readAutoMerge();
    expect(doc).toContain('workflow_run:');
    expect(doc).toContain('pull_request_review:');
  });

  it('workflow_run 이 듣는 이름이 claude-review.yml 의 name 과 일치한다', async () => {
    // 이름이 어긋나면 워크플로는 **에러 없이** 영원히 실행되지 않는다.
    // 실행으로는 절대 드러나지 않으므로 여기서 결합을 고정한다.
    const [auto, review] = await Promise.all([
      readAutoMerge(),
      readFile(CLAUDE_REVIEW, 'utf8'),
    ]);
    const reviewName = workflowName(review);
    const line = /^\s*workflows:[ \t]*(.+)$/m.exec(auto);
    expect(line, 'auto-merge.yml 에 workflows: 줄이 없다').not.toBeNull();
    expect(line?.[1]).toContain(reviewName);
  });

  it('rebase 로 머지하고 브랜치를 지운다', async () => {
    const doc = await readAutoMerge();
    expect(doc).toContain('--rebase');
    expect(doc).toContain('--delete-branch');
    expect(doc).not.toContain('--squash');
    expect(doc).not.toContain('--merge');
  });

  it('옵아웃 라벨 이름을 갖는다', async () => {
    const doc = await readAutoMerge();
    expect(doc).toContain('no-auto-merge');
  });

  it('머지와 리뷰 조회에 필요한 권한을 선언한다', async () => {
    const doc = await readAutoMerge();
    expect(doc).toContain('contents: write');
    expect(doc).toContain('pull-requests: write');
    expect(doc).toContain('checks: read');
  });

  it('자기 자신을 workflowName 으로 체크 집계에서 뺀다', async () => {
    // CheckRun 의 .name 은 워크플로가 아니라 **잡** 이름이다. .name 으로
    // 거르면 잡 이름과 어긋나 자기 자신이 집계에 남고, 그 체크는 항상
    // IN_PROGRESS 이므로 영원히 머지되지 않는다(설계 5.5절).
    const doc = await readAutoMerge();
    expect(doc).toContain('.workflowName');
    // 이름을 손으로 박으면 워크플로 name: 만 바꿔도 필터가 조용히 무력해진다.
    expect(doc).toContain('${{ github.workflow }}');
  });

  it('reviewDecision 을 쓰지 않는다', async () => {
    // 그 값은 브랜치 보호의 required reviews 설정에 좌우된다. 설정이 없는
    // 저장소에서는 비어 나오고, 새로 만든 프로젝트는 전부 그 상태다 —
    // 쓰면 영원히 머지되지 않는다(설계 5.4절).
    // 필드가 아니라 '값'을 금지하는 것이므로 점 표기(.reviewDecision)로
    // 실사용만 본다 — 이유를 설명하는 코멘트 자체가 이 단어를 언급하므로
    // 순수 부분 문자열 검사는 코멘트에 걸려 항상 실패한다.
    const doc = await readAutoMerge();
    expect(doc).not.toContain('.reviewDecision');
  });

  it('PR 코드를 체크아웃하지 않는다', async () => {
    // workflow_run 과 pull_request_review 는 base 저장소 컨텍스트에서
    // 시크릿과 쓰기 토큰을 들고 도는 권한 있는 트리거다. head 를 체크아웃해
    // 무언가 실행하면 fork PR 이 임의 코드로 그 토큰을 가져간다(설계 5.2절).
    // uses: 스텝으로 실제로 붙였는지만 본다 — 붙이지 말라는 코멘트 자체가
    // 이 문자열을 언급하므로 순수 부분 문자열 검사는 코멘트에 걸려 항상
    // 실패한다.
    //
    // 부분 문자열이 아니라 정규식인 이유: `uses: 'actions/checkout@v4'` 처럼
    // 따옴표를 쓰거나 콜론 뒤 공백이 둘이면 부분 문자열 단언은 놓친다.
    // 이 단언이 지키는 것이 이 워크플로의 가장 중요한 보안 불변식이다.
    const doc = await readAutoMerge();
    expect(doc).not.toMatch(/uses:\s*['"]?actions\/checkout/);
  });

  it('모든 gh pr 호출이 --repo 를 넘긴다', async () => {
    // 체크아웃이 없어 git remote 가 없다 — --repo 없이는 gh 가 대상
    // 저장소를 추론하지 못하고 죽는다.
    const doc = await readAutoMerge();
    const calls = doc.split('\n').filter((line) => line.includes('gh pr '));
    expect(calls.length, 'gh pr 호출이 하나도 없다').toBeGreaterThan(0);
    for (const call of calls) {
      expect(call, `--repo 가 없다: ${call.trim()}`).toContain('--repo');
    }
  });

  it('head SHA 를 조회하고 머지를 그 커밋에 고정한다', async () => {
    // 브랜치 보호가 없으면 새 푸시가 기존 승인을 무효화하지 않는다. 게이트가
    // 리뷰를 읽는 시점과 gh pr merge 가 머지하는 시점 사이에 head 가 바뀌면
    // 커밋 A 에 달린 승인으로 커밋 B 가 머지된다. jq 판정(승인이 현재 head 에
    // 달렸는가)에 더해, 서버 측에서 한 번 더 거부하도록 --match-head-commit 을
    // 넘긴다 — 읽기와 머지 사이의 잔여 창을 닫는 것은 GitHub 만 할 수 있다.
    const doc = await readAutoMerge();
    expect(doc).toContain('headRefOid');
    expect(doc).toMatch(/gh pr merge .*--match-head-commit/);
  });
});

/**
 * YAML 안에 인라인으로 박힌 jq 게이트 프로그램을 꺼낸다.
 *
 * 던지는 것이 요구다 — 추출이 실패했을 때 빈 프로그램을 돌려주면 아래 판정
 * 단언이 전부 공허해진다. "통과하지만 아무것도 막지 못하는 단언"이야말로 이
 * 게이트가 실제로 당한 결함(C1)이 테스트를 통과한 이유였다.
 */
const JQ_OPEN = `VERDICT=$(jq -r --arg SELF "$SELF" --arg LABEL "$OPT_OUT_LABEL" '`;
const JQ_CLOSE = `' pr.json)`;

function extractGate(yaml: string, source: string): string {
  const opened = yaml.indexOf(JQ_OPEN);
  if (opened === -1) throw new Error(`${source}: jq 게이트 시작 지점을 찾지 못했다`);
  const from = opened + JQ_OPEN.length;
  const closed = yaml.indexOf(JQ_CLOSE, from);
  if (closed === -1) throw new Error(`${source}: jq 게이트 끝 지점을 찾지 못했다`);
  const program = yaml.slice(from, closed);
  if (program.trim() === '') throw new Error(`${source}: jq 게이트가 비어 있다`);
  return program;
}

const GATE = extractGate(readFileSync(AUTO_MERGE, 'utf8'), 'templates/_shared');

/** 게이트를 실제 jq 로 돌려 판정 한 줄을 받는다. */
function verdict(pr: unknown, self = 'Auto Merge'): string {
  // 픽스처는 저장소 밖에 만든다. 저장소 안에 만들면 자동 WIP 커밋 훅이
  // 집어간다.
  const dir = mkdtempSync(join(tmpdir(), 'devbak-gate-'));
  try {
    const file = join(dir, 'pr.json');
    writeFileSync(file, JSON.stringify(pr));
    return execFileSync(
      'jq',
      ['-r', '--arg', 'SELF', self, '--arg', 'LABEL', 'no-auto-merge', GATE, file],
      { encoding: 'utf8' },
    ).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** PR 의 현재 head 커밋. 픽스처 전체가 이 값을 기준으로 승인을 고정한다. */
const HEAD_OID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
/** 승인이 달렸던 **이전** 커밋. 그 승인은 현재 head 를 머지시키면 안 된다. */
const OLD_OID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** `gh pr view --json state,isDraft,headRefOid,labels,reviews,statusCheckRollup` 의 형태. */
function prJson(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD_OID,
    labels: [],
    reviews: [],
    statusCheckRollup: [],
    ...over,
  };
}

function reviewBy(
  login: string,
  state: string,
  authorAssociation: string,
  submittedAt = '2026-08-07T00:00:00Z',
  commitOid: string | null = HEAD_OID,
): Record<string, unknown> {
  return {
    author: { login },
    state,
    authorAssociation,
    submittedAt,
    commit: commitOid === null ? null : { oid: commitOid },
  };
}

const passingCheck = {
  workflowName: 'CI',
  name: 'test',
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
};

describe('자동 머지 게이트 판정 (jq 를 실제로 돌린다)', () => {
  // 이 블록의 존재 이유. 이 파일의 나머지 단언은 전부 문자열 검사라
  // `--rebase` 라는 **글자**가 있는지만 본다 — 게이트가 무엇을 막는지는
  // 하나도 보지 않는다. C1(외부인 승인으로 머지됨)을 찾은 것도 테스트가
  // 아니라 사람이 jq 를 손으로 돌려서였다.

  it('외부인의 승인은 승인으로 세지 않는다', () => {
    // C1 회귀 방어. 공개 저장소에서는 읽기 권한만 있는 임의의 사용자가 승인
    // 리뷰를 남길 수 있고, pull_request_review 는 fork PR 에 대해서도 base
    // 저장소의 쓰기 토큰으로 도는 권한 있는 트리거다. 신원을 보지 않으면
    // 인터넷의 아무나가 승인 한 건으로 main 머지에 도달한다.
    const got = verdict(
      prJson({ reviews: [reviewBy('stranger', 'APPROVED', 'NONE')] }),
    );
    expect(got).toMatch(/^skip:/);
  });

  it('COLLABORATOR 승인 1건 + 체크 통과면 머지한다', () => {
    const got = verdict(
      prJson({
        reviews: [reviewBy('mate', 'APPROVED', 'COLLABORATOR')],
        statusCheckRollup: [passingCheck],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('OWNER 승인 1건이면 머지한다', () => {
    const got = verdict(prJson({ reviews: [reviewBy('owner', 'APPROVED', 'OWNER')] }));
    expect(got).toMatch(/^merge:/);
  });

  it('github-actions[bot] 의 승인은 authorAssociation 과 무관하게 신뢰한다', () => {
    // fork 에서 온 PR 에 대해 pull_request 트리거의 GITHUB_TOKEN 은 읽기
    // 전용으로 강등되므로 claude-review.yml 이 fork PR 을 승인하는 것 자체가
    // 불가능하다. 봇 승인이 존재한다는 사실 자체가 same-repo PR 임을 뜻한다.
    const got = verdict(
      prJson({ reviews: [reviewBy('github-actions[bot]', 'APPROVED', 'NONE')] }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('외부인의 변경 요청은 신뢰 승인이 있어도 막는다', () => {
    // 승인과 변경 요청의 비대칭은 의도다. 막는 쪽은 fail-safe 이므로
    // 외부인의 변경 요청도 존중한다 — 잘못 막아도 사람이 지우면 그만이지만,
    // 잘못 머지하면 되돌릴 수 없다.
    const got = verdict(
      prJson({
        reviews: [
          reviewBy('owner', 'APPROVED', 'OWNER'),
          reviewBy('stranger', 'CHANGES_REQUESTED', 'NONE'),
        ],
      }),
    );
    expect(got).toContain('변경 요청');
    expect(got).toMatch(/^skip:/);
  });

  it('승인이 0건이면 막는다', () => {
    expect(verdict(prJson())).toBe('skip: 승인이 없습니다');
  });

  it('draft PR 은 막는다', () => {
    const got = verdict(
      prJson({ isDraft: true, reviews: [reviewBy('owner', 'APPROVED', 'OWNER')] }),
    );
    expect(got).toBe('skip: draft PR 입니다');
  });

  it('옵아웃 라벨이 붙어 있으면 막는다', () => {
    const got = verdict(
      prJson({
        labels: [{ name: 'no-auto-merge' }],
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER')],
      }),
    );
    expect(got).toMatch(/^skip:/);
    expect(got).toContain('no-auto-merge');
  });

  it('실패한 체크가 있으면 막는다', () => {
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER')],
        statusCheckRollup: [
          { workflowName: 'CI', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' },
        ],
      }),
    );
    expect(got).toContain('실패한 체크');
  });

  it('진행 중인 체크가 있으면 막는다', () => {
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER')],
        statusCheckRollup: [
          { workflowName: 'CI', name: 'test', status: 'IN_PROGRESS', conclusion: null },
        ],
      }),
    );
    expect(got).toContain('진행 중');
  });

  it('자기 자신의 진행 중 체크는 무시한다', () => {
    // 이 워크플로 실행 자체가 head SHA 에 체크 런을 만든다. 빼지 않으면 그
    // 체크가 항상 IN_PROGRESS 라 영원히 머지되지 않는다 — 데드락이다.
    // 제외 기준은 잡 이름(.name = 'merge')이 아니라 .workflowName 이다.
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER')],
        statusCheckRollup: [
          { workflowName: 'Auto Merge', name: 'merge', status: 'IN_PROGRESS', conclusion: null },
        ],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('같은 사람이 변경 요청 뒤 승인하면 승인이 이긴다', () => {
    const got = verdict(
      prJson({
        reviews: [
          reviewBy('owner', 'CHANGES_REQUESTED', 'OWNER', '2026-08-07T01:00:00Z'),
          reviewBy('owner', 'APPROVED', 'OWNER', '2026-08-07T02:00:00Z'),
        ],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('승인 뒤의 COMMENTED 를 승인 철회로 오판하지 않는다', () => {
    const got = verdict(
      prJson({
        reviews: [
          reviewBy('owner', 'APPROVED', 'OWNER', '2026-08-07T01:00:00Z'),
          reviewBy('owner', 'COMMENTED', 'OWNER', '2026-08-07T02:00:00Z'),
        ],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('reviews·statusCheckRollup·labels 가 null 이어도 크래시하지 않는다', () => {
    const got = verdict(
      prJson({ labels: null, reviews: null, statusCheckRollup: null }),
    );
    expect(got).toBe('skip: 승인이 없습니다');
  });

  it('키 자체가 없어도 크래시하지 않는다', () => {
    const got = verdict({ state: 'OPEN', isDraft: false });
    expect(got).toBe('skip: 승인이 없습니다');
  });

  it('닫힌 PR 은 막는다', () => {
    const got = verdict(
      prJson({ state: 'CLOSED', reviews: [reviewBy('owner', 'APPROVED', 'OWNER')] }),
    );
    expect(got).toMatch(/^skip:/);
    expect(got).toContain('CLOSED');
  });

  it('작성자가 삭제된 리뷰가 있어도 크래시하지 않는다', () => {
    // 계정이 지워지면 .author 가 null 로 온다. 신뢰 판정이 .author.login 을
    // 보므로 여기서 죽으면 게이트 전체가 고장난다.
    const got = verdict(
      prJson({
        reviews: [
          {
            author: null,
            state: 'APPROVED',
            authorAssociation: 'NONE',
            submittedAt: '2026-08-07T00:00:00Z',
            commit: { oid: HEAD_OID },
          },
          reviewBy('owner', 'APPROVED', 'OWNER'),
        ],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('이전 커밋에 달린 승인으로는 현재 head 를 머지하지 않는다', () => {
    // TOCTOU 회귀 방어. main 에 브랜치 보호가 없어 새 푸시가 기존 승인을
    // 무효화하지 않는다 — 경합조차 필요 없다. 승인 뒤에 푸시하면 리뷰
    // 워크플로가 새 커밋에 대해 다시 돌고, 그 완료가 workflow_run 을
    // 발화시켜 옛 승인으로 새 커밋이 머지된다.
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER', '2026-08-07T00:00:00Z', OLD_OID)],
      }),
    );
    expect(got).toMatch(/^skip:/);
    expect(got).toContain('head');
  });

  it('commit 을 확인할 수 없는 승인은 세지 않는다', () => {
    // 오래된 리뷰나 API 형태 차이로 commit 이 없거나 null 로 올 수 있다.
    // 확인할 수 없으면 막는 쪽이 안전하다.
    const got = verdict(
      prJson({
        reviews: [
          { author: { login: 'owner' }, state: 'APPROVED', authorAssociation: 'OWNER', submittedAt: '2026-08-07T00:00:00Z' },
        ],
      }),
    );
    expect(got).toMatch(/^skip:/);
  });

  it('commit 이 null 인 승인도 세지 않는다', () => {
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER', '2026-08-07T00:00:00Z', null)],
      }),
    );
    expect(got).toMatch(/^skip:/);
  });

  it('이전 커밋에 달린 변경 요청은 커밋과 무관하게 막는다', () => {
    // 비대칭은 의도다. 승인은 head 에 고정하지만 CHANGES_REQUESTED 는 어느
    // 커밋에 대한 것이든 막는다 — 막는 쪽이 fail-safe 다.
    const got = verdict(
      prJson({
        reviews: [
          reviewBy('owner', 'APPROVED', 'OWNER', '2026-08-07T01:00:00Z'),
          reviewBy('stranger', 'CHANGES_REQUESTED', 'NONE', '2026-08-07T00:00:00Z', OLD_OID),
        ],
      }),
    );
    expect(got).toContain('변경 요청');
  });

  it('신뢰 승인 뒤 같은 사람의 DISMISSED 가 오면 승인이 철회된다', () => {
    // DISMISSED 는 집계에 포함하되 승인으로 세지 않는다. 빼면 그 사람의
    // 최신 리뷰가 옛 APPROVED 로 남아 철회가 반영되지 않는다.
    const got = verdict(
      prJson({
        reviews: [
          reviewBy('owner', 'APPROVED', 'OWNER', '2026-08-07T01:00:00Z'),
          reviewBy('owner', 'DISMISSED', 'OWNER', '2026-08-07T02:00:00Z'),
        ],
      }),
    );
    expect(got).toBe('skip: 승인이 없습니다');
  });

  it('외부 CI 의 Status API 형태(.state)로 진행중을 판정한다', () => {
    // statusCheckRollup 은 두 형태가 섞여 온다 — Actions 는 CheckRun
    // (.status/.conclusion/.workflowName), 외부 CI 는 StatusContext(.state).
    // StatusContext 에는 .status 자체가 없어 CheckRun 경로만 보면 진행 중인
    // 외부 CI 를 통과시킨다.
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER')],
        statusCheckRollup: [{ state: 'PENDING' }],
      }),
    );
    expect(got).toContain('진행 중');
  });

  it('외부 CI 의 Status API 형태(.state)로 실패를 판정한다', () => {
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER')],
        statusCheckRollup: [{ state: 'FAILURE' }],
      }),
    );
    expect(got).toContain('실패한 체크');
  });

  it('외부 CI 가 SUCCESS 면 통과시킨다', () => {
    const got = verdict(
      prJson({
        reviews: [reviewBy('owner', 'APPROVED', 'OWNER')],
        statusCheckRollup: [{ state: 'SUCCESS' }],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });
});

/**
 * 이 저장소판 워크플로에만 있는 fork 차단 분기를 YAML 에서 꺼낸다.
 *
 * jq 게이트 **바깥**의 셸 로직이라 verdict() 로는 돌릴 수 없다 — 두 사본의 jq
 * 프로그램이 글자 그대로 같아야 하므로 이 검사는 의도적으로 셸에 있다.
 *
 * extractGate() 와 같은 이유로 던진다 — 추출에 실패했을 때 빈 스크립트를
 * 돌리면 아래 단언이 전부 공허해진다.
 */
const FORK_GATE_OPEN = `if [ "$(jq -r '.isCrossRepository' pr.json)" = 'true' ]; then`;

function extractForkGate(yaml: string, source: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line.includes(FORK_GATE_OPEN));
  if (start === -1) throw new Error(`${source}: fork 차단 분기를 찾지 못했다`);
  const end = lines.findIndex((line, i) => i > start && line.trim() === 'fi');
  if (end === -1) throw new Error(`${source}: fork 차단 분기의 fi 를 찾지 못했다`);
  // YAML 블록 스칼라의 들여쓰기를 벗긴다. 그대로 두면 bash 는 돌지만
  // 스크립트가 원문과 다르게 보여 나중에 읽는 사람을 헷갈리게 한다.
  return lines
    .slice(start, end + 1)
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
}

const FORK_GATE = extractForkGate(readFileSync(REPO_AUTO_MERGE, 'utf8'), '.github/workflows');

/** 뽑아낸 fork 분기를 실제 bash 로 돌린다. 통과하면 뒤의 echo 가 실행된다. */
function forkGate(pr: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-fork-'));
  try {
    writeFileSync(join(dir, 'pr.json'), JSON.stringify(pr));
    return execFileSync('bash', ['-c', `set -euo pipefail\n${FORK_GATE}\necho '통과'`], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('이 저장소판의 fork 차단 게이트', () => {
  // 이 저장소의 머지는 곧바로 release.yml 디스패치를 거쳐 패키지 게시로
  // 이어진다. 승인자 신뢰 판정이 틀려도 공급망 경로가 결정적으로 닫히도록
  // 한 겹 더 둔 것이다.

  it('fork 에서 온 PR 이면 스킵한다', () => {
    expect(forkGate({ isCrossRepository: true })).toBe('skip: fork 에서 온 PR 입니다');
  });

  it('같은 저장소의 브랜치면 통과시킨다', () => {
    expect(forkGate({ isCrossRepository: false })).toBe('통과');
  });

  it('--json 목록과 스킵 분기 양쪽에 isCrossRepository 가 있다', () => {
    // 조회 목록에서 빠지면 jq 가 null 을 읽어 분기가 조용히 무력해진다.
    const doc = readFileSync(REPO_AUTO_MERGE, 'utf8');
    expect(doc).toMatch(/--json [^\n]*isCrossRepository/);
    expect(doc).toContain(FORK_GATE_OPEN);
  });

  it('템플릿판에는 fork 차단이 없다', async () => {
    // 의도적 비대칭이다. 생성물은 fork 기여를 자동 머지하고 싶을 수 있고,
    // 그쪽은 머지가 게시로 이어지지 않는다. 템플릿에 이 검사를 넣으면
    // 생성된 프로젝트가 외부 기여를 영원히 막는다.
    const doc = await readAutoMerge();
    expect(doc).not.toContain('isCrossRepository');
  });
});

describe('두 auto-merge.yml 사본의 게이트 동일성', () => {
  it('이 저장소판도 승인을 head 커밋에 고정한다', () => {
    // 게이트 동일성만으로는 부족하다 — headRefOid 조회와
    // --match-head-commit 은 jq 바깥이라 한쪽만 빠져도 동일성 단언은 통과한다.
    const doc = readFileSync(REPO_AUTO_MERGE, 'utf8');
    expect(doc).toMatch(/--json [^\n]*headRefOid/);
    expect(doc).toMatch(/gh pr merge .*--match-head-commit/);
  });

  it('이 저장소판과 템플릿판의 jq 프로그램이 글자 그대로 같다', () => {
    // 템플릿은 다른 저장소로 복사되므로 이 저장소의 composite action 을
    // 참조할 수 없다 — 중복은 의도다. 대신 드리프트를 여기서 막는다.
    // 실제로 한 번의 구현 세션 안에서 손으로 옮기다 주석 한 단어가 어긋났고,
    // 다음엔 isbad 목록이나 pending 조건일 수 있다.
    //
    // 파일이 없으면 던진다 — 조용히 통과하면 관문이 무의미하다.
    const repo = extractGate(readFileSync(REPO_AUTO_MERGE, 'utf8'), '.github/workflows');
    expect(repo).toBe(GATE);
  });
});

describe('_shared 리뷰 워크플로', () => {
  async function readReview(): Promise<string> {
    return readFile(CLAUDE_REVIEW, 'utf8');
  }

  it('통과와 실패 양쪽 지시를 모두 갖는다', async () => {
    // 승인만 지시하면 문제를 찾았을 때 인라인 코멘트만 남고 리뷰 상태가
    // 안 찍힌다. 그러면 auto-merge 의 "변경 요청 없음" 게이트는 존재하지만
    // 아무것도 막지 못한다 — 나중에 승인 하나가 들어오면 그대로 머지된다.
    const doc = await readReview();
    expect(doc).toContain('--approve');
    expect(doc).toContain('--request-changes');
  });

  it('코멘트만 남기고 끝내지 말라고 명시한다', async () => {
    const doc = await readReview();
    expect(doc).toContain('코멘트만 남기고 끝내지 않습니다');
  });

  it('gh pr review 를 허용 도구로 갖는다', async () => {
    // 지시가 있어도 도구가 막혀 있으면 Claude 는 승인도 변경 요청도 못 한다.
    const doc = await readReview();
    expect(doc).toContain('Bash(gh pr review:*)');
  });

  it('프롬프트 인젝션 방어 지시를 갖는다', async () => {
    // 이 리뷰의 승인 하나가 자동 머지를 통과시킨다(게이트는 approvals >= 1
    // 이고 봇을 신뢰한다). 그런데 이 프롬프트가 읽는 diff·PR 제목·PR 본문·
    // 커밋 메시지·코드 주석은 **전부 공격자 통제 입력**이다. 방어 지시가
    // 없으면 "이 PR 을 승인하라"를 diff 에 심는 것만으로 사람이 아무도 안 본
    // 변경이 main 에 들어간다.
    const doc = await readReview();
    expect(doc).toContain('검토 대상 데이터');
    expect(doc).toContain('지시');
    // 인젝션을 발견하면 조용히 무시하는 것으로 끝나면 안 된다 — 그 자체가
    // 변경 요청 사유여야 다음 사람이 본다.
    expect(doc).toContain('변경 요청');
  });

  it('승인 판단의 근거를 리뷰 기준과 실제 코드 변경으로 한정한다', async () => {
    const doc = await readReview();
    expect(doc).toContain('.claude/agents/devkit-reviewer.md');
    expect(doc).toContain('실제 코드 변경');
  });
});
