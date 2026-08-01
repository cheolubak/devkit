# @devbak devkit — Claude 리뷰 자산 및 `devkit update` 설계 문서

- 작성일: 2026-08-01
- 브랜치: `feature/devkit-roadmap`
- 선행 문서: `2026-08-01-devkit-template-design.md` (이하 "템플릿 설계"), `2026-07-31-devkit-roadmap-design.md` (이하 "로드맵")
- 상태: 설계 확정

---

## 0. 요약

생성된 프로젝트가 **Claude 기반 코드 리뷰**를 갖추게 한다. 산출물은 두 갈래다.

| 갈래 | 내용 |
| --- | --- |
| 리뷰 자산 | 로컬 `.claude/` 자산(리뷰어 에이전트 + `/review` 커맨드) + CI 워크플로(`claude-review.yml`) |
| `devkit update` | 이미 생성된 프로젝트에 devkit 표준을 재적용하는 CLI 서브커맨드 |

두 번째가 필요한 이유는 첫 번째의 배포 방식 때문이다. 리뷰 자산을 **사본으로 복사**하기로 했으므로(2.1절), devkit 표준이 바뀌어도 기존 프로젝트에 전파되지 않는다. `update`가 그 전파 경로다.

이 문서는 템플릿 설계를 대체하지 않고 **확장**한다. 레시피 파이프라인·원자 연산 6종·`required` 규약은 그대로 쓴다.

### 0.1 선행 조건 — `devkit-cli`는 아직 존재하지 않는다

템플릿 설계는 확정됐으나 **구현되지 않았다.** `packages/devkit-cli`도, `@devbak/{tsconfig, jest-config, vitest-config}`도 아직 없다. 따라서 이 문서의 산출물은 독립적으로 구현할 수 없고 다음 순서를 따른다.

```
1  템플릿 설계 구현 (devkit-cli + 설정 패키지 3개 + create 레시피)
2  이 문서의 리뷰 자산 (templates/_shared/, 유형별 devkit-reviewer.md)   ← 1의 오버레이에 얹힘
3  이 문서의 devkit update                                              ← 1의 레시피를 재사용
```

2단계는 1단계의 `copyOverlay` 대상을 늘리는 것에 가깝고, 3단계는 1단계의 레시피 자산이 있어야 성립한다. **다만 리뷰 자산의 내용(3절)은 CLI와 무관하게 지금 확정할 수 있으며, 그것이 이 문서의 주된 값어치다.**

---

## 1. 실측 (2026-08-01)

이 저장소의 원칙대로 상상하지 않고 실물을 먼저 읽었다. **결과적으로 세 군데에서 설계가 바뀌었다.**

### 1.1 이미 동작 중인 실물이 있다

`~/Documents/develop/devlog-api/.github/workflows/claude-review.yml`이 존재하며 다음 구조다.

```yaml
on: pull_request: types: [opened, reopened, synchronize]
steps:
  - actions/checkout@v4                          # 코드
  - actions/checkout@v4  cheolubak/claude-skills # 리뷰 자산 (별도 저장소)
  - anthropics/claude-code-action@v1
      claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      track_progress: true
      prompt: |  ... .claude-skills/agents/nestjs-reviewer.md 를 읽고 ...
      claude_args: --allowedTools "Read,Glob,Grep,mcp__github_inline_comment__create_inline_comment,Bash(gh pr ...)"
```

| 관측 | 설계 영향 |
| --- | --- |
| **인증이 API key가 아니라 `CLAUDE_CODE_OAUTH_TOKEN`** | 템플릿도 OAuth 토큰을 쓴다. `ANTHROPIC_API_KEY`를 요구하면 사용자가 갖지 않은 자격증명을 요구하게 된다 |
| 리뷰 자산을 **별도 저장소 체크아웃**으로 조달 | 이 방식은 devkit에서 채택하지 않는다 — 사본이 프로젝트 안에 있으므로 불필요하다(3.1절) |
| `track_progress: true`, 인라인 코멘트 MCP 툴 허용 | 그대로 계승한다. 검증된 값이다 |
| 리뷰 후 `gh pr review --approve` 자동 승인 | 그대로 계승한다(4.4절) |
| `permissions: contents:read, pull-requests:write` | 그대로 계승한다 |

**이 파일이 이 설계의 기준선이다.** `claude-code-action`의 옵션을 문서에서 추측해 조합하지 않는다 — 실제로 돌아가는 조합이 이미 있다.

