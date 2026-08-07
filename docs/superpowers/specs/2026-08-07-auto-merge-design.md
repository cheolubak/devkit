# 자동 승인·자동 머지 워크플로 설계

작성일: 2026-08-07

## 1. 배경과 목표

### 1.1 현재 상태

`devbak create`/`devbak update`가 놓는 CI 자산은 하나뿐이다.

- `templates/_shared/.github/workflows/claude-review.yml` — PR이 열리면 Claude가 리뷰하고, 프롬프트 안에서 "심각한 문제가 없으면 `gh pr review --approve`" 를 지시한다.

승인까지는 도달하지만 **승인 이후가 없다.** 승인된 PR은 사람이 손으로 머지해야 한다.

이 저장소(devkit) 자체의 `.github/workflows/`에는 `release.yml`만 있다. PR 리뷰 워크플로도, 자동 머지도 없다.

### 1.2 목표

1. 생성·갱신되는 프로젝트에서, 리뷰가 통과하면 자동 승인하고 승인이 1개 이상이면 자동 머지한다.
2. 이 저장소에서도 승인이 1개 이상이면 자동 머지한다.

### 1.3 비목표

- 이 저장소에 Claude 리뷰 워크플로를 도입하는 것. 요청 범위 밖이며, `CLAUDE_CODE_OAUTH_TOKEN` 시크릿과 `.claude/agents/devkit-reviewer.md` 같은 리뷰 기준 문서가 이 저장소에 없다.
- 머지 큐(merge queue) 도입.
- 브랜치 보호 규칙 설정. 워크플로는 저장소 설정 없이도 동작해야 한다.

## 2. 지배적 제약: GITHUB_TOKEN 이벤트는 워크플로를 트리거하지 않는다

이 설계 전체를 결정하는 사실이다.

> When you use the repository's `GITHUB_TOKEN` to perform tasks, events triggered by the `GITHUB_TOKEN`, **with the exception of `workflow_dispatch` and `repository_dispatch`**, will not create a new workflow run.

두 가지 결과가 따라온다.

### 2.1 `pull_request_review` 트리거만으로는 봇 승인을 못 잡는다

`claude-review.yml`은 `secrets.GITHUB_TOKEN`으로 `gh pr review --approve`를 실행한다. 그 승인이 만드는 `pull_request_review` 이벤트는 **새 워크플로 실행을 만들지 않는다.** 따라서 `pull_request_review`만 듣는 자동 머지 워크플로는 Claude가 승인한 PR에 대해 **영원히 실행되지 않는다.**

해결: `workflow_run` 트리거를 함께 쓴다. 워크플로 완료 이벤트는 그 워크플로가 어떤 토큰을 썼든 항상 발화한다.

사람이 UI에서 누른 승인은 사람의 토큰으로 발생하므로 `pull_request_review`가 정상 발화한다. 두 트리거가 각각 다른 경로를 담당한다.

| 승인 주체 | 발화하는 트리거 |
| --- | --- |
| Claude (GITHUB_TOKEN) | `workflow_run` (Claude Code Review 완료) |
| 사람 | `pull_request_review` |

### 2.2 GITHUB_TOKEN이 만든 머지 push는 `release.yml`을 트리거하지 않는다

이 저장소에만 해당한다. `release.yml`은 `on: push: branches: [main]`이다. 자동 머지가 GITHUB_TOKEN으로 PR을 머지하면 main에 push가 생기지만 **`release.yml`은 돌지 않는다.** 자동 머지를 켜는 순간 릴리스 파이프라인이 아무 에러 없이 멈춘다.

해결: 위 인용문의 예외를 쓴다. 머지 성공 직후 `gh workflow run release.yml --ref main`으로 `workflow_dispatch`를 건다. `workflow_dispatch`는 GITHUB_TOKEN으로도 새 실행을 만들 수 있는 두 예외 중 하나다. PAT이 필요 없다.

`release.yml`은 이미 `workflow_dispatch`를 갖고 있고, `if: github.ref == 'refs/heads/main'` 가드와 `concurrency: { group: release, cancel-in-progress: false }`도 있다. 디스패치가 겹쳐도 직렬화된다.

## 3. 산출물

