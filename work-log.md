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

### @devbak/tsconfig 패키지 추가 (Task 1)
- **변경 파일**: `packages/tsconfig/{package.json,base.json,nest.json,next.json,lib.json,README.md,tests/config.test.ts,tests/tsconfig.json}`(신규), `.gitignore`, `eslint.config.mjs`, `.oxlintrc.json`, `docs/superpowers/plans/2026-08-01-devkit-template.md`
- **내용**: `nest`·`next`·`lib` 3개 프리셋 + 공통 기반 `base`로 구성된, 빌드 없는 순수 JSON tsconfig 프리셋 패키지. `nest`는 `base`를 extends하지 않는다(`module: nodenext` 등 서로 다른 축이 많아 상속이 오히려 복잡해서). `next`·`lib`은 `base`를 extends한다.
  - **경로 옵션의 위험한 기준선을 여기서 처음 확정**: `extends`로 참조되는 tsconfig의 상대 경로(`include`/`exclude` 등)는 **그 파일 자신의 위치**를 기준으로 해석된다 — 소비자 프로젝트 위치가 아니다. `base.json`에 있던 `exclude: ["node_modules", "dist"]`가 실제로는 `packages/tsconfig/node_modules`·`packages/tsconfig/dist`를 가리켜 소비자 프로젝트에서는 **완전히 무의미**했다. 이 결함을 계획 자체에서 먼저 잡아 `exclude`를 프리셋에서 빼기로 계획 텍스트를 갱신한 뒤(커밋 `95a3634`) 구현에 반영했다(`ae2c711`). 이후 Task 2(jest `rootDir`)·Task 3(vitest `include`)가 반대 방향(소비자 기준)임을 실측으로 확인해 "도구마다 다르므로 일반화 금지"라는 원칙이 여기서 나왔다.
  - `.claude/worktrees/`(다른 세션이 만든 워크트리, `node_modules` 없음)가 루트 `pnpm lint`의 `projectService`를 깨뜨려 저장소 전체 린트가 막힌 인프라 문제를 별도로 처리(`68add0b`) — `.superpowers/`와 같은 부류로 `.gitignore`·`eslint.config.mjs`·`.oxlintrc.json` 3곳에서 제외.
- **검증**: `pnpm vitest run packages/tsconfig` 4/4(실제 `tsc` 실행 — 데코레이터 통과·strict 위반 검출·JSX 통과·`noUncheckedIndexedAccess` 검출), `pnpm lint`·`pnpm build` 통과.
- **커밋**: `535c84d..ae2c711`(사전 계획 결함 수정 포함) — 브랜치 `feature/devkit-roadmap`, main 미머지
- **후속 판단(Task 13)**: `/lib` 서브패스는 이 계획의 3개 레시피(nest·next·monorepo) 중 어디에서도 소비되지 않는다. 완료 기준 6번은 패키지 단위 기준이라 위반은 아니며(`@devbak/tsconfig` 자체는 nest·next가 쓴다), 로드맵이 예정한 "순수 라이브러리" 프로젝트 유형(미구현)을 위해 남겨둔다. 설계 문서 9절에 기록.

### @devbak/jest-config 패키지 추가 (Task 2)
- **변경 파일**: `packages/jest-config/{package.json,nest.js,nest-e2e.js,README.md,tsconfig.json,tests/config.test.ts,tests/tsconfig.json}`(신규), `eslint.config.mjs`, `.gitignore`, `package.json`, `pnpm-lock.yaml`
- **내용**: `nest new`의 인라인 `jest` 블록·`test/jest-e2e.json`을 CJS `module.exports`로 재노출하는 빌드 없는 패키지. `devkit-cli`가 생성할 NestJS 프로젝트가 `jest.config.js`에서 `require('@devbak/jest-config/nest')`로 소비한다.
  - **이 패키지가 저장소 최초의 "빌드 없는 순수 CJS `.js` 소스"였다**: `prettier-config`/`tsconfig`는 JSON만 배포해 겪지 않던 문제. 루트 `eslint.config.mjs`의 `projectService`가 이 `.js` 파일들을 못 찾아 `pnpm lint`가 전체 실패했고(파싱 에러), 찾은 뒤에도 `module`이 `no-undef`로 잡혔다. `eslint-config-nest`/`eslint-plugin-fsd`가 쓰는 패턴(패키지 루트 dev 전용 `tsconfig.json`, `allowJs`)으로 첫 문제를, `eslint.config.mjs`에 `packages/jest-config/*.js` 전용 `sourceType: 'commonjs'` 블록(글롭 확장이 아니라 새 블록 추가)으로 두 번째 문제를 해결.
  - **브리프가 예상한 실패와 실제 실패가 달랐다**: "ts-jest의 tsconfig 부재"를 예상했으나 실제로는 `Module ts-jest ... was not found`였다. 원인은 브리프가 준 테스트 코드가 픽스처를 `os.tmpdir()`에 만들어서였다 — 이 경로는 워크스페이스 트리 밖이라 Jest의 Node 모듈 해석이 `node_modules/ts-jest`를 못 찾는다. 실제 소비자는 자기 프로젝트 안에 `ts-jest`를 설치하므로 겪지 않는 문제(패키지 결함 아님). 테스트를 지우지 않고 픽스처 위치만 워크스페이스 트리 안(`packages/jest-config/tests/.fixtures/`)으로 옮겨 해결.
  - **경로 옵션 기준 실측**: `rootDir`/`coverageDirectory` 같은 상대 경로가 `@devbak/tsconfig`의 `extends`(프리셋 파일 위치 기준 — Task 1 결함)와 달리, **소비자의 `jest.config.js` 위치**를 기준으로 안전하게 해석됨을 실제 jest 실행(CLI 오버라이드 없이, `--coverage` 포함)으로 확인. README에 이 차이를 문서화.
