# 이 저장소에 Claude 자동 리뷰·승인 도입 설계

`2026-08-07-auto-merge-design.md`의 **비목표 1항**("이 저장소에 Claude 리뷰 워크플로를 도입하는 것")을
목표로 바꾼다. 그 문서가 미룬 이유였던 시크릿과 리뷰 기준 문서를 이번에 함께 만든다.

## 1. 배경과 목표

### 1.1 현재 상태 — 실측

`auto-merge.yml`은 이 저장소에서 정상 동작한다. PR #7에서 세 번 실행돼 세 번 다 `success`로 끝났고,
판정을 한 줄씩 남겼다.

| 시각 | 트리거 | VERDICT |
| --- | --- | --- |
| 10:23:17 | coderabbitai `CHANGES_REQUESTED` | `skip: 변경 요청이 1건 있습니다` |
| 10:27:47 | coderabbitai `APPROVED` | `skip: 승인이 없습니다` |
| 10:27:52 | cheolubak `COMMENTED` | `skip: 승인이 없습니다` |

머지되지 않은 이유는 고장이 아니다. PR #7의 유일한 승인이 CodeRabbit의 것인데
`authorAssociation`이 `NONE`이라 기존 설계 5.2.1절의 신뢰 판정에서 걸러졌고, `OWNER`인 사람은 `COMMENTED`만
남겨 집계에 들어가지 않았다.

즉 **승인해 줄 신뢰 주체가 없는 것이 유일한 결손**이다. `auto-merge.yml`의 신뢰 목록에는
`github-actions[bot]`이 이미 들어 있다 — 받을 준비는 돼 있고 줄 상대만 없다.

한편 이 저장소가 배포하는 템플릿에는 그 상대가 이미 있다.

| 자산 | `templates/_shared` | 이 저장소 |
| --- | --- | --- |
| `claude-review.yml` | 있음 | **없음** |
| `devkit-reviewer.md` | 있음(next·nest·monorepo 3종) | **없음** (`.claude/agents/` 자체가 없다) |
| `auto-merge.yml`의 `workflow_run` 트리거 | 있음 | **없음** |

### 1.2 목표

1. PR이 열리거나 갱신되면 Claude가 이 저장소의 기준으로 리뷰하고, 심각한 문제가 없으면 승인한다
2. 그 승인이 `auto-merge.yml`의 게이트를 통과해 rebase 머지 → `release.yml` 디스패치로 이어진다
3. 승인 뒤 체크가 늦게 끝나도 머지가 멈추지 않는다 (2.2절)

### 1.3 비목표

- **게이트 jq 프로그램 변경.** CodeRabbit의 변경 요청은 지금처럼 머지를 막는다. `rejections` 게이트가
  작성자를 가리지 않는 비대칭은 의도이며(막는 쪽은 fail-safe) 이번에 건드리지 않는다.
  두 사본의 jq 동일성 단언(`auto-merge-workflow.test.ts`)이 그대로 통과해야 한다.
- **CodeRabbit 제거.** 리뷰어 둘을 유지한다.
- **브랜치 보호 설정.** 기존 설계 5.2.2절의 `onHead` 판정과 `--match-head-commit`이 그 부재를 이미 메운다.

> 이 문서에서 "기존 설계"는 `2026-08-07-auto-merge-design.md`를 가리킨다. 절 번호가 붙은 참조는
> 모두 그 문서의 것이며, 이 문서 자신의 절과 번호가 겹칠 수 있다.
- **이미 열린 PR #7을 이번 변경으로 머지시키는 것.** `claude-review.yml`은 `opened`/`reopened`/
  `synchronize` 트리거라 기존 PR에는 새 푸시가 있어야 돈다.

## 2. 지배적 제약

### 2.1 GITHUB_TOKEN이 만든 이벤트는 워크플로를 트리거하지 않는다

