import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATE_SCRIPT = fileURLToPath(
  new URL('../templates/_shared/.github/scripts/wait-and-merge.sh', import.meta.url),
);

const REPO_SCRIPT = fileURLToPath(
  new URL('../../../.github/scripts/wait-and-merge.sh', import.meta.url),
);

describe('두 사본의 동일성', () => {
  // 옛 auto-merge.yml 은 "jq 게이트만 같다"를 고정했다 — 주석과 배선은
  // 드리프트해도 통과했고, 실제로 드리프트했다. 저장소판과 템플릿판의
  // 차이(fork 차단·release 디스패치)가 사라진 지금은 파일 전체를 고정할 수
  // 있다. 약한 단언을 유지할 이유가 없다.
  it('저장소판과 템플릿판이 바이트 단위로 같다', () => {
    expect(readFileSync(REPO_SCRIPT, 'utf8')).toBe(readFileSync(TEMPLATE_SCRIPT, 'utf8'));
  });
});

describe('스크립트 배선', () => {
  const script = readFileSync(TEMPLATE_SCRIPT, 'utf8');

  it('rebase 로 머지하고 브랜치를 지운다', () => {
    expect(script).toContain('--rebase');
    expect(script).toContain('--delete-branch');
  });

  it('머지를 판정한 커밋에 고정한다', () => {
    // 게이트와 머지 호출 사이의 잔여 창은 서버만 닫을 수 있다.
    expect(script).toContain('--match-head-commit "$HEAD_SHA"');
  });

  it('모든 gh pr 호출이 --repo 를 넘긴다', () => {
    const calls = script.match(/gh pr [a-z]+ [^\n]*/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain('--repo');
  });

  it('creator 를 주는 복수형 statuses 엔드포인트를 쓴다', () => {
    // 단수형 /status(combined)는 creator 를 주지 않아 신원 검사가 구조적으로
    // 항상 실패한다. 실제로 PR #9 가 그 상태로 영원히 멈춰 있었다.
    expect(script).toContain('/statuses');
    expect(script).not.toMatch(/commits\/\$HEAD_SHA\/status["' ]/);
  });

  it('옵아웃 라벨 이름을 갖는다', () => {
    expect(script).toContain('no-auto-merge');
  });

  it('남아 있는 auto-merge.yml 을 경고한다', () => {
    expect(script).toContain('.github/workflows/auto-merge.yml');
    expect(script).toContain('경고');
  });
});

/**
 * 스크립트에 heredoc 으로 박힌 jq 게이트 프로그램을 꺼낸다.
 *
 * 던지는 것이 요구다 — 추출이 실패했을 때 빈 프로그램을 돌려주면 아래 판정
 * 단언이 전부 공허해진다. "통과하지만 아무것도 막지 못하는 단언"이야말로
 * 이 게이트가 실제로 당한 결함이 테스트를 통과한 이유였다.
 */
const JQ_OPEN = "GATE=$(cat <<'JQ'\n";
const JQ_CLOSE = '\nJQ\n)';

function extractGate(script: string, source: string): string {
  const opened = script.indexOf(JQ_OPEN);
  if (opened === -1) throw new Error(`${source}: jq 게이트 시작 지점을 찾지 못했다`);
  const from = opened + JQ_OPEN.length;
  const closed = script.indexOf(JQ_CLOSE, from);
  if (closed === -1) throw new Error(`${source}: jq 게이트 끝 지점을 찾지 못했다`);
  const program = script.slice(from, closed);
  if (program.trim() === '') throw new Error(`${source}: jq 게이트가 비어 있다`);
  return program;
}

const GATE = extractGate(readFileSync(TEMPLATE_SCRIPT, 'utf8'), 'templates/_shared');

/** 게이트를 실제 jq 로 돌려 판정 한 줄을 받는다. */
function verdict(pr: unknown): string {
  // 픽스처는 저장소 밖에 만든다. 안에 만들면 자동 WIP 커밋 훅이 집어간다.
  const dir = mkdtempSync(join(tmpdir(), 'devbak-gate-'));
  try {
    const file = join(dir, 'pr.json');
    writeFileSync(file, JSON.stringify(pr));
    return execFileSync('jq', ['-r', '--arg', 'LABEL', 'no-auto-merge', GATE, file], {
      encoding: 'utf8',
    }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HEAD_OID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** `gh pr view --json …` 의 형태에 commitStatuses 를 합친 것. */
function prJson(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD_OID,
    labels: [],
    reviews: [],
    statusCheckRollup: [],
    commitStatuses: [],
    ...over,
  };
}

/** claude-review 통과 신호. creator 까지 있어야 게이트가 센다. */
function claudeStatus(state: string, creator = 'github-actions[bot]'): Record<string, unknown> {
  return { context: 'claude-review', state, creator, id: 1 };
}

function review(
  login: string,
  state: string,
  submittedAt = '2026-08-08T00:00:00Z',
): Record<string, unknown> {
  return { author: { login }, state, submittedAt, authorAssociation: 'OWNER' };
}

const PASSED_CHECK = { name: 'Claude Code Review', status: 'COMPLETED', conclusion: 'SUCCESS' };

describe('머지 게이트 판정 (jq 를 실제로 돌린다)', () => {
  it('claude-review 통과 + 체크 통과면 머지한다', () => {
    expect(
      verdict(
        prJson({
          commitStatuses: [claudeStatus('success')],
          statusCheckRollup: [PASSED_CHECK],
        }),
      ),
    ).toMatch(/^merge:/);
  });

  it('claude-review 신호가 아직 없으면 기다린다', () => {
    // 이 판정이 stop 으로 새면 PR 을 연 직후 스크립트가 곧바로 실패한다 —
    // 리뷰 워크플로는 아직 시작도 하지 않았다.
    expect(verdict(prJson())).toMatch(/^wait:/);
  });

  it('claude-review 가 pending 이면 기다린다', () => {
    expect(verdict(prJson({ commitStatuses: [claudeStatus('pending')] }))).toMatch(/^wait:/);
  });

  it('claude-review 가 failure 면 멈춘다', () => {
    expect(verdict(prJson({ commitStatuses: [claudeStatus('failure')] }))).toMatch(/^stop:/);
  });

  it('creator 가 다른 claude-review 는 통과로 세지 않는다', () => {
    // context 만 보면 statuses:write 를 가진 임의의 앱이 같은 이름으로
    // success 를 심어 리뷰 없이 게이트를 뚫는다.
    const got = verdict(prJson({ commitStatuses: [claudeStatus('success', 'attacker[bot]')] }));
    expect(got).toMatch(/^wait:/);
  });

  it('creator 가 없는 status 는 통과로 세지 않는다', () => {
    const got = verdict(
      prJson({ commitStatuses: [{ context: 'claude-review', state: 'success', id: 1 }] }),
    );
    expect(got).toMatch(/^wait:/);
  });

  it('변경 요청이 있으면 claude-review 통과로도 멈춘다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        reviews: [review('someone', 'CHANGES_REQUESTED')],
      }),
    );
    expect(got).toMatch(/^stop:/);
  });

  it('같은 리뷰어가 DISMISSED 로 철회하면 막지 않는다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        reviews: [
          review('bot', 'CHANGES_REQUESTED', '2026-08-08T00:00:00Z'),
          review('bot', 'DISMISSED', '2026-08-08T01:00:00Z'),
        ],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('승인 뒤의 COMMENTED 를 승인 철회로 오판하지 않는다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        reviews: [
          review('bot', 'CHANGES_REQUESTED', '2026-08-08T00:00:00Z'),
          review('bot', 'DISMISSED', '2026-08-08T01:00:00Z'),
          review('bot', 'COMMENTED', '2026-08-08T02:00:00Z'),
        ],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('진행 중인 체크가 있으면 기다린다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ name: 'CI', status: 'IN_PROGRESS' }],
      }),
    );
    expect(got).toMatch(/^wait:/);
  });

  it('실패한 체크가 있으면 멈춘다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'FAILURE' }],
      }),
    );
    expect(got).toMatch(/^stop:/);
  });

  it('외부 CI 의 Status API 형태(.state)로 진행중을 판정한다', () => {
    // statusCheckRollup 에는 CheckRun(.status/.conclusion)과
    // StatusContext(.state) 두 형태가 섞여 온다. 한쪽만 보면 나머지가
    // 항상 통과로 세어진다.
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ context: 'CodeRabbit', state: 'PENDING' }],
      }),
    );
    expect(got).toMatch(/^wait:/);
  });

  it('외부 CI 의 Status API 형태(.state)로 실패를 판정한다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ context: 'CodeRabbit', state: 'FAILURE' }],
      }),
    );
    expect(got).toMatch(/^stop:/);
  });

  it('draft PR 은 멈춘다', () => {
    expect(verdict(prJson({ isDraft: true, commitStatuses: [claudeStatus('success')] }))).toMatch(
      /^stop:/,
    );
  });

  it('닫힌 PR 은 멈춘다', () => {
    expect(verdict(prJson({ state: 'CLOSED', commitStatuses: [claudeStatus('success')] }))).toMatch(
      /^stop:/,
    );
  });

  it('옵아웃 라벨이 붙어 있으면 멈춘다', () => {
    const got = verdict(
      prJson({ labels: [{ name: 'no-auto-merge' }], commitStatuses: [claudeStatus('success')] }),
    );
    expect(got).toMatch(/^stop:/);
  });

  it('reviews·statusCheckRollup·labels 가 null 이어도 크래시하지 않는다', () => {
    const got = verdict(
      prJson({
        reviews: null,
        statusCheckRollup: null,
        labels: null,
        commitStatuses: [claudeStatus('success')],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('키 자체가 없어도 크래시하지 않는다', () => {
    expect(verdict({ state: 'OPEN', isDraft: false, headRefOid: HEAD_OID })).toMatch(/^wait:/);
  });

  it('작성자가 삭제된 리뷰가 있어도 크래시하지 않는다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        reviews: [{ author: null, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-08T00:00:00Z' }],
      }),
    );
    expect(got).toMatch(/^stop:/);
  });

  it('판정은 세 접두 중 하나로만 시작한다', () => {
    // 스크립트의 case 문이 merge:/stop: 만 분기하고 나머지를 wait 로 다룬다.
    // 새 접두를 만들면 그 판정이 조용히 "계속 기다림"으로 흡수된다.
    const samples = [
      verdict(prJson()),
      verdict(prJson({ isDraft: true })),
      verdict(prJson({ commitStatuses: [claudeStatus('success')] })),
    ];
    for (const got of samples) expect(got).toMatch(/^(merge|wait|stop): /);
  });
});