- **커밋**: `7944b55` (브랜치 `feature/devkit-roadmap`, main 미머지)

### @devbak/vitest-config 패키지 추가 (Task 3)
- **변경 파일**: `packages/vitest-config/{package.json,next.js,node.js,README.md,tsconfig.json,tests/config.test.ts,tests/tsconfig.json}`(신규), `package.json`, `pnpm-lock.yaml`
- **내용**: 프론트엔드/Node 프로젝트 공용 Vitest 설정을 ESM 순객체 2종(`next`=jsdom, `node`=node)으로 재노출하는 빌드 없는 패키지. `devkit-cli`가 생성할 Next.js 프로젝트가 `vitest.config.ts`에서 `import config from '@devbak/vitest-config/next'`로 소비한다.
  - **`include` 상대 경로 기준을 실측으로 확인**: `@devbak/jest-config`의 `rootDir`과 같은 방향 — 프리셋 파일 자신의 위치가 아니라 **소비자의 vitest root(설정 파일 위치/`--root`)** 기준으로 해석된다. `packages/vitest-config`에는 `src/` 디렉터리가 없는데도, 워크스페이스 트리 안 픽스처(`tests/.fixtures/`, Task 2에서 배운 대로 `os.tmpdir()` 회피)에 `--root`로 넘긴 디렉터리의 `src/sample.test.ts`를 실제로 찾아 통과시킴을 확인. `@devbak/tsconfig`의 `extends`(프리셋 위치 기준 — Task 1 결함)와는 반대다.
  - **CJS `.js` 파일 lint 파싱 함정이 반복됨**: `@devbak/jest-config`와 동일하게 루트 `eslint.config.mjs`의 `projectService`가 `next.js`/`node.js`를 못 찾아 파싱 에러 → 패키지 루트에 dev 전용 `tsconfig.json`(`allowJs: true, checkJs: false, include: ["*.js"]`) 추가로 해결. 단 이번엔 ESM이라 `sourceType: 'commonjs'` 블록은 불필요.
  - **테스트에서 import한 설정 객체의 `no-unsafe-member-access`**: `checkJs: false`로 타입 검사 대상에서 빠져 `any`로 좁혀지는 것을, `@devbak/jest-config`가 require 결과를 캐스팅한 것과 같은 방식으로 필요한 필드만 명시한 타입으로 캐스팅해 해결.
  - **회귀 테스트 3개 전부 RED→GREEN 실측**: (1) next 프리셋 `environment: 'jsdom'`을 `'node'`로 바꿔 실패 확인 후 복원, (2) node 프리셋을 `'jsdom'`으로 바꿔 실패 확인 후 복원, (3) node.js의 `include`를 매칭되지 않는 패턴(`nomatch/**/*.test.ts`)으로 바꿔 "1 passed"가 사라짐(대신 "No test files found, exiting with code 0")을 확인 후 복원. 세 테스트 모두 실제 회귀를 잡는다.
  - `jsdom`은 `next` 프리셋만 요구하므로 `peerDependenciesMeta`로 optional 처리하고 워크스페이스 루트에 `pnpm add -D -w jsdom@^25` 추가.
- **검증**: `pnpm vitest run packages/vitest-config` 3/3, `pnpm lint`(oxlint+eslint) exit 0, `pnpm test`(루트, `--passWithNoTests`) 92/92 통과.
- **커밋**: `06367cc` (브랜치 `feature/devkit-roadmap`, main 미머지)

### devkit-cli 패키지 뼈대 + 타입 + 진입점 (Task 4)
- **변경 파일**: `packages/devkit-cli/{package.json,tsup.config.ts,tsconfig.json,src/{bin.ts,index.ts,types.ts},tests/{bin.test.ts,tsconfig.json},templates/}`(신규), 루트 `package.json`(`devbak` 스크립트)
- **내용**: `Ctx`·`Step`·`Recipe`·`RecipeOptions`·`ProjectType` 타입 정의, `findToolkitRoot()`(툴킷 루트 탐색), `assertDistFresh()`(`src`/`dist` mtime 비교로 시작 시 거부). `main()`은 `RECIPES`를 빈 객체로 남겨 Task 8이 배선하도록 브리프가 지시한 대로 비워둠.
- **핵심 실측**: `pnpm lint`는 `oxlint && eslint .`라서 **oxlint가 실패하면 ESLint가 아예 돌지 않는다.** oxlint는 포팅한 core 규칙을 `eslint(rule-name)` 형식으로 출력해 언뜻 ESLint가 돈 것처럼 보이므로, ESLint 단독 검증은 반드시 `pnpm lint:es`로 해야 한다는 함정을 여기서 처음 확인했다(이후 모든 태스크가 이 구분을 지킴). 대조 실험(`.oxlintrc.json`·`eslint.config.mjs` 양쪽의 `templates` glob을 제거)으로 `lint:es`가 픽스처 경로를 지목하며 exit 1이 됨을 확인해 인과를 확정 — oxlint는 자기 설정 파일만 읽으므로(`eslint.config.mjs`를 안 읽음) 양쪽에 같은 패턴이 필요하다.
- **디스패치 오류를 브리프가 막음**: 컨트롤러가 "브리프 Step 7이 RECIPES를 빈 객체로 두라 한다"고 착각(실제로는 Task 8 내용)했으나, 구현자가 브리프 원문을 최종 근거로 삼아 정확히 판단 — 브리프-우선 원칙이 컨트롤러 기억 오류의 전파를 막은 사례.
- **fix round**: templates glob 필요성을 5조건 대조 실험으로 검증(커밋 `6a573c5`).
- **deferred**: `assertDistFresh`가 `dist/bin.js`는 있고 `src/`가 없을 때 가공 없는 `ENOENT`를 던짐; `assertDistFresh` 자체에는 테스트가 없음(`findToolkitRoot`만 있음); `findToolkitRoot`의 에러 문구가 "찾지 못했습니다...찾았습니다"로 한국어 자기모순(브리프 원문 유래, 계획 결함).
- **커밋**: `e199343..6a573c5` (브랜치 `feature/devkit-roadmap`, main 미머지)

