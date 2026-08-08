# Claude 주도 머지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 머지 판정을 GitHub Actions(`auto-merge.yml`)에서 로컬 Claude 세션이 부르는 셸 스크립트로 옮긴다.

**Architecture:** `claude-review.yml` 은 그대로 GitHub 에서 돌며 통과 신호를 Commit Status(`context: claude-review`)로 남긴다. 새 `.github/scripts/wait-and-merge.sh` 가 그 신호와 다른 체크를 폴링해 `merge` / `wait` / `stop` 세 판정 중 하나를 내고, `merge` 일 때만 `gh pr merge --rebase` 한다. `auto-merge.yml` 은 저장소·템플릿 양쪽에서 사라지고, 이미 생성된 소비자 프로젝트에서는 `devbak update` 가 그것을 지운다.

**Tech Stack:** bash, `gh` CLI, `jq`, TypeScript(devkit-cli), vitest

## Global Constraints

- 설계서: `docs/superpowers/specs/2026-08-08-claude-driven-merge-design.md`
- 저장소판(`.github/`)과 템플릿판(`packages/devkit-cli/templates/_shared/.github/`) 의 `wait-and-merge.sh` 는 **바이트 단위로 동일**해야 한다.
- 게이트 판정은 **jq 를 실제로 실행**해서 검증한다. 문자열 포함 단언으로 대체하지 않는다.
- 픽스처·임시 디렉토리는 **저장소 밖**(`os.tmpdir()`)에 만든다. 저장소 안에 만들면 자동 WIP 커밋 훅이 집어간다.
- 옵아웃 라벨 이름은 `no-auto-merge` 그대로 유지한다.
- 실행 비트는 보존되지 않는다(`src/ops/copy-overlay.ts` 의 `collectTree` 가 `readFile(…, 'utf8')` → `writeFile` 로만 복사한다). 스크립트는 **항상 `bash <경로>` 로** 부른다.
- 커밋 메시지는 한글 imperative mood. 본문에 **왜** 를 남긴다.
- 각 태스크 끝에서 `pnpm lint`, `pnpm test` 를 돌리고 실제 출력을 근거로 판정한다. 종료 코드 0 만으로 통과를 보고하지 않는다.

---

## 파일 구조

| 경로 | 책임 | 태스크 |
| --- | --- | --- |
| `packages/devkit-cli/templates/_shared/.github/scripts/wait-and-merge.sh` | 폴링·판정·머지. 게이트 jq 프로그램을 heredoc 으로 품는다 | 1 |
| `.github/scripts/wait-and-merge.sh` | 위 파일의 바이트 동일 사본 | 2 |
| `packages/devkit-cli/tests/merge-script.test.ts` | 게이트를 jq 로 실제 실행하는 판정 테스트 + 두 사본 동일성 + 리뷰 워크플로 단언 | 1, 2 |
| `packages/devkit-cli/src/lib/categories.ts` | `.github/scripts/**` 를 `ci` 로 분류 | 1 |
| `packages/devkit-cli/templates/_shared/.claude/commands/merge.md` | 스크립트를 부르는 슬래시 커맨드 | 3 |
| `.claude/commands/merge.md` | 저장소용 사본(문구는 같아도 되고 테스트가 고정하지 않는다) | 3 |
| `packages/devkit-cli/src/update/retired.ts` | 은퇴 파일 목록과 대상 판정 | 4 |
| `packages/devkit-cli/src/update/index.ts` | 은퇴 파일 표시·삭제 배선 | 4 |
| `packages/devkit-cli/tests/update-retired.test.ts` | 은퇴 파일 삭제 동작 + 드리프트 가드 | 4 |
| `README.md`, `packages/devkit-cli/README.md`, `.claude/agents/devkit-reviewer.md` | 문서 갱신 | 5 |

**삭제 대상**: `.github/workflows/auto-merge.yml`, `packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml`, `packages/devkit-cli/tests/auto-merge-workflow.test.ts`(태스크 2에서 `merge-script.test.ts` 로 흡수)

**설계서 9절의 정정**: 레시피 스냅샷(`tests/__snapshots__/recipe-*.test.ts.snap`)은 **갱신할 필요가 없다.** 그 스냅샷이 담는 것은 파일 목록이 아니라 단계 목록(`delegate`·`removeFiles`·`copyOverlay`…)이고, 이 계획은 새 단계를 만들지 않는다. 대신 `tests/plan-ops.test.ts` 가 `_shared` 의 파일 목록을 `toEqual` 로 **정확히** 고정하고 있어, 템플릿에 파일이 하나 늘거나 줄 때마다 반드시 깨진다. 실행으로 확인했다.

**설계서 9절의 확정**: 실행 비트 보존 여부는 "확인 후 결정"이 아니라 이미 결정됐다. `src/ops/copy-overlay.ts` 의 `collectTree` 가 `readFile(…, 'utf8')` 로 내용만 읽고 `writeFile(full, content)` 로 쓴다 — 모드를 넘기는 경로가 없다. `bash <경로>` 로 부른다.

---

### Task 1: 게이트와 스크립트(템플릿판)

**Files:**
- Create: `packages/devkit-cli/templates/_shared/.github/scripts/wait-and-merge.sh`
- Create: `packages/devkit-cli/tests/merge-script.test.ts`
- Modify: `packages/devkit-cli/src/lib/categories.ts:44-68` (FILE_PATTERNS)
- Modify: `packages/devkit-cli/tests/plan-ops.test.ts:24-36` (`_shared` 파일 목록)
- Modify: `packages/devkit-cli/tests/categories.test.ts` (새 패턴 단언 추가)

**Interfaces:**
- Consumes: 없음(첫 태스크)
- Produces:
  - 스크립트 파일 경로 `templates/_shared/.github/scripts/wait-and-merge.sh`
  - 게이트 jq 프로그램은 스크립트 안에서 `GATE=$(cat <<'JQ' … JQ\n)` 로 감싼다. 테스트는 여는 줄 `GATE=$(cat <<'JQ'` 과 닫는 줄 `JQ` 사이를 잘라 쓴다.
  - 게이트는 `--arg LABEL <라벨>` 하나만 받는다. 옛 `--arg SELF` 는 없다.
  - 판정 문자열은 `merge: `, `wait: `, `stop: ` 셋 중 하나로 시작한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/merge-script.test.ts` 를 만든다.

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/merge-script.test.ts
```

기대: 파일을 읽지 못해 `ENOENT … wait-and-merge.sh` 로 수집 단계에서 실패한다.

- [ ] **Step 3: 스크립트를 쓴다**

`packages/devkit-cli/templates/_shared/.github/scripts/wait-and-merge.sh` 를 아래 내용 그대로 만든다.