| # | 파일 | 상태 |
| --- | --- | --- |
| A | `packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml` | 수정 |
| B | `packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml` | 신규 |
| C | `.github/workflows/auto-merge.yml` | 신규 |
| D | `packages/devkit-cli/tests/auto-merge-workflow.test.ts` | 신규 |

**CLI 소스 코드 변경은 없다.**

- `create`: 세 레시피(`nest`/`next`/`monorepo`)가 모두 `copyOverlay('_shared')`를 호출하고, `collectTree`가 트리를 재귀 복사한다. `_shared/.github/workflows/` 아래 새 파일은 자동으로 포함된다.
- `update`: `categories.ts`의 `FILE_PATTERNS`에 `[/^\.github\/workflows\/.+/, 'ci']`가 이미 있다. 전체 `update`와 `--only ci` 둘 다 새 파일을 덮는다.
- `monorepo` 레시피는 `apps/web/.github`를 `removeFiles`로 지운다. 워크플로는 저장소 루트에만 남는다. 이 동작은 이미 옳다.

## 4. A. claude-review.yml 보강

### 4.1 문제

현재 프롬프트는 통과 경로만 지시한다.

```
리뷰 완료 후 심각한 문제가 없으면 `gh pr review N --approve -b "LGTM"` 명령으로 승인해주세요.
```

문제가 있을 때 무엇을 할지는 말하지 않는다. Claude는 인라인 코멘트만 남기고 끝낸다. 그러면 PR에 `CHANGES_REQUESTED` 상태의 리뷰가 찍히지 않는다.

자동 머지의 게이트 중 하나가 "CHANGES_REQUESTED가 없을 것"인데, 실패 경로에서 그 상태를 만들지 않으면 그 게이트는 아무것도 막지 못한다. 리뷰가 문제를 발견해도, 나중에 다른 승인이 하나 들어오면 그대로 머지된다.

### 4.2 수정

프롬프트를 대칭으로 만든다.

```
리뷰를 마치면 반드시 승인 또는 변경 요청 중 하나를 남깁니다.
코멘트만 남기고 끝내지 않습니다 — 자동 머지가 이 상태를 게이트로 씁니다.

- 심각한 문제가 없으면:
  gh pr review <N> --approve -b "LGTM"
- 심각한 문제가 있으면:
  gh pr review <N> --request-changes -b "<문제 요약>"
```

`allowedTools`는 이미 `Bash(gh pr review:*)`를 허용하므로 변경이 필요 없다. `permissions.pull-requests: write`도 이미 있다.

### 4.3 알려진 한계

`github-actions[bot]`은 자기가 만든 PR을 승인할 수 없다(GitHub이 422로 거부한다). Dependabot이나 다른 봇이 연 PR은 Claude가 승인하지 못할 수 있다. 이 경우 리뷰 워크플로가 실패로 끝나고 자동 머지는 승인 0으로 판정해 머지하지 않는다. 안전한 방향으로 실패하므로 별도 처리를 하지 않는다.

## 5. B. 템플릿 auto-merge.yml

### 5.1 트리거와 권한

```yaml
name: Auto Merge

on:
  workflow_run:
    workflows: ['Claude Code Review']
    types: [completed]
  pull_request_review:
    types: [submitted]

permissions:
  contents: write        # 머지
  pull-requests: write   # 머지 API, 브랜치 삭제
  checks: read           # statusCheckRollup 조회

concurrency:
  group: auto-merge-${{ github.event.workflow_run.head_sha || github.event.pull_request.head.sha }}
  cancel-in-progress: false
```

두 트리거가 **같은 키**를 만들어야 한다. 한쪽은 head SHA, 다른 쪽은 PR 번호로 잡으면 같은 PR에 대한 두 실행이 서로 다른 그룹에 들어가 동시에 머지를 시도한다. `pull_request_review` 이벤트에도 `pull_request.head.sha`가 있으므로 양쪽 모두 head SHA로 맞춘다.

`workflows:`에 적는 이름은 `claude-review.yml`의 `name:` 값과 **문자 그대로 일치해야 한다.** 어긋나면 워크플로는 에러 없이 그냥 실행되지 않는다. 이 결합은 테스트로 고정한다(9절).

`concurrency`는 승인과 리뷰 완료가 거의 동시에 도착할 때 두 잡이 같은 PR을 동시에 머지 시도하는 것을 막는다. `cancel-in-progress: false`여야 한다 — 취소하면 먼저 도착한 판정이 버려진다.

