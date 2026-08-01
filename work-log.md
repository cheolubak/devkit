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
- **커밋**: `8e78c65`(타입 단언 정리), `68b7984`(하이브리드 구성), `e150ae3`(README), `271b9f5`(work-log). 이후 `16004bf`로 `.superpowers/**`를 ESLint ignores에 추가(ESLint는 `.gitignore`를 읽지 않아 스크래치 파일이 `projectService`에 걸려 lint를 깨뜨렸다).

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

### React/Next 프리셋 서브패스 export 추가 (완료)
- **변경 파일**: `docs/superpowers/specs/2026-07-29-fsd-react-preset-design.md`, `docs/superpowers/plans/2026-07-29-fsd-react-preset.md`, `packages/eslint-plugin-fsd/src/{react,next}.ts`, `src/lib/preset.ts`, `src/types/eslint-plugin-jsx-a11y.d.ts`, `tests/{preset,react-preset,next-preset,entry-isolation}.test.ts`, `tests/tsconfig.json`, `package.json`, `tsup.config.ts`, `README.md`, `eslint.config.mjs`
- **내용**: consumer용 React/Next flat config 프리셋을 서브패스 export(`eslint-plugin-fsd/react`, `/next`)로 추가. 브레인스토밍 → 설계 → 계획 → Subagent-Driven 실행(6개 태스크, 태스크별 리뷰) → 최종 전체 브랜치 리뷰 순서로 진행.
  - **핵심 설계 3건**: (1) 루트 진입점은 React 의존 0을 유지한다 — optional peer만 선언하고 static import하면 선언과 실제가 어긋나므로 모듈 경계로 보증한다. (2) 프리셋은 config **배열**이다 — `ignores`를 FSD config에만 둬야 `@next/next` 규칙이 `app/`·`pages/`에서 꺼지지 않는다. (3) `eslint-plugin-react` 제외.
  - **실런타임 결함 발견**: 구조 단언 테스트 9개가 전부 통과한 상태에서, ESLint를 실제 실행해보니 `eslint-plugin-react@7.37.5`가 ESLint 10에서 크래시했다. `settings.react.version:'detect'` → `util/version.js:31`이 제거된 `context.getFilename()`을 호출. `version` 명시로 그 크래시는 피할 수 있으나 미가드 호출이 3곳 더 남아 사용자 결정에 따라 **프리셋에서 제외**. `jsx-a11y`는 제거된 API를 호출하지 않아 유지. peer 범위가 `^9.7`까지인 것을 "표기 지연"으로 본 초기 판단이 틀렸음을 스펙 2.1절에 기록하고, 설계에 **런타임 스모크 검증**(6.1절)을 절차로 추가.
  - **프리셋 구성**: `/react` = `[FSD, react-hooks]`(2개), `/next` = `[FSD, react-hooks, jsx-a11y, @next/next]`(4개). `ignores`는 FSD config에만, `@next/next`는 무스코프(라우팅 폴더에서 돌아야 함), `react-hooks`는 `.ts`/`.js`까지, `jsx-a11y`는 `.jsx`/`.tsx`만.
  - **최종 리뷰(opus)에서 Important 5건 발견·수정**: (I1) 문서가 "프리셋은 JSX 파싱을 설정하지 않는다"고 했으나 `jsx-a11y`의 상류 config가 `ecmaFeatures.jsx`를 품고 있어 `/next`는 실제로 파싱을 켠다 — 컨트롤러의 런타임 스모크가 `/next`만 대상으로 해 부분적으로 우연히 통과했고, `/react`가 `.jsx` 파싱에 실패하는 사실을 끝까지 놓쳤다. (I2) `react-hooks` peer 하한 `^7.0.0`이 ESLint 10을 선언하지 않는 7.0.x를 허용해 2.1절의 교훈을 재도입 → `^7.1.0`으로 상향. (I3) `react-hooks` recommended가 16개 규칙(error 13/warn 3, React Compiler 규칙군 포함)을 켠다는 사실이 미문서화, 스펙 8절의 `recommended-latest` 비교도 부정확(차이는 `void-use-memo` 1건). (I4) 격리 가드가 denylist라 서브패스 스펙시파이어·목록 밖 패키지를 놓침 → allowlist(`['eslint']`)로 전환. (I5) work-log가 완료 작업을 미완으로 기록.
