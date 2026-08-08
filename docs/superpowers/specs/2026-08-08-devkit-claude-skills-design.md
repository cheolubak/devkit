# @devbak devkit — Claude 스킬·커맨드 템플릿 자산 설계 문서

- 작성일: 2026-08-08
- 브랜치: `feature/devkit-claude-skills`
- 선행 문서: `2026-08-01-devkit-claude-review-design.md` (이하 "리뷰 설계"), `2026-08-06-devkit-implementer-agent-design.md`
- 상태: 설계 확정

---

## 0. 요약

생성된 프로젝트가 **유형에 맞는 Claude 스킬과 슬래시 커맨드**를 갖추게 하고, 그 스킬들을 **리뷰 판정의 근거로 배선**한다.

리뷰 설계는 `.claude/agents/devkit-reviewer.md` 하나에 리뷰 기준을 손으로 써 넣었다. 그 문서는 "무엇을 보는가"는 말하지만 "그래서 옳은 모양이 무엇인가"는 말하지 않는다. 판정 기준이 리뷰어의 사전 지식에 맡겨져 있다. 이 문서는 그 빈자리에 **스킬을 놓는다**.

산출물은 세 갈래다.

| 갈래 | 내용 |
| --- | --- |
| 스킬 자산 | `templates/_skills/` 공용 풀 43개(원본 42 + devkit 저작 1) + 레시피의 유형별 선택 |
| 커맨드 자산 | 유형별 슬래시 커맨드 6개(`_shared` 2, `nest` 2, `next` 2) |
| 리뷰 배선 | `devkit-reviewer.md`·`claude-review.yml`이 스킬을 판정 근거로 읽게 하고, 스택 충돌을 봉인 |

---

## 1. 실측 (2026-08-08)

상상하지 않고 실물을 먼저 읽었다. **네 군데에서 설계가 바뀌었다.**

### 1.1 스킬 출처 — gstack 소유와 사용자 추가는 다르다

`~/.claude/skills/` 아래에 108개 디렉토리가 있다. 그러나 그중 다수는 gstack 스위트가 설치한 것이고, `~/.claude/skills/gstack/` 아래에 같은 이름의 원본이 함께 있다. 집합 차(`comm -23`)를 실제로 계산해 **사용자가 직접 추가한 54개**를 얻었다. 이 문서의 대상은 그 54개다. gstack 소유(`qa`, `ship`, `browse`, `design-*`, `plan-*`, `ios-*` 등)와 superpowers 플러그인 스킬은 제외한다.

gstack 스킬은 `~/.gstack/sessions`·`bin/gstack-config` 같은 **로컬 설치 상태에 의존하는 preamble**을 갖는다. 소비자 프로젝트에 복사하면 그 전제가 없어 preamble이 조용히 실패한다. 제외의 근거는 취향이 아니라 이것이다.

### 1.2 원본 스킬이 devkit 템플릿과 모순한다 — 세 건

원본 그대로 복사하기로 했으므로(2.1절), 모순은 사라지지 않고 **소비자 프로젝트로 옮겨진다**. 실측한 것은 세 종류·네 스킬이다:

| 스킬 | 실측 | devkit 템플릿 |
| --- | --- | --- |
| `nestjs-validation/SKILL.md` | `class-validator` 11회, `zod` **0회** | zod 전용. `CLAUDE.md`가 "`class-validator`를 쓰지 않는다"고 명시 |
| `nestjs-crud/SKILL.md` | `class-validator` 4회 | 〃 |
| `eslint/SKILL.md` | `pnpm add -D eslint typescript-eslint @eslint/js eslint-config-prettier` + flat config 직접 작성 | `recipes/nest.ts`가 `@eslint/js`·`eslint-config-prettier`·`eslint-plugin-prettier`를 `null`로 **제거**하고 `@cheolubak/eslint-config-nest`로 대체 |
| `fsd-architecture/SKILL.md` | `steiger` 기반 | `@cheolubak/eslint-plugin-fsd` |

가장 위험한 것은 첫 두 건이다. `devkit-reviewer.md`의 금지 목록은 **`class-validator` 지적 자체를 오류로 규정한다**(리뷰 설계 3.3절, `tests/review-assets.test.ts`가 단언). 스킬을 그대로 넣으면 이 조합이 성립한다:

```
구현자: nestjs-validation 을 읽고 class-validator DTO 를 쓴다
리뷰어: 그것을 지적하는 것이 금지돼 있다
린터:   zod 전용 규칙이라 class-validator 를 모른다
→ 아무도 못 잡는 경로
```

이 봉인이 3.3절의 `devkit-stack` 스킬이다. 원본을 고치지 않고 우선순위만 뒤집는다.

### 1.3 `.claude/skills/` 는 어떤 카테고리에도 매칭되지 않는다