### mergeJson 연산 추가 (Task 5)
- **변경 파일**: `packages/devkit-cli/src/ops/merge-json.ts`(신규), `tests/merge-json.test.ts`(신규)
- **내용**: JSON 파일에 패치를 재귀 병합하는 원자 연산. `null` 값은 키 삭제, `required`는 병합 후 존재해야 할 경로를 선언해 위반 시 실패시킨다(6.2절 규약의 시작점).
- **계획 자체에서 발견한 버그**: `applyPatch({}, {a:{b:null}})`가 `{"a":{"b":null}}`을 반환 — 부모 경로(`a`)가 대상에 없으면 패치 서브트리를 통째로 대입해 중첩 `null`이 삭제 대신 **값으로 기록**됐다. 현재 3개 레시피는 부모 경로가 전부 이미 존재해 실피해가 0이었지만, 이후 레시피 작성자가 "null은 어디서나 삭제된다"고 가정했다면 조용히 깨진 JSON을 만들 뻔했다. 사용자 승인을 받아 계획 텍스트를 먼저 고치고(`8c1b977`) 재귀 삭제로 수정(`d204ed0`).
- **재리뷰 판정**: 회귀 테스트 3개 중 2개는 수정 전 구현에서 실제로 실패하는 진짜 회귀 테스트, 3번째("기존 키의 중첩 null")는 수정 전에도 통과했을 비회귀 고정(non-regression pin) — 결함은 아니나 회귀 검출력은 2개뿐이라고 기록.
- **커밋**: `178dce0..d204ed0` (브랜치 `feature/devkit-roadmap`, main 미머지)

### removeFiles·copyOverlay·makeDirs 연산 추가 (Task 6)
- **변경 파일**: `packages/devkit-cli/src/ops/{remove-files.ts,copy-overlay.ts,make-dirs.ts}`(신규), `tests/fs-ops.test.ts`(신규), `templates/`(픽스처)
- **내용**: 3개 원자 fs 연산. `assertInside()`로 `targetDir` 밖 경로 탈출을 거부하고, `required` 규약을 `removeFiles`까지 확장.
- **리뷰어가 구현자의 "순차가 설계 의도" 주장을 반박**: 세 루프 항목 전부 서로 의존성이 없음(`rm`은 `force:true`, `mkdir`는 `recursive:true`로 멱등, `copyTree`는 형제 엔트리 독립)이 근거. `Promise.all`로 병렬화해 `no-await-in-loop` 경고를 제거했으나(`cc0ffee`), 이것이 **로그 순서 보장을 실제로 깨뜨렸다** — `removeFiles`·`makeDirs`가 async 콜백 안에서 `logs.push()`를 부작용으로 실행해, `Promise.all`이 배열 순서만 보장하고 콜백 내부 실행 시점(libuv 스레드풀)은 보장하지 않는다는 사실이 드러남. 반환값 배열 기반으로 순서를 재구성해 구조적으로 해결(`f243bd7`).
- **deferred**: `copyOverlay`의 `describe()`가 변수 값은 빼고 키만 노출; `required` 경로가 여럿 누락되면 어느 `stat`이 먼저 settle되느냐로 에러 메시지 경로가 결정(순차일 땐 결정적이었음); `Promise.all`은 throw 이후에도 형제 작업을 취소하지 않음; `copyTree`의 fan-out에 상한 없음(현재 템플릿 크기에서는 무해).
- **이월(Task 8로)**: `copyOverlay`의 `templatesRoot()`가 `import.meta.url` 기준 dist 상대경로를 쓰는데, 당시 `src/ops/*`가 어떤 tsup 엔트리에도 안 붙어 있어 번들 여부 미확인 — Task 8에서 엔트리 연결 후 실빌드로 재검증하도록 명시.
- **이월(Task 12로)**: `copyOverlay`의 `run()` 경로에 자동 테스트가 0개(그레이 확인) — `templatesRoot()`가 dist를 전제해 vitest에서는 ENOENT. 3개 레시피 전부 이 연산으로 템플릿을 배선하므로 e2e가 반드시 덮어야 함.
- **커밋**: `38d3467..f243bd7` (2 fix rounds, 브랜치 `feature/devkit-roadmap`, main 미머지)