- **검증**: `pnpm test` 42 → **67개** 통과, `pnpm lint`(oxlint+eslint) exit 0, 양쪽 `tsc` exit 0, `pnpm build` 성공. 산출물 격리 확인: `dist/index.js`의 실제 모듈 그래프를 재귀 추적해 React 패키지 참조 0건. 런타임 스모크: `/next`를 ESLint에 실어 `.jsx` 린트 → fatal 0건, 세 플러그인 규칙 모두 발화.
- **커밋**: `69b87f6`(설계) → `1936172`(Task 6) + 최종 리뷰 수정. 이번 세션 커밋 20건 이상.
- **follow-up**: CI 매트릭스(`eslint: [9, 10]`)로 v9 지원 주장 실체화, 배포 메타데이터(`license`/`description`/`repository`+LICENSE), `/react`에도 JSX `languageOptions`를 줄지 결정, `tsup` `splitting: false` 검토.

## 2026-07-31

### React/Next 프리셋 main 머지
- **내용**: `feature/eslint-plugin-fsd`를 `main`에 **fast-forward** 머지(merge commit 없음, CLAUDE.md 규칙 준수). 머지된 결과에서 테스트 67/67·lint·build·양쪽 tsc 재검증 후 feature 브랜치 삭제. `origin/main`이 존재하지 않아 통합은 전부 로컬이며 푸시하지 않았다.
- **커밋**: `main` HEAD = `ef06507` (총 40커밋)

### eslint-config-nest 설계·계획 (구현 대기)
- **변경 파일**: `docs/superpowers/specs/2026-07-31-eslint-config-nest-design.md`, `docs/superpowers/plans/2026-07-31-eslint-config-nest.md`
- **내용**: NestJS 백엔드용 ESLint 공유 설정을 **별도 패키지** `packages/eslint-config-nest`로 만드는 설계와 4개 태스크 구현 계획. 브랜치 `feature/eslint-config-nest`.
  - **별도 패키지인 이유(실측)**: `eslint-plugin-fsd`에 `/nestjs` 서브패스를 만들 수 없다. FSD 규칙이 NestJS 전형 구조에서 오탐한다 — `entities`와 `shared`가 FSD 레이어명이면서 동시에 NestJS에서 가장 흔한 폴더명이라, TypeORM 엔티티 상호 참조(관계 매핑에 필수) 같은 정상 코드에 `no-cross-imports`가 발화한다. `src/modules/`·`src/common/`·`src/app.module.ts`는 무반응.
  - **zod 전용**: 사용자 스택이 zod이므로 `@darraghor/eslint-plugin-nestjs-typed`를 제외했다(가치의 대부분이 class-validator 데코레이터 규칙이고 `class-validator`를 필수 peer로 요구하며 peer 상한도 무제한). 대신 `eslint-plugin-zod`(peer 전부 optional, `^10` 명시, 규칙 40개 중 recommended 30개)를 쓴다.
  - **ESLint 10 전용**: `peerDependencies`에 `^9`를 넣지 않는다. 검증하지 않은 범위를 지원한다고 주장하지 않기 위해서이며, `eslint-plugin-fsd`가 최종 리뷰에서 받은 지적을 반영한 것이다.
  - **핵심 설계**: 켜는 것만큼 끄는 것이 값어치다. 어떤 규칙이 Nest 관용구(생성자 파라미터 프로퍼티, 데코레이터만 있는 빈 `@Module` 클래스, 메서드 참조 전달)와 충돌하는지 추측하지 않고 디스크 픽스처에 실제 ESLint를 돌려 정한다. 결정 절차 5단계를 스펙·계획에 못박았고, 발화가 오탐인지 픽스처가 나쁜지 구분하는 판단을 포함한다.
  - 픽스처는 `@nestjs/*`를 설치하지 않고 데코레이터를 로컬 스텁으로 재현한다(출처는 규칙 판정에 무관). 반면 `zod`는 실제 설치 — 미해결 모듈은 `any`가 되어 `no-unsafe-*`가 무더기로 발화해 오탐 가드를 무력화한다.