### 5.2 보안: 체크아웃하지 않는다

`workflow_run`과 `pull_request_review`는 둘 다 **권한 있는 트리거**다. base 저장소 컨텍스트에서 실행되며 시크릿과 쓰기 토큰에 접근한다. 여기서 PR의 head를 체크아웃하고 무언가 실행하면, fork에서 온 PR이 임의 코드로 저장소 토큰을 탈취할 수 있다.

이 워크플로는 **체크아웃 단계를 갖지 않는다.** `gh` CLI 호출만 한다. 이후 이 파일을 수정할 때도 `actions/checkout`을 추가해서는 안 된다.

### 5.2.1 보안: 누가 승인할 수 있는가

체크아웃을 빼는 것은 토큰 **탈취**를 막는다. 그것만으로는 부족하다. 토큰을 정당하게 쥔 잡이 공격자의 코드를 `main`에 넣어 주는 경로가 따로 열려 있다.

전제 네 가지가 함께 성립한다.

1. **공개 저장소에서는 읽기 권한만 있는 임의의 GitHub 사용자가 승인 리뷰를 제출할 수 있다.** 승인은 쓰기 권한을 요구하지 않는다.
2. 이 저장소는 공개(`"visibility":"PUBLIC"`)이고 `main`에 **브랜치 보호가 없다**(`branches/main/protection` → 404).
3. `pull_request_review`는 fork에서 온 PR에 대해서도 **base 저장소 컨텍스트에서 쓰기 토큰으로** 돈다. 2절의 `GITHUB_TOKEN` 제약은 여기 적용되지 않는다 — 승인을 남긴 것이 **사람 토큰**이면 이벤트는 정상 발화한다.
4. 이 저장소의 머지는 곧바로 `release.yml` 디스패치를 거쳐 `pnpm -r publish`(`packages: write`)로 이어진다. 즉 **머지 = 패키지 게시**다.

연쇄는 이렇게 된다. 계정 A가 fork에서 PR을 연다 → 계정 B(같은 사람)가 `--approve`를 남긴다 → 게이트 전부 통과 → `gh pr merge --rebase`로 임의 코드가 `main`에 들어간다 → `release.yml`이 그 코드를 체크아웃해 빌드·테스트를 돌리고 게시한다. 인터넷의 임의 사용자가 `@cheolubak/*` 게시까지 도달한다.

**따라서 승인 집계는 신원을 판정한다.** 아래 둘 중 하나를 만족하는 리뷰만 `APPROVED`로 센다.

- `authorAssociation`이 `OWNER` / `MEMBER` / `COLLABORATOR`
- 리뷰 작성자 로그인이 `github-actions[bot]`

`gh pr view --json reviews`가 주는 리뷰 객체는 `authorAssociation`을 이미 포함한다(`author`, `authorAssociation`, `body`, `commit`, `id`, `includesCreatedEdit`, `reactionGroups`, `state`, `submittedAt`). `--json` 목록에 따로 더할 필요가 없다.

봇 로그인을 허용해도 안전하다. fork에서 온 PR에 대해 `pull_request` 트리거의 `GITHUB_TOKEN`은 **읽기 전용으로 강등**되므로 `claude-review.yml`이 fork PR을 승인하는 것 자체가 불가능하다. 봇 승인이 존재한다는 사실 자체가 same-repo PR임을 뜻한다.

**`CHANGES_REQUESTED`는 신뢰를 따지지 않는다.** 작성자를 가리지 않고 그대로 센다. 비대칭은 의도다 — 막는 쪽은 fail-safe이므로 외부인의 변경 요청도 존중하는 것이 맞다. 잘못 막으면 사람이 라벨을 붙이거나 리뷰를 지우면 그만이지만, 잘못 머지하면 되돌릴 수 없다.

`.author`가 `null`인 경우(삭제된 계정)에도 크래시하지 않아야 한다. `(.author.login // "")`로 받는다.

**이 절을 완화하려는 다음 사람에게.** 게이트를 느슨하게 만들기 전에 위 전제 1~4 중 무엇이 바뀌었는지 먼저 확인하라. 저장소가 비공개가 되었거나 브랜치 보호가 생겼다면 전제가 달라진다. 아무것도 바뀌지 않았다면 완화는 곧 공급망 경로를 다시 여는 것이다.