```bash
#!/usr/bin/env bash
#
# PR 의 리뷰·체크 결과를 폴링해 전부 통과하면 rebase 로 머지한다.
#
# 예전에는 이 판정을 GitHub Actions(auto-merge.yml)가 했다. 그 구조의 비용은
# 전부 "사람이 없는 곳에서 판정한다"에서 나왔다 — 승인·Commit Status·CheckRun
# 이 서로 다른 이벤트로 도착해 트리거를 셋 두어야 했고, GITHUB_TOKEN 이 만든
# push 는 워크플로를 깨우지 않아 릴리스를 따로 디스패치해야 했으며, 누가
# 승인했는지를 코드가 판정해야 했다. 판정을 사람 앞으로 옮기면 셋 다 사라진다.
#
# 대신 이벤트 대신 **폴링**이 되므로 판정을 세 갈래로 나눈다. merge/skip 둘로
# 뭉뚱그리면 변경 요청을 받은 PR 을 타임아웃까지 헛되이 기다린다.
#
#   merge:  조건 충족 — 머지하고 끝낸다
#   wait:   더 기다리면 해소될 수 있다 — 다시 폴링한다
#   stop:   기다려도 안 된다 — 사유를 남기고 실패로 끝낸다
#
# 이 파일은 devkit 템플릿과 툴킷 저장소 양쪽에 같은 바이트로 존재한다.
# tests/merge-script.test.ts 가 그 동일성을 고정한다 — 한쪽만 고치지 말 것.
set -euo pipefail

OPT_OUT_LABEL=no-auto-merge

usage() {
  cat <<'USAGE'
사용법: wait-and-merge.sh <PR번호> [--timeout <초>] [--interval <초>] [--dry-run]

  --timeout   판정을 기다릴 최대 시간(기본 1800초)
  --interval  폴링 간격(기본 20초)
  --dry-run   판정까지만 하고 머지하지 않는다

종료 코드: 0 머지(또는 --dry-run 통과), 1 중단·타임아웃, 2 사용법 오류
USAGE
}

PR=''
TIMEOUT=1800
INTERVAL=20
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    --timeout)
      TIMEOUT="${2:-}"
      shift 2
      ;;
    --interval)
      INTERVAL="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "알 수 없는 옵션: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$PR" ]; then
        echo "PR 번호는 하나만 받습니다 (받은 것: $PR, $1)" >&2
        exit 2
      fi
      PR="$1"
      shift
      ;;
  esac
done

if [ -z "$PR" ]; then
  echo "PR 번호가 필요합니다." >&2
  usage >&2
  exit 2
fi

# GitHub 쪽 자동 머지가 아직 살아 있으면 이 스크립트가 판정하기 전에 그쪽이
# 먼저 머지한다. 중단하지는 않는다 — 그 파일을 지우는 PR 자체가 이 상태에서
# 돌아야 하기 때문이다.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo '')
if [ -n "$ROOT" ] && [ -f "$ROOT/.github/workflows/auto-merge.yml" ]; then
  echo "경고: .github/workflows/auto-merge.yml 이 남아 있습니다." >&2
  echo "      GitHub 쪽 자동 머지가 이 스크립트보다 먼저 머지할 수 있습니다 — 지우세요." >&2
fi

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

# 게이트 전체를 jq 한 프로그램에 모은다. 셸 분기로 흩으면 조건이 늘 때
# 조용히 빠지는 가지가 생긴다. 결과는 항상 한 줄이라 "왜 안 머지됐는가"가
# 출력만으로 읽힌다.
GATE=$(cat <<'JQ'
def norm: (. // "") | ascii_upcase;
def isbad($v): ["FAILURE","CANCELLED","TIMED_OUT","ACTION_REQUIRED","STARTUP_FAILURE","ERROR"] | index($v) != null;

# 리뷰어별 최신 리뷰만 남긴다. COMMENTED 는 집계에서 뺀다 — 지적 뒤에
# 코멘트를 하나 더 남긴 리뷰어를 철회로 오판한다. DISMISSED 는 포함하되
# 변경 요청으로 세지 않는다(철회가 반영돼야 한다).
def latest:
  [ (.reviews // [])[]
    | select(.state == "APPROVED"
          or .state == "CHANGES_REQUESTED"
          or .state == "DISMISSED") ]
  | group_by(.author.login)
  | map(max_by(.submittedAt));

# 변경 요청은 작성자도 커밋도 가리지 않는다. 막는 쪽은 fail-safe 다 —
# 잘못 막으면 사람이 지우면 그만이지만 잘못 머지하면 되돌릴 수 없다.
def rejections: latest | map(select(.state == "CHANGES_REQUESTED")) | length;

# statusCheckRollup 에는 두 형태가 섞여 온다 — Actions 가 만드는 CheckRun
# (.status/.conclusion)과 Commit Status API 가 만드는 StatusContext(.state).
# 한쪽만 보면 나머지가 항상 통과로 세어진다.
def checks: (.statusCheckRollup // []);
def pending:
  checks
  | map(select(((.status | norm) | . != "" and . != "COMPLETED")
            or ((.state | norm) == "PENDING")))
  | length;
def failing:
  checks
  | map(select(isbad(.conclusion | norm) or isbad(.state | norm)))
  | length;

# Claude 의 통과 신호는 리뷰 승인이 아니라 Commit Status 로 온다. Actions 의
# GITHUB_TOKEN 으로는 PR 을 승인할 수 없지만(GitHub 이 거부한다) Commit Status
# 는 만들 수 있다.
#
# context 와 creator 를 둘 다 본다. context 만 보면 외부 CI 의 초록불 하나로
# 머지되고, creator 를 안 보면 statuses:write 를 가진 임의의 앱이 같은 context
# 로 success 를 심어 리뷰 없이 통과한다. creator 를 확인할 수 없으면 세지
# 않는다.
#
# 커밋 고정이 필요 없다. 이 값의 출처인 /commits/{head}/statuses 는 현재 head
# 커밋의 것만 주므로, 새 커밋을 푸시하면 이 신호가 없는 상태로 시작한다.
def claudeState:
  ([ (.commitStatuses // [])[]
     | select((.context // "") == "claude-review")
     | select((.creator // "") | . == "github-actions[bot]" or . == "github-actions") ]
   | first) as $s
  | if $s == null then "" else ($s.state | norm) end;

# 순서가 판정의 질을 만든다. claude-review 를 다른 체크보다 먼저 보는 것은
# 그쪽이 statusCheckRollup 에도 섞여 들어와서다 — 나중에 보면 "실패한 체크가
# 1건"이라는 두루뭉술한 사유가 나간다.
if .state != "OPEN" then "stop: PR 이 열려 있지 않습니다 (state=\(.state))"
elif .isDraft then "stop: draft PR 입니다"
elif ([(.labels // [])[].name] | index($LABEL)) then "stop: \($LABEL) 라벨이 붙어 있습니다"
elif rejections > 0 then "stop: 변경 요청이 \(rejections)건 있습니다"
elif isbad(claudeState) then "stop: claude-review 가 통과하지 못했습니다 (\(claudeState))"
elif claudeState == "" then "wait: claude-review 신호가 아직 없습니다"
elif claudeState != "SUCCESS" then "wait: claude-review 가 \(claudeState) 입니다"
elif failing > 0 then "stop: 실패한 체크가 \(failing)건 있습니다"
elif pending > 0 then "wait: 체크 \(pending)건이 아직 진행 중입니다"
else "merge: claude-review 통과, 체크 통과"
end
JQ
)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

DEADLINE=$(($(date +%s) + TIMEOUT))
LAST=''
HEAD_SHA=''

while :; do
  gh pr view "$PR" --repo "$REPO" \
    --json state,isDraft,headRefOid,labels,reviews,statusCheckRollup > "$WORK/pr.json"

  HEAD_SHA=$(jq -r '.headRefOid' "$WORK/pr.json")

  # statusCheckRollup 은 StatusContext 의 creator 를 주지 않는다 — gh 가
  # 요청하는 필드가 context·state·startedAt·targetUrl 뿐이다(실측). 위 게이트는
  # "누가 이 status 를 만들었는가"를 봐야 하므로 REST 로 따로 받아 합친다.
  #
  # **복수형** /statuses 여야 한다. 단수형 /commits/{sha}/status(combined)는
  # creator 를 주지 않아 신원 검사가 구조적으로 항상 실패한다(PR #9 에서 실측).
  # 대신 복수형은 컨텍스트별 이력 전체를 주므로 컨텍스트별 최신만 남긴다.
  # id 로 고른다 — 단조 증가하므로 같은 초에 두 건이 들어와도 갈린다.
  gh api "repos/$REPO/commits/$HEAD_SHA/statuses" --paginate \
    --jq '.[] | {context, state, creator: (.creator.login // ""), id}' \
    | jq -s 'group_by(.context) | map(max_by(.id))' > "$WORK/statuses.json"
  jq --slurpfile s "$WORK/statuses.json" '. + {commitStatuses: $s[0]}' "$WORK/pr.json" \
    > "$WORK/pr.merged.json"
  mv "$WORK/pr.merged.json" "$WORK/pr.json"

  VERDICT=$(jq -r --arg LABEL "$OPT_OUT_LABEL" "$GATE" "$WORK/pr.json")

  # 바뀐 판정만 출력한다. 매 폴링마다 같은 줄을 찍으면 정작 바뀐 순간이 묻힌다.
  if [ "$VERDICT" != "$LAST" ]; then
    echo "$VERDICT"
    LAST="$VERDICT"
  fi

  case "$VERDICT" in
    merge:*) break ;;
    stop:*) exit 1 ;;
  esac

  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "타임아웃(${TIMEOUT}초) — 마지막 상태: $VERDICT" >&2
    exit 1
  fi

  sleep "$INTERVAL"
done

if [ "$DRY_RUN" = true ]; then
  echo "--dry-run — 머지하지 않았습니다."
  exit 0
fi

# 게이트와 이 호출 사이에 새 푸시가 들어올 수 있고, 그 잔여 창은 서버만 닫을
# 수 있다 — head 가 바뀌었으면 GitHub 이 머지를 거부한다.
gh pr merge "$PR" --repo "$REPO" --rebase --delete-branch --match-head-commit "$HEAD_SHA"

echo "머지했습니다 (#$PR, $HEAD_SHA)."
echo "release.yml 은 main push 로 깨어납니다 — Actions 에 실행이 생겼는지 확인하세요."
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/merge-script.test.ts
```

