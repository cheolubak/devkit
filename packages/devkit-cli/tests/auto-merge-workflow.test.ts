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

/** `gh pr view --json state,isDraft,labels,reviews,statusCheckRollup` 의 형태. */
function prJson(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: 'OPEN',
    isDraft: false,
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
): Record<string, unknown> {
  return { author: { login }, state, authorAssociation, submittedAt };
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
          { author: null, state: 'APPROVED', authorAssociation: 'NONE', submittedAt: '2026-08-07T00:00:00Z' },
          reviewBy('owner', 'APPROVED', 'OWNER'),
        ],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });
});

describe('두 auto-merge.yml 사본의 게이트 동일성', () => {
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
});