### 5.3 단계 1 — PR 번호 확정

```bash
if [ "${{ github.event_name }}" = "pull_request_review" ]; then
  PR="${{ github.event.pull_request.number }}"
else
  # workflow_run: head_sha 로 역조회한다.
  PR=$(gh api "repos/$REPO/commits/$SHA/pulls" --jq '[.[] | select(.state=="open")][0].number // empty')
fi
```

`github.event.workflow_run.pull_requests[]`를 쓰지 않는다. 그 배열은 fork에서 온 PR에 대해 비어 있다. head SHA 역조회는 fork 여부와 무관하게 동작한다.

`PR`이 비면 대상이 없다는 뜻이므로 로그를 남기고 정상 종료한다.

`workflow_run` 경로에서는 `github.event.workflow_run.conclusion == 'success'`인 경우에만 진행한다. 리뷰 워크플로가 실패했는데 머지를 시도할 이유가 없다.

### 5.4 단계 2 — 게이트

하나라도 걸리면 **이유를 로그로 남기고 exit 0**한다. 실패로 끝내면 PR 체크가 빨간불이 되어, 조건이 갖춰지지 않았을 뿐인 정상 상태를 고장으로 보이게 한다.

한 번의 `gh pr view` 호출로 필요한 필드를 모두 가져온다.

```bash
gh pr view "$PR" --json isDraft,state,labels,reviews,statusCheckRollup > pr.json
```

| # | 게이트 | 판정 |
| --- | --- | --- |
| 1 | 열린 PR인가 | `.state == "OPEN"` |
| 2 | draft 아닌가 | `.isDraft == false` |
| 3 | 옵아웃 라벨 없는가 | `.labels[].name`에 `no-auto-merge` 없음 |
| 4 | 변경 요청 없는가 | 리뷰어별 최신 리뷰에 `CHANGES_REQUESTED` 없음 |
| 5 | 승인 1개 이상인가 | 리뷰어별 최신 리뷰 중 `APPROVED` 개수 >= 1 |
| 6 | 체크가 전부 성공인가 | 5.5절 |

**승인 집계 (게이트 4·5).** `reviewDecision` 필드를 쓰지 않는다. 그 값은 브랜치 보호 규칙의 "required approving reviews" 설정에 좌우되며, 설정이 없는 저장소에서는 빈 값이 된다. 생성되는 프로젝트는 브랜치 보호가 없는 상태로 시작하므로 이 필드에 의존하면 항상 머지되지 않는다.

대신 `reviews` 배열을 직접 접는다.

```jq
[.reviews[]
 | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED" or .state == "DISMISSED")]
| group_by(.author.login)
| map(max_by(.submittedAt))
```

- `COMMENTED`는 제외한다. 승인 후 코멘트를 하나 더 남긴 리뷰어를 "승인 취소"로 오판하지 않기 위해서다.
- `DISMISSED`는 집계 대상에 포함하되 승인으로 세지 않는다. 승인이 철회된 사실이 최신 상태로 반영되어야 한다.
- 리뷰어별 `submittedAt` 최댓값 하나만 남긴다. 같은 사람이 변경 요청 후 승인하면 승인이 이긴다.

### 5.5 게이트 6 — 체크 상태

```jq
[.statusCheckRollup[]
 | select((.workflowName // "") != "Auto Merge")]
```

**자기 자신을 반드시 제외해야 한다.** 이 워크플로 실행 자체가 head SHA에 체크 런을 만든다. 제외하지 않으면 그 체크가 항상 `IN_PROGRESS`이므로 게이트 6이 절대 통과하지 못한다. 데드락이다.

제외 기준은 `.name`이 아니라 **`.workflowName`**이다. CheckRun의 `.name`은 워크플로 이름이 아니라 **잡 이름**이다. 워크플로를 `Auto Merge`로 짓고 잡을 `merge`로 지으면 `.name`은 `merge`이므로 `.name != "Auto Merge"` 필터가 통과해버려 자기 자신을 그대로 집계한다. 데드락이 재발하며, 필터가 있으니 고쳐진 것처럼 보인다. `gh pr view --json statusCheckRollup`은 CheckRun에 `workflowName` 필드를 함께 준다. StatusContext(외부 CI)에는 이 필드가 없으므로 `// ""`로 받아 통과시킨다.

