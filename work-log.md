# Work Log

## 2026-07-26

### eslint-plugin-fsd 설계 확정 및 저장소 초기화
- **변경 파일**: `docs/superpowers/specs/2026-07-26-eslint-plugin-fsd-design.md`, `.gitignore`
- **내용**: FSD 구조를 강제하는 ESLint 패키지(`eslint-plugin-fsd`) 설계 확정. pnpm 모노레포 구성, rule 3개(`no-higher-level-imports`/`no-cross-imports`/`no-public-api-sidestep`) + `recommended` flat config 프리셋. 관습 기반 zero-config 경로 파싱(`src/` 앵커로 Next.js 라우팅 폴더 오탐 방지), `pages` 레이어 별칭 `views`/`screens` 지원. git 초기화 및 설계 문서 커밋.
- **커밋**: 0bde34b

### Task 1: pnpm 모노레포 스캐폴딩 + eslint-plugin-fsd 패키지 뼈대
- **변경 파일**: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `packages/eslint-plugin-fsd/package.json`, `packages/eslint-plugin-fsd/tsconfig.json`, `packages/eslint-plugin-fsd/tsup.config.ts`, `packages/eslint-plugin-fsd/src/index.ts`, `pnpm-lock.yaml`
- **내용**: task-1-brief.md의 명세대로 pnpm 워크스페이스와 `eslint-plugin-fsd` 패키지 뼈대(임시 stub export)를 생성. `pnpm install`/`pnpm build`(tsup으로 dist 생성 확인)/`pnpm test` 모두 성공 확인. vitest가 테스트 0개로 exit 1 실패하여 브리프의 폴백대로 루트 `test` 스크립트에 `--passWithNoTests`를 추가해 exit 0으로 통과시킴.
- **커밋**: 1c29d1f

## 2026-07-27

### eslint-plugin-fsd 구현 완료 (Task 2~10 + 최종 리뷰 반영)
- **변경 파일**: `packages/eslint-plugin-fsd/src/lib/{types,layers,parse-path,resolve-import,create-rule}.ts`, `src/rules/{no-higher-level-imports,no-cross-imports,no-public-api-sidestep}.ts`, `src/index.ts`, `packages/eslint-plugin-fsd/tests/*.test.ts`, `README.md`
- **내용**: Subagent-Driven Development로 계획 10개 태스크를 TDD로 구현(레이어 모델 → 경로 파싱 → import 해석 → rule 공통 헬퍼 → rule 3개 → 진입점/`recommended` 프리셋 → README/통합검증). 총 42개 테스트 통과, tsup 빌드 성공. 태스크별 리뷰에서 실버그 3건 수정: (1) `findFsdRoot` 최상위 레이어 시 절대경로 `/` 반환, (2) `createImportRule`의 `ImportExpression`을 실제 노드로 처리해 report 크래시 제거, (3) 최종 리뷰(opus)에서 발견한 Critical — `recommended` 프리셋이 Next.js 루트 라우팅 `pages/`를 no-cross-imports 오탐 → `ignores: ['app/**','pages/**']` 스코핑으로 차단.
- **브랜치/커밋**: `feature/eslint-plugin-fsd` (fb00c5a..981b9a5, 총 14 커밋). main 미머지.
- **남은 follow-up**: type-only import 예외, 명시적 `/index` 진입점 허용, Windows 경로 테스트, `@x` cross-import, rule option `rootDir`.

## 2026-07-29

