# 역할 분담 · 타입 인식 · 마이그레이션

"무엇을 oxlint에, 무엇을 ESLint에 맡길 것인가"의 판단 기준과, 타입 인식(tsgolint)의 현재 위치, 기존 ESLint 설정에서 oxlint를 뽑아내는 마이그레이션 도구.

## 목차

- [무엇을 어디에 맡길까](#무엇을-어디에-맡길까)
- [oxlint가 잘하는 것](#oxlint가-잘하는-것)
- [ESLint에 남겨둘 것](#eslint에-남겨둘-것)
- [타입 인식(tsgolint) 현황과 선택](#타입-인식tsgolint-현황과-선택)
- [마이그레이션 도구 @oxlint/migrate](#마이그레이션-도구-oxlintmigrate)
- [단계적 도입 전략](#단계적-도입-전략)

## 무엇을 어디에 맡길까

판단 기준은 단순하다: **oxlint가 지원하는 규칙이면 oxlint(빠름), 아니면 ESLint.** 겹치는 부분은 `eslint-plugin-oxlint`로 ESLint에서 끈다(→ hybrid-setup.md).

```
규칙이 oxlint에 있나?
├─ 있음 → oxlint 담당, ESLint에선 off
└─ 없음(플러그인/프레임워크/커스텀) → ESLint 담당
```

## oxlint가 잘하는 것

- **correctness 규칙**: 거의 확실한 버그(`no-debugger`, `no-dupe-keys`, `no-unsafe-negation`, `for-direction` 등) — oxlint의 주력.
- **가져오기 검사**: `import` 플러그인(`import/no-cycle`, `no-duplicates` 등). `--import-plugin` 또는 `.oxlintrc.json`의 `plugins: ["import"]`.
- **React/JSX 기본 규칙**: `plugins: ["react"]` — 리액트 correctness의 상당 부분.
- **TypeScript 비타입 규칙**: `plugins: ["typescript"]` — 타입 정보 없이 판단 가능한 것들.
- **대규모 코드베이스 전체 스캔**: 수천 파일도 순식간. pre-commit·에디터에 이상적.

## ESLint에 남겨둘 것

oxlint에 아직 없거나 생태계가 성숙한 영역:

- **프레임워크 전용 플러그인**: `@next/eslint-plugin-next`, `eslint-plugin-react-hooks`의 최신 규칙, `eslint-plugin-vue` 등.
- **타입 인식 규칙(성숙판)**: `@typescript-eslint`의 `no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unnecessary-condition` 등 — 타입 시스템 전체를 요구하는 검사.
- **접근성 심화**: `jsx-a11y`의 세밀한 규칙 중 oxlint 미지원분.
- **스타일리스틱/커스텀 규칙**: 사내 규약을 표현한 커스텀 ESLint 규칙, `eslint-plugin-*` 특수 플러그인.

## 타입 인식(tsgolint) 현황과 선택

oxlint는 **`oxlint-tsgolint`**(TypeScript 컴파일러의 네이티브 Go 포팅 `tsgo` 기반)로 타입 인식 린팅을 opt-in 지원한다. 떠도는 Promise 같은 타입 필요 검사를 oxlint 속도로 돌릴 수 있다.

```bash
pnpm add -D oxlint-tsgolint@latest
```
```jsonc
// .oxlintrc.json
{ "options": { "typeAware": true } }
```
```bash
oxlint --type-aware   # CLI에서 한시적으로 켜기
```

**그러나 2026년 현재 커버리지는 typescript-eslint보다 좁다.** 세 가지 선택:

| 전략 | 구성 | 적합 |
|------|------|------|
| **A. 보수(권장 기본)** | 타입 인식 = ESLint, oxlint는 비타입만 | 안정성 우선, 대부분의 팀 |
| **B. 혼합** | oxlint `typeAware` 켜되 ESLint 타입 규칙도 유지, 중복은 조정 | 속도와 커버리지 절충 |
| **C. 공격적** | oxlint `typeAware` 주력, ESLint 타입 규칙 최소화 | 속도 최우선, tsgolint 성숙도 수용 |

> 지금은 **A**로 시작하고, `oxlint-tsgolint`가 성숙하면 B→C로 옮기며 ESLint 의존을 줄이는 경로를 권한다. 이 스킬의 기본 예시는 A를 따른다.

## 마이그레이션 도구 @oxlint/migrate

기존 ESLint 설정에서 oxlint가 대신할 수 있는 규칙을 자동으로 뽑아 `.oxlintrc.json`을 생성해준다.

```bash
# 기존 .eslintrc/eslint.config 기반으로 oxlint 설정 생성
npx @oxlint/migrate

# 타입 인식 규칙까지 포함(요 oxlint-tsgolint)
npx @oxlint/migrate --type-aware
```

생성된 `.oxlintrc.json`을 검토한 뒤, ESLint 쪽에는 `eslint-plugin-oxlint`의 `buildFromOxlintConfigFile`을 붙여 중복을 끈다. 이러면 "oxlint가 담당할 것"과 "ESLint에서 끌 것"이 자동으로 정렬된다.

## 단계적 도입 전략

기존 ESLint 프로젝트에 리스크 없이 얹는 순서:

1. **oxlint를 관찰 모드로 추가** — `pnpm oxlint`를 CI에 `continue-on-error`로 붙여 어떤 규칙이 잡히는지 본다. ESLint는 그대로.
2. **`@oxlint/migrate`로 겹침 파악** — 생성된 설정으로 oxlint가 대체 가능한 규칙 범위를 확인.
3. **`eslint-plugin-oxlint` 연결** — ESLint config 끝에 `buildFromOxlintConfigFile` 추가, 중복 보고 제거.
4. **실행 순서 확정** — `oxlint && eslint`로 스크립트 전환, pre-commit은 oxlint 우선.
5. **(선택) 타입 인식 이전** — tsgolint 성숙도를 보며 A→B→C로.

각 단계가 독립적이라 언제든 멈춰도 동작하는 상태가 유지된다.