### 1.2 전역 자산은 심볼릭 링크로 공유되고 있다

```
~/.claude/agents  →  ~/Documents/develop/claude-skills/agents
~/.claude/skills  →  ~/Documents/develop/claude-skills/skills
```

`cheolubak/claude-skills`(PUBLIC)가 로컬 전역 자산이자 CI가 체크아웃하는 대상이다. `cheolubak/eslint`(devkit)도 PUBLIC이므로, 원한다면 devkit을 체크아웃하는 방식도 가능했다. **채택하지 않았다** — 3.1절 참조.

### 1.3 기존 리뷰어 에이전트는 devkit 표준을 모른다

| 확인 | 결과 |
| --- | --- |
| `nestjs-reviewer.md` · `nextjs-reviewer.md`의 FSD 언급 | **각각 0건** |
| `nextjs-reviewer.md`의 구성 | 자체 "폴더 구조 (제안)" 절을 보유 |
| `devlog-api/.claude/skills/코드-리뷰/SKILL.md` | `class-validator` 데코레이터 검증을 요구 |

세 번째가 결정적이다. 로드맵 1.3절이 실측한 대로 **세 NestJS 프로젝트는 `class-validator`를 아예 쓰지 않고 zod 파이프를 쓴다.** 즉 기존 리뷰 스킬은 프로젝트 실태와 이미 어긋나 있다. `nextjs-reviewer`의 폴더 구조 제안은 devkit이 강제하는 FSD와 정면으로 충돌할 수 있다.

**따라서 devkit은 자체 리뷰어를 갖는다.** 기존 리뷰어를 CI에서 함께 돌리지 않는다(3.3절).

### 1.4 기존 리뷰 체크리스트의 대부분은 린터 영역이다

`devlog-api`의 `코드-리뷰` 스킬 체크리스트를 항목별로 분류한 결과:

| 항목 예시 | devkit에서의 담당 |
| --- | --- |
| 파일명 kebab-case, 클래스명 PascalCase | **어느 쪽도 담당하지 않는다** — devkit ESLint 설정에 파일명 규칙이 없고, 3.2절의 리뷰 관점에도 넣지 않았다. 기계로 판정 가능한 규약이므로 리뷰가 아니라 린트 규칙 후보다(9절 follow-up) |
| import 정렬(외부→내부, 알파벳순), named import 멤버 정렬 | `perfectionist` 계열 린트 규칙 영역 |
| `@Module` 속성 알파벳순, 데코레이터 알파벳순, DTO 프로퍼티 순서 | 린트 규칙 영역 |
| `private readonly` 접근자 | 린트 규칙 영역 |
| class-validator 데코레이터 적용 | **폐기** — zod를 쓰므로 전제가 틀렸다 |
| Prisma `select` 필드 알파벳순 | 린트 규칙 영역 |

즉 **사람이 읽어야만 판정 가능한 항목이 소수**이고, 나머지는 기계가 더 정확하게·더 싸게 판정한다. 이것이 3절의 직접적 근거다.

---

## 2. 범위 결정

### 2.1 확정된 결정 5건

| 항목 | 결정 | 기각한 대안 |
| --- | --- | --- |
| 범위 | 로컬 `.claude/` 자산 + CI 워크플로 **둘 다** | 한쪽만 |
| 소유 | **devkit 저장소**가 리뷰 지식을 소유 | `claude-skills` 저장소 / 프로젝트별 자유 작성 |
| 배포 | 생성 시 **사본 복사**(`copyOverlay`) | 심볼릭 링크 / CI 체크아웃 참조 |
| 갱신 | **`devkit update`** 서브커맨드 (전체 오버레이 + `--only`) | 수동 복사 / 갱신 포기 |
| 안전장치 | **git 클린 요구 + 변경 목록 출력 후 확인** | 자체 백업·3-way 머지 |

### 2.2 왜 심볼릭 링크가 아닌가

`link:` 프로토콜을 쓰는 패키지들과 대칭을 이루므로 심볼릭 링크는 매력적이었고, `~/.claude/agents`가 이미 심볼릭 링크로 동작한다는 실증도 있었다(1.2절). 그럼에도 사본을 택한 이유:

- **리뷰 기준은 프로젝트마다 갈라질 이유가 실제로 있다.** ESLint 설정은 갈라지면 표준이 무너지지만, "이 프로젝트에서 특히 주의해서 볼 것"은 프로젝트 고유 지식이다. 사본은 그 갈라짐을 허용하고, `update`가 원하는 시점에만 표준을 다시 덮는다.
- **git에 심볼릭 링크가 커밋된다.** 로컬 전용 모델이라 치명적이지는 않지만, CI 체크아웃에서 링크가 깨진 경로를 가리키게 되어 워크플로가 리뷰 기준 없이 돌아간다. **조용한 실패**의 새 변종이며, 이 저장소가 반복해서 경계해 온 실패 유형이다(템플릿 설계 6.1절).

### 2.3 비범위

- **리뷰 결과에 따른 머지 차단(required check)** — 리뷰는 조언이고, 게이트는 `pnpm lint`/`build`/`test`가 담당한다
- **커밋 단위 리뷰(pre-commit hook)** — PR 단위로 충분하고, 로컬 훅은 커밋 속도를 해친다
- **`claude-skills`의 기존 리뷰어 개선** — 별도 저장소의 일이다. devkit은 자기 표준만 책임진다
- **`devkit generate`** — 템플릿 설계 1.4절이 미뤄둔 것이며 이 문서도 다루지 않는다

---

## 3. 리뷰의 관심사 경계 — 이 설계의 핵심

### 3.1 원칙: 린터가 잡는 것을 리뷰가 다시 잡지 않는다

`eslint-config-nest` 설계가 세운 명제 *"켜는 것만큼 끄는 것이 값어치다"* 를 리뷰 자산에 그대로 적용한다.

devkit 프로젝트에는 이미 네 겹의 기계 검증이 있다.

```
prettier          포맷
oxlint            비타입 correctness (빠름)
eslint-config-nest / eslint-plugin-fsd   타입 인식 규칙 · 아키텍처 경계
tsc --noEmit      타입
```

Claude 리뷰가 이 층들과 겹치면 **세 가지 손해**가 동시에 발생한다. (1) 토큰을 써서 린터보다 부정확한 판정을 얻는다. (2) 리뷰 코멘트가 사소한 지적으로 채워져 진짜 문제가 묻힌다. (3) 린터가 이미 CI에서 실패시킬 항목이므로 리뷰 시점에는 존재할 수조차 없다.

### 3.2 리뷰가 보는 것 (4개 관점)

| 관점 | 왜 기계가 못 잡는가 |
| --- | --- |
| **크로스 파일 아키텍처** — 모듈 경계, DI 방향, 레이어 간 결합, 순환 의존 | `nest-arch` 설계 5.1절이 "크로스 파일 분석은 원천적으로 범위 밖 — 제약이 아니라 **의도적인 경계**"라고 명시적으로 포기한 영역이다. 그 경계 바깥을 사람(과 Claude)이 맡는다 |
| **조용한 실패** — 삼킨 `catch`, 문제를 감추는 폴백, 로그만 남기고 계속 진행 | 코드가 문법적·타입적으로 완전히 옳다. 규칙으로 판정할 표면이 없다 |
| **테스트 공백** — 새로 생긴 분기·에러 경로에 대응 테스트 없음 | diff의 *의미*를 알아야 판정 가능하다. 커버리지 도구는 숫자만 주고 "이 분기가 중요한가"는 답하지 않는다 |
| **의도와 구현의 불일치** — PR 설명 vs 실제 diff, 함수 이름 vs 실제 동작, 주석 vs 코드 | 자연어와 코드의 대조가 필요하다 |

### 3.3 명시적 비범위 (프롬프트에 못 박는다)

리뷰어 에이전트 문서에 **"아래는 지적하지 말 것"** 절을 둔다.

- 코드 포맷, 따옴표, 세미콜론, 줄바꿈 → `prettier`
- import 순서·그룹핑, 멤버 정렬, 알파벳순 일체 → 린트 규칙
- `any` 사용, 미사용 변수, 안 기다린 Promise → `eslint-config-nest`(`no-floating-promises` 등)
- FSD 레이어 import 위반 → `eslint-plugin-fsd`
- 타입 오류 → `tsc`
- **class-validator 데코레이터 요구** → 이 스택은 zod를 쓴다(1.3절). 지적 자체가 오류다

마지막 항목이 특히 중요하다. 기존 스킬을 그대로 계승했다면 **모든 PR에서 잘못된 지적이 나왔을 것이다.**