`src/lib/categories.ts:45`의 패턴은 `^\.claude\/(?:agents|commands)\/.+` 다. `skills`가 없다. 결과는 두 겹이다.

1. `tests/overlay-coverage.test.ts`의 "모든 오버레이 파일이 카테고리에 매칭된다"가 **실패한다**.
2. 그 테스트를 통과시키지 않고 우회하면(예: 테스트 수정), `devbak update --only claude`가 스킬을 **영원히 갱신하지 않으면서 성공을 보고한다**. 이 저장소가 반복해서 경계해 온 조용한 실패다.

### 1.4 `.gitignore` 는 이미 열려 있다 — 그러나 우연이다

루트 `.gitignore:11`이 `.claude/`를 무시하고, `:20`의 `!packages/devkit-cli/templates/*/.claude/`가 되살린다. `git check-ignore -v`를 스킬 경로에 실제로 돌려 exit=1(무시하지 않음)을 확인했다.

```
git check-ignore -v packages/devkit-cli/templates/_shared/.claude/skills/eslint/SKILL.md  → exit 1
```

**다만 `_skills/` 는 `.claude/` 아래가 아니다.** 2.2절이 채택하는 공용 풀 경로는 `templates/_skills/`이므로 `.claude/` 무시 규칙과 무관하고, 되살림 규칙의 보호도 받지 않는다 — 애초에 무시되지 않는다. 이 사실을 3.5절 테스트가 고정한다(2026-08-06에 `devkit-implementer.md`가 조용히 `git add`를 건너뛴 전례가 있다).

---

## 2. 배치

### 2.1 형태 — 원본 그대로 복사

각색하지 않고 바이트 그대로 옮긴다. 상류 스킬이 갱신되면 재복사가 곧 반영이고, 각색본이 원본과 갈라지는 문제가 없다. 대가는 1.2절의 모순이며, 그것은 `devkit-stack` 하나로 봉인한다.

### 2.2 공용 풀 — `templates/_skills/`

기존 오버레이 모델(`templates/<type>/` 통째 복사)을 그대로 쓰면 `monorepo`가 nest 15개 + next 18개를 자기 디렉토리에 **또 한 벌** 가져야 한다.

| | A. 유형별 디렉토리에 그대로 복사 | **B. 공용 풀 + 선택 복사 (채택)** |
| --- | --- | --- |
| 배치 | `templates/{nest,next,monorepo}/.claude/skills/` | `templates/_skills/<name>/` 한 벌 |
| 코드 변경 | 없음 | 새 op `copySkills(names)` 1개 |
| git 상의 중복 | 스킬당 최대 3벌 | 1벌 |
| 게시 패키지 증가 | ~3.2MB | **~1.7MB** (실측 합계 1,756KB) |
| 드리프트 | 한 벌만 고치면 나머지가 조용히 낡음 | 구조적으로 불가능 |

B를 채택한다. 드리프트가 결정적이다 — 이 저장소는 `copy-overlay-drift.test.ts`까지 두고 그 실패를 막아 왔는데, A는 같은 실패를 스킬 수만큼 새로 만든다.

유형별 구성이 레시피에 **이름으로 드러나는** 부수 효과도 있다. `registryDeps(['eslint-config-nest', ...])`가 이미 쓰는 모양과 같다.

### 2.3 유형별 스킬 구성

**공통 8개** (세 유형 모두) — 툴체인과 규율. `devkit-stack`만 devkit이 저작하고(3.3절) 나머지 7개는 원본 복사다:

```
devkit-stack
eslint  prettier  oxlint-eslint-hybrid  typescript-patterns
tdd  clean-code  verify-implementation
```

**`nest` 전용 15개**:

```
nestjs-auth  nestjs-caching  nestjs-config  nestjs-crud  nestjs-database
nestjs-deployment  nestjs-error-handling  nestjs-queue  nestjs-security
nestjs-semantic-search  nestjs-swagger  nestjs-testing  nestjs-validation
clean-architecture  backend-verify-loop
```

**`next` 전용 18개**:

```
fsd-architecture  react-best-practices  nextjs-a11y  nextjs-auth
nextjs-deployment  nextjs-i18n  nextjs-seo  nextjs-shadcn  nextjs-testing
cache-components  server-actions  tanstack-query  zustand-patterns
react-hook-form  tailwind-patterns  framer-motion  e2e-mcp
frontend-verify-loop
```

**`monorepo`**: 공통 8 + nest 15 + next 18 + `nestjs-monorepo` + `nextjs-monorepo` = **43개**

풀의 크기는 공통 8 + nest 15 + next 18 + monorepo 전용 2 = **43개**(합집합). 각 유형이 받는 수는 nest 23, next 26, monorepo 43이다. 게시 패키지 증가분 실측 1,756KB는 원본 42개의 합이며 `devkit-stack`은 여기에 포함되지 않는다(수 KB).