제외 후 남은 항목을 분류한다.

| 유형 | 필드 | 미완 | 실패 |
| --- | --- | --- | --- |
| CheckRun | `status`, `conclusion` | `status != "COMPLETED"` | `conclusion`이 `FAILURE`/`CANCELLED`/`TIMED_OUT`/`ACTION_REQUIRED`/`STARTUP_FAILURE` |
| StatusContext | `state` | `state == "PENDING"` | `state`가 `FAILURE`/`ERROR` |

`SUCCESS`/`NEUTRAL`/`SKIPPED`는 통과로 본다.

미완이 있으면 "체크 진행 중"으로 로그를 남기고 종료한다. 그 체크가 워크플로라면 완료 시 `workflow_run`이 발화해 이 워크플로가 다시 돈다 — 단, 그 워크플로 이름이 `workflows:` 목록에 있어야 한다. 템플릿은 `Claude Code Review`만 나열하므로, 사용자가 CI 워크플로를 추가하면 그 이름도 목록에 넣어야 한다. 이 사실을 파일 상단 주석에 명시한다.

### 5.6 단계 3 — 머지

```bash
gh pr merge "$PR" --rebase --delete-branch
```

`--rebase`다. merge commit을 만들지 않는다. `--squash`도 쓰지 않는다 — 커밋 메시지 접두(`feat:`/`fix:`)로 릴리스 버전을 판정하는 저장소에서 squash는 그 입력을 뭉갠다.

## 6. C. 이 저장소의 auto-merge.yml

5절과 같은 로직이되 세 곳이 다르다.

### 6.1 트리거

```yaml
on:
  pull_request_review:
    types: [submitted]
```

이 저장소에는 Claude 리뷰 워크플로가 없으므로 `workflow_run`으로 들을 대상이 없다. 승인은 사람이 한다.

### 6.2 권한

```yaml
permissions:
  contents: write
  pull-requests: write
  checks: read
  actions: write   # gh workflow run release.yml
```

### 6.3 머지 후 릴리스 디스패치

2.2절의 이유로, 머지가 성공한 경우에만 실행한다.

```bash
gh pr merge "$PR" --rebase --delete-branch
gh workflow run release.yml --ref main
```

머지가 실패하면 디스패치하지 않는다. 머지되지 않은 상태에서 릴리스를 돌리면 이전 main을 다시 판정하게 된다.

디스패치 자체가 실패하면 **잡을 실패시킨다.** 여기서 조용히 넘어가면 "머지는 됐는데 릴리스는 안 된" 상태가 아무 신호 없이 남는다. `release.yml`의 `concurrency`가 중복 실행을 직렬화하므로, 실패를 보고 사람이 다시 돌려도 안전하다.

### 6.4 알려진 한계 — 파일 주석으로 명시

이 저장소는 현재 PR에서 도는 CI 워크플로가 없다. 그래서 게이트 6은 사실상 항상 통과한다.

나중에 PR CI를 추가하면 문제가 생긴다. 승인 시점에 그 체크가 진행 중이면 게이트 6이 "보류"로 끝나는데, **다시 깨워 줄 트리거가 없다.** PR은 승인된 채로 머지되지 않고 남는다.

그때는 이 파일에 `workflow_run` 트리거를 추가하고 그 워크플로 이름을 나열해야 한다. 이 조건과 대응을 파일 상단 주석에 적는다. 조용히 멈추는 것보다 문서화된 한계가 낫다.

### 6.5 fork PR을 아예 제외한다

5.2.1절의 신뢰 판정에 더해, 이 저장소판은 `isCrossRepository`가 `true`면 판정 전에 종료한다.

```bash
gh pr view "$PR" --repo "$REPO" --json state,isDraft,isCrossRepository,labels,reviews,statusCheckRollup > pr.json
if [ "$(jq -r '.isCrossRepository' pr.json)" = 'true' ]; then
  echo "skip: fork 에서 온 PR 입니다"
  exit 0
fi
```