### linkDeps 연산 추가 (Task 7)
- **변경 파일**: `packages/devkit-cli/src/ops/link-deps.ts`(신규), `tests/link-deps.test.ts`(신규)
- **내용**: 소비자 `package.json`과 툴킷 패키지 디렉터리 사이의 `link:` 상대경로를 계산하는 연산. 7절이 요구하는 깊이 2종(루트 직속·`apps/web` 같은 중첩)을 모두 계산할 수 있어야 한다.
- **재리뷰가 검출력을 보강**: `normalizeToPosix`를 `linkSpec`에서 추출해 별도로 테스트 — `win32.relative`는 호스트 플랫폼과 무관하게 백슬래시를 반환하므로, 이 테스트는 실제로 macOS에서 실행되면서도 Windows 경로 정규화를 플랫폼 독립적으로 검증한다. 공개 시그니처는 불변.
- **parked → Task 13이 확정**: Windows를 지원 대상으로 볼 것인가 — 로드맵 2.1절이 소비자를 전부 macOS 개인 프로젝트로 한정하므로 **미지원으로 확정**하되, 이미 정확하고 테스트도 있는 정규화 코드는 제거 실익이 없어 유지(설계 9절에 기록).
- **parked → Task 11로 이월, Task 13이 재확인**: `linkDeps.run`이 항상 `ctx.targetDir` 기준으로 `linkSpec`을 계산하는데 `file`이 중첩 경로(`apps/web/package.json`)면 pnpm은 그 파일 자신의 위치 기준으로 `link:`를 해석해 어긋난다. 현재 세 레시피는 `compose`로 자식 `ctx`를 만들어 기본 파일에만 쓰므로 이 조합을 타지 않는다 — 결함이 아니라 새 레시피 작성 시 주의할 함정으로 설계 9절에 남김.
- **커밋**: `e183b1c..a15c10d` (브랜치 `feature/devkit-roadmap`, main 미머지)

### delegate 연산 + run 실행기 + CLI 진입점 (Task 8)
- **변경 파일**: `packages/devkit-cli/src/{ops/delegate.ts,run.ts,bin.ts,ops/index.ts}`, `tests/{run.test.ts,bin.test.ts}`(신규)
- **내용**: `delegate()`(외부 명령 위임), `compose()`/`scaffold()`(레시피 단계 조합기), `main()`이 `RECIPES` 레지스트리와 CLI 인자 파싱을 배선.
- **Task 6 이월 항목 해소**: `templatesRoot()`의 dist 상대경로가 옳음을 실빌드로 확인 — `dist/`에 `bin.js`·`index.js`·`chunk-*.js`가 전부 평평하게 배치되므로 `../templates`가 정확히 `packages/devkit-cli/templates`를 가리킨다. 실빌드 산출물을 동적 import해 `copyOverlay`를 실제로 실행시키고 `ENOENT` 경로로 확인(경로를 읽기만 한 게 아니라 실행 검증).
- **리뷰어 실증**: `run.test.ts`의 목에서 `async`를 제거하자 `run`이 `Promise.all`로 병렬화되는 회귀에 대해 테스트가 **통과하게 됐다.** async 함수의 `throw`는 거부된 Promise로 변환돼 `.map()`을 멈추지 않지만, 동기 `throw`는 `.map()` 자체를 멈춰 later 스파이가 호출되지 않는다 — 린트(`require-await`)를 만족시키려는 수정이 테스트 검출력을 정확히 무력화한 사례. `async` 복원 + 순서 테스트 보강으로 해결.
- `ops/index.ts` 재export가 5개 op 파일의 실제 export와 전부 일치(드리프트 0)를 리뷰어가 대조 확인.
- **커밋**: `37658d1..3d8ea72` (브랜치 `feature/devkit-roadmap`, main 미머지)

### nest 레시피와 템플릿 추가 (Task 9)
- **변경 파일**: `packages/devkit-cli/src/recipes/nest.ts`(신규), `templates/nest/*`(신규), `tests/recipe-nest.test.ts`(신규)
- **내용**: `nest new --strict --skip-git --skip-install -p pnpm` → `.prettierrc` 제거(required) → `copyOverlay('nest')` → `mergeJson`(package.json) → `linkDeps`(4개) → `makeDirs`(src/modules, src/common) → install/lint/build.
- **실제 생성 2회가 계획 실측이 놓친 것 2건을 드러냄**: (1) jest 설정의 `require()`가 `no-require-imports`에 걸림 (2) `nest new`의 `main.ts`가 `bootstrap()`을 await 없이 호출해 `no-floating-promises`(우리는 error, NestJS 자신은 warn)에 걸림.
- **리뷰 Important 3건, 전부 즉시 반영**: (1) `zod`가 `devDependencies`에 있어 `pnpm install --prod`에서 런타임 크래시 → `dependencies`로 이동 (2) `test/jest-e2e.json` 잔여(오버레이가 `jest-e2e.config.js`로 대체하는데 구 파일이 안 지워짐) → 제거 추가 (3) `main.ts` 오버레이가 설계 3.2절("애플리케이션 코드는 건드리지 않는다")과 충돌 → **사용자 판정**: 오버레이 유지 + `copyOverlay`에 `expectUpstream`(sha256 고정 드리프트 감지) 추가. `nest new`의 `main.ts`가 바뀌면 조용히 덮어쓰지 않고 실패한다.
- **계획 결함 누적 6건째**: `s.label.includes('lint')`가 `'eslint-config-nest'`와, `includes('install')`이 `'--skip-install'`과 부분 일치해 테스트가 오탐 — 정확 일치로 수정.
- **deferred**: `assertNoDrift`·`removeFiles`가 `stat` 실패를 전부 "파일 부재"로 취급(`EACCES` 오인 가능, Task 6 선례와 동일 패턴이라 수용); `copy-overlay-drift.test.ts`가 `assertNoDrift`를 직접 호출해 `copyOverlay(...).run()`을 통한 실제 배선은 Task 12 e2e만 덮음.
- **커밋**: `ce8bb04..f901cfa` (브랜치 `feature/devkit-roadmap`, main 미머지)