기대: 위 `describe` 의 모든 항목 PASS.

- [ ] **Step 5: 카테고리 패턴을 더한다**

`packages/devkit-cli/src/lib/categories.ts` 의 `FILE_PATTERNS` 에서 워크플로 줄 바로 아래에 한 줄을 더한다.

```ts
  [/^\.github\/workflows\/.+/, 'ci'],
  // 머지 판정 스크립트. 워크플로와 같은 카테고리다 — 둘은 함께 움직인다
  // (워크플로가 통과 신호를 남기고 스크립트가 그것을 읽는다).
  [/^\.github\/scripts\/.+/, 'ci'],
```

- [ ] **Step 6: 카테고리 단언을 더한다**

`packages/devkit-cli/tests/categories.test.ts` 의 `categoryOf` describe 안에 더한다.

```ts
  it('.github/scripts 아래는 ci 다', () => {
    expect(categoryOf('.github/scripts/wait-and-merge.sh')).toBe('ci');
  });
```

- [ ] **Step 7: `_shared` 파일 목록을 갱신한다**

`packages/devkit-cli/tests/plan-ops.test.ts` 의 `'템플릿 트리를 상대경로와 최종 내용으로 낸다'` 를 고친다. 이 단언은 `toEqual` 이라 파일이 하나 늘면 반드시 깨진다 — 템플릿에 파일이 몰래 추가되는 것을 막는 관문이므로, 목록을 갱신하는 것이 맞는 대응이다.

```ts
    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file)).sort();
    expect(paths).toEqual([
      '.claude/commands/review.md',
      '.claude/commands/verify.md',
      '.github/scripts/wait-and-merge.sh',
      '.github/workflows/auto-merge.yml',
      '.github/workflows/claude-review.yml',
      '.gitignore',
      '.npmrc',
    ]);
    // .gitignore 는 병합 대상이라 kind 가 다르다 — 나머지 여섯은 그대로 file 이다.
    expect(changes.filter((c) => c.kind === 'file')).toHaveLength(6);
```

- [ ] **Step 8: 전체 게이트를 돌린다**

```bash
pnpm lint && pnpm test
```

기대: 전부 통과. `merge-script.test.ts` 가 새로 잡히고 `plan-ops`·`categories`·`overlay-coverage` 가 통과한다.

- [ ] **Step 9: 커밋**