- **커밋**: `e11ec1a`(설계 문서), `b4dd59b`(구현 계획)

### eslint-config-nest 구현 완료
- **변경 파일**: `packages/eslint-config-nest/**`(신규 패키지: `src/index.ts`, `tests/config.test.ts`, `tests/fixtures/nest-app/**`, `package.json`, `tsconfig.json`, `tests/tsconfig.json`, `tsup.config.ts`, `README.md`), `eslint.config.mjs`, `.oxlintrc.json`, `pnpm-lock.yaml`
- **내용**: Subagent-Driven으로 4개 태스크를 실행하고 최종 전체 브랜치 리뷰까지 완료. 테스트 67 → **77개**.
  - **config 구성**: `typescript-eslint` `recommendedTypeChecked` + `eslint-plugin-zod` `recommended`(30개) + Nest 치명 규칙 3종(`no-floating-promises`·`no-misused-promises`·`require-await`) 명시 고정. 자체적으로 끈 규칙은 **단 하나** — `@typescript-eslint/unbound-method`, `*.spec.ts`/`*.e2e-spec.ts` 스코프.
  - **"측정한 것만 끈다" 방법론**: 디스크 픽스처에 실제 ESLint를 돌려 발화한 것만 조정. 발화가 (a) Nest 관용구 오탐인지 (b) 픽스처가 나쁜지 구분하고 (b)면 픽스처를 고쳤다. 실제로 Task 2에서 데코레이터 스텁의 미사용 파라미터가 `no-unused-vars`를 발화시켰는데, 실제 Nest 코드는 데코레이터를 소비할 뿐 정의하지 않으므로 (b)로 판정해 픽스처를 분리했다 — 규칙을 껐다면 모든 consumer가 값어치 있는 규칙을 잃었을 것이다.
  - **최종 리뷰가 Critical 1건 발견**: `recommended-type-checked`에 `files` 제한이 없어 타입 인식 규칙이 `.js`/`.mjs`/`.cjs`에도 걸리는데 `projectService`는 `.ts`에만 켜져 있었다. 타입 정보 없는 타입 인식 규칙은 경고가 아니라 **예외를 던지므로**, consumer가 `eslint .`를 돌리면 자기 `eslint.config.mjs`에서 종료 코드 2로 크래시했다. 74개 테스트가 전부 초록인 상태에서 살아 있었고, 하네스가 손으로 고른 `.ts` 경로만 린트해 이 부류를 구조적으로 못 잡았기 때문이다. `disableTypeChecked`를 `.js/.mjs/.cjs`에 적용하고, `lintFiles(['.'])`로 프로젝트 전체를 린트하는 회귀 테스트를 함께 넣었다.
  - **npm 이름 선점 발견**: `eslint-config-nest`(v0.0.8, 2022)와 `eslint-plugin-fsd`(v1.0.1)가 이미 존재한다. 사고 방지로 `private: true`만 넣고 이름 결정은 보류.
- **검증**: `pnpm test` 77/77, `pnpm lint`(oxlint+eslint) exit 0, `pnpm build` 성공, 양쪽 `tsc --noEmit` exit 0.
- **커밋**: `6271c46`(스캐폴딩) → `0fb79df`(최종 리뷰 수정). 브랜치 `feature/eslint-config-nest`, 총 13커밋.
- **follow-up**: 픽스처 보강(느슨한 `@Body()` DTO 경로로 `no-unsafe-*` 시험, `@UseGuards` + `canActivate(): Promise<boolean>`로 `no-misused-promises` 시험, TypeORM 엔티티), 배포 메타데이터(LICENSE 파일).