기존 설계 2.1절과 같다. `claude-review.yml`이 `GITHUB_TOKEN`으로 `gh pr review --approve`를 실행하면
그 승인은 `pull_request_review`를 **발화시키지 못한다.** 따라서 `pull_request_review`만 듣는 지금의
저장소판 `auto-merge.yml`은 Claude가 승인한 PR에 대해 영원히 실행되지 않는다.

해법도 같다 — 리뷰 워크플로의 **완료**를 `workflow_run`으로 듣는다. 템플릿판이 이미 그 형태다.

### 2.2 (신규) 외부 앱의 Commit Status는 `workflow_run`으로 들을 수 없다

이번에 새로 드러난 제약이며, 이 설계에서 가장 중요한 부분이다.

`statusCheckRollup`에는 **두 종류**가 섞여 온다.

| 형태 | 만드는 주체 | 필드 | 완료를 듣는 트리거 |
| --- | --- | --- | --- |
| `CheckRun` | GitHub Actions | `.status` / `.conclusion` / `.workflowName` | `workflow_run` |
| `StatusContext` | 외부 앱 (Commit Status API) | `.state` | **`status`** |

기존 게이트는 두 형태를 **읽는** 것은 이미 처리한다(`pending`·`failing` 정의가 `.status`와 `.state`를
모두 본다). 그러나 **깨어나는** 쪽은 `CheckRun`만 전제하고 있었다.

CodeRabbit은 `__typename: StatusContext`, 즉 Commit Status API를 쓴다. 그래서 CodeRabbit 체크가
`PENDING`인 동안 auto-merge가 돌면 `skip: 체크 1건이 아직 진행 중입니다`로 끝나고, 그 체크가
`SUCCESS`로 바뀌어도 **auto-merge를 다시 깨울 트리거가 없다.**

이것이 이론적 위험이 아님은 PR #7에서 확인된다. CodeRabbit은 **리뷰를 체크보다 먼저 제출한다.**

```
10:23:12  CodeRabbit 리뷰 제출        → auto-merge 실행됨
10:27:25  CodeRabbit 체크 시작 (PENDING)
10:27:44  CodeRabbit 리뷰 제출        → auto-merge 실행됨
  이후    CodeRabbit 체크 SUCCESS     → 깨울 트리거 없음
```

지금까지 이 교착이 드러나지 않은 이유는 승인이 항상 사람 손이어서 `pull_request_review`가 늦게라도
발화했기 때문이다. 자동 승인을 켜는 순간 그 마지막 트리거가 사라지면서 노출된다. 증상은 "승인은 됐는데
머지가 안 된 채 조용히 멈춤"이다.

해법은 `on: status` 트리거를 더하는 것이다. `status` 이벤트는 커밋 SHA(`github.event.sha`)를 주므로
6.4절의 head SHA 역조회 로직을 그대로 재사용할 수 있다 — 새로 짜는 로직은 없고, 트리거 한 줄과
기존 세 표현식(잡 조건·concurrency 키·SHA 출처)에 폴백을 하나씩 더하는 것이 전부다.

### 2.3 (신규) `workflow_run`·`status`는 기본 브랜치의 워크플로만 실행한다

GitHub은 이 두 이벤트에 대해 **기본 브랜치에 있는 워크플로 파일만** 실행한다. 따라서 이 변경을 PR로
올려도 그 PR 브랜치에서는 두 트리거가 동작하지 않는다 — `main`에 머지된 **다음** PR부터 동작한다.

결과가 검증 순서를 규정한다.

| 대상 | 자기 PR에서 검증되는가 |
| --- | --- |
| `claude-review.yml` (`pull_request` 트리거) | 된다. 리뷰와 승인까지 확인할 수 있다 |
| `auto-merge.yml`의 `workflow_run`·`status` | **안 된다.** 머지 후 다음 PR에서야 확인된다 |