```bash
git add packages/devkit-cli/templates/_shared/.github/scripts/wait-and-merge.sh \
        packages/devkit-cli/tests/merge-script.test.ts \
        packages/devkit-cli/src/lib/categories.ts \
        packages/devkit-cli/tests/categories.test.ts \
        packages/devkit-cli/tests/plan-ops.test.ts
git commit -m "$(cat <<'EOF'
feat: 리뷰 결과를 기다렸다 머지하는 스크립트를 더한다

판정을 이벤트에서 폴링으로 옮기면 merge/skip 2분류로는 부족하다. 어느
쪽 skip 이든 이벤트 모델에서는 "이번엔 안 함"으로 같았지만, 폴링에서는
"더 기다리면 되는 것"과 "기다려도 안 되는 것"이 갈린다 — 뭉뚱그리면
변경 요청 받은 PR 을 타임아웃까지 헛되이 기다린다.

auto-merge.yml 은 아직 지우지 않는다. 스크립트가 먼저 초록불이어야
그것을 지우는 PR 이 스스로 이 경로로 머지될 수 있다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 저장소판 배치와 `auto-merge.yml` 철거

**Files:**
- Create: `.github/scripts/wait-and-merge.sh` (템플릿판의 바이트 동일 사본)
- Delete: `.github/workflows/auto-merge.yml`
- Delete: `packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml`
- Delete: `packages/devkit-cli/tests/auto-merge-workflow.test.ts`
- Modify: `packages/devkit-cli/tests/merge-script.test.ts` (두 사본 동일성 + 리뷰 워크플로 단언 흡수)
- Modify: `.github/workflows/claude-review.yml`
- Modify: `packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml`
- Modify: `packages/devkit-cli/tests/plan-ops.test.ts` (목록에서 auto-merge.yml 제거)
- Modify: `packages/devkit-cli/tests/e2e/packed.e2e.test.ts:61-63`

**Interfaces:**
- Consumes: Task 1 의 `templates/_shared/.github/scripts/wait-and-merge.sh` 와 `tests/merge-script.test.ts` 의 `extractGate`
- Produces: `.github/scripts/wait-and-merge.sh` — Task 3 의 커맨드가 이 경로를 부른다

- [ ] **Step 1: 동일성 테스트를 먼저 쓴다**

`packages/devkit-cli/tests/merge-script.test.ts` 상단의 상수 아래에 더한다.

```ts
const REPO_SCRIPT = fileURLToPath(
  new URL('../../../.github/scripts/wait-and-merge.sh', import.meta.url),
);
```

그리고 새 describe 를 더한다.

```ts
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
```

기존 `auto-merge-workflow.test.ts` 의 `describe('Commit Status 조회 파이프라인 (실제 응답 녹화본에 돌린다)')` 블록 전체를 `merge-script.test.ts` 로 **옮긴다**. 옮길 때 바꾸는 것은 두 가지뿐이다.

1. `extractStatusFetch(...)` 의 입력을 `readFileSync(AUTO_MERGE, 'utf8')` 에서 `readFileSync(TEMPLATE_SCRIPT, 'utf8')` 로 바꾼다. 정규식(`--jq '(\.\[\][^']*)'`, `\| jq -s '([^']*)'`)은 그대로 셸 스크립트에도 맞는다.
2. `it('두 사본의 조회 파이프라인이 같다')` 는 삭제한다 — 위 바이트 동일성이 더 강하게 덮는다.

기존 `describe('_shared 리뷰 워크플로')` 와 `describe('이 저장소판 리뷰 워크플로')` 두 블록도 통째로 옮긴다. 그 안에서 auto-merge.yml 을 문자열로 언급하는 단언은 없다(프롬프트 문구만 본다).

옮기지 않고 **버리는** 블록은 넷이다. 대상이 사라졌기 때문이다.

- `describe('_shared 자동 머지 워크플로')`
- `describe('이 저장소판의 fork 차단 게이트')`
- `describe('두 auto-merge.yml 사본의 게이트 동일성')`
- `describe('이 저장소판 auto-merge 의 트리거 배선')`

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/merge-script.test.ts
```

기대: `저장소판과 템플릿판이 바이트 단위로 같다` 가 `ENOENT … .github/scripts/wait-and-merge.sh` 로 실패한다.

- [ ] **Step 3: 저장소판 사본을 놓는다**

```bash
mkdir -p .github/scripts
cp packages/devkit-cli/templates/_shared/.github/scripts/wait-and-merge.sh .github/scripts/wait-and-merge.sh
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/merge-script.test.ts
```

기대: 전부 PASS.

- [ ] **Step 5: 옛 워크플로와 옛 테스트를 지운다**

```bash
git rm .github/workflows/auto-merge.yml
git rm packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml
git rm packages/devkit-cli/tests/auto-merge-workflow.test.ts
```

- [ ] **Step 6: `claude-review.yml` 의 참조를 고친다 (저장소판)**

`.github/workflows/claude-review.yml` 에서 세 곳을 고친다.

첫째, 머리말 주석(2–13행)을 통째로 아래로 바꾼다.

```yaml
# PR 마다 Claude 가 리뷰하고, 통과 여부를 **Commit Status**(context:
# claude-review)로 남긴다. `.github/scripts/wait-and-merge.sh` 가 그 status 를
# 게이트로 읽어 머지한다.
#
# 승인(--approve)을 쓰지 않는 이유는 아래 github_token 주석에 있다 — Actions
# 토큰으로는 GitHub 이 승인을 거부한다.
#
# 머지 판정은 GitHub 에 있지 않다. 이 워크플로가 status 를 남기면 끝이고,
# 그것을 기다렸다 머지하는 것은 사람이 부르는 스크립트다. 그래서 이 파일의
# name: 값을 다른 워크플로가 이름으로 참조하지 않는다 — 예전에는
# auto-merge.yml 의 workflow_run 목록과 글자 그대로 같아야 했다.
```

둘째, 프롬프트의 게이트 설명(87–90행 부근)에서 경로를 바꾼다.

```
            리뷰를 마치면 반드시 아래 둘 중 하나를 **실행**합니다.
            코멘트만 남기고 끝내지 않습니다 — 이 Commit Status 가 머지 게이트
            (.github/scripts/wait-and-merge.sh)가 읽는 유일한 통과 신호라,
            남기지 않으면 PR 이 판정을 못 받고 멈춘 채로 남습니다.
```

셋째, 변경 요청 철회 안내(95–98행 부근)에서 "자동 머지의" 를 "머지 게이트의" 로 바꾼다.

```
              그리고 **이전에 당신이 남긴 변경 요청이 있으면 반드시 철회합니다.**
              머지 게이트의 변경 요청 판정은 커밋을 가리지 않는데(막는 쪽은
              fail-safe 다) 통과 신호는 커밋에 묶입니다. 철회하지 않으면 한 번
              지적받은 PR 은 그 지적이 해소돼도 영원히 머지되지 않습니다.
```

넷째, 같은 절 마지막 문장(108–110행 부근)의 "자동 머지 게이트는" 을 "머지 게이트는" 으로 바꾼다.

- [ ] **Step 7: `claude-review.yml` 의 참조를 고친다 (템플릿판)**

`packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml` 에 Step 6 과 같은 네 곳을 적용한다. 템플릿판에는 머리말 주석이 없으므로(`name:` 다음 바로 `on:` 이다) 첫째 항목은 **주석 블록을 새로 넣는 것**이 된다 — `name:` 줄 바로 아래에 Step 6 의 주석을 그대로 넣는다.

프롬프트 안의 "그 머지가 곧바로 패키지 게시로 이어지므로" 는 저장소판에만 있는 문구다(템플릿판은 "변경이 main 에 들어갑니다"). 그대로 둔다.

- [ ] **Step 8: 남은 참조를 고친다**

`packages/devkit-cli/tests/plan-ops.test.ts` — 목록에서 auto-merge.yml 을 뺀다.

```ts
    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file)).sort();
    expect(paths).toEqual([
      '.claude/commands/review.md',
      '.claude/commands/verify.md',
      '.github/scripts/wait-and-merge.sh',
      '.github/workflows/claude-review.yml',
      '.gitignore',
      '.npmrc',
    ]);
    // .gitignore 는 병합 대상이라 kind 가 다르다 — 나머지 다섯은 그대로 file 이다.
    expect(changes.filter((c) => c.kind === 'file')).toHaveLength(5);
```

같은 파일 25–26행의 주석에서 `// auto-merge.yml 은 auto-merge 계획 Task 1부터 _shared 에 있다.` 를 지우고 아래로 바꾼다.

```ts
    // wait-and-merge.sh 는 머지 판정이 워크플로에서 스크립트로 옮겨오며 들어왔다.
```

`packages/devkit-cli/tests/e2e/packed.e2e.test.ts` — 61–63행의 존재 단언 대상을 바꾼다. 점으로 시작하는 디렉토리가 tarball 에서 빠지는 회귀를 잡는 것이 목적이므로 대상만 갈아끼우면 된다.

```ts
    expect(
      existsSync(join(root, 'templates', '_shared', '.github', 'workflows', 'claude-review.yml')),
    ).toBe(true);
    // 스크립트도 같은 dot-디렉토리 아래다. 빠지면 생성물의 머지 경로가 통째로
    // 사라지는데 create 는 그대로 성공한다.
    expect(
      existsSync(join(root, 'templates', '_shared', '.github', 'scripts', 'wait-and-merge.sh')),
    ).toBe(true);
```

- [ ] **Step 9: 전체 게이트를 돌린다**

```bash
pnpm lint && pnpm test
```

기대: 전부 통과. `auto-merge.yml` 을 참조하는 테스트가 하나도 남지 않았는지 확인한다.

```bash
grep -rn "auto-merge.yml" packages/devkit-cli/tests packages/devkit-cli/src
```

기대 출력: `merge-script.test.ts` 의 "남아 있는 auto-merge.yml 을 경고한다" 단언 한 곳뿐. (Task 4 에서 `src/update/retired.ts` 가 여기에 더해진다.)

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: 머지 판정을 GitHub 워크플로에서 걷어낸다

auto-merge.yml 이 트리거를 셋 둔 것도, 릴리스를 따로 디스패치한 것도,
승인자 신원을 판정한 것도 전부 "사람이 없는 곳에서 머지한다"의 비용이었다.
판정이 사람 앞으로 옮겨진 지금 셋 다 지울 수 있다.

두 사본의 단언도 강화한다. 예전에는 jq 게이트만 같은지 보았고 주석과
배선은 드리프트해도 통과했다 — 실제로 드리프트했다. 저장소판과 템플릿판의
차이가 사라졌으므로 파일 전체를 고정한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/merge` 슬래시 커맨드

**Files:**
- Create: `packages/devkit-cli/templates/_shared/.claude/commands/merge.md`
- Create: `.claude/commands/merge.md`
- Modify: `packages/devkit-cli/tests/merge-script.test.ts` (커맨드 단언 추가)
- Modify: `packages/devkit-cli/tests/plan-ops.test.ts` (목록에 커맨드 추가)

**Interfaces:**
- Consumes: Task 2 의 `.github/scripts/wait-and-merge.sh`
- Produces: `/merge` 커맨드. 사용자가 `/merge <PR번호>` 로 부른다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/merge-script.test.ts` 에 더한다.

```ts
const TEMPLATE_COMMAND = fileURLToPath(
  new URL('../templates/_shared/.claude/commands/merge.md', import.meta.url),
);

describe('/merge 커맨드', () => {
  it('스크립트를 bash 로 부른다', async () => {
    // 실행 비트는 보존되지 않는다 — copyOverlay 의 collectTree 가 내용만
    // 읽어 writeFile 로 쓴다. `./script.sh` 로 부르면 소비자 프로젝트에서
    // Permission denied 로 죽는다.
    const doc = await readFile(TEMPLATE_COMMAND, 'utf8');
    expect(doc).toContain('bash .github/scripts/wait-and-merge.sh');
    expect(doc).not.toMatch(/(?<!bash )\.\/\.github\/scripts/);
  });

  it('판정 로직을 다시 적지 않는다', async () => {
    // 게이트가 두 곳에 적히면 반드시 어긋난다. 커맨드는 부르고 보고할 뿐이다.
    const doc = await readFile(TEMPLATE_COMMAND, 'utf8');
    expect(doc).not.toContain('statusCheckRollup');
    expect(doc).not.toContain('commitStatuses');
  });

  it('실패했을 때 고치지 말고 보고하라고 명시한다', async () => {
    const doc = await readFile(TEMPLATE_COMMAND, 'utf8');
    expect(doc).toContain('멈추고');
  });

  it('frontmatter 에 description 이 있다', async () => {
    const doc = await readFile(TEMPLATE_COMMAND, 'utf8');
    expect(doc).toMatch(/^---\ndescription: .+\n---\n/);
  });
});
```

`readFile` 이 아직 import 돼 있지 않으면 상단에 더한다.

```ts
import { readFile } from 'node:fs/promises';
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/merge-script.test.ts -t '/merge 커맨드'
```

기대: 네 건 모두 `ENOENT … merge.md` 로 실패.

- [ ] **Step 3: 커맨드를 쓴다**

`packages/devkit-cli/templates/_shared/.claude/commands/merge.md` 를 아래 내용으로 만든다.

```markdown
---
description: PR 의 리뷰·체크 결과를 기다렸다가 전부 통과하면 머지한다
---

인자로 받은 PR 번호에 대해 실행한다. 번호가 없으면 현재 브랜치의 열린 PR 을
`gh pr view --json number` 로 찾고, 그것도 없으면 그 사실만 알리고 끝낸다.

```bash
bash .github/scripts/wait-and-merge.sh <PR번호>
```

이 명령은 리뷰가 끝날 때까지 **길게 기다린다**(기본 30분). 백그라운드로 돌리고
완료 알림을 받는다 — 포그라운드로 돌리면 도구 타임아웃에 걸린다.

## 판정을 다시 하지 않는다

무엇을 기다리고 무엇을 막을지는 스크립트의 jq 게이트가 정한다. 그 판정을 이
문서나 대화에서 다시 계산하지 않는다 — 두 곳에 적힌 규칙은 반드시 어긋난다.

스크립트의 출력은 세 접두 중 하나로 시작한다.

- `merge:` — 머지했다. 종료 코드 0
- `wait:` — 아직 기다리는 중. 스크립트가 알아서 다시 폴링한다
- `stop:` — 기다려도 안 된다. 종료 코드 1

## 실패했을 때

`stop:` 이나 타임아웃으로 끝나면 **멈추고 보고한다.** 스크립트가 출력한 사유를
그대로 전하고, 무엇을 고쳐야 하는지 사람이 판단하게 한다.

지적을 스스로 고쳐 다시 푸시하지 않는다. 리뷰가 막은 변경을 아무도 보지 않은
채로 고쳐 넣으면, 통과 신호 하나가 다시 머지까지 이어진다.

## 머지한 뒤

`release.yml` 은 main push 로 깨어난다. Actions 에 실행이 실제로 생겼는지
확인하고, 없으면 그 사실을 보고한다 — 조용히 넘어가면 "머지는 됐는데 릴리스는
안 된" 상태가 신호 없이 남는다.
```

`.claude/commands/merge.md` 에 같은 파일을 복사한다.

```bash
cp packages/devkit-cli/templates/_shared/.claude/commands/merge.md .claude/commands/merge.md
```

`.claude/commands/` 디렉토리가 없으면 먼저 만든다. 루트 `.gitignore` 의 `.claude/` 규칙이 이 파일을 삼킬 수 있으므로 **`git status` 로 추적되는지 반드시 확인**하고, 무시된다면 `git add -f` 가 아니라 `.gitignore` 의 부정 패턴을 고친다.

```bash
git check-ignore -v .claude/commands/merge.md || echo "무시되지 않음 — 정상"
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/merge-script.test.ts
```

기대: 전부 PASS.

- [ ] **Step 5: `_shared` 목록을 갱신한다**

`packages/devkit-cli/tests/plan-ops.test.ts`:

```ts
    expect(paths).toEqual([
      '.claude/commands/merge.md',
      '.claude/commands/review.md',
      '.claude/commands/verify.md',
      '.github/scripts/wait-and-merge.sh',
      '.github/workflows/claude-review.yml',
      '.gitignore',
      '.npmrc',
    ]);
    // .gitignore 는 병합 대상이라 kind 가 다르다 — 나머지 여섯은 그대로 file 이다.
    expect(changes.filter((c) => c.kind === 'file')).toHaveLength(6);
```

- [ ] **Step 6: 전체 게이트를 돌린다**

```bash
pnpm lint && pnpm test
```

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: 리뷰를 기다렸다 머지하는 /merge 커맨드를 더한다

커맨드가 판정을 다시 적지 않는 것이 요구다. 게이트가 두 곳에 있으면
반드시 어긋나고, 어긋난 쪽이 느슨하면 그것이 실제 게이트가 된다.

bash 로 부른다 — copyOverlay 는 내용만 복사하고 실행 비트를 보존하지
않으므로 소비자 프로젝트에서 ./script.sh 는 Permission denied 로 죽는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `devbak update` 가 은퇴한 워크플로를 지운다

**Files:**
- Create: `packages/devkit-cli/src/update/retired.ts`
- Create: `packages/devkit-cli/tests/update-retired.test.ts`
- Modify: `packages/devkit-cli/src/update/index.ts:66-108`

**Interfaces:**
- Consumes: `Category`(`src/lib/categories.js`), `pathExists`(`src/ops/path-exists.js`)
- Produces:
  - `interface RetiredFile { relPath: string; category: Category; reason: string }`
  - `const RETIRED_FILES: readonly RetiredFile[]`
  - `async function retiredTargets(targetDir: string, categories: ReadonlySet<Category>): Promise<RetiredFile[]>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/update-retired.test.ts` 를 만든다.

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runUpdate } from '../src/update/index.js';
import { RETIRED_FILES, retiredTargets } from '../src/update/retired.js';

const TOOLKIT = resolve(import.meta.dirname, '../../..');
const TEMPLATES_DIR = fileURLToPath(new URL('../templates', import.meta.url));
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 은퇴 파일을 미리 심어 둔 최소 대상 프로젝트. */
function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-retired-'));
  created.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'demo' }, null, 2)}\n`);
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(dir, '.github', 'workflows', 'auto-merge.yml'), 'name: Auto Merge\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'wip'], {
    cwd: dir,
  });
  return dir;
}

const base = (targetDir: string) => ({
  targetDir,
  toolkitRoot: TOOLKIT,
  skipInstall: true,
  yes: true,
  log: () => {},
});

const ALL_CATEGORIES = new Set(RETIRED_FILES.map((file) => file.category));

describe('retiredTargets', () => {
  it('대상에 실제로 있는 것만 돌려준다', async () => {
    const dir = makeProject();
    const got = await retiredTargets(dir, ALL_CATEGORIES);

    expect(got.map((file) => file.relPath)).toContain('.github/workflows/auto-merge.yml');
  });

  it('없으면 비어 있다 — 없는 것이 정상 상태다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-retired-empty-'));
    created.push(dir);

    expect(await retiredTargets(dir, ALL_CATEGORIES)).toEqual([]);
  });

  it('카테고리가 맞지 않으면 대상이 아니다', async () => {
    // --only lint 로 돌린 사람이 CI 파일이 지워지는 것을 보면 안 된다.
    const dir = makeProject();

    expect(await retiredTargets(dir, new Set(['lint' as const]))).toEqual([]);
  });
});

describe('은퇴 목록 드리프트 가드', () => {
  it('은퇴한 파일이 템플릿에 다시 존재하지 않는다', async () => {
    // 이것이 어긋나면 update 가 방금 쓴 파일을 곧바로 지운다 — 실행 순서에
    // 따라 결과가 갈리는, 재현이 어려운 형태의 결함이다.
    const entries = await readdir(TEMPLATES_DIR, { recursive: true, withFileTypes: true });
    const templatePaths = new Set(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) => `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/')),
    );

    for (const file of RETIRED_FILES) {
      const hits = [...templatePaths].filter((path) => path.endsWith(`/${file.relPath}`));
      expect(hits, `${file.relPath} 가 템플릿에 아직 있다: ${hits.join(', ')}`).toEqual([]);
    }
  });
});