### 두 패키지를 @devbak 스코프로 전환
- **변경 파일**: `packages/eslint-plugin-fsd/{package.json,src/index.ts,README.md}`, `packages/eslint-config-nest/{package.json,README.md,tests/config.test.ts}`
- **내용**: 무스코프 이름 `eslint-plugin-fsd`(v1.0.1)와 `eslint-config-nest`(v0.0.8, 2022)가 **둘 다 npm에 타인 선점**돼 그대로는 배포 불가였다. `@devbak/eslint-plugin-fsd`·`@devbak/eslint-config-nest`로 전환(두 스코프 이름 모두 미등록 확인).
  - `eslint-config-nest`의 `private: true` 제거 — 이름 충돌 방지용이었고 스코프 전환으로 이유가 사라짐.
  - 두 패키지에 `publishConfig.access: "public"` 추가. 스코프 패키지는 기본이 restricted라 없으면 공개 배포 안 됨.
  - 두 패키지에 `prepublishOnly: "pnpm build"` 추가. `files: ["dist"]`인데 `dist`가 gitignore 대상이라 빌드 없이 publish하면 **빈 패키지**가 나감(최종 리뷰 I3 지적).
  - 플러그인 `meta.name`을 패키지명과 일치.
  - **규칙 접두어 `fsd/`는 불변** — flat config에서 규칙명은 `plugins` 키로 정해지므로 패키지명 변경의 영향을 받지 않는다. 기존 consumer 설정 그대로 동작.
  - `docs/superpowers/` 설계·계획 문서와 이 work-log의 과거 항목은 당시 결정을 담은 이력이라 수정하지 않음.
- **검증**: `pnpm test` 77/77, `pnpm lint`·`pnpm build` 통과, `tsc` 4개 프로젝트 통과, `npm pack --dry-run`으로 tarball 정상 생성 확인(10파일/4파일).
- **커밋**: `d8952a9` — `main`에 fast-forward 머지 완료
- **남은 것**: 배포하려면 `npm login`으로 `@devbak` 스코프 소유 계정 로그인 필요(현재 미로그인).