### 2.4 제외한 사용자 스킬 12개와 근거

| 스킬 | 제외 근거 |
| --- | --- |
| `design-fit-review` `ux-walkthrough` `review-team` | 라이브 서비스 진단·토론 리뷰. 갓 생성된 빈 프로젝트에 대상이 없다 |
| `frontend-resume-review` | 채용 도구. 코드베이스와 무관 |
| `manage-skills` `skill-usage` | 스킬 저작·통계 도구. 대상은 스킬 저장소이지 소비자 프로젝트가 아니다 |
| `diff-commit` `merge-worktree` `request-pr` | 개인 git 워크플로. 팀마다 다르며 devkit이 강제할 것이 아니다 |
| `python-backend` | 스택 불일치 |
| `supabase-patterns` `grafana-observability` | devkit이 설치하지 않는 외부 서비스. 스킬만 있고 배선이 없으면 없는 설정을 가정한 코드를 유도한다 |

### 2.5 커맨드

`_shared/.claude/commands/`:

| 커맨드 | 하는 일 |
| --- | --- |
| `/review` | 기존. `devkit-reviewer.md` 기준으로 변경분 리뷰 |
| `/verify` | 린트·빌드·테스트 게이트를 순서대로 돌리고 실패 지점에서 멈춘다. `verify-implementation` 참조 |

`nest/.claude/commands/`:

| 커맨드 | 하는 일 |
| --- | --- |
| `/module <이름>` | `src/modules/<이름>/`에 module·controller·service를 배치하고 zod 스키마를 놓는다. `nestjs-crud`·`nestjs-validation`·`devkit-stack` 참조 |
| `/api-test <경로>` | 해당 HTTP 경로의 e2e 스펙(`*.e2e-spec.ts`)을 만든다. `nestjs-testing` 참조 |

`next/.claude/commands/`:

| 커맨드 | 하는 일 |
| --- | --- |
| `/slice <레이어>/<이름>` | FSD 슬라이스와 세그먼트, Public API 배럴을 만든다. `fsd-architecture`·`devkit-stack` 참조 |
| `/a11y` | 변경된 컴포넌트의 접근성을 점검한다. `nextjs-a11y` 참조 |

`monorepo`는 nest·next 커맨드를 모두 받는다. 이름이 겹치지 않는다.

커맨드는 **얇은 래퍼**다. 판정 기준을 자기 안에 복제하지 않고 스킬 경로를 가리킨다. 복제하면 스킬이 갱신돼도 커맨드가 옛 기준을 계속 말한다.

---

## 3. 배선

### 3.1 `copySkills` 원자 연산

`ops/copy-skills.ts`. `copyOverlay`의 `collectTree`를 재사용하되 소스가 `templates/_skills/<name>/`이고 대상이 `.claude/skills/<name>/`이다.

```
copySkills(['eslint', 'prettier', ...])
```

- 이름이 풀에 없으면 **던진다**. 조용히 건너뛰면 그 스킬은 어떤 유형에도 배포되지 않으면서 생성이 성공한다
- `__NAME__` 치환은 하지 않는다. 스킬 본문은 프로젝트 이름과 무관하고, 우연히 그 형태의 문자열이 있으면 훼손된다
- `plan`/`run` 분리는 `copyOverlay`와 같다 — `update`가 `plan`만 호출한다

### 3.2 카테고리 확장

```
[/^\.claude\/(?:agents|commands|skills)\/.+/, 'claude']
```

1.3절의 두 겹 실패를 함께 닫는다. `devbak update --only claude`가 에이전트·커맨드·스킬을 한 단위로 갱신하게 된다 — 셋은 서로를 경로로 가리키므로 따로 갱신되면 결합이 끊긴다.

### 3.3 `devkit-stack` 스킬 — 충돌의 봉인

`templates/_skills/devkit-stack/SKILL.md`. devkit이 새로 쓰는 유일한 스킬이며 세 유형 공통이다. 담는 것:

- `@cheolubak/*` 6개 패키지가 **이미 결정한 것**: 린트(`eslint-config-nest`, `eslint-plugin-fsd`), 포맷(`prettier-config`), 타입(`tsconfig`), 테스트(`jest-config`, `vitest-config`)
- 레지스트리 접근: `.npmrc` + `GITHUB_TOKEN`. 공개 패키지도 토큰을 요구한다
- **우선순위 선언**: 다른 스킬의 안내가 이 문서와 어긋나면 이 문서가 이긴다. 어긋나는 지점을 이름으로 못박는다 —
  - 검증은 **zod**다. `nestjs-validation`·`nestjs-crud`의 `class-validator` 안내는 이 프로젝트에 적용하지 않는다
  - 린트 설정은 **`@cheolubak/eslint-config-nest`**를 확장한다. `eslint` 스킬의 `@eslint/js`·`eslint-config-prettier` 직접 설치 안내를 따르지 않는다
  - FSD 강제는 **`@cheolubak/eslint-plugin-fsd`**다. `fsd-architecture` 스킬의 `steiger` 안내를 따르지 않는다

