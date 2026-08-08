import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const TEMPLATE_COMMAND = fileURLToPath(
  new URL('../templates/_shared/.claude/commands/merge.md', import.meta.url),
);

// 저장소판. 스크립트와 마찬가지로 템플릿판과 바이트 단위로 같아야 한다 — 둘
// 다르면 아무도 모르는 채로 드리프트한다. 이 상수가 없던 동안 저장소판
// merge.md 는 어떤 단언에도 걸리지 않은 채 "우연히 동일"했다.
const REPO_COMMAND = fileURLToPath(new URL('../../../.claude/commands/merge.md', import.meta.url));

// 두 사본 모두에 같은 단언을 돌린다. 한쪽만 검증하면 다른 쪽의 드리프트가
// 조용히 남는다 — 아래 '두 사본의 동일성' 이 그것을 바이트 단위로도
// 잡아내지만, 내용 단언까지 양쪽에 걸어야 어느 사본이 무엇을 어겼는지가
// 실패 메시지에 바로 드러난다.
describe.each([
  ['templates/_shared', TEMPLATE_COMMAND],
  ['저장소판', REPO_COMMAND],
])('/merge 커맨드 (%s)', (_label, commandPath) => {
  it('스크립트를 bash 로 부른다', async () => {
    // 실행 비트는 보존되지 않는다 — copyOverlay 의 collectTree 가 내용만
    // 읽어 writeFile 로 쓴다. `./script.sh` 로 부르면 소비자 프로젝트에서
    // Permission denied 로 죽는다.
    const doc = await readFile(commandPath, 'utf8');
    expect(doc).toContain('bash "$(git rev-parse --show-toplevel)/.github/scripts/wait-and-merge.sh"');
    expect(doc).not.toMatch(/(?<!bash )\.\/\.github\/scripts/);
  });

  it('판정 로직을 다시 적지 않는다', async () => {
    // 게이트가 두 곳에 적히면 반드시 어긋난다. 커맨드는 부르고 보고할 뿐이다.
    const doc = await readFile(commandPath, 'utf8');
    expect(doc).not.toContain('statusCheckRollup');
    expect(doc).not.toContain('commitStatuses');
  });

  it('실패했을 때 고치지 말고 보고하라고 명시한다', async () => {
    const doc = await readFile(commandPath, 'utf8');
    expect(doc).toContain('멈추고');
  });

  it('frontmatter 에 description 이 있다', async () => {
    const doc = await readFile(commandPath, 'utf8');
    expect(doc).toMatch(/^---\ndescription: .+\n---\n/);
  });

  it('스크립트를 절대경로로 부른다', async () => {
    // cwd 가 저장소 루트가 아니면(하위 패키지, monorepo 의 apps/web 등)
    // 상대경로 호출은 파일을 못 찾고 죽는다.
    const doc = await readFile(commandPath, 'utf8');
    expect(doc).toContain('git rev-parse --show-toplevel');
  });

  it('부르는 사람에게 PR 확인을 요구한다', async () => {
    // 이 설계가 뺀 방어(신원 검증·trusted·커밋 고정)의 유일한 대체물은
    // 사람이 세션 앞에 있다는 것이다. 그 사람에게 무엇이 요구되는지가
    // 문서에 없으면 그 전제 자체가 아무 데도 적히지 않은 것과 같다.
    const doc = await readFile(commandPath, 'utf8');
    expect(doc).toContain('부르기 전에');
  });
});

describe('두 사본의 동일성', () => {
  // 옛 auto-merge.yml 은 "jq 게이트만 같다"를 고정했다 — 주석과 배선은
  // 드리프트해도 통과했고, 실제로 드리프트했다. 저장소판과 템플릿판의
  // 차이(fork 차단·release 디스패치)가 사라진 지금은 파일 전체를 고정할 수
  // 있다. 약한 단언을 유지할 이유가 없다.
  it('저장소판과 템플릿판 스크립트가 바이트 단위로 같다', () => {
    expect(readFileSync(REPO_SCRIPT, 'utf8')).toBe(readFileSync(TEMPLATE_SCRIPT, 'utf8'));
  });

  it('저장소판과 템플릿판 /merge 커맨드가 바이트 단위로 같다', () => {
    // F2(절대경로 호출)·F9(사람 확인 요구)를 고치며 한쪽만 고치면 이 단언이
    // 없는 한 아무도 모른다 — 스크립트는 이미 강화돼 있었지만 그것을 부르는
    // 진입점은 그렇지 않았다.
    expect(readFileSync(REPO_COMMAND, 'utf8')).toBe(readFileSync(TEMPLATE_COMMAND, 'utf8'));
  });
});