### devkit 로드맵 및 Phase 1·2 설계 확정
- **변경 파일**: `docs/superpowers/specs/2026-07-31-devkit-roadmap-design.md`(신규), `work-log.md`
- **내용**: 이 저장소를 ESLint 패키지 모음에서 Next.js/NestJS 공용 개발 표준 툴킷(`@devbak/*`)으로 확장하는 4단계 로드맵과, Phase 1·2의 상세 설계를 확정.
  - **실측 선행**: `~/Documents/develop`의 28개 프로젝트 의존성을 스캔해 근거를 세웠다. `prettier@3`이 16개 프로젝트에 각자 존재(공통분모 1위), ESLint가 8(6개)/9(9개)/10(2개)로 3중 파편화, NestJS 3개(`account-api`/`devlog-api`/`eungam-api`)는 **전부 eslint@8 + legacy `.eslintrc.js`**, 테스트 러너는 프론트=vitest·백엔드=jest로 깔끔히 갈림.
  - **NestJS 3개 계측이 규칙 후보를 걸러냈다**: (1) 배럴 `index.ts`가 **통틀어 0개** → FSD의 `no-public-api-sidestep`에 대응하는 "모듈 Public API 강제" 규칙 기각. (2) **`class-validator`를 아예 안 쓰고** `@Body(new ZodValidationPipe(schema))` 패턴이 지배적 → "DTO에 class-validator 데코레이터 요구" 규칙을 만들었다면 소비자 전체가 위반이 될 뻔했다. `eslint-config-nest` 설계 3절이 zod를 전제한 것과 독립적으로 같은 결론에 도달. (3) `devlog-api`의 `AppController`가 `PrismaService`를 직접 주입 → R1의 실제 검출 사례.
  - **로드맵 순서를 작성 도중 뒤집었다**: 초판은 `eslint-plugin-nest-arch`를 Phase 1로 놓았으나, `git rebase origin/main`으로 `eslint-config-nest`가 들어오면서 **완성됐지만 소비자가 0인 패키지**가 이미 있다는 사실이 드러났다. 소비자를 만들기 전에 새 패키지를 더 만들면 미사용 패키지가 둘이 된다. 게다가 `eslint-config-nest`는 peer가 `eslint: ^10` 전용인데 소비자 후보 3개가 전부 eslint@8이라 **구조적으로 쓸 수 없는 상태**였다. → Phase 1을 "소비자 활성화"(ESLint 8→10 마이그레이션 + 설정 패키지 추출), Phase 2를 `nest-arch`로 재배치. 마이그레이션이 `nest-arch`의 오탐 기준선도 만들어주므로 정보 흐름도 맞다.
  - **Phase 2 규칙 4개 확정**: `no-persistence-in-controller`(error), `no-untyped-payload`(error), `no-cross-module-controller-import`(error), `no-direct-env-access`(warn). 핵심 결정은 **"클래스 역할은 오직 데코레이터로 판정한다"** — Nest는 경로가 아니라 `@Controller()`/`@Injectable()`이 역할을 선언하며, 이 덕분에 규칙이 단일 파일만 보면 되고 타입 정보가 불필요해진다(이미 타입 인식이라 느린 `eslint-config-nest`와 함께 켜도 추가 부담 없음).
  - **기각한 규칙을 스펙에 명시**: `thin-controller`는 "얼마나 thin해야 thin인가"가 주관적이라 오탐 후 규칙이 꺼지는 결말이 예상되어 기각하고, 의도 중 객관적으로 판정 가능한 부분만 R1이 대신한다. `no-http-artifacts-in-service`는 타입 정보가 필요해 follow-up으로 미룸.
  - **셀프 리뷰에서 내부 모순 1건 수정**: 4.1절이 "파일명과 경로는 판정에 쓰지 않는다"고 선언했는데 R3·R4는 실제로 경로를 쓴다. 원칙을 "클래스 역할 판정"으로 한정하고, R3가 파일명 관습에 의존하는 것이 안전한 이유(오차가 false negative 방향으로만 난다)를 명시.
  - **추측성 서술 2건을 실측으로 대체**: `**/tests/fixtures/**`가 `eslint.config.mjs`·`.oxlintrc.json` 양쪽에 이미 있고 패키지 경로를 앵커하지 않아 새 패키지도 자동 커버됨을 확인. `eslint-plugin-fsd`의 `license`/`description`/`repository`/`keywords`/`engines`가 **전부 비어 있음**을 확인(`eslint-config-nest`는 5개 모두 보유) → Phase 1에서 정렬.
- **커밋**: `ec4665a` (브랜치 `feature/devkit-roadmap`, main 미머지)
- **블로커**: 두 패키지 모두 미배포 상태라, Phase 1에서 소비자 프로젝트가 설치하려면 npm 배포 또는 `pnpm link`/`file:` 로컬 검증 경로를 먼저 정해야 한다.

## 2026-08-01