원본 스킬을 고치지 않는 이유는 2.1절과 같다. 각색본은 상류와 갈라진다. 우선순위 선언은 한 파일이므로 갈라질 곳이 없다.

### 3.4 리뷰가 스킬을 읽게 한다

**`devkit-reviewer.md`** — 두 경로를 다 연다.

1. frontmatter에 `skills:` 목록 (`~/.claude/agents/nestjs-reviewer.md`가 쓰는 형태). 로컬에서 서브에이전트로 호출될 때 붙는다
2. `## 보는 것`의 각 관점 항목에 **판정 근거 스킬 경로를 본문으로 명시** (예: 트랜잭션 경계 → `.claude/skills/nestjs-database/`)

2가 없으면 안 된다. `claude-review.yml`은 리뷰어를 서브에이전트로 호출하지 않고 **문서로 읽게** 한다 — frontmatter는 그 경로에서 해석되지 않는다. 리뷰 설계가 `REVIEWER_PATH`를 테스트로 고정한 것과 같은 이유다: 결합이 끊겨도 워크플로는 실패하지 않고 조용히 기본 판단으로 리뷰한 뒤 승인까지 찍는다.

`## 지적하지 않는 것`에 한 줄을 더한다: **스킬의 안내가 `devkit-stack`과 어긋나면 `devkit-stack`이 이기며, 그 어긋남 자체를 지적 근거로 삼지 않는다.**

**`claude-review.yml`** — 프롬프트에 `.claude/skills/`의 존재와 `devkit-stack` 우선순위를 한 문단 더한다. 기존 프롬프트 인젝션 방어 문단은 그대로 둔다.

### 3.5 테스트

새 파일 `tests/skill-assets.test.ts`:

| 단언 | 막는 것 |
| --- | --- |
| 레시피가 선언한 이름이 전부 `_skills/`에 실재 | 오타 하나로 스킬이 조용히 빠지고 생성은 성공 |
| `_skills/`의 모든 디렉토리가 최소 한 유형에 선택됨 | 아무 유형도 안 쓰는 스킬이 패키지 용량만 먹음 |
| 모든 스킬에 `SKILL.md`가 있고 frontmatter `name`이 디렉토리명과 일치 | 이름 불일치로 스킬이 로드되지 않음 |
| `devkit-stack`이 `zod`·`eslint-config-nest`·`eslint-plugin-fsd`를 명시 | 1.2절 봉인의 소실 |
| `devkit-reviewer.md`의 `skills:` 목록이 그 유형이 실제로 받는 스킬의 부분집합 | 리뷰어가 없는 스킬을 가리키며 빈손으로 판정 |
| 각 커맨드가 참조하는 `.claude/skills/<name>` 경로가 그 유형에 실재 | 커맨드가 끊긴 경로를 가리킴 |
| `_skills/` 아래 모든 파일이 `git ls-files`에 있음 | 1.4절 — 디스크는 초록불인데 clone·CI·게시본에는 없음 |

기존 테스트 중 영향받는 것:

- `tests/overlay-coverage.test.ts` — 3.2절의 패턴 확장으로 통과. `_skills/`는 `templates/<type>/` 수집 대상이 아니므로 이 테스트의 범위 밖이다
- `tests/review-assets.test.ts` — `skills:` frontmatter 추가가 기존 `name: devkit-reviewer` 정규식(`^---\n(?:.*\n)*?name: devkit-reviewer\n`)을 깨지 않는지 확인. 깨지면 frontmatter 순서를 조정한다

### 3.6 레시피 변경

세 레시피 각각에 `copySkills([...])` 한 단계가 는다. 위치는 `copyOverlay('_shared')` 다음 — 오버레이가 놓은 `.claude/`에 얹힌다.

---

## 4. 하지 않는 것

- **스킬 각색·요약**. 2.1절.
- **gstack 스킬 이식**. 1.1절 — 로컬 설치 상태에 의존한다.
- **`~/.claude/agents/`의 사용자 에이전트 17개 이식**. `nestjs-reviewer`·`nextjs-reviewer`는 devkit의 `devkit-reviewer`와 역할이 겹치고 금지 목록이 없다(그래서 `class-validator`를 지적한다). 나머지(`hiring-manager`, `resume-critic` 등)는 코드와 무관하다. 이번 범위 밖이다.
- **스킬 버전 고정·상류 동기화 자동화**. 재복사는 사람이 한다. 자동화는 상류가 바뀌었을 때 무엇이 깨지는지 아직 모르는 상태에서 도입할 것이 아니다.