### next 레시피와 템플릿 추가 (Task 10)
- **변경 파일**: `packages/devkit-cli/src/recipes/next.ts`(신규), `templates/next/*`(신규), `tests/recipe-next.test.ts`(신규)
- **내용**: `create-next-app@latest --ts --app --src-dir --tailwind --no-eslint ...` → AGENTS.md/CLAUDE.md 제거(required) → `copyOverlay('next')` → `mergeJson` → `linkDeps` → FSD 레이어(`pages` 대신 `views`) → install/lint/build.
- **브리프 결함 2건을 구현자가 실행 중 잡음**: (1) `@devbak/eslint-plugin-fsd/next`에 파서가 없어 브리프 템플릿 그대로면 `next.config.ts`·`layout.tsx`가 "Unexpected token {"로 파싱 실패 — `jsx-a11y`가 JSX는 되게 하지만 TS 타입 주석은 espree가 모른다. `typescript-eslint` recommended(비타입체크)를 템플릿에 추가해 해결. (2) 브리프의 skipInstall 테스트가 `label.includes('lint')`를 써서 `'@devbak/eslint-plugin-fsd'`와 부분 일치 — 계획 결함 6번의 재발, 디스패치 경고 덕에 즉시 발견.
- **FSD 양방향 검증**: 고의 위반(shared→features)에서 `fsd/no-higher-level-imports` 발화, 위반 제거 후 원 생성물(`src/app/` 라우팅 포함) exit 0 — 오탐 없음.
- **Task 13 이월 항목 해소 여기서 답이 정해짐**: "next | tsconfig | 확인 필요" → **뺀다**. `create-next-app`의 tsconfig를 덮어쓰지 않기로 했으므로(Next가 관리하는 `.next/types/**` 항목이 있어서) `@devbak/tsconfig`에 소비처가 없다.
- **follow-up(범위 밖)**: `@devbak/eslint-config-next` 패키지로 `eslint-config-nest`와 대칭을 맞출지 — 현재는 생성물 템플릿에 `typescript-eslint`를 인라인. 이 계획의 패키지 4개 범위 밖.
- **커밋**: `f901cfa..e43bcb7` (fix 라운드 없음, 브랜치 `feature/devkit-roadmap`, main 미머지)

### monorepo 레시피와 템플릿 추가 (Task 11)
- **변경 파일**: `packages/devkit-cli/src/recipes/monorepo.ts`(신규), `templates/monorepo/*`(신규), `tests/recipe-monorepo.test.ts`(신규)
- **내용**: 루트 `copyOverlay('monorepo')` → `makeDirs`(apps/packages) → `compose`로 next 레시피를 `apps/web`에 합성(ctx 리매핑) → `apps/web/pnpm-workspace.yaml`·`eslint.config.mjs` 제거(required) → `mergeJson`(apps/web을 catalog: 참조로) → `linkDeps`(루트) → install/lint/build.
- **설계 4.1절 가설이 실제로 검증됨**: `next.ts` 무수정(git log로 확인), `compose` + ctx 리매핑 한 줄로 로직 복제 0건.
- **Important**: `apps/web/package.json`에 `typescript-eslint`가 고아로 남음(eslint·prettier는 null로 뺐는데 이것만 빠뜨림, `eslint.config.mjs`를 지웠으므로 쓸 곳이 없음) → null로 수정.
- **컨트롤러가 직접 재현·확정한 결함**: 생성물에 `"type"` 필드가 없어 Vite의 config 로더가 `vitest.config.ts`를 CJS로 번들링하고, externalize-deps가 ESM 전용인 `@devbak/vitest-config`를 `require()`로 로드하려다 실패("resolved to an ESM file", 2026-08-01 실측). `next.ts`의 `mergeJson`에 `"type": "module"`을 추가해 해결 — next 레시피 자체가 고쳤으므로 monorepo가 합성할 때도 `applyPatch`의 spread 특성으로 자동 상속됨을 `merge-json.ts` 소스로 확인.
- **설계 5.4절의 근거가 틀렸음이 여기서 드러남**: "create-next-app이 테스트를 안 만들어 vitest가 실패한다"던 원문 근거가 부정확 — 실제로는 config 로딩 단계에서 죽었을 뿐 `passWithNoTests`와 무관했다. 결정(자가검증에서 `pnpm test` 제외)은 유지, 근거 서술은 Task 13이 정정.
- **확인된 사실**: `create-next-app` 산출물의 확장자 분포는 svg 5·md 3·tsx 2·ts 2·json 2·yaml 1·mjs 1·ico 1·gitignore 1·css 1 — `.js`/`.cjs` **0개**. `"type": "module"`이 안전한 근거.
- **의도된 비대칭**: 루트=CJS(`"type"` 없음)·`apps/web`=ESM(`"type": "module"`)이 패키지 경계별 해석이라 정상 — 나중에 "통일"하지 않도록 Task 13이 `templates/monorepo/CLAUDE.md`에 명시.
- **Task 13 이월 항목 해소**: 루트 `linkDeps`의 `'tsconfig'`도 소비처가 없음(루트에 tsconfig.json 자체가 없음) — 제거.
- **커밋**: `75466cb..aaf28d0` (브랜치 `feature/devkit-roadmap`, main 미머지)