즉 이 PR 자체는 사람이 승인해 `pull_request_review` 경로로 머지해야 한다. 이 사실을 모르면 "Claude가
승인했는데 자동 머지가 안 된다"를 결함으로 오인하고 고치려 들게 된다 — 그것이 정상 동작이다.

## 3. 산출물

| | 파일 | 작업 |
| --- | --- | --- |
| A | `.claude/agents/devkit-reviewer.md` | 신규 |
| B | `.github/workflows/claude-review.yml` | 신규 |
| C | `.github/workflows/auto-merge.yml` | 수정 (트리거·PR 번호 확정) |
| D | `packages/devkit-cli/templates/_shared/.github/workflows/auto-merge.yml` | 수정 (`status` 트리거) |
| E | `packages/devkit-cli/tests/auto-merge-workflow.test.ts` | 수정 (단언 추가) |

사람만 할 수 있는 일 — `CLAUDE_CODE_OAUTH_TOKEN` 시크릿 등록. 로컬에서 `claude setup-token`으로
발급한 뒤 `gh secret set CLAUDE_CODE_OAUTH_TOKEN`. 이것이 없으면 B는 매 PR마다 실패하고, 게이트는
승인 0으로 판정해 머지하지 않는다 — 안전한 방향으로 실패한다.

## 4. A. 이 저장소용 리뷰 기준 문서

### 4.1 템플릿판을 그대로 쓸 수 없다

템플릿의 `devkit-reviewer.md`는 **생성된 앱**을 전제한다 — FSD 레이어 배치, Server/Client 경계,
`apps/`↔`packages/` 방향. 이 저장소에는 그중 어느 것도 없다. 이 저장소는 그 앱을 만드는 **툴킷**이다.

### 4.2 지적하지 않는 것

이 저장소는 다섯 겹의 기계 검증을 이미 통과시킨다.

| 검증 | 담당 | 명령 |
| --- | --- | --- |
| 포맷 | `prettier` | `pnpm format` |
| 비타입 correctness | `oxlint` | `pnpm lint:ox` |
| 플러그인 규칙·타입 인식 | `eslint` | `pnpm lint:es` |
| 타입 | `tsc --noEmit` | `pnpm typecheck` |
| 동작 | `vitest` | `pnpm test` |

따라서 포맷·import 정렬·`any`·미사용 변수·타입 오류는 코멘트하지 않는다. 발견했다는 것은 CI가 이미
실패했다는 뜻이고, 그것은 리뷰가 아니라 CI가 보고할 일이다.

### 4.3 보는 것 — 여섯 관점

전부 이 저장소가 실제로 당한 결함에서 왔다. 각 항목에 근거 사고를 함께 적어, 나중에 읽는 사람이
"왜 이걸 보는가"를 되묻지 않게 한다.

1. **한 사실이 여러 곳에 있는가.** 이슈 #6에서 버전 리터럴이 세 곳인데 릴리스가 두 곳만 갱신했다.
   `auto-merge.yml`은 두 사본을 손으로 옮기다 주석 한 단어가 어긋났다. 새 상수·경로·이름이 둘 이상의
   자리에 생기면, 한쪽만 고쳐도 통과하지 않도록 묶는 장치가 함께 왔는가.
2. **통과하지만 아무것도 막지 못하는 테스트.** 추출 실패 시 빈 문자열을 돌려주는 헬퍼가 아래 단언
   전체를 공허하게 만든 적이 있다(C1이 테스트를 통과한 이유). `toContain`으로 git의 실제 판정을
   증명하려 한 적이 있다. 새 단언이 **틀린 구현에서 실제로 실패하는가.**
3. **조용한 실패.** `readFile.catch(() => '')`가 EACCES까지 삼켰다. 좁은 `include`와
   `passWithNoTests`가 "테스트 0개 통과"를 초록불로 만들었다. 조기 반환이 관문과 정보 로그를 함께
   지웠다. 폴백이 "없음"과 "가져오기 실패"를 구분 불가능하게 만들지 않는가.
