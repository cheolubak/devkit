import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATE_SCRIPT = fileURLToPath(
  new URL('../templates/_shared/.github/scripts/wait-and-merge.sh', import.meta.url),
);

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