### 프로젝트 템플릿(`devkit create`) 설계 확정
- **변경 파일**: `docs/superpowers/specs/2026-08-01-devkit-template-design.md`(신규), `work-log.md`
- **내용**: 새 프로젝트를 한 명령으로 생성하는 CLI 설계를 확정. 산출물은 새 패키지 4개(`devkit-cli`, `tsconfig`, `jest-config`, `vitest-config`)이며 지원 유형은 NestJS · Next.js · Turborepo 모노레포.
  - **로드맵 순서를 다시 앞당겼다**: 로드맵 3.3절은 스캐폴딩을 Phase 4로 미루며 "Phase 1 없이 하면 설정을 하드코딩하게 된다"고 했다. 그 논증은 설정 패키지가 없을 때만 성립하므로, 패키지를 **먼저 뽑고** 템플릿으로 가는 순서로 무력화했다. 또 배포하지 않기로 한 이상 `create-` 접두어(= `npm create` 레지스트리 규약)가 무의미해져 **Phase 3·4를 한 패키지로 통합**했다.
  - **`eslint-plugin-fsd`도 소비자가 0이라는 사실이 드러났다**: 로드맵이 백엔드 마이그레이션만 다뤄 가려져 있었고, 어느 Phase도 이를 해소하지 않았다. Next.js 템플릿이 그 첫 소비자가 된다.
  - **공식 CLI를 실제로 돌려 후처리를 확정했다** — 추측했다면 세 군데를 틀렸다. (1) `@nestjs/cli` 11은 `.eslintrc.js`가 아니라 **`eslint.config.mjs`(flat config)를 생성**한다(`devlog-api`의 legacy 설정은 CLI 10 유물). 후처리는 삭제가 아니라 덮어쓰기다. (2) `nest new`가 **`eslint-plugin-prettier`+`eslint-config-prettier`를 기본 포함**하고 **`eslint: ^9.18.0`**을 박는다 — 로드맵 4.5절이 제거하기로 한 조합이자 `eslint-config-nest`의 `^10` 전용 peer와 충돌. (3) `nest new`는 **`.gitignore`를 만들지 않는다**.
  - **문서에 없고 실행해야만 나오는 함정 1건**: `create-next-app` 16은 `pnpm-workspace.yaml`(`ignoredBuiltDependencies`)을 생성한다. 모노레포의 `apps/web/` 안에 남으면 **중첩 워크스페이스**가 된다. 단일 앱에서는 `sharp` 빌드 승인에 필요하므로 남기고, 모노레포에서만 제거해 루트로 이관한다.
  - **`pnpm catalog:`가 `link:`를 지원하지 않음을 실측으로 확인**(`ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC`). 모노레포의 각 `package.json`이 `link:`를 직접 선언하고, 루트와 `apps/web`은 깊이가 다르므로 `linkDeps` 연산이 상대경로를 **계산**한다. `catalog:`는 `next`·`react` 등 일반 패키지에만 쓴다.
  - **설정 패키지 3개는 전부 빌드가 없다**(JSON · CJS 객체 · ESM 함수). 편의가 아니라 위험 제거다 — 로드맵 4.2절이 경고한 "`dist`가 낡으면 조용히 옛 규칙으로 린트한다"가 **구조적으로 불가능**해진다. 빌드가 필요한 건 `devkit-cli` 하나뿐이고, 그것은 시작 시 `src`/`dist` mtime 비교로 자체 방어한다.
  - **핵심 설계 — 연산이 기대를 선언한다**: 가장 위험한 실패는 크래시가 아니라 조용한 성공이다. `create-next-app`이 언젠가 `pnpm-workspace.yaml` 생성을 멈추면 제거 연산이 말없이 통과하고 방어가 죽은 줄 모르게 된다. `required: true`가 붙은 연산은 대상이 없으면 **실패**시켜 공식 CLI의 변화를 침묵 대신 에러로 드러낸다.
  - **셀프 리뷰에서 내부 모순 1건 수정**: `nest` 레시피만 8단계에 `verify`를 뒀는데 이는 원자 연산 6종에 없는 이름이었고 `next`에는 아예 없었다. 세 레시피 공통 `delegate` 단계로 통일하고 5.4절을 신설. 그 과정에서 **`pnpm test`를 자가검증에서 빼야 함**이 드러났다 — `create-next-app`은 테스트를 하나도 만들지 않아 갓 생성된 Next 앱에서 vitest가 "테스트 0개"로 실패한다. 생성물에 `--passWithNoTests`를 넣어 실패를 감추는 대신 자가검증 범위를 `lint`+`build`로 좁혔다.
- **커밋**: `feature/devkit-roadmap` 브랜치 (main 미머지)
- **다음**: 구현 계획 작성 → 설정 패키지 3개 → CLI 원자 연산 → 레시피 3종 순서
- **미결**: `eslint-config-nest`가 Nest 런타임 전역(`sourceType: 'commonjs'`, `globals.node`+`globals.jest`)을 담는지 구현 첫 단계에서 확인 필요. 로드맵 Phase 1 Task 2~10(기존 3개 프로젝트 마이그레이션)은 취소가 아니라 이 작업 뒤로 미뤄졌다.