describe('runUpdate 의 은퇴 파일 삭제', () => {
  it('--dry-run 은 목록에만 올리고 지우지 않는다', async () => {
    const dir = makeProject();
    const lines: string[] = [];
    await runUpdate({
      ...base(dir),
      log: (message) => lines.push(message),
      type: 'nest',
      only: 'ci',
      dryRun: true,
    });

    expect(lines.join('\n')).toContain('.github/workflows/auto-merge.yml');
    expect(existsSync(join(dir, '.github', 'workflows', 'auto-merge.yml'))).toBe(true);
  });

  it('실제 실행은 지운다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'ci' });

    expect(existsSync(join(dir, '.github', 'workflows', 'auto-merge.yml'))).toBe(false);
  });

  it('--only lint 로는 지우지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'lint' });

    expect(existsSync(join(dir, '.github', 'workflows', 'auto-merge.yml'))).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/update-retired.test.ts
```

기대: `Failed to resolve import "../src/update/retired.js"` 로 수집 단계에서 실패.

- [ ] **Step 3: `retired.ts` 를 쓴다**

```ts
import { join } from 'node:path';
import type { Category } from '../lib/categories.js';
import { pathExists } from '../ops/path-exists.js';

/**
 * 템플릿에서 은퇴한 파일 — `update` 가 소비자에게서도 지운다.
 *
 * 레시피의 `removeFiles` 를 쓰지 않는다. 그쪽은 **생성 시점의 뼈대 정리**용이고
 * 목록에 `apps/web/.claude` 같은 디렉토리가 들어 있다 — 소비자가 그 아래에
 * 자기 커맨드를 넣어 뒀다면 update 가 그것을 날린다. 은퇴는 그것과 다른 일이라
 * 다른 목록에 둔다: "devkit 이 예전에 놓았고, 이제는 놓지 않으며, 남아 있으면
 * 해로운" 파일만 담는다.
 *
 * `reason` 을 요구하는 것이 요구다. 이유 없이 파일을 지우면 사용자는 update 가
 * 왜 자기 파일을 없앴는지 알 길이 없다.
 */
export interface RetiredFile {
  /** 프로젝트 상대 경로. POSIX `/` 로 쓴다. */
  relPath: string;
  category: Category;
  reason: string;
}

export const RETIRED_FILES: readonly RetiredFile[] = [
  {
    relPath: '.github/workflows/auto-merge.yml',
    category: 'ci',
    reason:
      '머지 판정이 .github/scripts/wait-and-merge.sh 로 옮겨졌습니다. 남아 있으면 그쪽이 먼저 머지합니다.',
  },
];

/**
 * 대상에 실제로 존재하고 카테고리 필터를 통과한 은퇴 파일.
 *
 * 없으면 조용히 뺀다 — 없는 것이 정상 상태이고, 이미 지운 사람에게 매번
 * 알릴 이유가 없다.
 */
export async function retiredTargets(
  targetDir: string,
  categories: ReadonlySet<Category>,
): Promise<RetiredFile[]> {
  const candidates = RETIRED_FILES.filter((file) => categories.has(file.category));
  const present = await Promise.all(
    candidates.map(async (file) => ({
      file,
      exists: await pathExists(join(targetDir, ...file.relPath.split('/'))),
    })),
  );
  return present.filter((item) => item.exists).map((item) => item.file);
}
```

- [ ] **Step 4: `runUpdate` 에 배선한다**

`packages/devkit-cli/src/update/index.ts` 를 고친다.

import 를 더한다.

```ts
import { rm } from 'node:fs/promises';
import { retiredTargets, type RetiredFile } from './retired.js';
```

(기존 `import { mkdir, readFile, writeFile } from 'node:fs/promises';` 에 `rm` 을 합쳐도 된다.)

`const writes = ...` 줄 **앞에** 은퇴 대상을 계산하고 출력한다.

```ts
  // 은퇴 파일은 계획(PlannedFile)이 아니라 삭제라 변경 목록과 따로 낸다.
  // 조용히 지우면 update 가 사용자 파일을 없앴다는 사실이 어디에도 남지 않는다.
  const retired = await retiredTargets(targetDir, categories);
  if (retired.length > 0) {
    log(`\n  지움 (${retired.length})`);
    for (const file of retired) log(`    ${file.relPath} — ${file.reason}`);
  }

  const writes = classified.filter((item) => item.kind !== 'unchanged');
```

"변경할 것이 없습니다" 게이트가 삭제만 있는 경우를 삼키지 않게 고친다.

```ts
  if (writes.length === 0 && retired.length === 0) {
    log('\n변경할 것이 없습니다.');
    return;
  }
```

`writeAll(...)` 호출 **뒤에** 삭제를 실행한다.

```ts
  await removeRetired(targetDir, retired, log);
```

파일 맨 아래 `writeAll` 옆에 헬퍼를 더한다.

```ts
async function removeRetired(
  targetDir: string,
  retired: readonly RetiredFile[],
  log: (message: string) => void,
): Promise<void> {
  for (const file of retired) {
    const full = join(targetDir, ...file.relPath.split('/'));
    // oxlint-disable-next-line no-await-in-loop -- 부분 실패 시 어디까지 지웠는지가 로그 순서로 드러나야 한다
    await rm(full, { force: true });
    log(`  지움: ${file.relPath}`);
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/update-retired.test.ts
```

기대: 일곱 건 모두 PASS.

- [ ] **Step 6: 가드가 실제로 막는지 변이로 확인한다**

통과하는 테스트는 증거가 아니다. 드리프트 가드를 일부러 깨서 실패하는지 본다.

```bash
mkdir -p packages/devkit-cli/templates/_shared/.github/workflows
printf 'name: Auto Merge\n' > packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml
cd packages/devkit-cli && pnpm vitest run tests/update-retired.test.ts -t '드리프트'
```

기대: `은퇴한 파일이 템플릿에 다시 존재하지 않는다` 가 FAIL.

원복한다.

```bash
rm packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml
cd packages/devkit-cli && pnpm vitest run tests/update-retired.test.ts -t '드리프트'
```

기대: PASS.

- [ ] **Step 7: 전체 게이트를 돌린다**

```bash
pnpm lint && pnpm test
```

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: update 가 은퇴한 워크플로를 소비자에게서도 지운다

update 는 지금까지 파일 삭제를 전파하지 않았다. 그대로 두면 이미 생성된
프로젝트는 update 후에도 auto-merge.yml 을 갖고, 그 게이트는 claude-review
success 만으로 머지하므로 새 스크립트가 판정하기 전에 먼저 머지한다.

레시피의 removeFiles 를 재사용하지 않는다. 그 목록은 생성 시점의 뼈대
정리용이고 apps/web/.claude 같은 디렉토리를 담고 있어, 소비자가 거기에
넣어 둔 자기 파일까지 날린다. 은퇴는 다른 일이므로 다른 목록에 둔다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 문서 갱신

**Files:**
- Modify: `README.md:172-183`
- Modify: `packages/devkit-cli/README.md` (137, 154-175, 202, 212-213, 243, 311, 334행 부근)
- Modify: `.claude/agents/devkit-reviewer.md:41`

**Interfaces:**
- Consumes: Task 1–4 의 산출물 전체
- Produces: 없음(마지막 태스크)

- [ ] **Step 1: 루트 README 를 고친다**

`README.md` 의 "세 유형 모두 Claude 기반 코드 리뷰 자산…" 문단(172–183행)을 아래로 바꾼다.

```markdown
세 유형 모두 Claude 기반 코드 리뷰 자산(`/review` 슬래시 커맨드, PR 자동 리뷰
워크플로, 유형별 리뷰어 에이전트)과 **머지 스크립트**를 함께 놓는다. 리뷰는
GitHub Actions 에서 돌고 통과 여부를 Commit Status(`claude-review`)로 남기지만,
**머지 판정은 GitHub 에 있지 않다** — `/merge` 커맨드가
`.github/scripts/wait-and-merge.sh` 를 불러 그 신호와 다른 체크를 폴링하고,
전부 통과하면 그 자리에서 rebase 로 머지한다.

즉 **사람이 세션 앞에 있어야 머지된다.** 자리를 비운 사이에는 머지되지 않고,
GitHub UI 에서 사람이 직접 연 PR 도 누군가 `/merge` 를 부를 때까지 열려 있다.
그것이 이 구조가 노리는 바다 — 아무도 보지 않는 사이에 패키지가 게시되지
않는다.

변경 요청이 남아 있거나, 체크가 실패했거나, `no-auto-merge` 라벨이 붙어 있으면
스크립트가 사유를 출력하고 종료 코드 1로 멈춘다. **이 라벨은 기본 제공되지
않는다** — `gh label create no-auto-merge`로 먼저 만들어야 쓸 수 있다.
CI 워크플로를 실제로 돌리려면 생성된 저장소에 시크릿
`CLAUDE_CODE_OAUTH_TOKEN`을 등록해야 한다(API key가 아니다).
자세한 내용은 [`packages/devkit-cli/README.md`](packages/devkit-cli/README.md).
```

- [ ] **Step 2: devkit-cli README 를 고친다**

`packages/devkit-cli/README.md` 에서 다음을 고친다.

137행의 자산 표에서 `auto-merge.yml` 줄을 갈아끼운다.

```markdown
| `templates/_shared/.github/scripts/wait-and-merge.sh` | 리뷰 결과를 폴링해 전부 통과하면 머지 |
| `templates/_shared/.claude/commands/merge.md` | `/merge` — 위 스크립트를 부른다 |
```

154행의 "### 자동 머지" 절 제목을 "### 머지" 로 바꾸고, 그 아래 156–175행의 설명을 아래로 바꾼다.

```markdown
`.github/scripts/wait-and-merge.sh` 가 PR 을 폴링해 판정한다. GitHub Actions 는
관여하지 않는다 — 리뷰만 돌고, 머지는 사람이 부른 세션에서 일어난다.

```bash
bash .github/scripts/wait-and-merge.sh <PR번호>
```

판정은 세 갈래다.

| 접두 | 뜻 | 행동 |
| --- | --- | --- |
| `merge:` | 조건 충족 | `--rebase --delete-branch` 로 머지, 종료 코드 0 |
| `wait:` | 더 기다리면 해소될 수 있음 | 기본 20초 뒤 다시 폴링 |
| `stop:` | 기다려도 안 됨 | 사유 출력, 종료 코드 1 |

머지 조건은 넷이다.

| 조건 | 내용 |
| --- | --- |
| 상태 | PR 이 열려 있고 draft 가 아님 |
| 리뷰 | 철회되지 않은 변경 요청이 없음 |
| 통과 신호 | `claude-review` Commit Status 가 `success` 이고 생성자가 `github-actions[bot]` |
| 체크 | 다른 체크가 전부 완료·성공 |

`claude-review` 는 **context 와 creator 를 둘 다** 본다. context 만 보면 외부 CI
의 초록불 하나로 머지되고, creator 를 안 보면 `statuses:write` 를 가진 임의의
앱이 같은 이름으로 `success` 를 심어 리뷰 없이 게이트를 뚫는다.

기본 타임아웃은 1800초다. `--timeout`·`--interval` 로 바꾼다. `--dry-run` 은
판정까지만 하고 머지하지 않는다.

**`no-auto-merge` 라벨은 기본 제공되지 않는다.** GitHub이 새 저장소에 만들어 주는
기본 라벨에 없으므로, 쓰려면 먼저 만들어야 한다.

```bash
gh label create no-auto-merge --description "이 PR 은 자동 머지하지 않는다"
```
```

202행의 `tests/auto-merge-workflow.test.ts` 를 `tests/merge-script.test.ts` 로 바꾼다.

212–213행의 "CI 워크플로를 추가하면 `auto-merge.yml`도 고쳐야 한다" 문단을 통째로 지운다. `workflow_run.workflows` 목록이 없어졌으므로 그 제약 자체가 사라졌다. 대신 아래를 넣는다.

```markdown
**CI 워크플로를 추가해도 고칠 것이 없다.** 스크립트는 `statusCheckRollup` 을
통째로 집계하므로 새 체크가 자동으로 판정에 들어온다. 예전 `auto-merge.yml` 은
`on.workflow_run.workflows` 목록에 이름을 손으로 넣어야 했고, 빠뜨리면 PR 이
승인된 채로 조용히 멈췄다 — 이벤트로 깨어나지 않게 되면서 그 함정이 사라졌다.
```

243행의 `tests/auto-merge-workflow.test.ts`가 `actions/checkout` 부재를 고정한다는 문장은, 그 단언이 `auto-merge.yml` 전용이었으므로 문단째 지운다. 체크아웃 위험은 권한 있는 트리거(`workflow_run`/`pull_request_review`)의 문제였고 그 트리거가 없어졌다.

311행과 334행의 생성물 트리에서 `.github/workflows/auto-merge.yml` 줄을 지우고 두 줄을 넣는다. 트리의 들여쓰기를 주변 줄과 맞춘다.

```
    .github/scripts/wait-and-merge.sh
    .claude/commands/merge.md
```

- [ ] **Step 3: 리뷰어 에이전트 문서를 고친다**

`.claude/agents/devkit-reviewer.md:41` 의 `auto-merge.yml` 언급을 확인하고, 예시로 든 "한 사실이 여러 곳" 사례가 여전히 성립하는지 본다. `auto-merge.yml` 이 없어졌으므로 그 이름을 `.github/scripts/wait-and-merge.sh` 로 바꾼다. 문장의 요지(버전 리터럴이 여러 곳에 있었다)는 그대로 둔다.

- [ ] **Step 4: 남은 참조가 없는지 확인한다**

```bash
grep -rn "auto-merge\|자동 머지\|Auto Merge" --include='*.md' --include='*.ts' --include='*.yml' . \
  | grep -v node_modules | grep -v work-log | grep -v docs/superpowers
```

파일 이름(`auto-merge.yml`)만 찾으면 한글로 "자동 머지"라고 쓴 주석을 놓친다 — 실제로 `tests/merge-ignore-git.test.ts:108` 과 `tests/skill-assets.test.ts:254` 가 그 형태다. 둘 다 **주석**이라 동작에는 영향이 없지만, 없어진 구조를 설명하는 주석은 다음에 읽는 사람을 틀린 방향으로 보낸다.

기대: 아래 넷만 남는다.

- `src/update/retired.ts` — 은퇴 목록의 경로 문자열
- `tests/merge-script.test.ts` — "남아 있는 auto-merge.yml 을 경고한다" 단언
- `tests/update-retired.test.ts` — 픽스처가 심는 파일
- `README.md`·`packages/devkit-cli/README.md` — `no-auto-merge` **라벨 이름**(이것은 그대로 유지한다)

그 밖의 곳에서 없어진 자동 머지 구조를 현재형으로 설명하고 있으면 고친다. `tests/skill-assets.test.ts:254` 의 "판단으로 리뷰하고 승인까지 찍는다"는 이 계획 이전부터 이미 틀린 문장이다(리뷰는 승인이 아니라 Commit Status 를 남긴다) — 같이 고친다.

- [ ] **Step 5: 전체 게이트를 돌린다**

```bash
pnpm lint && pnpm build && pnpm test
```

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: 머지가 사람 앞에서 일어난다는 것을 문서에 반영한다

README 가 "승인 1건이면 자동 머지"를 설명하고 있었는데 그 경로가 통째로
없어졌다. 바뀐 것은 조건이 아니라 **누가 언제 판정하는가**이므로, 조건
표만 갈아끼우지 않고 "사람이 세션 앞에 있어야 머지된다"를 명시한다.

CI 워크플로를 추가하면 workflow_run 목록도 고쳐야 한다는 경고를 지운다 —
이벤트로 깨어나지 않게 되면서 그 함정 자체가 사라졌다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 실행 후 확인 (사람이 한다)

계획의 태스크가 아니라 **이 브랜치의 PR 에서 실측할 것**이다.

1. PR 을 열고 `/merge <번호>` 를 부른다. 스크립트가 `wait:` → `merge:` 로 넘어가고 실제로 머지되는지 본다.
   - 이 PR 자체가 `auto-merge.yml` 을 지우는 PR 이므로, 머지되기 전까지는 GitHub 쪽 자동 머지가 **아직 살아 있다**. 스크립트가 판정하기 전에 그쪽이 먼저 머지할 수 있다 — 그래도 결과는 같으므로 문제는 아니지만, 어느 쪽이 머지했는지 Actions 로그로 구분해 둔다.
2. 머지 뒤 `release.yml` 실행이 실제로 생겼는지 Actions 에서 확인한다. 없으면 설계서 6절의 가정이 틀린 것이므로 디스패치를 되살린다.
3. `issue-to-pr` 스킬 브랜치(`f6d9d03`)와 이 브랜치 중 나중에 랜딩하는 쪽이 상대를 고친다. 그 스킬의 "PR 을 열면 리뷰가 돌고, 통과 신호가 남으면 자동으로 머지된다. 즉 PR 생성은 사람이 개입할 수 있는 마지막 지점이다" 문단이 이 변경으로 무효가 된다 — `/merge` 를 부르는 단계를 더해야 한다.