4. **워크플로 보안.** 권한 있는 트리거(`pull_request_review`·`workflow_run`·`status`)에
   `actions/checkout`이 붙지 않았는가. `GITHUB_TOKEN`이 만든 이벤트가 트리거를 만들 것으로
   가정하지 않았는가. 시크릿이 fork에서 오는 입력에 닿지 않는가.
5. **게시 경로.** 이 저장소의 머지는 곧바로 패키지 게시로 이어진다. `files`·`exports`·버전 범위가
   맞는가. 빌드가 있는 패키지와 없는 패키지의 비대칭을 지켰는가. `pnpm pack`이 `prepublishOnly`를
   돌리지 않는다는 사실에 걸리지 않는가.
6. **템플릿 자산이 실제로 배포되는가.** 루트 `.gitignore`의 `.claude/` 한 줄이 템플릿 자산을 삼켜
   `git add`가 조용히 건너뛴 적이 있다. 템플릿에 더한 파일이 git에 실제로 들어갔는가.

### 4.4 출력

템플릿판과 같다. 인라인 코멘트, 심각도(**심각**/**권장**/**관찰**), 확신 없으면 질문, 심각한 문제가
없으면 승인.

## 5. B. 이 저장소의 claude-review.yml

템플릿판을 기반으로 하되 이 저장소에 맞춘다.

```yaml
name: 'Claude Code Review'
on:
  pull_request:
    types: [opened, reopened, synchronize]
```

`name` 값은 C의 `workflows:` 목록과 **문자 그대로 일치해야 한다.** 어긋나면 워크플로는 에러 없이
그냥 실행되지 않는다. 이 결합은 9절에서 테스트로 고정한다.

프롬프트는 템플릿판을 따르며, 프롬프트 인젝션 방어 지시를 그대로 유지한다. 이 리뷰의 승인 하나가
자동 머지를 통과시키고 그 머지가 패키지 게시로 이어지므로, diff·PR 제목·PR 본문·커밋 메시지·코드
주석은 **전부 공격자 통제 입력**이다.

### 5.1 알려진 한계

`github-actions[bot]`은 자기가 만든 PR을 승인할 수 없다(GitHub이 422로 거부한다). 봇이 연 PR은
리뷰 워크플로가 실패로 끝나고 자동 머지는 승인 0으로 판정한다. 안전한 방향이므로 별도 처리를 하지
않는다.

## 6. C·D. auto-merge.yml 두 사본

### 6.1 트리거

저장소판에 더한다.

```yaml
on:
  pull_request_review:
    types: [submitted]
  workflow_run:
    workflows: ['Claude Code Review']
    types: [completed]
  status:
```

`status`는 두 사본 **모두**에 넣는다. 생성되는 프로젝트도 외부 CI를 붙이면 같은 교착을 겪는다.

`status:`가 값 없는 키인 것은 오타가 아니다. 이 이벤트는 `types`도 브랜치 필터도 받지 않는다 —
**모든 커밋 상태 변경에 발화한다.** `main` 푸시 등 PR과 무관한 커밋에서도 돌지만, PR 번호 확정
단계가 열린 PR을 못 찾고 즉시 끝난다.

이 워크플로 자신은 Commit Status를 만들지 않으므로(Actions는 `CheckRun`을 만든다) 자기 이벤트로
자기를 다시 깨우는 순환은 생기지 않는다. `GITHUB_TOKEN`이 만든 이벤트가 트리거를 못 만든다는
2.1절의 제약도 같은 방향으로 작용한다.

### 6.2 잡 실행 조건

```yaml
if: >-
  github.event_name == 'pull_request_review'
  || github.event.workflow_run.conclusion == 'success'
  || github.event.state == 'success'
```

`status`를 `success`로 좁히는 것은 낭비를 줄이기 위해서다. `pending`·`failure`에서 돌아도 게이트가
막지만, 그때는 어차피 머지할 수 없다.