/**
 * status 를 받아 오는 파이프라인을 스크립트에서 그대로 꺼낸다 — `gh api --jq`
 * 의 프로그램과 그 뒤 `jq -s` 의 프로그램 둘 다.
 *
 * 던지는 것이 요구다. 추출이 실패했을 때 빈 프로그램을 돌려주면 아래 단언이
 * 공허해진다.
 *
 * `.[]` 로 시작하는 것만 잡는다 — 같은 파일의 다른 `--jq`(`gh repo view` 의
 * `.nameWithOwner`)는 따옴표도 `.[` 도 없어 걸리지 않는다.
 */
function extractStatusFetch(script: string, source: string): { perItem: string; reduce: string } {
  const perItem = /--jq '(\.\[\][^']*)'/.exec(script);
  if (perItem === null) throw new Error(`${source}: status 조회의 gh api --jq 를 찾지 못했다`);
  const reduce = /\| jq -s '([^']*)'/.exec(script);
  if (reduce === null) throw new Error(`${source}: status 조회의 jq -s 를 찾지 못했다`);
  return { perItem: perItem[1], reduce: reduce[1] };
}

interface FetchedStatus {
  context: string;
  state: string;
  creator: string;
  id: number;
}

/** 스크립트에서 꺼낸 두 jq 프로그램을 실제 jq 로 이어 돌린다. */
function runStatusFetch(response: unknown): FetchedStatus[] {
  const { perItem, reduce } = extractStatusFetch(
    readFileSync(TEMPLATE_SCRIPT, 'utf8'),
    'templates/_shared',
  );
  const dir = mkdtempSync(join(tmpdir(), 'devbak-status-'));
  try {
    const file = join(dir, 'response.json');
    writeFileSync(file, JSON.stringify(response));
    const perItemOut = execFileSync('jq', ['-c', perItem, file], { encoding: 'utf8' });
    return JSON.parse(
      execFileSync('jq', ['-s', reduce], { input: perItemOut, encoding: 'utf8' }),
    ) as FetchedStatus[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Commit Status 조립 파이프라인', () => {
  // 이 블록이 없어서 dedup 결함이 판정 테스트 20건을 전부 통과했다. 게이트가
  // 무엇을 막는지는 검증됐지만, 게이트에 **무엇이 들어가는지**는 아무도 보지
  // 않고 있었다.

  it('creator 를 살려 낸다 — 게이트의 신원 검사가 통과할 수 있다', () => {
    const got = runStatusFetch([
      {
        context: 'claude-review',
        creator: { login: 'github-actions[bot]' },
        id: 5,
        state: 'success',
      },
    ]);

    expect(got[0]?.creator).toBe('github-actions[bot]');
    expect(got[0]?.state).toBe('success');
  });

  it('creator 가 다른 같은 context 가 정당한 신호를 지우지 않는다', () => {
    // statuses:write 를 가진 임의의 앱이 id 만 더 큰 claude-review status 를
    // 하나 올리는 것으로 정당한 PR 을 영원히 wait: 에 가둘 수 있었다.
    const got = runStatusFetch([
      {
        context: 'claude-review',
        creator: { login: 'github-actions[bot]' },
        id: 5,
        state: 'success',
      },
      { context: 'claude-review', creator: { login: 'attacker[bot]' }, id: 10, state: 'failure' },
    ]);

    expect(got.find((s) => s.creator === 'github-actions[bot]')?.state).toBe('success');
  });

  it('같은 creator 의 옛 success 가 최신 failure 를 이기지 않는다', () => {
    // 축약 자체는 여전히 필요하다. creator 를 키에 넣었다고 이력 전체가
    // 그대로 흘러 들어오면, 옛 success 가 최신 failure 를 덮는다.
    const got = runStatusFetch([
      {
        context: 'claude-review',
        creator: { login: 'github-actions[bot]' },
        id: 5,
        state: 'success',
      },
      {
        context: 'claude-review',
        creator: { login: 'github-actions[bot]' },
        id: 10,
        state: 'failure',
      },
    ]);

    expect(got.filter((s) => s.context === 'claude-review')).toHaveLength(1);
    expect(got[0]?.state).toBe('failure');
  });

  it('creator 가 없는 응답도 크래시하지 않는다', () => {
    const got = runStatusFetch([{ context: 'CodeRabbit', id: 1, state: 'success' }]);

    expect(got[0]?.creator).toBe('');
  });
});

/**
 * `GET /repos/{o}/{r}/commits/{sha}/statuses` 의 **실제 응답 녹화본**.
 *
 * 손으로 지어낸 형태가 아니라 툴킷 저장소 PR #9 의 head 커밋에서 그대로 받은
 * 것이다(필드는 이 파이프라인이 읽는 것만 남겼다). 손으로 지어낸 픽스처가
 * 정확히 그 결함을 숨겼기 때문이다 — "API 가 무엇을 주는가"와 "게이트가
 * 무엇을 받는가" 사이의 이음매가 통째로 검증되지 않고 있었다.
 *
 * CodeRabbit 이 pending 2건 → success 2건으로 쌓여 있는 것도 녹화 그대로다.
 * 축약을 실제 데이터로 검증할 수 있다.
 */
const CLAUDE_BOT = { login: 'github-actions[bot]' };
const RABBIT_BOT = { login: 'coderabbitai[bot]' };

const RECORDED_STATUSES = [
  { context: 'claude-review', creator: CLAUDE_BOT, id: 51_873_194_642, state: 'success' },
  { context: 'CodeRabbit', creator: RABBIT_BOT, id: 51_873_171_385, state: 'success' },
  { context: 'CodeRabbit', creator: RABBIT_BOT, id: 51_873_171_102, state: 'success' },
  { context: 'CodeRabbit', creator: RABBIT_BOT, id: 51_873_143_452, state: 'pending' },
  { context: 'CodeRabbit', creator: RABBIT_BOT, id: 51_873_142_927, state: 'pending' },
];

describe('Commit Status 조립 파이프라인 (실제 응답 녹화본에 돌린다)', () => {
  it('creator 가 살아서 나온다 — 게이트의 신원 검사가 통과할 수 있다', () => {
    const got = runStatusFetch(RECORDED_STATUSES);
    const claude = got.find((s) => s.context === 'claude-review');

    expect(claude, 'claude-review status 가 축약 결과에 없다').toBeDefined();
    // 게이트의 claudeState 가 정확히 이 값을 이 문자열과 비교한다.
    expect(claude?.creator).toBe('github-actions[bot]');
    expect(claude?.state).toBe('success');
  });

  it('컨텍스트별로 최신 하나만 남는다', () => {
    // 복수형 엔드포인트는 이력 전체를 준다. 축약하지 않으면 같은 컨텍스트의
    // 옛 status 가 최신을 이길 수 있다.
    const got = runStatusFetch(RECORDED_STATUSES);

    expect(got.map((s) => s.context).sort()).toEqual(['CodeRabbit', 'claude-review']);
    expect(got.find((s) => s.context === 'CodeRabbit')?.id).toBe(51873171385);
  });
});

/** 이 저장소 자신의 리뷰 워크플로. 템플릿이 아니라 운영 설정이다. */
const TEMPLATE_CLAUDE_REVIEW = fileURLToPath(
  new URL('../templates/_shared/.github/workflows/claude-review.yml', import.meta.url),
);
const REPO_CLAUDE_REVIEW = fileURLToPath(
  new URL('../../../.github/workflows/claude-review.yml', import.meta.url),
);

describe('_shared 리뷰 워크플로', () => {
  async function readReview(): Promise<string> {
    return readFile(TEMPLATE_CLAUDE_REVIEW, 'utf8');
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

  it('통과 신호를 Commit Status 로 남긴다', async () => {
    // Actions 의 GITHUB_TOKEN 으로는 PR 을 승인할 수 없다 — GitHub 이
    // "GitHub Actions is not permitted to approve pull requests" 로 거부한다.
    // 그 토큰을 넘기면 리뷰는 정상적으로 돌고 워크플로도 success 로 끝나지만
    // 승인만 남지 않아 자동 머지가 영원히 오지 않는다. 실패가 초록불 뒤에
    // 숨는 형태라 실행으로는 드러나지 않는다.
    const doc = await readReview();
    expect(doc).toContain('statuses: write');
    expect(doc).toMatch(/statuses\/\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/);
    expect(doc).toContain('context=claude-review');
    // 지시가 있어도 도구가 막혀 있으면 status 를 만들지 못한다.
    expect(doc).toContain('Bash(gh api:*)');
  });

  it('통과할 때 자기 이전 변경 요청을 철회하도록 지시한다', async () => {
    // rejections 판정은 커밋을 가리지 않는데(의도된 fail-safe) 통과 신호는
    // 커밋에 묶인다. 승인 방식일 때는 새 승인이 그 리뷰어의 최신 리뷰가 되어
    // 옛 변경 요청을 덮었지만, status 만 남기면 옛 CHANGES_REQUESTED 가
    // 그대로 남아 고쳐진 PR 이 영원히 막힌다.
    //
    // 이 결함은 **첫 리뷰에서는 드러나지 않는다** — 통과하면 그냥 머지된다.
    // "지적 → 수정 → 재리뷰" 사이클에서만 나타나므로 실행으로 잡기 어렵다.
    const doc = await readReview();
    expect(doc).toContain('/dismissals');
    expect(doc).toContain('event=DISMISS');
    // 최신 1건만 고르면 나머지 변경 요청이 PR 화면에 남는다. 게이트는
    // 리뷰어별 최신만 보므로 판정에는 차이가 없지만, 철회되지 않은 빨간
    // 표시가 "왜 아직 막혀 있나"를 읽는 사람을 혼란시킨다.
    expect(doc).not.toContain('.[-1].id');
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
    // 변경 요청 사유여야 다음 사람이 본다. '변경 요청'만 찾으면 인젝션 방어
    // 블록을 통째로 지워도 --request-changes 안내 문구가 남아 통과한다 —
    // 방어 블록에만 있는 고유 조각으로 본다.
    expect(doc).toContain('조용히 무시하고 넘어가지 않습니다');
  });

  it('승인 판단의 근거를 리뷰 기준과 실제 코드 변경으로 한정한다', async () => {
    const doc = await readReview();
    expect(doc).toContain('.claude/agents/devkit-reviewer.md');
    expect(doc).toContain('실제 코드 변경');
  });

  it('draft PR 이 ready 로 전환되는 것을 듣고, 겹친 실행을 concurrency 로 막는다', async () => {
    // ready_for_review 가 없으면 draft 로 열린 PR 이 ready 로 바뀌어도 재리뷰를
    // 듣는 트리거가 없어 auto-merge 의 "draft PR 입니다" 게이트에서 조용히
    // 멈춘다. concurrency 가 없으면 gh pr review --approve 가 commit_id 없이
    // PR 최신 커밋에 승인을 기록하는 특성 때문에, 겹친 실행이 옛 커밋의 승인을
    // 새 커밋에 남겨 auto-merge 의 onHead 판정이 봇 승인에 대해 깨질 수 있다.
    const doc = await readReview();
    expect(doc).toContain('ready_for_review');
    expect(doc).toMatch(/^concurrency:/m);
    expect(doc).toContain('cancel-in-progress: true');
  });
});

describe('이 저장소판 리뷰 워크플로', () => {
  function read(): string {
    return readFileSync(REPO_CLAUDE_REVIEW, 'utf8');
  }

  it('통과와 실패 양쪽 지시를 모두 갖는다', () => {
    // 승인만 지시하면 문제를 찾았을 때 인라인 코멘트만 남고 리뷰 상태가
    // 안 찍힌다. 그러면 auto-merge 의 "변경 요청 없음" 게이트는 존재하지만
    // 아무것도 막지 못한다.
    const doc = read();
    expect(doc).toContain('--approve');
    expect(doc).toContain('--request-changes');
  });

  it('gh pr review 를 허용 도구로 갖는다', () => {
    // 지시가 있어도 도구가 막혀 있으면 Claude 는 승인도 변경 요청도 못 한다.
    expect(read()).toContain('Bash(gh pr review:*)');
  });

  it('통과 신호를 Commit Status 로 남긴다', () => {
    // Actions 의 GITHUB_TOKEN 으로는 PR 을 승인할 수 없다 — GitHub 이
    // "GitHub Actions is not permitted to approve pull requests" 로 거부한다.
    // 그 토큰을 넘기면 리뷰는 정상적으로 돌고 워크플로도 success 로 끝나지만
    // 승인만 남지 않아 자동 머지가 영원히 오지 않는다. 실패가 초록불 뒤에
    // 숨는 형태라 실행으로는 드러나지 않는다.
    const doc = read();
    expect(doc).toContain('statuses: write');
    expect(doc).toMatch(/statuses\/\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/);
    expect(doc).toContain('context=claude-review');
    // 지시가 있어도 도구가 막혀 있으면 status 를 만들지 못한다.
    expect(doc).toContain('Bash(gh api:*)');
  });

  it('통과할 때 자기 이전 변경 요청을 철회하도록 지시한다', () => {
    // rejections 판정은 커밋을 가리지 않는데(의도된 fail-safe) 통과 신호는
    // 커밋에 묶인다. 승인 방식일 때는 새 승인이 그 리뷰어의 최신 리뷰가 되어
    // 옛 변경 요청을 덮었지만, status 만 남기면 옛 CHANGES_REQUESTED 가
    // 그대로 남아 고쳐진 PR 이 영원히 막힌다.
    //
    // 이 결함은 **첫 리뷰에서는 드러나지 않는다** — 통과하면 그냥 머지된다.
    // "지적 → 수정 → 재리뷰" 사이클에서만 나타나므로 실행으로 잡기 어렵다.
    const doc = read();
    expect(doc).toContain('/dismissals');
    expect(doc).toContain('event=DISMISS');
    // 최신 1건만 고르면 나머지 변경 요청이 PR 화면에 남는다. 게이트는
    // 리뷰어별 최신만 보므로 판정에는 차이가 없지만, 철회되지 않은 빨간
    // 표시가 "왜 아직 막혀 있나"를 읽는 사람을 혼란시킨다.
    expect(doc).not.toContain('.[-1].id');
  });

  it('프롬프트 인젝션 방어 지시를 갖는다', () => {
    // 이 리뷰의 승인 하나가 자동 머지를 통과시키고 그 머지가 패키지 게시로
    // 이어진다. diff·PR 제목·본문·커밋 메시지는 전부 공격자 통제 입력이다.
    // '변경 요청'만 찾으면 인젝션 방어 블록을 통째로 지워도 --request-changes
    // 안내 문구가 남아 통과한다 — 방어 블록에만 있는 고유 조각으로 본다.
    const doc = read();
    expect(doc).toContain('검토 대상 데이터');
    expect(doc).toContain('조용히 무시하고 넘어가지 않습니다');
  });

  it('프롬프트가 참조하는 리뷰 기준 문서가 실제로 존재한다', () => {
    // 경로가 어긋나면 Claude 는 기준을 못 읽고 자기 판단으로 승인하는데,
    // 워크플로는 초록불로 끝나 아무도 모른다. 경로를 여기에 손으로 박지
    // 않고 프롬프트에서 뽑아 검증한다 — 박으면 그것 자체가 두 번째 사본이
    // 되어 드리프트 대상이 된다.
    const matched = /(\.claude\/agents\/[\w-]+\.md)/.exec(read());
    if (matched === null) {
      throw new Error('프롬프트에 리뷰 기준 문서 경로가 없다');
    }
    const target = fileURLToPath(new URL(`../../../${matched[1]}`, import.meta.url));
    expect(existsSync(target), `${matched[1]} 이 저장소에 없다`).toBe(true);
  });

  it('draft PR 이 ready 로 전환되는 것을 듣고, 겹친 실행을 concurrency 로 막는다', () => {
    // 템플릿판과 같은 이유. 이 저장소판은 머지가 곧바로 release.yml 디스패치를
    // 거쳐 패키지 게시로 이어지므로, 겹친 실행이 옛 커밋의 승인을 새 커밋에
    // 남기는 결함은 여기서 더 위험하다.
    const doc = read();
    expect(doc).toContain('ready_for_review');
    expect(doc).toMatch(/^concurrency:/m);
    expect(doc).toContain('cancel-in-progress: true');
  });
});