### oxlint + ESLint 하이브리드 린팅 도입 (저장소 자체 린트 구성)
- **변경 파일**: `.oxlintrc.json`(신규), `eslint.config.mjs`(신규), `packages/eslint-plugin-fsd/tests/tsconfig.json`(신규), `package.json`, `pnpm-lock.yaml`, `packages/eslint-plugin-fsd/src/lib/parse-path.ts`, `packages/eslint-plugin-fsd/tests/{create-rule,no-cross-imports,no-higher-level-imports,no-public-api-sidestep}.test.ts`
- **내용**: 루트 `lint` 스크립트가 `eslint .`를 가리키는데 `eslint.config.*`가 아예 없어 동작하지 않던 상태였다(플러그인 저장소인데 자기 자신은 린트되지 않음). oxlint 도입과 함께 ESLint 설정을 처음 구성해 하이브리드로 세움.
  - oxlint(`.oxlintrc.json`): plugins `eslint/typescript/import/promise/unicorn/vitest`, categories `correctness=error, suspicious=warn, perf=warn`. `unicorn/no-array-sort`는 tsconfig target이 ES2022라 `toSorted`(ES2023)를 못 써서 off.
  - ESLint(`eslint.config.mjs`): `recommendedTypeChecked` + `projectService`로 **타입 인식 규칙만** 담당. `eslint-plugin-oxlint`의 `buildFromOxlintConfigFile`을 배열 **맨 끝**에 spread해 중복 규칙 제거(198개 중 158개 off, 잔여 40개는 대부분 타입 인식 규칙).
  - 타입 인식 커버리지 구멍 해소: 빌드용 tsconfig가 `include: ["src"]`라 테스트 파일이 어떤 TS 프로젝트에도 속하지 않아 `projectService`가 실패 → `tests/tsconfig.json` 별도 추가. `*.config.*`는 오버라이드에서 `disableTypeChecked` + `projectService: false`(disableTypeChecked는 규칙만 끄고 파서는 안 끄기 때문).
  - 스크립트: `lint`를 `oxlint && eslint .`(빠른 쪽 먼저 실패시켜 느린 ESLint를 아끼는 순서)로 바꾸고 `lint:ox`/`lint:es`/`lint:fix` 추가.
  - 첫 린트에서 `@typescript-eslint/no-unnecessary-type-assertion` 5건 검출·수정: `parse-path.ts`의 `rel[0]!`(tsconfig에 `noUncheckedIndexedAccess`가 없어 무의미), 테스트 4곳의 `it as unknown as typeof RuleTester.it`. 전부 oxlint가 타입 정보 없이는 못 잡는 건이라 하이브리드에서 ESLint를 남긴 근거가 됨.
- **검증**: `oxlint` 0.13s 통과, `eslint .` 통과, `tsc --noEmit`(src/tests) 통과, `pnpm test` 42/42 통과, `pnpm build` 성공.
- **커밋**: 미커밋(작업 트리에 반영만)

### ESLint 10 업그레이드
- **변경 파일**: `package.json`, `packages/eslint-plugin-fsd/package.json`, `packages/eslint-plugin-fsd/README.md`, `pnpm-lock.yaml`
- **내용**: ESLint를 9.39.5 → **10.8.0**으로 올림. Node v24.6.0으로 v10 요구사항(`^20.19 || ^22.13 || >=24`) 충족.
  - `typescript-eslint@8.65.0`은 이미 peer가 `^8.57.0 || ^9.0.0 || ^10.0.0`이라 메이저 업그레이드 불필요. `eslint-plugin-oxlint`는 peer가 `oxlint`뿐이라 무관. `@eslint/js`만 `^9` → `^10.0.1`로 동반 상향(하이브리드 도입 시 eslint 9에 맞추려 임시로 낮춰뒀던 것).
  - **함정**: 루트만 올리면 `packages/eslint-plugin-fsd/node_modules/eslint`가 9.39.5로 남는다. 락파일에 auto-install된 peer `eslint: ">=9"`가 9.39.5로 고정돼 있고 `>=9`를 만족하니 pnpm이 갱신하지 않기 때문. 테스트가 패키지 디렉토리에서 `eslint`(RuleTester)를 import하므로 이대로면 **42개 테스트가 v9로 돌아가 업그레이드 검증이 무의미**해진다 → 플러그인 패키지에 `devDependencies: { eslint: "^10.8.0" }`을 명시해 해결.
  - `peerDependencies`를 `">=9"` → `"^9.0.0 || ^10.0.0"`으로 좁힘. 무제한 `>=9`는 미검증 미래 메이저(v11+)까지 지원한다고 주장하게 되므로 알려진 지원 범위로 한정.
  - 규칙 집합 변화는 1건뿐: **`no-useless-assignment`가 v10 `recommended`에 신규 편입**(oxlint 활성 카테고리 밖이라 ESLint가 담당, 현재 코드는 통과). 제거된 규칙 0건. 하이브리드 중복 제거는 그대로 유지(off 158개 동일, 활성 40→41).
  - README의 "ESLint v9 flat config" 표기를 v9/v10으로 갱신. `docs/superpowers/` 아래 설계·계획 문서는 당시 결정을 담은 이력 문서라 수정하지 않음.