### 실생성 통합 테스트 추가 — 3층 e2e (Task 12)
- **변경 파일**: `packages/devkit-cli/tests/e2e/create.e2e.test.ts`(신규), `vitest.e2e.config.ts`(신규), `package.json`(`test:e2e` 스크립트), `README.md`(디스크 제약 설명)
- **내용**: nest·next·monorepo 3개 유형 실제 생성 + 안전장치(기존 디렉토리 거부) 총 5개 테스트. 각 생성물에서 install→lint→build→(전부) test까지 실제 실행.
- **이월 6건 전부 이 층에서 덮음**: (1) 오버레이 배선을 내용 수준으로 단언(`_gitignore` 부재+`.gitignore` 존재, `CLAUDE.md`에 치환된 이름 존재+`__NAME__` 부재) (2) 생성물의 `pnpm test`가 "테스트 0개 exit 0"이지만 config 로드 **성공**을 증명 — 원 결함(Task 11)은 로드 단계에서 죽었으므로 두 상태를 구분해야 함 (3) 모노레포 FSD가 규칙명(`fsd/no-higher-level-imports`)을 문자열로 단언 (4) eslint config 잔여물·lint 스크립트 키 충돌 없음 (5) `.js` 검사가 `node_modules`·`.next`·`dist`·`.turbo`·`out`·`.git` 제외 (6) `copyOverlay`의 `run()` 경로가 여기서 처음 실행 검증됨(Task 6·9 이월 항목 해소).
- **Important**: e2e의 `afterEach`가 실패 시에도 생성물을 무조건 삭제해, 설계 6.3절("생성물은 지우지 않는다 — 지우면 디버깅이 불가능해진다")을 **하네스만** 어기고 있었다(CLI 런타임 자체는 지킴, `rmSync` 없음 확인). `RUN_ID` 접미사 + 조건부 정리로 수정.
- **실측**: 5/5 통과, 96.79초(warm pnpm store). 디스크 여유가 6.1GiB뿐이라 세 유형을 동시에 만들면 소진 위험 — README에 명시. 실측 수치 자체(6.1GiB)는 README에는 박지 않고 리포트에만 남김("이 정도면 충분"으로 오독될 수 있어서).
- **커밋**: `78d2953..10465e3` (2 fix rounds, 브랜치 `feature/devkit-roadmap`, main 미머지)

### 최종 검증 및 기록 (Task 13)
- **변경 파일**: `packages/devkit-cli/src/recipes/{next.ts,monorepo.ts}`, `packages/devkit-cli/tests/__snapshots__/{recipe-next.test.ts.snap,recipe-monorepo.test.ts.snap}`, `packages/devkit-cli/templates/monorepo/CLAUDE.md`, `docs/superpowers/specs/2026-08-01-devkit-template-design.md`, `work-log.md`
- **내용**: 새 기능 없이 12개 태스크의 이월 6건을 처리하고 완료 기준 7개를 전수 확인.
  - **(이월 1) 미사용 `tsconfig` linkDeps 제거**: `next.ts`와 `monorepo.ts`(루트) 양쪽에서 `@devbak/tsconfig`를 링크했지만 실제 소비처(`extends`)가 없음을 확인(Task 10·11이 이미 이유를 밝혀둔 것을 실행). 두 파일의 `linkDeps` 목록에서 `'tsconfig'`를 빼고 스냅샷 2개를 갱신 — diff는 정확히 그 한 줄뿐임을 확인.
  - **(이월 2) 설계 5.4절 서술 정정**: "create-next-app이 테스트를 안 만들어 vitest가 실패한다"는 원문을 "생성물에 `"type"`이 없어 config 로딩이 CJS/ESM 충돌로 죽었다(Task 11 실측), `passWithNoTests`와 무관했다"로 교체. 자가검증에서 `pnpm test`를 빼는 **결정은 유지**하고(3층 e2e가 이제 이 범위를 덮음), "배제가 실제 결함을 가렸다"는 교훈을 명시했다.
  - **(이월 3) work-log 중복 정리**: Task 2·3 구현자가 미리 커밋한 항목(`0d2ed2f`, `d41c269`)은 지우지 않고 그대로 두었다 — 실제로 중복이나 모순은 없었고(Task 1·4~13 항목이 아예 없었던 것뿐), 이번에 Task 1·4~13을 시간순으로 채워 넣어 전체 기록을 일관되게 완성했다.
  - **(이월 4) `dist` 삭제 후 재빌드 검증**: `packages/*/dist`를 전부 옮겨 지운 뒤(주의: `rm -rf`가 이 세션의 권한 정책에서 거부되어 `mv`로 대체) `pnpm build`로 처음부터 재생성, 그 산출물로 `pnpm devbak create devkit-final-check --type nest`를 실행 — install/lint/build 전부 exit 0. 캐시된 산출물에 우연히 기대던 배선이 아님을 확인.
  - **(이월 5) 모듈 타입 비대칭 문서화**: `templates/monorepo/CLAUDE.md`에 "루트=CJS/`apps/web`=ESM은 의도된 비대칭이며 통일하면 `pnpm test`가 다시 깨진다"는 절을 추가.
  - **(이월 6) 완료 기준 7개 전수 확인**: 아래 참조 — **7개 전부 통과.**
