# 자동 승인·자동 머지 워크플로 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `devbak create`/`update`가 놓는 프로젝트와 이 저장소 모두에서, 승인이 1건 이상이면 PR을 자동으로 rebase 머지한다.

**Architecture:** 승인 판정과 머지를 별도 워크플로(`auto-merge.yml`)로 분리한다. GITHUB_TOKEN이 일으킨 이벤트는 새 워크플로 실행을 만들지 않으므로, Claude 봇 승인은 `workflow_run`(리뷰 워크플로 완료)으로, 사람 승인은 `pull_request_review`로 각각 듣는다. 승인 수는 브랜치 보호 설정에 의존하는 `reviewDecision` 대신 `reviews` 배열을 리뷰어별 최신으로 접어 직접 센다. CLI 소스 변경은 없다 — `copyOverlay('_shared')`와 `ci` 카테고리가 create/update 배선을 이미 덮는다.

**Tech Stack:** GitHub Actions YAML, `gh` CLI, `jq`, Vitest

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-07-auto-merge-design.md`. 절 번호는 이 문서를 가리킨다.
- 작업 브랜치: `feature/auto-merge-workflow` (이미 `origin/main` 기준으로 생성됨).
- 패키지 매니저는 **pnpm**. `npm`을 쓰지 않는다.
- 워크플로에 `actions/checkout`을 **넣지 않는다**. `workflow_run`·`pull_request_review`는 권한 있는 트리거라 fork PR 코드를 체크아웃하면 토큰이 탈취된다 (설계 5.2절).
- 체크아웃이 없으므로 **모든 `gh pr` 호출에 `--repo "$REPO"`를 넘긴다**. git remote로 저장소를 추론할 수 없다.
- 머지는 `--rebase --delete-branch`. `--squash`·`--merge`를 쓰지 않는다.
- 게이트 미충족은 **`exit 0` + 로그**. 판정 불가(`gh` 호출 실패)와 머지 실패만 `exit 1`.
- 모든 `run:` 블록은 `set -euo pipefail`로 시작한다.
- 옵아웃 라벨 이름은 `no-auto-merge`.
- 리뷰 워크플로 이름은 `Claude Code Review` (`templates/_shared/.github/workflows/claude-review.yml`의 `name:` 값).
- 커밋 메시지는 한글 imperative. 접두는 `decide.ts`의 `BUMP_BY_TYPE`(`feat`/`fix`/`refactor`/`perf`/`build`)이 릴리스를 결정하므로 의도한 것만 쓴다.

## File Structure

| 파일 | 상태 | 책임 |
| --- | --- | --- |
| `packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml` | 신규 | 생성물의 자동 머지. 두 트리거·6게이트·rebase 머지 |
| `packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml` | 수정 | 리뷰 결과를 승인 **또는 변경 요청**으로 남기게 한다 |
| `packages/devkit-cli/tests/auto-merge-workflow.test.ts` | 신규 | 위 두 파일의 구조·결합 단언 |
| `.github/workflows/auto-merge.yml` | 신규 | 이 저장소의 자동 머지 + 릴리스 재기동 |
| `README.md` | 수정 | 생성물 자산 설명 갱신 |
| `packages/devkit-cli/README.md` | 수정 | 리뷰 자산 표·생성 트리·CI 절 갱신 |
| `work-log.md` | 수정 | 작업 기록 |

**변경하지 않는 것** (확인 완료, 손대면 안 됨):

- `src/**` — CLI 소스. `copyOverlay('_shared')`가 트리를 재귀 복사하고 `categoryOf`의 `/^\.github\/workflows\/.+/ → 'ci'`가 update를 덮는다.
- `tests/__snapshots__/*.snap` — `copyOverlay.describe()`는 `{template, vars, expectUpstream}`만 낸다. 파일 목록이 없으므로 스냅샷은 바뀌지 않는다.
- `tests/e2e/**` — `.github`를 단언하는 곳이 없다 (grep 확인).

---

### Task 1: 템플릿 auto-merge.yml

생성되는 모든 프로젝트가 갖게 될 자동 머지 워크플로와 그 구조 테스트.

**Files:**
- Create: `packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml`
- Test: `packages/devkit-cli/tests/auto-merge-workflow.test.ts`

**Interfaces:**
- Consumes: `templates/_shared/.github/workflows/claude-review.yml`의 최상위 `name:` 값 = `Claude Code Review`. 이 문자열이 `auto-merge.yml`의 `workflows:` 목록과 일치해야 한다.
- Produces: 워크플로 이름 `Auto Merge`. 이 값은 `${{ github.workflow }}`로 자기 자신을 체크 집계에서 빼는 데 쓰인다 — Task 3이 같은 구조를 재사용한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/auto-merge-workflow.test.ts` 생성:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));
const WORKFLOWS_DIR = `${TEMPLATES_DIR}_shared/.github/workflows`;
const AUTO_MERGE = `${WORKFLOWS_DIR}/auto-merge.yml`;
const CLAUDE_REVIEW = `${WORKFLOWS_DIR}/claude-review.yml`;

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
    const doc = await readAutoMerge();
    expect(doc).not.toContain('reviewDecision');
  });

  it('PR 코드를 체크아웃하지 않는다', async () => {
    // workflow_run 과 pull_request_review 는 base 저장소 컨텍스트에서
    // 시크릿과 쓰기 토큰을 들고 도는 권한 있는 트리거다. head 를 체크아웃해
    // 무언가 실행하면 fork PR 이 임의 코드로 그 토큰을 가져간다(설계 5.2절).
    const doc = await readAutoMerge();
    expect(doc).not.toContain('actions/checkout');
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
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/auto-merge-workflow.test.ts
```

Expected: FAIL. `readdir`가 `auto-merge.yml`을 찾지 못하고, 나머지는 `ENOENT`로 죽는다.

- [ ] **Step 3: 워크플로를 만든다**

`packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml` 생성:

```yaml
name: Auto Merge

# 승인이 1건 이상이면 PR 을 rebase 로 머지한다.
#
# 트리거가 둘인 이유. GitHub 은 GITHUB_TOKEN 이 일으킨 이벤트로 새 워크플로
# 실행을 만들지 않는다(workflow_dispatch·repository_dispatch 만 예외).
# claude-review.yml 은 GITHUB_TOKEN 으로 승인하므로 그 승인은
# pull_request_review 를 발화시키지 못한다 — 그래서 workflow_run 으로 리뷰
# 워크플로의 "완료"를 듣는다. 사람이 UI 에서 누른 승인은 사람 토큰이라
# pull_request_review 가 정상 발화한다. 하나만 두면 두 경로 중 하나가
# 아무 신호 없이 죽는다.
#
# CI 워크플로를 추가하면 그 이름을 아래 workflows: 목록에도 넣어야 한다.
# 넣지 않으면, 승인 시점에 그 체크가 진행 중일 때 이 워크플로가 "보류"로
# 끝난 뒤 다시 깨어날 트리거가 없어 PR 이 승인된 채로 멈춘다.
on:
  workflow_run:
    workflows: ['Claude Code Review']
    types: [completed]
  pull_request_review:
    types: [submitted]

permissions:
  contents: write # 머지
  pull-requests: write # 머지 API·브랜치 삭제
  checks: read # statusCheckRollup 조회

# 두 트리거가 **같은 키**를 만들어야 한다. 한쪽을 PR 번호로 잡으면 같은 PR 의
# 두 실행이 서로 다른 그룹에 들어가 동시에 머지를 시도한다.
# cancel-in-progress: false 여야 한다 — 취소하면 먼저 도착한 판정이 버려진다.
concurrency:
  group: auto-merge-${{ github.event.workflow_run.head_sha || github.event.pull_request.head.sha }}
  cancel-in-progress: false

jobs:
  merge:
    # 리뷰 워크플로가 실패했으면 머지를 시도할 이유가 없다.
    if: github.event_name == 'pull_request_review' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    # 체크아웃 단계가 없다. workflow_run 과 pull_request_review 는 base 저장소
    # 컨텍스트에서 시크릿과 쓰기 토큰을 들고 도는 **권한 있는 트리거**다 —
    # PR 의 head 를 체크아웃해 무언가 실행하면 fork PR 이 임의 코드로 그
    # 토큰을 가져갈 수 있다. actions/checkout 을 추가하지 말 것.
    # 체크아웃이 없으므로 gh 는 git remote 로 저장소를 추론할 수 없다 —
    # 모든 호출에 --repo 를 넘긴다.
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      REPO: ${{ github.repository }}
    steps:
      - name: PR 번호 확정
        id: pr
        env:
          EVENT: ${{ github.event_name }}
          PR_FROM_REVIEW: ${{ github.event.pull_request.number }}
          HEAD_SHA: ${{ github.event.workflow_run.head_sha }}
        run: |
          set -euo pipefail
          if [ "$EVENT" = 'pull_request_review' ]; then
            NUMBER="$PR_FROM_REVIEW"
          else
            # workflow_run.pull_requests[] 를 쓰지 않는다 — fork 에서 온 PR 에
            # 대해 비어 있다. head SHA 역조회는 fork 여부와 무관하게 동작한다.
            NUMBER=$(gh api "repos/$REPO/commits/$HEAD_SHA/pulls" \
              --jq '[.[] | select(.state == "open")][0].number // empty')
          fi
          if [ -z "$NUMBER" ]; then
            echo "열린 PR 을 찾지 못했습니다 — 대상 없음"
          else
            echo "대상 PR: #$NUMBER"
          fi
          echo "number=$NUMBER" >> "$GITHUB_OUTPUT"

      - name: 판정하고 머지
        if: steps.pr.outputs.number != ''
        env:
          PR: ${{ steps.pr.outputs.number }}
          SELF: ${{ github.workflow }}
          OPT_OUT_LABEL: no-auto-merge
        run: |
          set -euo pipefail

          gh pr view "$PR" --repo "$REPO" --json state,isDraft,labels,reviews,statusCheckRollup > pr.json

          # 게이트 전체를 jq 한 프로그램에 모은다. 셸 분기로 흩으면 조건이
          # 늘 때 조용히 빠지는 가지가 생긴다. 결과는 항상 한 줄로 로그에
          # 남는다 — "왜 안 머지됐는가"가 실행 로그만으로 읽혀야 한다.
          VERDICT=$(jq -r --arg SELF "$SELF" --arg LABEL "$OPT_OUT_LABEL" '
            def norm: (. // "") | ascii_upcase;
            def isbad($v): ["FAILURE","CANCELLED","TIMED_OUT","ACTION_REQUIRED","STARTUP_FAILURE","ERROR"] | index($v) != null;

            # 리뷰어별 최신 리뷰만 남긴다. COMMENTED 는 집계에서 뺀다 —
            # 승인 뒤에 코멘트를 하나 더 남긴 리뷰어를 승인 취소로 오판한다.
            # DISMISSED 는 포함하되 승인으로 세지 않는다(철회가 반영돼야 한다).
            # reviewDecision 은 쓰지 않는다 — 브랜치 보호의 required reviews
            # 설정에 좌우되고, 설정이 없는 저장소에서는 비어 나온다.
            def latest:
              [ (.reviews // [])[]
                | select(.state == "APPROVED"
                      or .state == "CHANGES_REQUESTED"
                      or .state == "DISMISSED") ]
              | group_by(.author.login)
              | map(max_by(.submittedAt));

            # 자기 자신을 workflowName 으로 뺀다. CheckRun 의 .name 은
            # 워크플로가 아니라 **잡** 이름이라, .name 으로 거르면 잡 이름과
            # 어긋나 자기 자신이 집계에 남는다 — 그 체크는 항상 IN_PROGRESS
            # 이므로 영원히 머지되지 않는다. StatusContext(외부 CI)에는 이
            # 필드가 없으므로 // "" 로 받아 통과시킨다.
            def others:
              [ (.statusCheckRollup // [])[] | select((.workflowName // "") != $SELF) ];

            def approvals: latest | map(select(.state == "APPROVED")) | length;
            def rejections: latest | map(select(.state == "CHANGES_REQUESTED")) | length;
            def pending:
              others
              | map(select(((.status | norm) | . != "" and . != "COMPLETED")
                        or ((.state | norm) == "PENDING")))
              | length;
            def failing:
              others
              | map(select(isbad(.conclusion | norm) or isbad(.state | norm)))
              | length;

            if .state != "OPEN" then "skip: PR 이 열려 있지 않습니다 (state=\(.state))"
            elif .isDraft then "skip: draft PR 입니다"
            elif ([(.labels // [])[].name] | index($LABEL)) then "skip: \($LABEL) 라벨이 붙어 있습니다"
            elif rejections > 0 then "skip: 변경 요청이 \(rejections)건 있습니다"
            elif approvals < 1 then "skip: 승인이 없습니다"
            elif pending > 0 then "skip: 체크 \(pending)건이 아직 진행 중입니다"
            elif failing > 0 then "skip: 실패한 체크가 \(failing)건 있습니다"
            else "merge: 승인 \(approvals)건, 체크 통과"
            end
          ' pr.json)

          echo "$VERDICT"

          # 게이트에 걸린 것은 고장이 아니라 정상 상태다. 실패로 끝내면 PR
          # 체크가 빨간불이 되어 "조건이 아직 안 갖춰졌다"를 고장으로 보이게 한다.
          case "$VERDICT" in
            merge:*) ;;
            *) exit 0 ;;
          esac

          gh pr merge "$PR" --repo "$REPO" --rebase --delete-branch
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/auto-merge-workflow.test.ts
```

Expected: PASS (10건).

- [ ] **Step 5: jq 프로그램이 실제로 파싱되는지 확인한다**

문자열 단언은 jq 문법 오류를 잡지 못한다. 실물로 검증한다.

```bash
cd /Users/dabot/Documents/develop/eslint
# 워크플로에서 jq 프로그램만 뽑아 빈 입력으로 문법 검사한다.
python3 - <<'PY' > /tmp/gate.jq
import re, pathlib
y = pathlib.Path('packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml').read_text()
body = y.split("jq -r --arg SELF \"$SELF\" --arg LABEL \"$OPT_OUT_LABEL\" '", 1)[1]
print(body.split("\n          ' pr.json)", 1)[0])
PY
echo '{"state":"OPEN","isDraft":false,"labels":[],"reviews":[],"statusCheckRollup":[]}' \
  | jq -r --arg SELF 'Auto Merge' --arg LABEL 'no-auto-merge' -f /tmp/gate.jq
```

Expected: `skip: 승인이 없습니다`

승인 1건 + 체크 통과도 확인한다:

```bash
echo '{"state":"OPEN","isDraft":false,"labels":[],"reviews":[{"author":{"login":"a"},"state":"APPROVED","submittedAt":"2026-08-07T00:00:00Z"}],"statusCheckRollup":[{"workflowName":"CI","status":"COMPLETED","conclusion":"SUCCESS"}]}' \
  | jq -r --arg SELF 'Auto Merge' --arg LABEL 'no-auto-merge' -f /tmp/gate.jq
```

Expected: `merge: 승인 1건, 체크 통과`

자기 자신이 제외되는지도 확인한다 — 이걸 놓치면 데드락이다:

```bash
echo '{"state":"OPEN","isDraft":false,"labels":[],"reviews":[{"author":{"login":"a"},"state":"APPROVED","submittedAt":"2026-08-07T00:00:00Z"}],"statusCheckRollup":[{"workflowName":"Auto Merge","name":"merge","status":"IN_PROGRESS","conclusion":null}]}' \
  | jq -r --arg SELF 'Auto Merge' --arg LABEL 'no-auto-merge' -f /tmp/gate.jq
```

Expected: `merge: 승인 1건, 체크 통과` (진행 중인 자기 자신이 제외됐다는 뜻)

같은 리뷰어가 변경 요청 뒤 승인한 경우:

```bash
echo '{"state":"OPEN","isDraft":false,"labels":[],"reviews":[{"author":{"login":"a"},"state":"CHANGES_REQUESTED","submittedAt":"2026-08-07T00:00:00Z"},{"author":{"login":"a"},"state":"APPROVED","submittedAt":"2026-08-07T01:00:00Z"}],"statusCheckRollup":[]}' \
  | jq -r --arg SELF 'Auto Merge' --arg LABEL 'no-auto-merge' -f /tmp/gate.jq
```

Expected: `merge: 승인 1건, 체크 통과`

**어느 하나라도 다른 결과가 나오면 jq 프로그램을 고치고 이 단계를 다시 돈다.**
`/tmp/gate.jq`는 검증용이므로 저장소에 남기지 않는다 (`/tmp` 밖에 만들지 말 것 —
저장소 안에 만들면 자동 커밋 훅이 집어간다).

- [ ] **Step 6: 전체 검증**

```bash
cd /Users/dabot/Documents/develop/eslint
pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
```

Expected: 전부 PASS. 스냅샷은 바뀌지 않아야 한다 (`copyOverlay.describe()`에 파일 목록이 없다). **스냅샷이 깨지면 그건 예상 밖이므로 `-u`로 덮지 말고 원인을 먼저 본다.**

- [ ] **Step 7: 커밋**

```bash
cd /Users/dabot/Documents/develop/eslint
git add packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml \
        packages/devkit-cli/tests/auto-merge-workflow.test.ts
git commit -m "$(cat <<'EOF'
feat: 승인 1건 이상이면 PR 을 자동 머지하는 워크플로를 템플릿에 더한다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: claude-review.yml 을 대칭으로 만든다

리뷰가 문제를 찾았을 때 `CHANGES_REQUESTED`를 실제로 남기게 한다. 남기지 않으면 Task 1의 게이트 4(변경 요청 없음)가 아무것도 막지 못한다.

**Files:**
- Modify: `packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml:34`
- Test: `packages/devkit-cli/tests/auto-merge-workflow.test.ts` (Task 1이 만든 파일에 describe 블록 추가)

**Interfaces:**
- Consumes: Task 1의 `auto-merge.yml`. 그 게이트가 `CHANGES_REQUESTED` 상태를 읽는다.
- Produces: 없음. 최상위 `name: 'Claude Code Review'`는 **바꾸지 않는다** — Task 1의 `workflows:` 목록이 이 값에 결합돼 있고, 그 결합은 Task 1의 테스트가 고정한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/auto-merge-workflow.test.ts` **끝에** 추가:

```ts
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
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/auto-merge-workflow.test.ts
```

Expected: `_shared 리뷰 워크플로` 중 2건 FAIL (`--request-changes` 없음, 문구 없음). `gh pr review` 단언은 이미 통과한다.

- [ ] **Step 3: 프롬프트를 고친다**

`templates/_shared/.github/workflows/claude-review.yml`의 34번 줄을 찾는다:

```yaml
            리뷰 완료 후 심각한 문제가 없으면 `gh pr review ${{ github.event.pull_request.number }} --approve -b "LGTM"` 명령으로 승인해주세요.
```

이것을 아래로 바꾼다 (들여쓰기 12칸 유지):

```yaml
            리뷰를 마치면 반드시 승인 또는 변경 요청 중 하나를 남깁니다.
            코멘트만 남기고 끝내지 않습니다 — 자동 머지(.github/workflows/auto-merge.yml)가
            이 리뷰 상태를 게이트로 읽습니다. 상태를 남기지 않으면 문제를 찾고도
            나중에 들어온 승인 하나로 그대로 머지됩니다.

            - 심각한 문제가 없으면:
              `gh pr review ${{ github.event.pull_request.number }} --approve -b "LGTM"`
            - 심각한 문제가 있으면:
              `gh pr review ${{ github.event.pull_request.number }} --request-changes -b "<문제 요약>"`
```

`claude_args`의 `--allowedTools`는 이미 `Bash(gh pr review:*)`를 포함하므로 **바꾸지 않는다**.
최상위 `name: 'Claude Code Review'`도 **바꾸지 않는다**.

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

```bash
cd packages/devkit-cli && pnpm vitest run tests/auto-merge-workflow.test.ts
```

Expected: PASS (13건 — Task 1의 10건 + 이번 3건).

- [ ] **Step 5: 전체 검증**

```bash
cd /Users/dabot/Documents/develop/eslint
pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
```

Expected: 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
cd /Users/dabot/Documents/develop/eslint
git add packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml \
        packages/devkit-cli/tests/auto-merge-workflow.test.ts
git commit -m "$(cat <<'EOF'
fix: 리뷰가 문제를 찾으면 변경 요청 상태를 남기게 한다

승인만 지시하면 인라인 코멘트만 남고 CHANGES_REQUESTED 가 안 찍혀,
자동 머지의 "변경 요청 없음" 게이트가 아무것도 막지 못한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 이 저장소의 auto-merge.yml

같은 로직에 트리거 하나, 권한 하나, 머지 후 릴리스 재기동이 다르다.

**Files:**
- Create: `.github/workflows/auto-merge.yml`

**Interfaces:**
- Consumes: Task 1의 워크플로 구조(게이트 jq 프로그램)를 그대로 재사용한다. `.github/workflows/release.yml`의 `workflow_dispatch` 트리거와 파일명 `release.yml`에 결합한다.
- Produces: 없음.

**이 태스크에는 테스트가 없다.** 이 파일은 `devkit-cli` 패키지의 템플릿 자산이 아니라 이 저장소의 운영 설정이다(설계 9.3절). `axisOf`가 `packages/`로 시작하지 않는 경로에 `null`을 주므로 **릴리스 버전에도 영향이 없다.**

- [ ] **Step 1: `release.yml` 이 workflow_dispatch 를 갖는지 확인한다**

```bash
cd /Users/dabot/Documents/develop/eslint
grep -n "workflow_dispatch\|concurrency\|group: release" .github/workflows/release.yml
```

Expected: `workflow_dispatch:` (6번 줄 근처), `concurrency:` / `group: release` 가 모두 보인다.
**셋 중 하나라도 없으면 여기서 멈추고 사람에게 알린다** — 릴리스 재기동의 전제가 깨진 것이다.

- [ ] **Step 2: 워크플로를 만든다**

`.github/workflows/auto-merge.yml` 생성:

```yaml
name: Auto Merge

# 승인이 1건 이상이면 PR 을 rebase 로 머지하고, 그 뒤 release.yml 을 깨운다.
#
# 트리거가 pull_request_review 하나인 이유. 이 저장소에는 Claude 리뷰
# 워크플로가 없어 workflow_run 으로 들을 대상이 없다. 승인은 사람이 하고,
# 사람 토큰이 만든 이벤트는 정상적으로 워크플로를 트리거한다.
#
# 알려진 한계 — PR 에서 도는 CI 워크플로를 나중에 추가하면 이 파일도 고쳐야
# 한다. 승인 시점에 그 체크가 진행 중이면 아래 게이트가 "보류"로 끝나는데,
# 다시 깨워 줄 트리거가 없어 PR 이 승인된 채로 멈춘다. 그때는 여기에
#
#   workflow_run:
#     workflows: ['<그 워크플로의 name>']
#     types: [completed]
#
# 을 더하고, 잡의 if 에 workflow_run 성공 조건을 넣어야 한다
# (templates/_shared/.github/workflows/auto-merge.yml 이 그 형태다).
on:
  pull_request_review:
    types: [submitted]

permissions:
  contents: write # 머지
  pull-requests: write # 머지 API·브랜치 삭제
  checks: read # statusCheckRollup 조회
  actions: write # 머지 후 release.yml 을 workflow_dispatch 로 깨운다

concurrency:
  group: auto-merge-${{ github.event.pull_request.head.sha }}
  cancel-in-progress: false

jobs:
  merge:
    runs-on: ubuntu-latest
    # 체크아웃 단계가 없다. pull_request_review 는 base 저장소 컨텍스트에서
    # 시크릿과 쓰기 토큰을 들고 도는 **권한 있는 트리거**다 — PR 의 head 를
    # 체크아웃해 무언가 실행하면 fork PR 이 임의 코드로 그 토큰을 가져갈 수
    # 있다. actions/checkout 을 추가하지 말 것. 체크아웃이 없으므로 gh 는
    # git remote 로 저장소를 추론할 수 없다 — 모든 호출에 --repo 를 넘긴다.
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      REPO: ${{ github.repository }}
    steps:
      - name: 판정하고 머지
        env:
          PR: ${{ github.event.pull_request.number }}
          SELF: ${{ github.workflow }}
          OPT_OUT_LABEL: no-auto-merge
        run: |
          set -euo pipefail

          gh pr view "$PR" --repo "$REPO" --json state,isDraft,labels,reviews,statusCheckRollup > pr.json

          # 게이트 전체를 jq 한 프로그램에 모은다. 셸 분기로 흩으면 조건이
          # 늘 때 조용히 빠지는 가지가 생긴다. 결과는 항상 한 줄로 로그에
          # 남는다 — "왜 안 머지됐는가"가 실행 로그만으로 읽혀야 한다.
          VERDICT=$(jq -r --arg SELF "$SELF" --arg LABEL "$OPT_OUT_LABEL" '
            def norm: (. // "") | ascii_upcase;
            def isbad($v): ["FAILURE","CANCELLED","TIMED_OUT","ACTION_REQUIRED","STARTUP_FAILURE","ERROR"] | index($v) != null;

            # 리뷰어별 최신 리뷰만 남긴다. COMMENTED 는 집계에서 뺀다 —
            # 승인 뒤에 코멘트를 하나 더 남긴 리뷰어를 승인 취소로 오판한다.
            # DISMISSED 는 포함하되 승인으로 세지 않는다(철회가 반영돼야 한다).
            # reviewDecision 은 쓰지 않는다 — 브랜치 보호의 required reviews
            # 설정에 좌우되고, 설정이 없는 저장소에서는 비어 나온다.
            def latest:
              [ (.reviews // [])[]
                | select(.state == "APPROVED"
                      or .state == "CHANGES_REQUESTED"
                      or .state == "DISMISSED") ]
              | group_by(.author.login)
              | map(max_by(.submittedAt));

            # 자기 자신을 workflowName 으로 뺀다. CheckRun 의 .name 은
            # 워크플로가 아니라 **잡** 이름이라, .name 으로 거르면 잡 이름과
            # 어긋나 자기 자신이 집계에 남는다 — 그 체크는 항상 IN_PROGRESS
            # 이므로 영원히 머지되지 않는다. StatusContext(외부 CI)에는 이
            # 필드가 없으므로 // "" 로 받아 통과시킨다.
            def others:
              [ (.statusCheckRollup // [])[] | select((.workflowName // "") != $SELF) ];

            def approvals: latest | map(select(.state == "APPROVED")) | length;
            def rejections: latest | map(select(.state == "CHANGES_REQUESTED")) | length;
            def pending:
              others
              | map(select(((.status | norm) | . != "" and . != "COMPLETED")
                        or ((.state | norm) == "PENDING")))
              | length;
            def failing:
              others
              | map(select(isbad(.conclusion | norm) or isbad(.state | norm)))
              | length;

            if .state != "OPEN" then "skip: PR 이 열려 있지 않습니다 (state=\(.state))"
            elif .isDraft then "skip: draft PR 입니다"
            elif ([(.labels // [])[].name] | index($LABEL)) then "skip: \($LABEL) 라벨이 붙어 있습니다"
            elif rejections > 0 then "skip: 변경 요청이 \(rejections)건 있습니다"
            elif approvals < 1 then "skip: 승인이 없습니다"
            elif pending > 0 then "skip: 체크 \(pending)건이 아직 진행 중입니다"
            elif failing > 0 then "skip: 실패한 체크가 \(failing)건 있습니다"
            else "merge: 승인 \(approvals)건, 체크 통과"
            end
          ' pr.json)

          echo "$VERDICT"

          # 게이트에 걸린 것은 고장이 아니라 정상 상태다. 실패로 끝내면 PR
          # 체크가 빨간불이 되어 "조건이 아직 안 갖춰졌다"를 고장으로 보이게 한다.
          case "$VERDICT" in
            merge:*) ;;
            *) exit 0 ;;
          esac

          gh pr merge "$PR" --repo "$REPO" --rebase --delete-branch

          # GITHUB_TOKEN 이 만든 push 는 워크플로를 트리거하지 않는다 —
          # release.yml 은 on: push: branches: [main] 이므로, 자동 머지를 켠
          # 순간 릴리스가 아무 신호 없이 멈춘다. workflow_dispatch 는 그
          # 규칙의 **명시적 예외**라 여기서 되살릴 수 있다(PAT 불필요).
          #
          # 실패하면 이 잡을 실패시킨다. 조용히 넘어가면 "머지는 됐는데
          # 릴리스는 안 된" 상태가 신호 없이 남는다. release.yml 의
          # concurrency(group: release)가 중복 실행을 직렬화하므로 사람이
          # 다시 돌려도 안전하다.
          gh workflow run release.yml --repo "$REPO" --ref main
          echo "release.yml 을 디스패치했습니다"
```

- [ ] **Step 3: 게이트가 Task 1 과 동일한지 확인한다**

두 파일의 jq 프로그램은 글자 그대로 같아야 한다. 다르면 한쪽만 고쳐지는 드리프트가 생긴다.

```bash
cd /Users/dabot/Documents/develop/eslint
diff <(sed -n '/def norm:/,/end$/p' .github/workflows/auto-merge.yml) \
     <(sed -n '/def norm:/,/end$/p' packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml)
```

Expected: 출력 없음 (동일). 다르면 맞춘다.

- [ ] **Step 4: YAML 이 파싱되는지 확인한다**

이 환경에는 `pyyaml`이 없다(`python3 -c "import yaml"`은 `ModuleNotFoundError`로 죽는다).
macOS가 기본 제공하는 ruby의 psych를 쓴다.

```bash
cd /Users/dabot/Documents/develop/eslint
for f in .github/workflows/auto-merge.yml packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml; do
  ruby -ryaml -e 'd=YAML.load_file(ARGV[0]); puts "#{ARGV[0]}: parse OK, name=#{d["name"].inspect}"' "$f"
done
```

Expected: 두 줄 모두 `parse OK, name="Auto Merge"`

**문자열 단언은 YAML 문법 오류를 잡지 못한다** — 테스트는 `readFile`로 원문 텍스트를 읽으므로
YAML이 깨져도 그대로 통과한다. 이 단계를 "테스트가 검증한다"는 이유로 건너뛰지 말 것.

- [ ] **Step 5: 전체 검증**

```bash
cd /Users/dabot/Documents/develop/eslint
pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
```

Expected: 전부 PASS.

- [ ] **Step 6: 커밋**

```bash
cd /Users/dabot/Documents/develop/eslint
git add .github/workflows/auto-merge.yml
git commit -m "$(cat <<'EOF'
ci: 이 저장소에 자동 머지와 릴리스 재기동을 배선한다

GITHUB_TOKEN 이 만든 머지 push 는 release.yml 을 트리거하지 않는다.
머지 직후 workflow_dispatch 로 깨운다 — 그 규칙의 명시적 예외다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 문서와 작업 기록

**Files:**
- Modify: `README.md:172-175`
- Modify: `packages/devkit-cli/README.md` (136번 줄 표, 145·147번 줄 문단, 149절, 218·238번 줄 트리)
- Modify: `work-log.md`

**Interfaces:** 없음.

- [ ] **Step 1: 루트 README 를 고친다**

`README.md`에서 이 문단을 찾는다 (172번 줄 근처):

```markdown
세 유형 모두 Claude 기반 코드 리뷰 자산(`/review` 슬래시 커맨드, PR 자동 리뷰
워크플로, 유형별 리뷰어 에이전트)을 함께 놓는다. CI 워크플로를 실제로 돌리려면
생성된 저장소에 시크릿 `CLAUDE_CODE_OAUTH_TOKEN`을 등록해야 한다(API key가 아니다).
자세한 내용은 [`packages/devkit-cli/README.md`](packages/devkit-cli/README.md).
```

이것을 아래로 바꾼다:

```markdown
세 유형 모두 Claude 기반 코드 리뷰 자산(`/review` 슬래시 커맨드, PR 자동 리뷰
워크플로, 유형별 리뷰어 에이전트)과 **자동 머지 워크플로**를 함께 놓는다. 리뷰가
통과하면 Claude가 승인하고, 승인이 1건 이상이면 PR이 rebase로 머지된다. `no-auto-merge`
라벨을 붙이면 그 PR은 제외된다. CI 워크플로를 실제로 돌리려면 생성된 저장소에 시크릿
`CLAUDE_CODE_OAUTH_TOKEN`을 등록해야 한다(API key가 아니다).
자세한 내용은 [`packages/devkit-cli/README.md`](packages/devkit-cli/README.md).
```

- [ ] **Step 2: devkit-cli README 의 자산 표를 고친다**

`packages/devkit-cli/README.md`의 136번 줄:

```markdown
| `templates/_shared/.github/workflows/claude-review.yml` | PR 자동 리뷰 워크플로 |
```

바로 아래에 한 줄을 더한다:

```markdown
| `templates/_shared/.github/workflows/auto-merge.yml` | 승인 1건 이상이면 자동 머지 |
```

- [ ] **Step 3: devkit-cli README 의 생성 트리 두 곳을 고친다**

218번 줄과 238번 줄의 `.github/workflows/claude-review.yml` 아래에 각각 같은 들여쓰기로 한 줄을 더한다:

```
    .github/workflows/auto-merge.yml
```

- [ ] **Step 4: devkit-cli README 의 "CI 워크플로를 쓰려면" 절을 고친다**

149번 줄의 `### CI 워크플로를 쓰려면` 절 본문 뒤에 다음 절을 통째로 추가한다:

```markdown
### 자동 머지

`auto-merge.yml`은 승인이 **1건 이상**이면 PR을 `--rebase --delete-branch`로 머지한다.
아래 여섯 게이트를 모두 통과해야 한다.

| 게이트 | 통과 조건 |
| --- | --- |
| 상태 | PR이 `OPEN` |
| draft | draft가 아님 |
| 라벨 | `no-auto-merge` 라벨이 없음 |
| 변경 요청 | 리뷰어별 **최신** 리뷰에 `CHANGES_REQUESTED`가 없음 |
| 승인 | 리뷰어별 최신 리뷰 중 `APPROVED`가 1건 이상 |
| 체크 | 자기 자신을 뺀 모든 체크가 성공(진행 중도 불가) |

게이트에 걸리면 이유를 로그에 남기고 **정상 종료**한다. 조건이 아직 안 갖춰진 것은
고장이 아니므로 PR 체크를 빨간불로 만들지 않는다.

**트리거가 둘인 이유.** GitHub은 `GITHUB_TOKEN`이 일으킨 이벤트로 새 워크플로 실행을
만들지 않는다(`workflow_dispatch`·`repository_dispatch`만 예외). `claude-review.yml`은
`GITHUB_TOKEN`으로 승인하므로 그 승인은 `pull_request_review`를 발화시키지 못한다 —
그래서 `workflow_run`으로 리뷰 워크플로의 완료를 듣는다. 사람이 UI에서 누른 승인은
사람 토큰이라 `pull_request_review`가 정상 발화한다. **하나만 두면 두 경로 중 하나가
아무 신호 없이 죽는다.**

**CI 워크플로를 추가하면 `auto-merge.yml`도 고쳐야 한다.** `on.workflow_run.workflows`
목록에 그 워크플로 이름을 넣지 않으면, 승인 시점에 그 체크가 진행 중일 때 자동 머지가
"보류"로 끝난 뒤 다시 깨어날 트리거가 없어 PR이 승인된 채로 멈춘다.

**승인 수는 `reviewDecision`으로 세지 않는다.** 그 값은 브랜치 보호의 required reviews
설정에 좌우되고, 설정이 없는 저장소에서는 비어 나온다 — 새로 만든 프로젝트는 전부 그
상태라 쓰면 영원히 머지되지 않는다. 대신 `reviews`를 리뷰어별 최신으로 접어 직접 센다.

**이 워크플로는 PR 코드를 체크아웃하지 않는다.** `workflow_run`·`pull_request_review`는
base 저장소 컨텍스트에서 시크릿과 쓰기 토큰을 들고 도는 권한 있는 트리거다. head를
체크아웃해 무언가 실행하면 fork PR이 임의 코드로 그 토큰을 가져갈 수 있다.
`tests/auto-merge-workflow.test.ts`가 `actions/checkout` 부재를 단언으로 고정한다.
```

- [ ] **Step 5: 문서 링크와 표가 깨지지 않았는지 본다**

```bash
cd /Users/dabot/Documents/develop/eslint
pnpm format:check
grep -c "auto-merge.yml" README.md packages/devkit-cli/README.md
```

Expected: `format:check` PASS. 루트 README 0건(파일명을 쓰지 않고 설명만 넣었다),
devkit-cli README 5건(표 1 + 트리 2 + 본문 2).
`format:check`가 실패하면 `pnpm format`을 돌린다.

- [ ] **Step 6: work-log 를 쓴다**

`work-log.md`는 **최신이 맨 위**다. 3번 줄에 `## 2026-08-07` 헤더가 **이미 있으므로
새 날짜 헤더를 만들지 않는다** — 그 헤더 바로 아래(4번 줄부터)에 `###` 항목 하나를
끼워 넣는다. 새 `## 2026-08-07`을 또 만들면 같은 날짜가 두 번 나온다.

```markdown
### 자동 승인·자동 머지 워크플로
- **변경 파일**:
  - `packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml` (신규)
  - `packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml`
  - `packages/devkit-cli/tests/auto-merge-workflow.test.ts` (신규)
  - `.github/workflows/auto-merge.yml` (신규)
  - `README.md`, `packages/devkit-cli/README.md`
- **내용**: 승인이 1건 이상이면 PR을 rebase 머지하는 워크플로를 템플릿과 이 저장소에
  더했다. 설계를 지배한 제약은 **GITHUB_TOKEN이 일으킨 이벤트는 새 워크플로 실행을
  만들지 않는다**는 것이다 — Claude가 GITHUB_TOKEN으로 남긴 승인은
  `pull_request_review`를 발화시키지 못하므로 `workflow_run`으로 리뷰 워크플로의
  완료를 함께 듣는다. 같은 제약 때문에 이 저장소에서는 자동 머지가 만든 push가
  `release.yml`을 트리거하지 못해, 머지 직후 `gh workflow run release.yml`로
  깨운다(`workflow_dispatch`는 그 규칙의 명시적 예외다). 승인 수는 브랜치 보호
  설정에 좌우되는 `reviewDecision` 대신 `reviews`를 리뷰어별 최신으로 접어 직접
  센다. 체크 게이트는 자기 자신을 `workflowName`으로 빼야 한다 — `.name`은
  워크플로가 아니라 잡 이름이라 그걸로 거르면 데드락이 그대로 남는다.
  CLI 소스 변경은 없다(`copyOverlay('_shared')`와 `ci` 카테고리가 이미 덮는다).
- **커밋**: (Task 1~4의 실제 해시로 채운다)
```

- [ ] **Step 7: 커밋**

```bash
cd /Users/dabot/Documents/develop/eslint
git add README.md packages/devkit-cli/README.md work-log.md
git commit -m "$(cat <<'EOF'
docs: 자동 승인·자동 머지 워크플로를 문서화한다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: work-log 의 커밋 해시를 채운다**

```bash
cd /Users/dabot/Documents/develop/eslint
git log --oneline origin/main..HEAD
```

출력된 해시를 `work-log.md`의 `**커밋**:` 줄에 적고 amend 한다:

```bash
git add work-log.md
git commit --amend --no-edit
```

---

## 마무리 검증

- [ ] **전체 검증을 한 번 더 돌린다**

```bash
cd /Users/dabot/Documents/develop/eslint
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
```

Expected: 전부 PASS.

`pnpm lint`는 **단락 평가**라 ESLint 단독 검증에는 `lint:es`를 따로 돌려야 한다.

- [ ] **e2e 는 선택이다**

`pnpm test:e2e`는 `GITHUB_TOKEN`이 필요하고 생성물에서 `pnpm install`을 돌린다.
이번 변경은 e2e가 단언하는 대상(`.github`를 보지 않는다)에 닿지 않으므로 필수가 아니다.
돌린다면:

```bash
export GITHUB_TOKEN=$(gh auth token)   # read:packages 권한 필요
cd packages/devkit-cli && pnpm test:e2e
```

- [ ] **실물 검증은 사람과 함께 한다**

정적 단언은 워크플로가 실제로 도는지 증명하지 못한다. 설계 10절대로 마지막에 확인한다.

1. 이 브랜치로 PR을 연다 → 승인한다 → Actions 탭에서 `Auto Merge`가 돌고 머지되는지, 그 뒤 `release`가 디스패치되는지 본다.
2. `devbak create`로 만든 프로젝트를 GitHub에 올려 PR을 열고, Claude 리뷰 승인 → 자동 머지가 도는지 본다. 그 저장소에 `CLAUDE_CODE_OAUTH_TOKEN` 시크릿이 있어야 한다.

**1번이 이 브랜치 자신을 머지한다는 점에 주의한다.** 자동 머지가 의도대로 안 돌면
브랜치가 원치 않게 머지될 수 있으므로, 먼저 `no-auto-merge` 라벨을 붙여 옵아웃
경로부터 확인하는 것이 안전하다.