- **검증**: `eslint --version` 10.8.0(루트/패키지 모두), `pnpm lint` 통과, `pnpm test` 42/42 통과(v10 RuleTester), `tsc --noEmit`(src/tests) 통과, `pnpm build` 성공.
- **커밋**: `8e78c65`(타입 단언 정리), `68b7984`(하이브리드 구성), `e150ae3`(README), `271b9f5`(work-log)

## 2026-07-30

### React/Next 프리셋 작업 (진행 중) — eslint-plugin-react ESLint 10 비호환 발견
- **변경 파일**: `docs/superpowers/specs/2026-07-29-fsd-react-preset-design.md`, `docs/superpowers/plans/2026-07-29-fsd-react-preset.md`, `packages/eslint-plugin-fsd/src/lib/preset.ts`, `packages/eslint-plugin-fsd/src/react.ts`, `packages/eslint-plugin-fsd/tests/{preset,react-preset}.test.ts`, `packages/eslint-plugin-fsd/package.json`
- **내용**: consumer용 React/Next flat config 프리셋을 서브패스 export(`eslint-plugin-fsd/react`, `/next`)로 추가하는 작업. 브레인스토밍 → 설계 → 계획 → Subagent-Driven 실행 순서로 진행.
  - **핵심 설계 2건**: (1) 루트 진입점은 React 의존 0을 유지한다 — optional peer만 선언하고 static import하면 선언과 실제가 어긋나므로 모듈 경계로 보증한다. (2) 프리셋은 config **배열**이다 — `ignores`를 FSD config에만 둬야 `@next/next` 규칙이 `app/`·`pages/`에서 꺼지지 않는다.
  - **실런타임 결함 발견**: 구조 단언 테스트 9개가 전부 통과한 상태에서, ESLint를 실제 실행해보니 `eslint-plugin-react@7.37.5`가 ESLint 10에서 크래시했다. `settings.react.version:'detect'` → `util/version.js:31`이 제거된 `context.getFilename()`을 호출. `version` 명시로 크래시는 피할 수 있으나 미가드 호출이 3곳 더 남아 사용자 결정에 따라 **프리셋에서 제외**. `jsx-a11y`는 제거된 API를 호출하지 않아 유지.
  - peer 범위가 `^9.7`까지인 것을 "표기 지연"으로 본 초기 판단이 틀렸음을 문서에 명시하고, 설계에 **런타임 스모크 검증**(6.1절)을 절차로 추가.
  - 프리셋 구성 확정: `/react` = `[FSD, react-hooks]`, `/next` = `[FSD, react-hooks, jsx-a11y, @next/next]`. JSX 파싱 설정은 consumer 책임.
- **검증**: Task 1 완료(리뷰 clean), Task 2 리뷰 통과 후 요구사항 변경으로 수정 라운드 진행 중. 테스트 목표 65개.
- **커밋**: `69b87f6`(설계 문서), `24027bb`(구현 계획), `0e66b2f`(Task 1 조립 헬퍼), `48c325e`(Task 2 초안), `7b9bee7`(설계·계획 개정)
- **남은 작업**: Task 2 수정 라운드 → Task 3(next 프리셋) → Task 4(격리 회귀 테스트) → Task 5(exports·tsup) → Task 6(README) → 최종 리뷰