- **완료 기준 확인 결과**:
  1. 3개 유형 실생성 → `pnpm lint`·`pnpm build` exit 0, nest는 `pnpm test`까지 — `pnpm test:e2e` 5/5(113초)로 통과 확인
  2. 모노레포 `pnpm install`이 중첩 워크스페이스 경고 없이 완료 — e2e monorepo 테스트로 확인
  3. Next 생성물에서 FSD 규칙이 실제로 발화(고의 위반 테스트) — e2e로 확인, 이번 세션의 Task 10 실측과 일치
  4. Nest 생성물에서 `no-floating-promises` 발화 — Task 9 실측 + e2e로 확인
  5. `dist` 삭제 후 재빌드해도 생성물 정상 동작 — 이번 세션에서 직접 재현(위 이월 4)
  6. 설정 패키지 4개 전부 실제로 소비(선언만 하고 미사용 0) — 이월 1로 확보. `@devbak/tsconfig/lib` 서브패스는 미소비지만 패키지 단위 기준이라 위반 아님(설계 9절에 기록)
  7. `pnpm lint`(oxlint+eslint) 경고 0·에러 0, `pnpm build`, `tsc --noEmit`(devkit-cli 본체·테스트 tsconfig 둘 다) 통과 — 이번 세션에서 재확인
  - **참고**: `dist` 신선도 가드도 실제로 동작함을 별도 확인(`touch src/bin.ts` → `pnpm devbak create` 즉시 거부, 디렉토리 미생성 — 8절 완료 기준 목록엔 없지만 6.3절 실패 목록 항목이라 함께 검증).
- **테스트 개수**: 92(Task 3 시점) → **165**(단위/스냅샷) + **5**(e2e, 별도 실행) — 최종.
- **검증**: `pnpm build`·`pnpm lint`(oxlint+eslint, 경고 0)·`pnpm test` 165/165·`pnpm test:e2e` 5/5·`tsc --noEmit` 2개 프로젝트 전부 통과.
- **커밋**: `caca9aa`(fix: linkDeps 제거) · `d39cbda`(docs: 이 기록) — 브랜치 `feature/devkit-roadmap`, main 미머지

### 최종 전체 브랜치 리뷰 대응 (I-1~I-4, M-1, M-3~M-5)
- **변경 파일**: `templates/{nest,next,monorepo}/_prettierignore`(신규), `templates/nest/eslint.config.mjs`, `templates/monorepo/CLAUDE.md`, `src/ops/path-exists.ts`(신규), `src/ops/{copy-overlay,remove-files,index}.ts`, `src/bin.ts`, `src/recipes/next.ts`, `tests/{bin,fs-ops}.test.ts`, 스냅샷 2개, `docs/superpowers/specs/2026-08-01-devkit-template-design.md`
- **내용**: 최종 리뷰가 지적한 8건을 한 패스로 처리.
  - **I-1(blocking)**: 세 템플릿에 `_prettierignore` 추가. 실제 `nest` 프로젝트를 생성해 실행으로 검증한 결과, 리뷰가 지목한 `dist/`는 이 리포의 최소 스캐폴드에서는 원인이 아니었다(`prettier --write dist` 실행해도 바이트 변화 없음) — 진짜 원인은 (a) pnpm의 flow-style `pnpm-lock.yaml`을 Prettier가 block-style로 펼치려는 것, (b) `templates/nest/eslint.config.mjs`의 80자 초과 한 줄이었다. 둘 다 반영(`pnpm-lock.yaml`을 세 `_prettierignore`에 추가, `eslint.config.mjs` 줄바꿈 수정). 수정 전/후 `pnpm format:check`를 실행해 exit 1 → exit 0 전환을 직접 확인한 뒤 생성물은 삭제했다.
  - **I-2**: `.then(() => true, () => false)` 관용구(`bin.ts`·`remove-files.ts`·`copy-overlay.ts` 3곳)를 `ENOENT`/`ENOTDIR`만 "없음"으로 읽는 공용 `pathExists()`로 교체 — `EACCES`가 덮어쓰기 방지 가드를 무력화하던 문제. `chmod 000`으로 실제 `EACCES`를 유발하는 단위 테스트 추가.
  - **I-3**: `next.ts` mergeJson에 `required: ['dependencies.next', 'scripts.build']` 추가 — 그동안 next 단독 실행 시 `create-next-app` 변화를 감지하지 못하던 공백. 스냅샷 2개 갱신.
  - **I-4·M-1·M-4**: 설계 문서만 갱신(코드 변경 없음) — nest 오버레이의 `tsconfig.json` 드리프트 미감지를 §9에 기록, §9의 `/lib` 서술을 현재 상태(`/nest`만 소비)로 정정, §6.3의 경로 탈출 가드 서술을 `copyOverlay` 제외로 정정.
  - **M-3**: `monorepo/CLAUDE.md`에 루트/`apps/web` 깊이별 `link:` relocation 경고 절 추가.
  - **M-5**: `bin.ts`의 `!(type in RECIPES)`를 `Object.hasOwn`으로 교체 — `--type constructor`가 `Object` 생성자를 레시피로 착각해 `run()` 내부에서야 죽던 문제. 테스트 추가.