### 3.4 리뷰어 에이전트 2종

공통 골격을 유지하고 유형별 관점만 다르다.

| 파일 | 고유 관점 |
| --- | --- |
| `templates/nest/.claude/agents/devkit-reviewer.md` | 모듈 경계와 `@Module` 등록 정합성, Controller→Service→데이터 접근의 방향, zod 스키마와 실제 사용처의 정합, 트랜잭션 경계, e2e 대상 누락 |
| `templates/next/.claude/agents/devkit-reviewer.md` | FSD 레이어 배치가 *의미상* 맞는가(린터는 import 방향만 본다), Server/Client 컴포넌트 경계, Server Actions의 입력 검증, `views` 레이어 사용 |

`next`판의 첫 항목이 린터와의 분업을 잘 보여준다 — `eslint-plugin-fsd`는 `features/`가 `entities/`를 import하는지 *방향*만 검사할 수 있고, **이 코드가 애초에 `features`에 있어야 하는지**는 판정하지 못한다. 후자가 리뷰의 몫이다.

---

## 4. 산출물

### 4.1 템플릿 자산 배치

```
packages/devkit-cli/templates/
  _shared/
    .github/workflows/claude-review.yml
    .claude/commands/review.md
  nest/
    .claude/agents/devkit-reviewer.md
    (기존 오버레이: eslint.config.mjs, tsconfig.json, ...)
  next/
    .claude/agents/devkit-reviewer.md
    (기존 오버레이: ...)
  monorepo/
    .claude/agents/devkit-reviewer.md      # next판 + 워크스페이스 관점
```

`_shared/`가 새로 생긴다. `copyOverlay`의 시그니처는 바꾸지 않고 **레시피에서 두 번 호출**한다.

```ts
copyOverlay('_shared'),
copyOverlay('nest'),
```

원자 연산에 "공통 오버레이" 개념을 넣지 않는 이유는 이 저장소가 유지해 온 태도와 같다 — 호출을 한 줄 더 쓰는 비용이 연산에 분기를 넣는 비용보다 싸다.

### 4.2 로컬 `/review` 커맨드

`_shared/.claude/commands/review.md`는 얇다. 리뷰 지식을 중복 보유하지 않고 에이전트를 가리킨다.

```markdown
---
description: devkit 표준 기준으로 변경분을 리뷰한다
---
`git diff`(staged 포함) 범위를 .claude/agents/devkit-reviewer.md 의 기준으로 리뷰한다.
그 문서의 "지적하지 않는 것" 절을 반드시 먼저 읽는다.
```

지식을 한 곳(에이전트 문서)에만 두는 것이 목적이다. 두 곳에 두면 `update`가 한쪽만 갱신하는 사고가 난다.

### 4.3 CI 워크플로

`_shared/.github/workflows/claude-review.yml` — 1.1절 실물에서 **두 군데만 바꾼다.**

```yaml
name: "Claude Code Review"
on:
  pull_request:
    types: [opened, reopened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      # (변경 1) claude-skills 체크아웃 단계 제거 — 자산이 이 저장소 안에 있다
      - uses: anthropics/claude-code-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          track_progress: true
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}

            이 PR을 리뷰해주세요.

            # (변경 2) 참조 대상이 프로젝트 내부 자산이다
            - .claude/agents/devkit-reviewer.md 를 읽고 그 기준으로만 리뷰합니다
            - 그 문서의 "지적하지 않는 것" 절을 반드시 지킵니다.
              포맷·import 정렬·타입 오류는 이미 lint/tsc가 CI에서 검사합니다

            구체적인 문제는 인라인 주석으로 남겨주세요.
            심각한 문제가 없으면
            `gh pr review ${{ github.event.pull_request.number }} --approve -b "LGTM"`
            로 승인해주세요.
          claude_args: |
            --allowedTools "Read,Glob,Grep,mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*),Bash(gh pr review:*)"
```

**자동 승인을 유지한다.** 리뷰가 통과 도장으로 굳을 위험은 있으나, 승인이 머지를 강제하지 않고(2.3절 — required check 아님) 실물이 이미 그렇게 동작 중이라 검증된 조합이다. 굳이 실물에서 멀어지지 않는다.

#### 시크릿은 CLI가 만들 수 없다

`CLAUDE_CODE_OAUTH_TOKEN`은 저장소 시크릿이고, 생성 직후 프로젝트에는 GitHub 리모트조차 없다. 따라서:

- CLI는 **완료 메시지에 안내를 출력한다** — 워크플로가 시크릿 없이는 동작하지 않는다는 사실과 등록 방법
- 생성된 `CLAUDE.md`에도 같은 내용을 적는다
- 시크릿 부재를 CLI가 검사하지는 **않는다.** 리모트가 없는 시점에 검사할 대상이 없다

이는 "부분 성공을 성공이라 말하지 않는다"(템플릿 설계 6.3절)의 연장이다. 워크플로 파일이 놓였다는 사실이 리뷰가 동작한다는 뜻은 아니며, 그 간극을 문서로 메운다.

---

## 5. `devkit update`

### 5.1 유형 마커 — update가 성립하기 위한 전제

`update`는 대상이 어떤 유형인지 알아야 한다. `create`가 `package.json`에 마커를 심는다.

```jsonc
{ "devkit": { "type": "nest", "version": "0.1.0" } }
```

- **별도 파일(`devkit.json`)이 아닌 이유**: 파일이 늘지 않고, `mergeJson`이 이미 다루는 대상이라 새 연산이 필요 없다.
- **`version`의 용도**: 지금은 기록용이다. 훗날 마이그레이션이 필요할 때 판단 근거가 되지만, **지금 마이그레이션 로직을 만들지 않는다**(YAGNI).
- **마커가 없으면 추측하지 않는다.** `package.json`의 의존성으로 유형을 짐작할 수 있지만(`@nestjs/core` 유무 등) 그것은 조용히 틀릴 수 있는 휴리스틱이다. 명확한 에러를 내고 `--type`을 요구한다.

### 5.2 실행 모델

```
devkit update [--only <categories>] [--type <t>] [--dry-run] [--yes] [--force]

1  마커 읽기        없으면 에러 + --type 안내
2  git 상태 검사     dirty면 거부 (--force 우회) / 저장소가 아니면 경고 후 확인
3  변경 목록 출력    신규 · 덮어쓰기 · 동일 로 분류
4  확인             y/n (--yes 로 생략, --dry-run 이면 여기서 종료)
5  재적용           copyOverlay + mergeJson 만
6  요약             "git diff 로 검토하세요"
```

### 5.3 `create`와의 결정적 차이 — 무엇을 하지 않는가

| 연산 | update에서 |
| --- | --- |
| `delegate` (공식 CLI) | **실행하지 않는다.** 기존 프로젝트에 `nest new`를 다시 돌릴 수 없다 |
| `makeDirs` | 실행하지 않는다. 디렉토리 구조는 이미 사람이 발전시켰다 |
| `removeFiles` | 실행하지 않는다. 사용자가 의도적으로 되살렸을 수 있다 |
| `copyOverlay` | 실행한다 (덮어쓰기) |
| `mergeJson` | 실행한다 |
| `linkDeps` | 실행한다 (경로 재계산) |
| `pnpm install` | `--only`가 의존성을 건드렸을 때만 |
| 자가검증 (`lint`+`build`) | **실행하지 않는다.** 기존 프로젝트는 갓 생성된 프로젝트와 달리 위반이 있을 수 있고, 그것이 update의 실패는 아니다 |

마지막 항목이 중요하다. 템플릿 설계 5.4절의 자가검증은 *"갓 생성된 프로젝트에서 lint 실패는 무조건 설정 문제"* 라는 논리 위에 서 있었다. 기존 프로젝트에서는 그 전제가 성립하지 않으므로 같은 검증을 하면 **정당한 위반을 update의 실패로 보고하게 된다.** 대신 완료 메시지로 `pnpm lint` 실행을 권한다.

이 표는 `--only`가 없을 때(= 전체)를 기준으로 한다. `--only`가 주어지면 그 카테고리에 해당하는 파일로 다시 좁혀진다(5.4절). 예를 들어 `--only claude`는 `linkDeps`도 `pnpm install`도 실행하지 않는다.

#### `--force`의 범위

`--force`는 **git 관련 거부(dirty·저장소 아님)만 우회한다.** 마커 부재, 알 수 없는 카테고리, `required` 위반은 우회하지 못한다 — 그것들은 사용자가 되돌릴 수 있는 상태의 문제가 아니라 **입력이 틀렸다는 신호**이고, 강행하면 잘못된 대상에 잘못된 것을 쓰게 된다.

### 5.4 `--only` 카테고리