### 6.3 concurrency

```yaml
group: auto-merge-${{ github.event.workflow_run.head_sha || github.event.sha || github.event.pull_request.head.sha }}
```

세 트리거가 **같은 키**를 만들어야 한다. `pull_request_review`에는 `sha`가 없고 `status`에는
`pull_request`가 없으므로 폴백 순서가 세 갈래를 모두 덮는다. `cancel-in-progress: false`를
유지한다 — 취소하면 먼저 도착한 판정이 버려진다.

### 6.4 PR 번호 확정

템플릿판의 스텝을 가져오되 SHA 출처를 하나 늘린다.

```yaml
HEAD_SHA: ${{ github.event.workflow_run.head_sha || github.event.sha }}
```

`workflow_run.pull_requests[]`를 쓰지 않는 이유는 그대로다 — fork PR에 대해 비어 있고, 비면
워크플로가 **에러 없이** 아무것도 하지 않는다. head SHA 역조회는 그 실패가 드러난다.

### 6.5 저장소판에만 남는 것

`status` 트리거를 넣어도 두 사본의 의도된 차이는 세 가지 그대로다.

1. fork PR 차단 (`isCrossRepository`) — 이 저장소의 머지만 게시로 이어진다
2. `release.yml` workflow_dispatch — 2.2절과 같은 이유(GITHUB_TOKEN push는 트리거를 안 만든다)
3. `actions: write` 권한 — 위 디스패치에 필요하다

jq 게이트는 **한 글자도 바뀌지 않는다.**

## 7. 데이터 흐름

```
PR 열림 / 푸시
  │
  ├─→ Claude Code Review (pull_request)
  │     ├─ .claude/agents/devkit-reviewer.md 를 읽는다
  │     ├─ gh pr review --approve | --request-changes
  │     │    (GITHUB_TOKEN → pull_request_review 발화 안 함)
  │     └─ 워크플로 완료 ───────────→ workflow_run: completed ──┐
  │                                                              │
  ├─→ CodeRabbit (외부 앱)                                       │
  │     ├─ 리뷰 제출 ─────────────→ pull_request_review ───────┤
  │     └─ Commit Status 전환 ────→ status ────────────────────┤
  │                                                              │
  └─→ 사람이 UI 에서 Approve ─────→ pull_request_review ───────┤
                                                                 ▼
                                                          Auto Merge
                                                            ├ PR 번호 확정
                                                            ├ fork 차단
                                                            ├ jq 게이트 (불변)
                                                            ├ gh pr merge --rebase
                                                            └ release.yml 디스패치
```

## 8. 에러 처리 원칙

기존 설계와 같다. **게이트에 걸린 것은 고장이 아니라 정상 상태다.** 실패로 끝내면 PR 체크가 빨간불이
되어 "조건이 아직 안 갖춰졌다"를 고장으로 보이게 한다. 판정은 항상 한 줄로 로그에 남는다 —
"왜 안 머지됐는가"가 실행 로그만으로 읽혀야 한다.

예외는 머지 후 `release.yml` 디스패치 실패다. 그때는 잡을 실패시킨다. 조용히 넘어가면 "머지는 됐는데
릴리스는 안 된" 상태가 신호 없이 남는다.

## 9. 테스트

기존 테스트는 **템플릿판만** 검사한다(`readAutoMerge()`가 템플릿 경로를 읽는다). 저장소판이 리뷰
워크플로를 듣지 않는 상태는 아무도 잡지 못한다. 아래를 더한다.

### 9.1 저장소판 auto-merge.yml

- `workflow_run:` · `pull_request_review:` · `status:` 세 트리거를 모두 갖는다
- `workflows:` 목록의 이름이 **저장소판** `claude-review.yml`의 `name:`과 일치한다
- `status` 이벤트의 SHA(`github.event.sha`)가 PR 번호 확정 스텝에 배선돼 있다