- **검증**: `pnpm test`(루트) 169/169 · `pnpm lint`(oxlint+eslint) 경고 0/에러 0 · `pnpm build`(전체) 통과. `pnpm test:e2e`는 실행하지 않음(지시).
- **커밋**: `c0527c7` — 브랜치 `feature/devkit-roadmap`, main 미머지
### Claude 리뷰 자산 및 devkit update 기반 모듈 구현
- **변경 파일**: `packages/devkit-cli/**`(신규 패키지), `eslint.config.mjs`, `.oxlintrc.json`, `docs/superpowers/specs/2026-08-01-devkit-claude-review-design.md`, `docs/superpowers/plans/2026-08-01-devkit-claude-review.md`
- **내용**: 생성된 프로젝트가 Claude 기반 코드 리뷰를 갖추게 하는 자산과, 그것을 갱신하는 `devkit update`의 기반 모듈을 구현.
  - **설계의 중심은 리뷰의 관심사 경계**: `devlog-api`의 기존 `코드-리뷰` 스킬 체크리스트를 항목별로 분류한 결과 대부분이 린터 영역(import 정렬·알파벳순·데코레이터 순서)이었고, `class-validator` 전제는 zod를 쓰는 실제 스택과 이미 어긋나 있었다. 그대로 계승했다면 모든 PR에서 잘못된 지적이 나왔을 것이다. 리뷰어는 린터가 원리적으로 못 잡는 4관점만 본다.
  - **CI 워크플로는 `devlog-api`의 동작 중인 실물이 기준선**. 두 군데만 변경 — `claude-skills` 체크아웃 제거, 참조 대상을 프로젝트 내부 자산으로. 기존 `nestjs-reviewer`/`nextjs-reviewer`가 FSD를 전혀 언급하지 않고(grep 0건) 자체 폴더구조를 제안해 devkit 표준과 충돌하기 때문이다.
  - **드리프트 방어**: 카테고리에 매칭되지 않는 오버레이 파일이 있으면 테스트가 실패한다. 계획 작성 중 이 방어가 `.gitignore` 미분류를 즉시 드러내 `repo` 카테고리를 추가했다. 방어가 실제로 실패시키는지 미분류 파일로 확인했다.
  - **`templates/`를 ESLint·oxlint 양쪽 ignore에 추가**. 소비자용 `.ts` 오버레이는 이 저장소의 어떤 tsconfig에도 속하지 않아 타입 인식 규칙이 예외를 던진다 — `eslint-config-nest`에서 겪은 Critical과 같은 부류이며, 증상이 나기 전에 막았다.
  - **Task 3에서 태스크 분해 도중 유실됐던 관점 3건을 리뷰가 복원**: 설계 3.4절이 nest 리뷰어에 배정한 고유 관점(zod 스키마와 사용처의 정합, 트랜잭션 경계, e2e 누락)이 계획에서 누락된 채로 진행되고 있었다.
  - **Task 4의 구조 단언이 항상-통과였다**: `expect(doc).toContain('FSD')`가 문서 전체를 검사해, "지적하지 않는 것" 목록에 있는 "FSD 레이어 간 import 방향 위반" 문구에 우연히 매치됐다 — 관점 절을 통째로 지워도 통과하는 단언이었다. 세 단언을 `## 보는 것` 슬라이스로 스코프하고, 구현자가 섹션을 임시 삭제해 실제로 실패하는지 확인한 뒤 되돌렸다.
  - **Task 7에서 과잉 catch 발견**: `readFile(...).catch(() => null)`이 `EISDIR`·`EACCES`까지 신규 파일로 삼켰다. 계획은 "쓰기 단계에서 같은 오류를 다시 만난다"고 정당화했으나, 리뷰가 `EACCES`에서는 **쓰기가 성공해 기존 파일을 조용히 덮어쓴다**는 것을 실증했다. `ENOENT`만 신규로 좁혔다.
  - **Task 8에서 과소 집계와 과잉 catch 2건 발견**: (a) `git status --porcelain`이 새 미추적 디렉토리를 한 줄로 접어 `changedFiles`를 과소 집계했다 — devkit이 `.claude/agents/`를 통째로 만드는 바로 그 시나리오에서 터진다. `-uall`로 고쳤다. (b) `catch(() => null)`이 권한 오류·손상된 저장소까지 `not-a-repo`로 뭉갰다. `isMissingRepo`로 좁혔더니 이번엔 stderr 매칭이 로케일에 취약해져, `LC_ALL=C`·`LANG=C`로 메시지를 고정했다.
  - **Task 9 검증 중 tsc 게이트가 실결함을 잡았다**: `overlay-coverage.test.ts`의 `entry.parentPath ?? entry.path` 폴백이 `@types/node@24`의 `Dirent`에 `path`가 없어 `TS2339`로 실패했다. vitest는 타입 체크 없이 트랜스파일만 하므로 테스트 76개가 전부 초록인 채로 이 결함을 통과시켰고, `tsc --noEmit` 게이트가 처음 잡았다. 게이트를 다섯 개 둔 이유가 이것이다. 폴백은 `engines` 하한(`^20.19.0`)이 `parentPath` 도입 이후라 애초에 커버할 구간도 없었다.
- **검증**: `pnpm lint` exit 0(경고 1건, `overlay-coverage.test.ts:16` `no-await-in-loop`, 알려진 항목), `pnpm test` 155개 통과(신규 76 + 기존 79), `pnpm build` 성공, `tsc --noEmit` 2개 프로젝트(`packages/devkit-cli/tsconfig.json`, `packages/devkit-cli/tests/tsconfig.json`) 통과
- **커밋**: `83dcc95`(설계) 외 구현 커밋 다수, `8453b86`(tsc 폴백 결함 수정). 브랜치 `worktree-streamed-humming-papert`
- **남은 것**: CLI 실행 로직(`bin`·레시피·원자 연산 6종)과 `create`·`update` 서브커맨드는 템플릿 설계 구현의 몫이다(설계 0.1절)