/**
 * 인자 파싱 결과를 실제 셸 실행으로 검증한다.
 *
 * 인자 오류는 gh 호출보다 앞에서 끝나므로 네트워크·인증 없이 스크립트를 그대로
 * 돌릴 수 있다. 이 블록이 잡으려는 결함은 텍스트 검사로는 안 드러났다 —
 * `--timeout` 만 주고 값을 안 주면 `${2:-}` 가 빈 문자열을 조용히 받고
 * `shift 2` 가 `set -e` 아래에서 아무 출력 없이 rc=1 로 죽었고(usage 의 계약은
 * 사용법 오류 exit 2), `--timeout abc` 는 DEADLINE 계산의 산술 확장이 문자열을
 * 변수명으로 재귀 확장하려다 `set -u` 에 걸려 "unbound variable" 로 죽었다.
 * 종료 코드만 보면 "죽었다"와 "사용법 오류를 알렸다"를 구분할 수 없으므로
 * stderr 메시지까지 함께 본다.
 */
function runScript(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('bash', [TEMPLATE_SCRIPT, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('인자 파싱 (스크립트를 실제로 실행한다)', () => {
  it('인자가 없으면 exit 2, 사용법을 알린다', () => {
    const got = runScript([]);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('PR 번호가 필요합니다');
    expect(got.stderr).toContain('사용법:');
  });

  it('--timeout 에 값이 없으면 exit 2', () => {
    const got = runScript(['42', '--timeout']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('--timeout 에 값이 필요합니다');
  });

  it('--timeout abc 는 exit 2', () => {
    const got = runScript(['42', '--timeout', 'abc']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('--timeout 은 0 이상의 정수여야 합니다');
  });

  it('--interval 에 값이 없으면 exit 2', () => {
    const got = runScript(['42', '--interval']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('--interval 에 값이 필요합니다');
  });

  it('--interval abc 는 exit 2', () => {
    const got = runScript(['42', '--interval', 'abc']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('--interval 은 1 이상의 정수여야 합니다');
  });

  it('--interval 0 은 exit 2 (busy-loop 방지, A1)', () => {
    // --interval 0 은 sleep 0 이 되어 지연 없이 gh API 를 두들기는 바쁜
    // 루프를 만든다. --timeout 0 과 달리 0 을 허용하지 않는다.
    const got = runScript(['42', '--interval', '0']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('--interval 은 1 이상의 정수여야 합니다: 0');
  });

  it('PR 번호가 숫자가 아니면 exit 2 (A2)', () => {
    const got = runScript(['abc']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('PR 번호는 양의 정수여야 합니다: abc');
  });

  it('PR 번호 0 은 exit 2 (A2)', () => {
    const got = runScript(['0']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('PR 번호는 1 이상이어야 합니다: 0');
  });

  it('--help 는 exit 0 이고 사용법을 stdout 에 낸다', () => {
    const got = runScript(['--help']);
    expect(got.status).toBe(0);
    expect(got.stdout).toContain('사용법:');
  });

  it('알 수 없는 옵션은 exit 2', () => {
    const got = runScript(['42', '--bogus']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('알 수 없는 옵션');
  });

  it('PR 번호를 두 개 주면 exit 2', () => {
    const got = runScript(['42', '43']);
    expect(got.status).toBe(2);
    expect(got.stderr).toContain('PR 번호는 하나만 받습니다');
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

  it('외부 CI 의 Status API 형태(.state)로 통과를 판정한다', () => {
    // .state 만 있는 항목(StatusContext)이 SUCCESS 면 통과해야 한다 —
    // .conclusion 이 없다는 이유로 차단되면 정당한 외부 CI 가 전부 막힌다.
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ context: 'CodeRabbit', state: 'SUCCESS' }],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('완료된 CheckRun 의 conclusion 이 SKIPPED 면 통과한다', () => {
    // 경로 필터로 건너뛴 워크플로가 SKIPPED 로 완료되는 것은 매우 흔하다.
    // 이것을 막으면 자신과 무관한 워크플로를 가진 정당한 PR 이 전부 막힌다.
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ name: 'docs-only', status: 'COMPLETED', conclusion: 'SKIPPED' }],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('완료된 CheckRun 의 conclusion 이 NEUTRAL 이면 통과한다', () => {
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ name: 'optional', status: 'COMPLETED', conclusion: 'NEUTRAL' }],
      }),
    );
    expect(got).toMatch(/^merge:/);
  });

  it('완료된 CheckRun 의 conclusion 이 STALE 이면 멈춘다', () => {
    // CodeRabbit 은 SUCCESS 만 허용하라고 지적했지만, 거부 목록이 아니라
    // 허용 목록(SUCCESS·SKIPPED·NEUTRAL)으로 고쳤다. STALE 은 그 허용
    // 목록에 없으므로 여전히 막힌다.
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'STALE' }],
      }),
    );
    expect(got).toMatch(/^stop:/);
  });

  it('알려지지 않은 conclusion 값은 멈춘다(fail-safe)', () => {
    // 거부 목록이었다면 GitHub 이 새 conclusion 값을 추가할 때마다 그 값이
    // 허용 목록 갱신 없이 조용히 통과했다. 허용 목록이므로 모르는 값은
    // 자동으로 차단된다.
    const got = verdict(
      prJson({
        commitStatuses: [claudeStatus('success')],
        statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'FUTURE_VALUE' }],
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
    // 안 찍힌다. 그러면 wait-and-merge.sh 의 "변경 요청 없음" 게이트는 존재하지만
    // 아무것도 막지 못한다 — 나중에 통과 신호(Commit Status)가 하나 찍히면 그대로 머지된다.
    const doc = await readReview();
    // '--approve' 리터럴만 찾으면 "승인(--approve)은 쓰지 않습니다"라는
    // 부정문 안에서도 통과해 아무것도 막지 못한다 — 실제로 쓰지 않는다는
    // 설명 문장이 있는지를 본다.
    expect(doc).toMatch(/승인\(--approve\)은 쓰지 않습니다/);
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
    // 통과 신호(Commit Status)만 남지 않아 머지 게이트가 영원히 열리지 않는다.
    // 실패가 초록불 뒤에 숨는 형태라 실행으로는 드러나지 않는다.
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
    // 이 리뷰가 남기는 Commit Status 하나가 머지 게이트를 통과시킨다(게이트는
    // claude-review 의 success 하나로 판정하고, creator 가 github-actions[bot]
    // 인 것만 신뢰한다). 그런데 이 프롬프트가 읽는 diff·PR 제목·PR 본문·
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
    // 듣는 트리거가 없어 wait-and-merge.sh 의 "draft PR 입니다" 게이트에서 조용히
    // 멈춘다. concurrency 가 없어도 판정 자체는 깨지지 않는다 — Commit Status 는
    // 실행이 읽은 SHA 에 정확히 묶인다. 그래도 겹친 실행은 이미 지나간 커밋을
    // 리뷰하며 토큰과 시간을 낭비하므로 취소한다.
    const doc = await readReview();
    expect(doc).toContain('ready_for_review');
    expect(doc).toMatch(/^concurrency:/m);
    expect(doc).toContain('cancel-in-progress: true');
  });

  it('pull_request_target 을 쓰지 않는다', async () => {
    // fork PR 방어는 지금 전부 암묵적이다 — pull_request 트리거라 fork PR 에는
    // 시크릿이 안 흐르고, CLAUDE_CODE_OAUTH_TOKEN 이 비어 claude-review status
    // 가 아예 안 만들어지고, 게이트는 그것을 wait: 로 보다가 타임아웃으로
    // 막는다(fail-safe). pull_request_target 으로 바뀌는 순간 그 방어가
    // 조용히 사라지고 게이트는 리뷰되지 않은 fork PR 을 통과시킨다.
    //
    // `on:` 의 실제 트리거 키만 본다 — 파일 전체에서 문자열을 찾으면 이
    // 위험을 설명하는 주석 자신(방금 쓴 이 텍스트 포함)이 그 문자열을
    // 담고 있어 항상 걸린다.
    const doc = await readReview();
    const trigger = /^on:\n\s*([\w_]+):/m.exec(doc);
    expect(trigger, 'on: 트리거 키를 찾지 못했다').not.toBeNull();
    expect(trigger?.[1]).toBe('pull_request');
  });

  it('통과 신호보다 변경 요청 철회를 먼저 하도록 지시한다', async () => {
    // wait-and-merge.sh 의 게이트는 rejections(변경 요청 존재)를 claudeState
    // 보다 먼저 검사하고, stop: 판정은 재시도 없이 즉시 exit 1 한다. 통과
    // 신호를 먼저 남기고 철회를 나중에 하면, 그 사이의 짧은 창을 폴링이
    // 관측했을 때 이미 지적이 해소된 PR 이 옛 CHANGES_REQUESTED 때문에
    // 영구 실패한다(사람이 다시 머지를 불러야 한다). 철회를 먼저 끝내면 그
    // 창에서는 claudeState 가 비어 wait: 로만 떨어지고 wait: 는 재시도되므로
    // 문제가 사라진다.
    const doc = await readReview();
    expect(doc).toContain('/dismissals');
    expect(doc).toContain('state=success');
    expect(doc.indexOf('/dismissals')).toBeLessThan(doc.indexOf('state=success'));
  });
});

describe('이 저장소판 리뷰 워크플로', () => {
  function read(): string {
    return readFileSync(REPO_CLAUDE_REVIEW, 'utf8');
  }

  it('통과와 실패 양쪽 지시를 모두 갖는다', () => {
    // 승인만 지시하면 문제를 찾았을 때 인라인 코멘트만 남고 리뷰 상태가
    // 안 찍힌다. 그러면 wait-and-merge.sh 의 "변경 요청 없음" 게이트는 존재하지만
    // 아무것도 막지 못한다.
    const doc = read();
    // '--approve' 리터럴만 찾으면 "승인(--approve)은 쓰지 않습니다"라는
    // 부정문 안에서도 통과해 아무것도 막지 못한다 — 실제로 쓰지 않는다는
    // 설명 문장이 있는지를 본다.
    expect(doc).toMatch(/승인\(--approve\)은 쓰지 않습니다/);
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
    // 통과 신호(Commit Status)만 남지 않아 머지 게이트가 영원히 열리지 않는다.
    // 실패가 초록불 뒤에 숨는 형태라 실행으로는 드러나지 않는다.
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
    // 이 리뷰가 남기는 Commit Status 하나가 머지 게이트를 통과시키고 그 머지가
    // 패키지 게시로 이어진다. diff·PR 제목·본문·커밋 메시지는 전부 공격자 통제 입력이다.
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
    // 템플릿판과 같은 이유. 이 저장소판은 머지(main push)가 곧바로 release.yml
    // 을 깨워 패키지 게시로 이어지므로, 겹친 실행이 옛 커밋의 승인을 새 커밋에
    // 남기는 결함은 여기서 더 위험하다.
    const doc = read();
    expect(doc).toContain('ready_for_review');
    expect(doc).toMatch(/^concurrency:/m);
    expect(doc).toContain('cancel-in-progress: true');
  });

  it('pull_request_target 을 쓰지 않는다', () => {
    // 템플릿판과 같은 이유 — fork PR 방어(fail-safe)가 pull_request 트리거에
    // 암묵적으로 얹혀 있다. `on:` 의 실제 트리거 키만 본다(이유는 템플릿판
    // 단언 참조 — 위험을 설명하는 주석 자신이 문자열을 담고 있다).
    const doc = read();
    const trigger = /^on:\n\s*([\w_]+):/m.exec(doc);
    expect(trigger, 'on: 트리거 키를 찾지 못했다').not.toBeNull();
    expect(trigger?.[1]).toBe('pull_request');
  });

  it('통과 신호보다 변경 요청 철회를 먼저 하도록 지시한다', () => {
    // 템플릿판과 같은 이유 — wait-and-merge.sh 의 게이트는 rejections 를
    // claudeState 보다 먼저 검사하고 stop: 은 재시도 없이 즉시 실패한다.
    // 철회가 통과 신호보다 늦으면, 그 사이 창을 폴링이 관측했을 때 이미
    // 해소된 PR 이 영구 실패한다(이유는 템플릿판 단언 참조).
    const doc = read();
    expect(doc).toContain('/dismissals');
    expect(doc).toContain('state=success');
    expect(doc.indexOf('/dismissals')).toBeLessThan(doc.indexOf('state=success'));
  });
});

/**
 * PATH 앞에 가짜 `gh` 를 놓고 wait-and-merge.sh 를 통째로 실행한다.
 *
 * 위의 '인자 파싱'은 gh 호출 전에 끝나는 경로만 실제로 돌리고, '머지 게이트
 * 판정'은 jq 게이트만 따로 돌린다. 폴링 루프·재시도·기본 브랜치 검사·머지
 * 호출 자체는 지금까지 텍스트로만 읽었다 — CodeRabbit 과 이 브랜치의 최종
 * 리뷰가 둘 다 이 빈틈을 지적했다. 가짜 gh 는 실제 gh CLI 의 관련 서브커맨드만
 * 흉내 내되, `--jq` 필터는 인자로 받은 문자열을 진짜 jq 로 돌린다 — 필터
 * 자체가 바뀌면 이 가짜도 그 변화를 따라가야 테스트가 계속 의미를 갖는다.
 */
interface FakeGh {
  dir: string;
  calls(): string[];
  writePr(n: number | 'last', pr: Record<string, unknown>): void;
  writeStatuses(n: number | 'last', statuses: unknown[]): void;
  /**
   * `target` 호출의 **몇 번째 호출인가**(1부터, 성공·실패 가리지 않고 센다)를
   * `callNumbers` 에 나열된 번호일 때 실패(exit 1)시킨다. poll.count 를 쓰지
   * 않는 이유는 poll.count 가 `pr view` 성공에서만 증가해, 실패 자체를 셀 수
   * 없기 때문이다 — 별도 카운터(`<target>.calls`)로 raw 호출 수를 센다.
   */
  failCalls(target: 'pr-view' | 'statuses', callNumbers: number[]): void;
}

function makeFakeGh(repo: string): FakeGh {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-fake-gh-'));
  writeFileSync(join(dir, 'repo.txt'), `${repo}\n`);
  writeFileSync(join(dir, 'calls.log'), '');

  const script = `#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
printf '%s\\n' "$*" >> "$DIR/calls.log"

# 실패 주입: $1 은 카운터·설정 파일 접두사(pr-view 또는 statuses). 이 호출이
# 몇 번째인지(raw, 성공/실패 무관)를 세어 fail-$1.calls 에 그 번호가 있으면
# exit 1 로 죽는다 — 실제 gh 가 네트워크 순단·502 로 죽는 것을 흉내 낸다.
fail_if_due() {
  local ep="$1"
  local n
  n=$(( $(cat "$DIR/$ep.calls" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$DIR/$ep.calls"
  if [ -f "$DIR/fail-$ep.calls" ] && grep -qx "$n" "$DIR/fail-$ep.calls"; then
    exit 1
  fi
}

case "$1" in
  repo)
    cat "$DIR/repo.txt"
    ;;
  api)
    case "$2" in
      *auto-merge.yml)
        # 기본 브랜치에 없다고 가정한다(F1 검사 통과, 경고 없음).
        exit 1
        ;;
      */statuses)
        fail_if_due statuses
        N=$(cat "$DIR/poll.count" 2>/dev/null || echo 1)
        FILTER=""
        prev=""
        for a in "$@"; do
          if [ "$prev" = "--jq" ]; then FILTER="$a"; fi
          prev="$a"
        done
        FIXTURE="$DIR/statuses-$N.json"
        [ -f "$FIXTURE" ] || FIXTURE="$DIR/statuses-last.json"
        jq -c "$FILTER" "$FIXTURE"
        ;;
      *)
        echo "fake gh: unhandled api $2" >&2
        exit 1
        ;;
    esac
    ;;
  pr)
    case "$2" in
      view)
        fail_if_due pr-view
        N=$(( $(cat "$DIR/poll.count" 2>/dev/null || echo 0) + 1 ))
        echo "$N" > "$DIR/poll.count"
        FIXTURE="$DIR/pr-$N.json"
        [ -f "$FIXTURE" ] || FIXTURE="$DIR/pr-last.json"
        cat "$FIXTURE"
        ;;
      merge)
        exit 0
        ;;
      *)
        echo "fake gh: unhandled pr $2" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "fake gh: unhandled $1" >&2
    exit 1
    ;;
esac
`;
  const ghPath = join(dir, 'gh');
  writeFileSync(ghPath, script);
  chmodSync(ghPath, 0o755);

  return {
    dir,
    calls: () =>
      readFileSync(join(dir, 'calls.log'), 'utf8')
        .split('\n')
        .filter((line) => line.length > 0),
    writePr: (n, pr) => writeFileSync(join(dir, `pr-${n}.json`), JSON.stringify(pr)),
    writeStatuses: (n, statuses) =>
      writeFileSync(join(dir, `statuses-${n}.json`), JSON.stringify(statuses)),
    failCalls: (target, callNumbers) =>
      writeFileSync(join(dir, `fail-${target}.calls`), `${callNumbers.join('\n')}\n`),
  };
}

function runFullScript(
  fake: FakeGh,
  args: string[],
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('bash', [TEMPLATE_SCRIPT, ...args], {
      encoding: 'utf8',
      // 가짜 gh 를 실제 gh 보다 앞에 두되, bash·jq·mktemp·date 등은 그대로
      // 시스템 PATH 에서 찾아야 하므로 대체가 아니라 앞에 붙인다.
      env: { ...process.env, PATH: `${fake.dir}:${process.env.PATH}` },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

const FAKE_REPO = 'acme/widgets';
const FAKE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CLAUDE_SUCCESS_STATUS = [
  { context: 'claude-review', creator: { login: 'github-actions[bot]' }, id: 1, state: 'success' },
];

describe('스크립트 전체 실행 (가짜 gh 를 PATH 에 놓고 통째로 돌린다)', () => {
  it('wait: 에서 merge: 로 전이하며 실제로 머지를 호출한다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // 첫 폴링: claude-review 신호 없음 → wait. 둘째 폴링: 통과 → merge.
      fake.writePr(1, prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses(1, []);
      fake.writePr(2, prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses(2, CLAUDE_SUCCESS_STATUS);

      const got = runFullScript(fake, ['7', '--interval', '1', '--timeout', '30']);

      expect(got.status).toBe(0);
      expect(got.stdout).toContain('wait: claude-review 신호가 아직 없습니다');
      expect(got.stdout).toContain('merge:');
      expect(got.stdout).toContain('머지했습니다 (#7');

      // 머지가 실제로 호출됐는지는 종료 코드만으로 알 수 없다 — 가짜 gh 의
      // 호출 기록으로 증명한다. 게이트가 읽은 head 커밋에 고정됐는지도 함께.
      const mergeCall = fake.calls().find((c) => c.startsWith('pr merge'));
      expect(mergeCall, '머지 호출이 기록에 없다').toBeDefined();
      expect(mergeCall).toContain(' 7 ');
      expect(mergeCall).toContain(`--match-head-commit ${FAKE_SHA}`);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  it('stop: 이면 머지를 부르지 않고 exit 1 한다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      fake.writePr(
        'last',
        prJson({ headRefOid: FAKE_SHA, reviews: [review('someone', 'CHANGES_REQUESTED')] }),
      );
      fake.writeStatuses('last', []);

      const got = runFullScript(fake, ['7', '--interval', '1', '--timeout', '30']);

      expect(got.status).toBe(1);
      expect(got.stdout).toContain('stop: 변경 요청이 1건 있습니다');
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(false);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  it('타임아웃이면 exit 1 하고 마지막 사유를 출력한다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // 'last' 만 두면 몇 번을 폴링하든 claude-review 신호가 계속 없다 —
      // wait: 에서 절대 벗어나지 못하고 타임아웃까지 간다.
      fake.writePr('last', prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses('last', []);

      const got = runFullScript(fake, ['7', '--timeout', '1', '--interval', '1']);

      expect(got.status).toBe(1);
      expect(got.stderr).toContain('타임아웃(1초)');
      expect(got.stderr).toContain('wait: claude-review 신호가 아직 없습니다');
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(false);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  it('--dry-run 은 판정이 merge: 여도 실제로 머지하지 않는다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      fake.writePr('last', prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses('last', CLAUDE_SUCCESS_STATUS);

      const got = runFullScript(fake, ['7', '--dry-run', '--interval', '1', '--timeout', '30']);

      expect(got.status).toBe(0);
      expect(got.stdout).toContain('merge:');
      expect(got.stdout).toContain('--dry-run — 머지하지 않았습니다.');
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(false);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  // 아래 세 건은 FAILS 재시도 카운터(연속 실패 시 중단, 성공 시 리셋)를
  // 실행으로 고정한다. 지금까지의 4건은 gh pr view · gh api …/statuses 가
  // 매 폴링마다 항상 성공하는 경로만 돌아, 재시도 분기 자체는 텍스트로만
  // 읽혀 있었다(직전 커밋 메시지의 "재시도에 실행 테스트를 더했다"는 주장과
  // 실제 커버리지가 어긋나 있었다).
  it('조회가 1~2회 실패해도 재시도해 결국 머지한다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // gh pr view 의 첫 호출과 gh api …/statuses 의 첫 호출을 각각 한 번씩
      // 실패시킨다 — 두 조회 분기를 모두 건드려야 나머지 재시도 경로가
      // 무검증으로 남지 않는다.
      fake.failCalls('pr-view', [1]);
      fake.failCalls('statuses', [1]);

      // pr view 호출#2 에서 처음 성공(poll.count=1). 이 폴링은 뒤이은
      // statuses 호출#1 이 실패해 verdict 까지 못 가고 재시도로 넘어간다.
      fake.writePr(1, prJson({ headRefOid: FAKE_SHA }));
      // pr view 호출#3 에서 다시 성공(poll.count=2), statuses 호출#2 도
      // 성공해 통과 신호를 읽고 merge: 로 떨어진다.
      fake.writePr(2, prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses(2, CLAUDE_SUCCESS_STATUS);

      const got = runFullScript(fake, ['7', '--interval', '1', '--timeout', '30']);

      expect(got.status).toBe(0);
      expect(got.stdout).toContain('merge:');
      expect(got.stdout).toContain('머지했습니다 (#7');
      // 연속 실패가 2회에서 멈췄으므로 중단 메시지는 나오지 않는다.
      expect(got.stderr).not.toContain('연속 3회 실패');

      const mergeCall = fake.calls().find((c) => c.startsWith('pr merge'));
      expect(mergeCall, '머지 호출이 기록에 없다').toBeDefined();
      expect(mergeCall).toContain(`--match-head-commit ${FAKE_SHA}`);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  it('연속 3회 실패 시 머지를 부르지 않고 exit 1 하며, stop: 과 구분되는 사유를 남긴다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // gh pr view 가 처음 세 번 연속 실패한다.
      fake.failCalls('pr-view', [1, 2, 3]);
      // 4번째 이후는 정상 응답(그리고 claude-review 신호는 없는 wait: 상태)을
      // 준비해 둔다 — 재시도 상한이 실제로 3인지를 메시지 문자열이 아니라
      // "정확히 3번만 gh pr view 를 불렀다"로 고정하기 위해서다. 상한이 3보다
      // 크게 바뀌면 3번째 실패 뒤에도 재시도가 이어져 이 폴백 픽스처를 읽고
      // wait: 로 계속 돌다가 타임아웃으로 빠진다 — 호출 횟수와 중단 메시지
      // 둘 다 어긋나야 이 변이가 실제로 잡힌다.
      fake.writePr('last', prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses('last', []);

      const got = runFullScript(fake, ['7', '--interval', '1', '--timeout', '5']);

      expect(got.status).toBe(1);
      expect(got.stderr).toContain('연속 3회 실패했습니다');
      // "게이트가 막은 것이 아니다" 취지의 문구가 있어야 stop: 판정(게이트가
      // 실제로 막은 것)과 혼동되지 않는다.
      expect(got.stderr).toContain('게이트가 막은 것이 아닙니다');
      expect(got.stdout).not.toContain('stop:');
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(false);
      // 정확히 3번만 시도하고 멈췄는지 — 상한이 3이 아니면 이 수가 어긋난다.
      expect(fake.calls().filter((c) => c.startsWith('pr view')).length).toBe(3);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  it('성공이 연속 실패 카운터를 되돌려, 2회+2회 실패로는 중단되지 않는다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // gh pr view 호출 #1,#2 실패 → #3 성공(리셋) → #4,#5 실패 → #6 성공.
      // FAILS 가 "연속" 이 아니라 누적이었다면 2+2=4 가 되어 3회 문턱에서
      // 이미 중단됐을 것이다 — 이 순서가 리셋 로직을 정확히 겨눈다.
      fake.failCalls('pr-view', [1, 2, 4, 5]);

      // pr view #3 성공(poll.count=1) → statuses 는 매번 성공하되, 아직
      // claude-review 신호가 없어 wait: 로 남아 루프가 계속돈다.
      fake.writePr(1, prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses(1, []);
      // pr view #6 성공(poll.count=2) → statuses 도 성공하고 통과 신호가
      // 있어 merge: 로 떨어진다.
      fake.writePr(2, prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses(2, CLAUDE_SUCCESS_STATUS);

      const got = runFullScript(fake, ['7', '--interval', '1', '--timeout', '30']);

      expect(got.status).toBe(0);
      expect(got.stderr).not.toContain('연속 3회 실패');
      expect(got.stdout).toContain('merge:');
      expect(got.stdout).toContain('머지했습니다 (#7');
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(true);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  // 아래 세 건은 `--timeout` 계약이 **조회 성공 여부와 무관하게** 지켜지는지를
  // 고정한다. 재시도 경로(`continue`)가 데드라인 검사를 건너뛰면 `--timeout` 은
  // 조회가 성공한 폴링에서만 의미를 갖는다.
  //
  // `--timeout 0` 으로 겨눈다. 상한 3 은 스크립트에 박혀 있어 테스트가 키울 수
  // 없고, 시간을 재는 방식은 CI 에서 흔들린다. 데드라인이 처음부터 지나 있으면
  // 결함 유무가 **종료 사유 문자열**로 갈린다 — 건너뛰면 재시도가 상한까지 가
  // "연속 3회 실패", 지나가면 곧바로 "타임아웃(0초)".

  it('--timeout 0 은 한 번만 확인하고 타임아웃한다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // 조회는 매번 성공하되 claude-review 신호가 없어 wait: 에 머문다.
      fake.writePr('last', prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses('last', []);

      const got = runFullScript(fake, ['7', '--timeout', '0', '--interval', '1']);

      expect(got.status).toBe(1);
      expect(got.stderr).toContain('타임아웃(0초)');
      expect(got.stderr).toContain('wait: claude-review 신호가 아직 없습니다');
      // "한 번만" 이 요점이다 — 데드라인 검사가 루프 맨 앞으로 가면 조회를
      // 아예 안 하고 끝나 이 수가 0 이 된다.
      expect(fake.calls().filter((c) => c.startsWith('pr view')).length).toBe(1);
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(false);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  it('gh pr view 가 실패한 폴링도 데드라인 검사를 지나 타임아웃으로 끝난다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // 조회가 계속 실패한다. 재시도 경로가 데드라인을 건너뛰면 상한 3 까지
      // 가서 "연속 3회 실패" 로 끝나고, 지나가면 첫 실패 직후 타임아웃한다.
      fake.failCalls('pr-view', [1, 2, 3, 4, 5]);
      fake.writePr('last', prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses('last', []);

      const got = runFullScript(fake, ['7', '--timeout', '0', '--interval', '1']);

      expect(got.status).toBe(1);
      expect(got.stderr).toContain('타임아웃(0초)');
      expect(got.stderr).not.toContain('연속 3회 실패');
      expect(fake.calls().filter((c) => c.startsWith('pr view')).length).toBe(1);
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(false);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  it('gh api …/statuses 가 실패한 폴링도 데드라인 검사를 지나 타임아웃으로 끝난다', () => {
    const fake = makeFakeGh(FAKE_REPO);
    try {
      // pr view 는 성공하고 statuses 만 계속 실패한다 — 두 재시도 경로 중
      // 나머지 한쪽도 같은 가드를 받는지 따로 겨눈다.
      fake.failCalls('statuses', [1, 2, 3, 4, 5]);
      fake.writePr('last', prJson({ headRefOid: FAKE_SHA }));
      fake.writeStatuses('last', []);

      const got = runFullScript(fake, ['7', '--timeout', '0', '--interval', '1']);

      expect(got.status).toBe(1);
      expect(got.stderr).toContain('타임아웃(0초)');
      expect(got.stderr).not.toContain('연속 3회 실패');
      // `api` 로만 거르면 안 된다 — 스크립트는 auto-merge.yml 잔존 검사로도
      // `gh api` 를 부른다. statuses 호출만 골라 센다.
      expect(fake.calls().filter((c) => c.includes('/statuses')).length).toBe(1);
      expect(fake.calls().some((c) => c.startsWith('pr merge'))).toBe(false);
    } finally {
      rmSync(fake.dir, { recursive: true, force: true });
    }
  });
});