**한 겹 더 두는 이유.** 여기서는 머지가 곧 패키지 게시다(5.2.1절 전제 4). 신뢰 판정이 틀리더라도 공급망 경로가 결정적으로 닫히도록 한다. CLAUDE.md 워크플로상 이 저장소의 PR은 전부 same-repo 브랜치이므로 실사용 손해가 없다.

**템플릿에는 넣지 않는다.** 생성물은 오픈소스일 수 있고 fork 기여를 자동 머지하고 싶을 수 있다. 거기서는 5.2.1절의 신뢰 판정만으로 충분하다.

**이 검사는 게이트 jq 프로그램 바깥에 둔다.** 그 프로그램은 두 사본에서 글자 그대로 같아야 하고(9.4절), 안에 넣으면 동일성이 깨진다.

## 7. 데이터 흐름

```
[PR 열림/푸시]
      │
      ├─→ Claude Code Review (pull_request)
      │        └─ gh pr review --approve | --request-changes   (GITHUB_TOKEN)
      │                 │
      │                 ×  pull_request_review 이벤트 → 워크플로 실행 안 만듦
      │                 │
      └─────────────────┴─→ workflow_run: completed  ─────┐
                                                          │
[사람이 UI에서 승인] ─→ pull_request_review: submitted ───┤
                                                          ▼
                                                    Auto Merge
                                                          │
                                    ┌─────────────────────┤
                                    │  1. PR 번호 확정     │
                                    │  2. 게이트 6종       │
                                    │  3. gh pr merge      │
                                    └─────────────────────┘
                                                          │
                                      (이 저장소만) gh workflow run release.yml
```

## 8. 에러 처리 원칙

| 상황 | 처리 |
| --- | --- |
| 게이트 미충족 (승인 부족, 체크 진행 중 등) | 이유를 로그로 남기고 **exit 0**. 정상 상태다 |
| PR 번호를 못 찾음 | 로그 남기고 exit 0. 대상이 없는 것이지 고장이 아니다 |
| `gh pr view` 실패 | **exit 1**. 판정 자체가 불가능한데 조용히 넘어가면 안 된다 |
| `gh pr merge` 실패 | **exit 1**. 충돌·권한 문제를 드러낸다 |
| `gh workflow run` 실패 (이 저장소) | **exit 1**. 6.3절 |

모든 스크립트 단계는 `set -euo pipefail`로 시작한다.

## 9. 테스트

`packages/devkit-cli/tests/auto-merge-workflow.test.ts` 신규. 템플릿 워크플로 파일을 문자열로 읽어 단언한다. 기존 `review-assets.test.ts`가 같은 방식을 쓴다.

| 단언 | 막는 회귀 |
| --- | --- |
| `_shared/.github/workflows/auto-merge.yml`이 존재한다 | 파일 유실 |
| `--rebase`를 포함하고 `--squash`/`--merge`를 포함하지 않는다 | merge commit 금지 규칙 위반 |
| `--delete-branch`를 포함한다 | 후처리 누락 |
| 트리거에 `workflow_run`과 `pull_request_review`가 모두 있다 | 봇 승인 경로 유실 (2.1절 회귀) |
| `workflows:`에 적힌 이름이 `claude-review.yml`의 `name:` 값과 일치한다 | 이름 드리프트 |
| `no-auto-merge` 문자열이 있다 | 탈출구 유실 |
| `pull-requests: write`와 `contents: write`가 있다 | 권한 누락 |
| 체크 집계에서 자기 자신을 `workflowName`으로 제외한다 | 5.5절 데드락 회귀. `.name`으로 거르면 잡 이름과 어긋나 무력하다 |
| 워크플로 `name:`이 제외 문자열과 일치한다 | 워크플로 이름만 바꾸면 필터가 조용히 무력해진다 |
| `actions/checkout`을 포함하지 **않는다** | 5.2절 권한 상승 |
| `claude-review.yml`이 `--request-changes`를 포함한다 | 4.1절 비대칭 재발 |

`workflows:` 이름 일치 단언이 가장 중요하다. 두 파일을 모두 읽어 `claude-review.yml`의 `name:` 값을 뽑고, 그 값이 `auto-merge.yml`의 `workflows:` 목록에 있는지 본다. 이름이 어긋나면 워크플로는 **에러 없이** 영원히 실행되지 않으므로, 실행으로는 절대 드러나지 않는다.