### 9.2 저장소판 claude-review.yml

- `--approve`와 `--request-changes`를 모두 갖는다 (한쪽만 있으면 문제를 찾고도 상태를 안 남긴다)
- 프롬프트 인젝션 방어 지시를 갖는다
- `Bash(gh pr review:*)`를 허용 도구로 갖는다
- **참조하는 `.claude/agents/devkit-reviewer.md`가 실제로 존재한다**

마지막 것은 템플릿판 테스트에도 없던 관점이다. 경로가 어긋나면 Claude는 기준 문서를 못 읽고 자기
판단으로 승인하는데, 워크플로는 초록불로 끝나 아무도 모른다. 4.3절 1번 관점(한 사실이 여러 곳)을
이 설계 자신에게 적용한 것이다.

### 9.3 템플릿판

- `status:` 트리거를 갖는다

### 9.4 그대로 통과해야 하는 것

- 두 사본의 jq 프로그램 동일성. 이번 변경은 게이트 바깥만 건드린다
- fork 차단 게이트 4건
- 게이트 판정 24건

## 10. 검증 방법

1. `pnpm test` — 기존 390여 건 + 신규가 모두 그린
2. `pnpm lint` · `pnpm typecheck`
3. 새 단언이 실제로 막는지 **변이로 확인한다.** 예컨대 `workflows:` 이름을 한 글자 바꿔 테스트가
   빨개지는지 본 뒤 되돌린다. 통과하는 테스트는 증거가 아니다(4.3절 2번)

### 10.1 라이브에서만 확인되는 것

전부 조용히 실패하므로 첫 PR을 눈으로 따라가야 한다. 2.3절 때문에 확인 시점이 두 단계로 갈린다.

**이 PR에서 확인 가능**

| 확인 | 실패하면 |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN`이 등록돼 있다 | 리뷰 워크플로가 매번 실패, 승인 0 |
| Claude가 `devkit-reviewer.md`를 읽고 승인 또는 변경 요청을 남긴다 | 코멘트만 남고 게이트가 아무것도 막지 못한다 |
| Claude 승인의 `authorAssociation` 실제 값 | 로그인으로도 신뢰하므로 통과해야 하나 한 번은 봐 둔다 |

**머지 후 다음 PR에서만 확인 가능**

| 확인 | 실패하면 |
| --- | --- |
| `workflow_run`이 실제로 발화한다 | auto-merge가 아예 안 돈다 |
| `status` 이벤트가 CodeRabbit 상태 전환에 발화한다 | 2.2절 교착이 그대로 남는다 |
| Claude Code Review 체크 자신이 게이트를 막지 않는다 | `workflow_run` 시점에 완료 상태여야 한다 |

이 PR 자체는 사람이 승인해 `pull_request_review` 경로로 머지한다.

## 11. 결정 요약

| # | 결정 | 이유 |
| --- | --- | --- |
| 1 | `CLAUDE_CODE_OAUTH_TOKEN`을 쓴다 | 템플릿판과 시크릿 이름이 일치해 두 사본을 같은 형태로 유지한다 |
| 2 | CodeRabbit을 그대로 둔다 | 리뷰어 둘을 유지한다. `rejections` 게이트의 fail-safe 비대칭을 깨지 않는다 |
| 3 | 리뷰 기준은 이 저장소 사고 기록 기반 | 템플릿판은 FSD·Next.js 전제라 이 툴킷 저장소에 맞지 않는다 |
| 4 | `on: status`를 **두 사본 모두**에 넣는다 | 생성물도 외부 CI를 붙이면 같은 교착을 겪는다 |
| 5 | jq 게이트를 건드리지 않는다 | 동일성 단언을 지키고, 이번 변경의 위험 표면을 트리거로 한정한다 |
| 6 | PR 번호는 head SHA 역조회 | `workflow_run.pull_requests[]`는 비어도 에러를 내지 않는다 |