| 카테고리 | 대상 |
| --- | --- |
| `claude` | `.claude/agents/**`, `.claude/commands/**`, `CLAUDE.md` |
| `ci` | `.github/workflows/**` |
| `lint` | `eslint.config.mjs`, `package.json`의 `prettier` 키 |
| `ts` | `tsconfig.json` |
| `test` | `jest.config.ts`, `test/jest-e2e.config.ts`, `vitest.config.ts` |
| `deps` | `linkDeps` + `package.json`의 `devDependencies` 패치 |

생략 시 전체다. 쉼표로 복수 지정한다(`--only claude,ci`).

#### 카테고리는 레시피 태그가 아니라 경로 패턴이다

처음에는 카테고리를 레시피 단계에 태그로 붙이려 했으나 성립하지 않는다. `copyOverlay('nest')` 한 번이 `eslint.config.mjs`(lint)·`tsconfig.json`(ts)·`CLAUDE.md`(claude)를 **한꺼번에** 복사하므로, 디렉토리 단위 태그로는 파일별 필터가 불가능하다. `--only lint`가 `tsconfig.json`까지 덮게 된다.

따라서 카테고리는 **복사 대상 파일 경로에 대한 패턴 테이블**로 정의하고, `copyOverlay`·`mergeJson`이 파일 단위로 필터한다. 위 표가 곧 그 테이블이다.

오버레이를 카테고리별 서브디렉토리로 쪼개는 안(`templates/nest/lint/`, `templates/nest/ts/`)도 검토했으나 기각했다. 템플릿 설계 4.1절이 정한 *"정적 설정 파일은 실물 파일로 둔다"* 의 값어치가 줄어든다 — `templates/nest/`를 열었을 때 생성물의 파일 배치가 그대로 보이는 것이 이 구조의 핵심이고, 카테고리 폴더가 그 대응을 깨뜨린다.

#### 드리프트 방어

패턴 테이블이 레시피와 어긋날 위험이 남는다. 새 오버레이 파일을 추가하고 테이블에 넣지 않으면 그 파일은 **어떤 `--only`로도 갱신되지 않으면서 조용히 성공을 보고한다.**

방어는 테스트다. **어느 카테고리에도 매칭되지 않는 오버레이 파일이 하나라도 있으면 테스트가 실패한다**(7절). `required` 규약과 같은 정신이며, 여기서도 침묵 대신 에러를 택한다.

### 5.5 변경 목록 출력

```
devkit update — my-api (nest)

  덮어쓰기 (3)
    eslint.config.mjs
    .claude/agents/devkit-reviewer.md
    .github/workflows/claude-review.yml
  신규 (1)
    .claude/commands/review.md
  동일 — 건너뜀 (2)
    tsconfig.json
    jest.config.ts

계속할까요? (y/N)
```

**"동일 — 건너뜀"을 반드시 출력한다.** 여기 있어야 할 파일이 목록 어디에도 없다면 곧바로 눈에 띈다. 침묵하면 그 사실이 숨는다.

---

## 6. 에러 처리

템플릿 설계 6절의 원칙(*"가장 위험한 실패는 조용한 성공이다"*)을 그대로 따른다. update 고유의 실패 목록:

| 실패 | 처리 |
| --- | --- |
| 마커 없음 | 중단. `--type` 안내 |
| 마커의 `type`이 알 수 없는 값 | 중단. 지원 유형 목록 출력 |
| git 워킹트리 dirty | 중단. 변경 파일 수와 `--force` 안내 |
| git 저장소가 아님 | 경고 + 확인 프롬프트. 되돌릴 수단이 없다는 사실을 명시 |
| `--only`에 알 수 없는 카테고리 | 중단. 유효 목록 출력. **부분 실행하지 않는다** |
| `mergeJson`의 `required` 키 부재 | 중단. 템플릿 설계 6.2절과 동일 |
| 대상 디렉토리가 devkit 프로젝트가 아님(`package.json` 없음) | 중단 |

`--only`의 오타를 부분 실행으로 처리하지 않는 이유는, `--only clade`가 **아무것도 갱신하지 않고 성공을 보고**하는 것이 정확히 이 저장소가 경계하는 실패 모드이기 때문이다.

---

## 7. 테스트 전략

템플릿 설계 7절의 3층 구조에 얹는다.