### 9.1 기존 테스트가 자동으로 커버하는 것

- `overlay-coverage.test.ts` — 모든 템플릿 파일이 카테고리에 매칭되는지 단언한다. 새 파일이 `ci`에 걸리지 않으면 즉시 실패한다.
- `recipe-*.test.ts` 스냅샷 — **변하지 않는다.** `copyOverlay`의 `describe()`는 파일 목록이 아니라 오버레이 이름만 담으므로, `_shared`에 파일을 더해도 스냅샷에 나타나지 않는다. 갱신할 것이 없다.

### 9.2 e2e

`tests/e2e`가 실제 생성물의 파일 목록을 단언한다면 조정이 필요하다. 구현 시 확인한다.

`packed.e2e.test.ts`는 tarball에 `templates/_shared/.github/workflows/auto-merge.yml`이 실리는지도 단언한다. 워크플로는 점으로 시작하는 **디렉토리** 아래에 있어 npm의 dot-file 필터링이나 `files` 목록 변경에 조용히 빠질 수 있는데, 빠져도 `create`는 성공하므로 생성물에서 CI가 사라진 채 발견되지 않는다.

### 9.3 문자열 단언만으로는 부족하다 — 게이트를 실제로 돌린다

위 표는 전부 `toContain`/`not.toContain`이다. `--rebase`라는 **글자**가 있는지는 보지만, 승인 0건일 때 막는지·실패한 체크가 있을 때 막는지·리뷰어별 최신 접기가 맞는지는 하나도 보지 않는다. 실제로 5.2.1절의 결함은 이 단언들을 전부 통과한 채 존재했고, 발견한 것도 테스트가 아니라 사람이 jq를 손으로 돌려서였다.

그래서 `tests/auto-merge-workflow.test.ts`는 템플릿 YAML에서 jq 게이트 구간을 문자열로 잘라 내 픽스처 JSON에 **실제 `jq`로 돌리고 판정 문자열을 단언한다**(`jq`는 macOS와 `ubuntu-latest`에 기본 설치돼 있다). 추출이 실패하면 **던진다** — 빈 프로그램을 조용히 돌리면 모든 단언이 공허해지기 때문이다.

첫 케이스가 5.2.1절 회귀 방어다: `authorAssociation: "NONE"`인 승인 1건은 `skip:`으로 끝나야 한다.

### 9.4 두 사본의 드리프트를 막는다

이 저장소의 `.github/workflows/auto-merge.yml`은 `devkit-cli` 패키지의 **동작** 테스트 범위 밖이다. 템플릿 자산이 아니라 운영 설정이다. 그러나 게이트 jq는 두 파일에 **글자 그대로 같은 사본**으로 존재한다 — 템플릿은 다른 저장소로 복사되므로 이 저장소의 composite action을 참조할 수 없어, 중복이 의도다.

손으로 옮기는 사본은 어긋난다. 실제로 한 번의 구현 세션 안에서 주석 한 단어가 어긋났고, 다음에 어긋나는 것은 `isbad` 목록이나 `pending` 조건일 수 있다. 그리고 그쪽 사본이 바로 패키지를 게시하는 저장소의 것이다.

따라서 테스트는 두 파일에서 jq 구간을 각각 뽑아 `toBe`로 비교한다. **"저장소판을 테스트한다"가 아니라 "템플릿과 같은지만 본다"**이므로 위 범위 구분과 충돌하지 않는다. 저장소판 파일이 없으면 던진다.

이 관문이 있으므로 두 사본에서 달라야 하는 것(6.5절의 fork 제외, 6.3절의 릴리스 디스패치)은 반드시 jq 구간 **바깥**에 두어야 한다.

## 10. 검증 방법

정적 검증만으로는 부족하다. 워크플로는 실제로 돌려야 안다.

1. `pnpm test` — 9절 단언 통과
2. `pnpm lint:ox`, `pnpm lint:es`, `pnpm typecheck`
3. 임시 PR을 이 저장소에 열어 승인 → 자동 머지와 `release.yml` 디스패치가 실제로 일어나는지 Actions 탭에서 확인
4. `devbak create`로 생성한 프로젝트를 GitHub에 올려 PR을 열고, Claude 리뷰 승인 → 자동 머지가 도는지 확인

3·4는 GitHub 실물이 필요하므로 구현 후 사용자와 함께 진행한다.