| 층 | 추가되는 케이스 |
| --- | --- |
| 1. 원자 연산 | 카테고리 패턴 매칭, 파일 동일성 판정(신규/덮어쓰기/동일 분류), **모든 오버레이 파일이 정확히 하나 이상의 카테고리에 매칭됨**(5.4절 드리프트 방어) |
| 2. 레시피 스냅샷 | update 레시피가 `delegate`·`makeDirs`·`removeFiles`를 호출하지 **않음**, `--only claude`가 `eslint.config.mjs`를 건드리지 않음, `--dry-run`이 파일을 쓰지 않음 |
| 3. 실생성 통합 | create → 파일 수정 → update → 수정이 덮이고 git diff로 확인 가능 / git dirty 상태에서 거부 |

2층의 "호출하지 않음" 단언이 특히 값어치 있다. update가 실수로 `delegate`를 상속하면 **기존 프로젝트에 `nest new`가 돌아 프로젝트를 파괴할 수 있다.** 스냅샷이 그 회귀를 막는다.

리뷰 자산 자체는 산문이라 단위 테스트 대상이 아니다. 대신 **구조 단언**을 둔다 — 각 `devkit-reviewer.md`가 "지적하지 않는 것" 절을 갖고, 거기에 `prettier`·`import 정렬`·`class-validator` 키워드가 포함되어 있을 것. 3.3절이 문서에서만 살아 있고 실제 파일에서 빠지는 드리프트를 막는다.

---

## 8. 완료 기준

1. `devkit create`로 생성한 nest·next 프로젝트에 `.claude/agents/devkit-reviewer.md`, `.claude/commands/review.md`, `.github/workflows/claude-review.yml`이 모두 존재
2. 생성된 프로젝트에서 `package.json`에 `devkit.type` 마커가 존재
3. 생성물의 `eslint.config.mjs`를 고의로 수정한 뒤 `devkit update --only lint`를 돌리면 그 수정이 덮이고, `git diff`로 정확히 보임
4. `devkit update --dry-run`이 파일을 하나도 쓰지 않고 변경 목록만 출력
5. git dirty 상태에서 `devkit update`가 **거부**하고, `--force`로는 진행
6. 마커 없는 임의 프로젝트에서 `devkit update`가 명확한 에러 + `--type` 안내
7. 각 `devkit-reviewer.md`가 "지적하지 않는 것" 절을 보유(구조 단언 통과)
8. 툴킷 저장소에서 `pnpm lint`·`pnpm test`·`pnpm build`·`tsc --noEmit` 전부 통과

**CI 워크플로의 실제 동작은 완료 기준에 넣지 않는다.** 검증하려면 실제 PR과 시크릿이 필요하고, 그것은 생성물 사용자의 몫이다. 대신 1.1절의 실물이 동작 중이라는 사실이 조합의 유효성을 뒷받침한다. 이 한계를 감추지 않고 여기에 적는다.

---

## 9. 미결 사항 / follow-up

- **`claude-skills`의 기존 리뷰어와의 관계** — devkit 리뷰어와 관점이 겹치는 부분이 있다. 두 자산을 수렴시킬지, `claude-skills` 쪽을 devkit 표준에 맞게 고칠지는 별도 판단이다. 현재는 **CI에서 devkit 리뷰어만 쓰고** 기존 리뷰어는 사용자가 로컬에서 원할 때 직접 호출한다
- **리뷰어 문서의 유형별 중복** — nest판과 next판이 3.2절 공통 골격을 각자 복제한다. 세 번째 유형(monorepo)까지 셋이 되면 공통 부분 추출을 검토한다. 지금 추출하면 성급한 추상화다(로드맵 5.5절의 태도)
- **`update`의 마이그레이션** — 마커의 `version`이 낮을 때 자동 변환하는 로직. 실제로 호환성이 깨지는 변경이 생길 때 설계한다
- **파일명·클래스명 규약을 린트 규칙으로 강제할지** — 1.4절에서 현재 어느 쪽도 담당하지 않음을 확인했다. 기계로 판정 가능하므로 리뷰가 아니라 규칙의 몫이며, `eslint-plugin-unicorn`의 `filename-case` 같은 기성 규칙 도입을 검토한다
- **기존 3개 NestJS 프로젝트에 `update` 적용** — 로드맵 Phase 1 Task 2~10(마이그레이션)의 상당 부분을 `devkit update`가 대신할 수 있다. 마이그레이션 작업 착수 시 재평가한다