### 10.1 라이브에서만 확인되는 것 — 전부 조용히 실패한다

아래 셋은 정적 검증으로 증명할 수 없고, **어긋나도 에러 없이 아무 일도 일어나지 않는다.** 그래서 실물 실행 때 이것부터 본다.

**(a) `workflow_run.head_sha` 역조회가 실제로 PR을 찾는가.** 5.3절이 `gh api repos/{repo}/commits/{sha}/pulls`로 PR 번호를 구한다. 이 SHA가 PR head와 다르면(예: GitHub이 merge commit SHA를 넘기면) 조회가 빈 결과를 내고 워크플로는 "대상 없음"으로 정상 종료한다. 봇 승인 경로가 통째로 죽지만 빨간불은 하나도 안 뜬다.

**(b) `github-actions[bot]` 리뷰에 `commit` 필드가 채워지는가.** 5.4절의 승인 집계는 `commit.oid`가 현재 head와 같을 때만 센다. 확인할 수 없으면 세지 않는다(fail-closed). 이 저장소의 과거 PR 4건·리뷰 10건에서 `commit.oid`가 전부 채워져 있음을 실측했고 **봇 리뷰(GitHub App)도 포함**이지만, `github-actions[bot]`은 액터 종류가 달라 동일 액터로 실증한 것이 아니다. 만약 비어 나오면 **템플릿의 자동 승인 경로가 통째로 막힌다** — 이번에도 증상은 침묵이다.

**(c) Claude 봇 승인의 `authorAssociation` 값.** 5.2.1절의 신뢰 판정은 `OWNER`/`MEMBER`/`COLLABORATOR` 또는 로그인 `github-actions[bot]`을 통과시킨다. 로그인으로도 걸리므로 association이 무엇이든 통과해야 하지만, 실제 값을 한 번은 봐 두는 것이 좋다.

(b)가 비어 나오는 경우의 대응은 **게이트를 느슨하게 하는 것이 아니다.** `gh pr review --approve`에 명시적으로 commit을 지정하게 하거나, 봇 승인에 한해 `--match-head-commit`만으로 서버 측 검증에 맡기는 쪽을 검토한다. 5.2.1절 말미의 경고가 여기에도 적용된다 — 완화 전에 전제가 무엇이 바뀌었는지 먼저 확인하라.

## 11. 결정 요약

| 결정 | 선택 | 이유 |
| --- | --- | --- |
| 머지 트리거 | 별도 워크플로 + 승인 직접 카운트 | GITHUB_TOKEN 제약(2.1절)을 `workflow_run`으로 우회. 브랜치 보호 설정 없이 동작 |
| 승인 집계 | `reviews`를 리뷰어별 최신으로 접음 | `reviewDecision`은 브랜치 보호 설정에 좌우돼 빈 값이 됨 |
| 머지 게이트 | 승인>=1, CHANGES_REQUESTED 없음, 체크 전부 성공, draft 제외, 라벨 옵아웃 | 사용자 선택 |
| 승인자 신뢰 판정 | `authorAssociation`이 OWNER/MEMBER/COLLABORATOR 이거나 `github-actions[bot]` | 공개 저장소에서는 읽기 권한만으로 승인할 수 있다(5.2.1절) |
| 변경 요청 신뢰 판정 | 하지 않음 — 누구 것이든 센다 | 막는 쪽은 fail-safe. 잘못 막으면 되돌릴 수 있지만 잘못 머지하면 못 되돌린다 |
| 이 저장소의 fork PR | `isCrossRepository`로 아예 제외 | 머지가 곧 패키지 게시라 한 겹 더 둔다(6.5절). 템플릿에는 넣지 않는다 |
| 머지 방식 | `--rebase --delete-branch` | CLAUDE.md의 merge commit 금지. squash는 릴리스 판정 입력을 뭉갬 |
| 이 저장소 범위 | auto-merge만 (리뷰 워크플로 없음) | 사용자 선택 |
| 릴리스 재기동 | `gh workflow run release.yml` | `workflow_dispatch`는 GITHUB_TOKEN 제약의 명시적 예외. PAT 불필요 |
| 게이트 미충족 시 | exit 0 + 로그 | 정상 상태를 빨간불로 만들지 않음 |
