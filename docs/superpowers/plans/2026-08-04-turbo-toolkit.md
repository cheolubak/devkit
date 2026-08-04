# 툴킷 Turborepo 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이 저장소(`eslint-workspace`)의 `build`·`test`·`lint`·`typecheck`를 패키지별 태스크로 재편하고 Turborepo가 오케스트레이션하게 한다.

**Architecture:** 태스크는 패키지별로 두되, **oxlint만 루트 태스크 하나로 남긴다**(Rust라 전체를 훑어도 밀리초). ESLint는 패키지마다 설정을 두되 **루트 설정이 `packages/**`를 무시**하게 해 어떤 실행에서도 스코프 안의 설정이 정확히 하나이도록 격리한다 — 이것이 `multiple candidate TSConfigRootDirs`를 원천 차단하는 유일한 장치다.

**Tech Stack:** Turborepo 2.10.8, pnpm workspace, vitest, ESLint 10 + typescript-eslint 8, oxlint, tsup, TypeScript 5.6

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-04-turbo-toolkit-design.md`. 절 번호는 이 문서를 가리킨다.
- 패키지 매니저는 **pnpm**. `npm`을 쓰지 않는다.
- TypeScript strict mode, 2-space 들여쓰기.
- **주석·문서는 한국어.** "왜 그런가"(결정의 근거·실측 사실)를 적는다. 기존 파일의 주석은 **하드윈 사실의 기록이므로 옮길 때 지우지 마라.**
- 커밋 메시지는 imperative mood, 한국어.
- **검증은 `pnpm lint:ox`와 `pnpm lint:es`를 둘 다** 돌린다. 어느 하나로는 반대쪽 규칙을 원리적으로 못 본다.
- **기준선(현재 값): 테스트 362개 통과, oxlint 에러 0(warning 3), ESLint 에러 0, 빌드 성공.** 태스크가 끝날 때마다 이 값이 유지돼야 한다. 테스트 개수가 줄면 `include` 패턴이 파일을 놓친 것이다.
- 브랜치는 `feature/turbo-toolkit`.

---

## 파일 구조

| 파일 | 책임 | 상태 |
| --- | --- | --- |
| `turbo.json` | 태스크 그래프 | 신규 |
| `eslint.base.mjs` | 공유 ESLint 설정을 **함수로** export. 실행 설정이 아니다 | 신규 |
| `eslint.config.mjs` | 루트 파일 전용. `packages/**`를 무시한다 | 수정 |
| `vitest.config.ts`·`vitest.e2e.config.ts` (루트) | — | **삭제** |
| `packages/<pkg>/vitest.config.ts` | 패키지 단위 테스트 | 신규 ×7 |
| `packages/devkit-cli/vitest.e2e.config.ts` | e2e 전용 | 신규 |
| `packages/<pkg>/eslint.config.mjs` | `eslint.base.mjs`를 소비 | 신규 ×7 |
| `packages/<pkg>/tests/tsconfig.json` | 테스트 타입 검사 | 신규 ×6 (devkit-cli는 이미 있음) |
| `packages/<pkg>/package.json` | 태스크 스크립트 | 수정 ×7 |
| `package.json` (루트) | turbo 위임 스크립트 | 수정 |

### ~~설계 대비 확장 1건 — `tests/tsconfig.json`을 6개 패키지에 만든다~~ (2026-08-04 정정: 틀린 전제였다)

**이 절의 원래 주장은 사실이 아니었다.** Task 3 실행 중 구현자가 실측으로 잡았다 — `tests/tsconfig.json`은 **7개 패키지 전부에 이미 있다.** 그중 둘은 이유가 주석으로 적힌 채 커스터마이즈돼 있다:

- `eslint-config-nest`: `"exclude": ["fixtures"]` — `tests/fixtures/nest-app/`이 자체 tsconfig를 가진 독립 픽스처다. 바닐라 템플릿으로 덮으면 데코레이터 시그니처 오류(TS1241·TS1270)가 난다.
- `eslint-plugin-fsd`: `"include": [".", "../src/types"]` — `src/types/eslint-plugin-jsx-a11y.d.ts`의 모듈 보강이 필요하다. 빼면 TS7016이 난다.

**계획이 이렇게 틀린 이유**: 사실 수집 때 패키지 **루트**의 `tsconfig.json`만 세고, `tests/` 아래는 `devkit-cli` 하나만 확인했다. "나머지는 없다"는 어느 조사도 확인하지 않은 명제였다. `ls packages/*/tests/tsconfig.json` 한 줄이면 드러났다.

**그래도 이 태스크의 값어치는 그대로다.** 파일이 있었다는 것과 `tsc`가 돌았다는 것은 다르다 — 이 저장소에는 `typecheck` 스크립트가 **아예 없었으므로**, 그 tsconfig들은 ESLint `projectService`의 파싱에만 쓰였고 **타입 검사는 한 번도 실행된 적이 없다.** Task 3이 그 검사를 처음 켠다.

따라서 Task 3의 Step 1은 **신설이 아니라 확인**이고, 커스터마이즈된 둘은 **그대로 둔다.**

---

## Task 1: turbo 설치와 `build` 태스크

**Files:**
- Create: `turbo.json`
- Modify: `package.json` (루트 — devDependency + `build` 스크립트)
- Modify: `.gitignore` (`.turbo/` 추가)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `turbo.json`의 `tasks.build`, 루트 `build: "turbo run build"`

- [ ] **Step 1: 루트 `package.json`에 `packageManager`를 추가한다**

**실측: 지금 이 필드가 없다.** turbo는 락파일로 패키지 매니저를 추론할 수 있지만, 명시하는 것이 권장이고 **`monorepo` 템플릿(`templates/monorepo/package.json`)은 이미 명시하고 있다** — 툴킷이 자기가 권하는 것을 자기는 안 하고 있던 셈이다. 도그푸딩이 이 작업의 목적 중 하나이므로 여기서 맞춘다.

현재 pnpm 버전은 `10.27.0`이다. `package.json`의 `"private": true` 아래에 추가한다:

```jsonc
"packageManager": "pnpm@10.27.0",
```

- [ ] **Step 2: turbo를 설치한다**

```bash
pnpm add -Dw turbo@2.10.8
```

`-w`는 워크스페이스 루트에 넣는다는 뜻이다. 없으면 pnpm이 거부한다.

- [ ] **Step 3: `turbo.json`을 만든다**

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json", ".oxlintrc.json", "eslint.base.mjs"],
  "tasks": {
    "build": { "outputs": ["dist/**"] }
  }
}
```

`dependsOn: ["^build"]`를 **넣지 않는다.** 이 저장소의 패키지 7개 사이에는 workspace 의존이 하나도 없어(설계 1.1절) no-op이고, 없는 관계를 선언하면 다음 사람이 있다고 오해한다.

`globalDependencies`의 셋은 모든 패키지 결과에 영향을 준다 — 하나라도 바뀌면 전체 캐시가 무효화돼야 한다. `eslint.base.mjs`는 Task 4에서 생기지만 지금 선언해 둬도 무해하다(없는 파일은 무시된다).

- [ ] **Step 4: `.gitignore`에 `.turbo/`를 추가한다**

`.gitignore`의 적당한 위치에 추가한다:

```
.turbo/
```

turbo의 로컬 캐시·로그 디렉토리다. 커밋되면 안 된다.

- [ ] **Step 5: 루트 `build` 스크립트를 바꾼다**

`package.json`의 `"build": "pnpm -r build"` → `"build": "turbo run build"`

- [ ] **Step 6: 빌드가 이전과 같은지 확인한다**

```bash
rm -r packages/devkit-cli/dist packages/eslint-plugin-fsd/dist packages/eslint-config-nest/dist
pnpm build
ls packages/devkit-cli/dist packages/eslint-plugin-fsd/dist packages/eslint-config-nest/dist
```

Expected: 3개 패키지 전부 빌드되고 `dist/`가 생긴다. `pnpm test`도 돌려 362개 통과를 확인한다.

- [ ] **Step 7: 캐시가 걸리는지 확인한다 — 이 태스크의 핵심 검증**

```bash
pnpm build
```

Expected: 두 번째 실행이 `>>> FULL TURBO`로 즉시 끝난다. **이게 안 나오면 `outputs` 선언이 틀렸거나 캐시가 작동하지 않는 것이다** — 다음 태스크로 넘어가지 말고 원인을 찾는다.

한 패키지만 건드려 부분 무효화도 확인한다:

```bash
touch packages/devkit-cli/src/bin.ts
pnpm build
```

Expected: `devkit-cli`만 재빌드되고 나머지 둘은 캐시 적중(`cache hit`)이다.

- [ ] **Step 8: 커밋**

```bash
git add turbo.json package.json pnpm-lock.yaml .gitignore
git commit -m "build: turbo를 도입하고 build 태스크를 옮긴다"
```

---

## Task 2: `test` 태스크 — vitest 설정을 패키지별로 분할

**Files:**
- Create: `packages/{devkit-cli,eslint-config-nest,eslint-plugin-fsd,jest-config,prettier-config,tsconfig,vitest-config}/vitest.config.ts` (7개)
- Create: `packages/devkit-cli/vitest.e2e.config.ts`
- Delete: `vitest.config.ts`, `vitest.e2e.config.ts` (루트)
- Modify: `packages/*/package.json` (7개 — `test` 스크립트), `packages/devkit-cli/package.json` (`test:e2e`)
- Modify: `package.json` (루트), `turbo.json`

**Interfaces:**
- Consumes: Task 1의 `turbo.json`
- Produces: `turbo.json`의 `tasks.test`·`tasks["test:e2e"]`, 패키지별 `test` 스크립트

- [ ] **Step 1: 기준선을 기록한다**

```bash
pnpm test 2>&1 | grep -E "Test Files|Tests "
```

Expected: `Test Files 40 passed (40)` / `Tests 362 passed (362)`. **이 숫자를 보고서에 적어라** — 분할 후 대조할 기준이다.

- [ ] **Step 2: 패키지별 `vitest.config.ts`를 만든다 (7개 전부 동일 내용)**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 한 단계로 한정한다(`tests/*.test.ts`, `tests/**`가 아님). devkit-cli의
    // e2e 테스트는 `tests/e2e/*.e2e.test.ts`에 있고 수 분~수십 분이 걸린다
    // (pnpm dlx + pnpm install + next build). `**`로 재귀 매칭하면 기본
    // `pnpm test`가 이를 물어 개발 루프가 죽는다 — 반드시 별도 설정 +
    // `pnpm test:e2e`로만 실행한다.
    include: ['tests/*.test.ts'],
  },
});
```

**같은 내용을 7개 패키지 각각에 만든다.** 공유 설정으로 뽑지 않는 이유: 이 저장소에는 `@devbak/vitest-config` 패키지가 있지만 그것은 **소비자용**(`next`·`node` 프리셋)이고, 툴킷 자기 자신이 그것을 쓰면 순환이 생긴다(그 패키지의 테스트가 그 패키지의 설정으로 돌게 된다).

- [ ] **Step 3: `devkit-cli`에 e2e 설정을 만든다**

`packages/devkit-cli/vitest.e2e.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    // pnpm dlx 다운로드 + pnpm install + next build가 들어간다
    testTimeout: 900_000,
    hookTimeout: 900_000,
    // 같은 부모 디렉토리에 생성하므로 병렬 실행하면 서로 간섭한다
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: 패키지 스크립트를 추가한다**

7개 패키지 각각의 `package.json` `scripts`에:

```jsonc
"test": "vitest run --passWithNoTests"
```

`devkit-cli`에는 추가로:

```jsonc
"test:e2e": "vitest run --config vitest.e2e.config.ts"
```

- [ ] **Step 5: 루트 설정을 지우고 루트 스크립트를 바꾼다**

```bash
git rm vitest.config.ts vitest.e2e.config.ts
```

`package.json`:

```jsonc
"test": "turbo run test",
"test:e2e": "turbo run test:e2e"
```

루트 설정을 **남기지 않는 것이 요구다.** 같은 사실이 두 곳에 있으면 갈라지는 순간 어느 쪽이 진짜인지 알 수 없다.

- [ ] **Step 6: `turbo.json`에 태스크를 추가한다**

```jsonc
"test": {},
"test:e2e": { "dependsOn": ["build"], "cache": false }
```

`test:e2e`가 자기 패키지 `build`에 의존하는 이유: 빌드된 `dist/bin.js`를 실제로 실행하고, `assertDistFresh`가 `src`보다 낡은 `dist`를 거부한다. **캐시하지 않는 이유**: 네트워크(`pnpm dlx`)·디스크·외부 상태에 의존하므로 캐시하면 "돌았다"는 거짓 신호가 된다.

- [ ] **Step 7: 테스트 개수가 보존됐는지 확인한다 — 이 태스크의 핵심 검증**

```bash
pnpm test 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: **362개 전부 통과.** 숫자가 줄었으면 `include` 패턴이 파일을 놓친 것이다 — 테스트를 고치지 말고 패턴을 고쳐라.

e2e가 기본 `test`에 섞이지 않았는지도 확인한다:

```bash
pnpm test 2>&1 | grep -c "e2e" || echo "e2e 미포함 확인"
```

- [ ] **Step 8: 커밋**

```bash
git add -A packages/*/vitest.config.ts packages/devkit-cli/vitest.e2e.config.ts packages/*/package.json package.json turbo.json
git commit -m "test: vitest 설정을 패키지별로 분할하고 turbo 태스크로 옮긴다"
```

---

## Task 3: `typecheck` 태스크 신설

**Files:**
- Create: `packages/{eslint-config-nest,eslint-plugin-fsd,jest-config,prettier-config,tsconfig,vitest-config}/tests/tsconfig.json` (6개)
- Modify: `packages/*/package.json` (`typecheck` 스크립트), `turbo.json`, `package.json` (루트)

**Interfaces:**
- Consumes: Task 1의 `turbo.json`
- Produces: `turbo.json`의 `tasks.typecheck`, 루트 `typecheck: "turbo run typecheck"`

**배경:** 지금 `tsc`로 검사되는 테스트는 `devkit-cli`의 것뿐이다. 다른 패키지의 tsconfig는 전부 `include: ["src"]` 또는 `["*.js"]`라 테스트가 어느 프로젝트에도 속하지 않는다. **이 태스크에서 기존 타입 오류가 드러날 수 있다 — 그것은 실패가 아니라 발견이다.**

- [ ] **Step 1: 6개 패키지에 `tests/tsconfig.json`을 만든다**

`packages/devkit-cli/tests/tsconfig.json`이 본이다. 각 패키지의 `tests/tsconfig.json`:

```jsonc
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["."]
}
```

`include: ["."]`는 **점(dot)으로 시작하는 디렉토리를 포함하지 않는다** — `tests/.fixtures/`가 자동으로 빠진다. 이건 기존 `devkit-cli` 설정이 의도한 동작이며 그대로 따른다.

- [ ] **Step 2: 타입 오류가 있는지 먼저 본다**

```bash
for p in eslint-config-nest eslint-plugin-fsd jest-config prettier-config tsconfig vitest-config; do
  echo "--- $p"; pnpm exec tsc --noEmit -p "packages/$p/tests/tsconfig.json" 2>&1 | tail -5
done
```

Expected: 오류가 없거나, 있다면 **무엇인지 기록한다.** 오류가 있으면 다음 단계에서 고친다 — `tests/tsconfig.json`을 느슨하게 만들어 회피하지 마라.

- [ ] **Step 3: 드러난 타입 오류를 고친다**

Step 2에서 오류가 없었으면 이 단계를 건너뛴다. 있었으면 **테스트 코드를 고친다.** `strict`를 끄거나 `skipLibCheck` 외의 완화 옵션을 넣지 마라 — 그러면 이 태스크가 검사하려던 것을 검사하지 않게 된다.

- [ ] **Step 4: `typecheck` 스크립트를 추가한다**

tsconfig가 있는 패키지(`devkit-cli`·`eslint-config-nest`·`eslint-plugin-fsd`·`jest-config`·`vitest-config`):

```jsonc
"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tests/tsconfig.json"
```

**주의**: `devkit-cli`·`eslint-config-nest`·`eslint-plugin-fsd`의 `tsconfig.json`은 `declaration: true`(base 상속)에 `outDir`이 있으므로 `--noEmit`과 충돌할 수 있다. 충돌하면 `tsc -p tsconfig.json --noEmit --declaration false`로 조정한다.

TS 소스가 없는 패키지(`prettier-config`·`tsconfig`)는 테스트만:

```jsonc
"typecheck": "tsc --noEmit -p tests/tsconfig.json"
```

- [ ] **Step 5: `turbo.json`과 루트 스크립트에 추가한다**

`turbo.json`: `"typecheck": {}`
루트 `package.json`: `"typecheck": "turbo run typecheck"`

- [ ] **Step 6: 확인한다**

```bash
pnpm typecheck
pnpm test 2>&1 | grep -E "Tests "
```

Expected: typecheck 통과(7개 패키지 전부), 테스트 여전히 362개.

- [ ] **Step 7: 커밋**

```bash
git add -A packages/*/tests/tsconfig.json packages/*/package.json package.json turbo.json
git commit -m "build: 패키지별 typecheck 태스크를 신설한다"
```

---

## Task 4: `lint` 태스크 — ESLint 분할 (이 계획에서 가장 위험한 태스크)

**Files:**
- Create: `eslint.base.mjs`
- Create: `packages/*/eslint.config.mjs` (7개)
- Modify: `eslint.config.mjs` (루트 — `packages/**` 무시)
- Modify: `packages/*/package.json` (`lint` 스크립트), `turbo.json`, `package.json` (루트)

**Interfaces:**
- Consumes: Task 3의 `tests/tsconfig.json`(테스트가 이제 프로젝트에 속하므로 `projectService`가 안정된다)
- Produces: `baseConfig(tsconfigRootDir, extra?)` — `eslint.base.mjs`가 export하는 함수. `turbo.json`의 `tasks.lint`·`tasks["//#lint:ox"]`·`tasks["//#lint:root"]`

**🚨 이 태스크가 막으려는 것:** 패키지마다 `eslint.config.mjs`를 두면 `typescript-eslint`의 `tsconfigRootDir` 자동추론이 후보를 여럿 등록해 **`multiple candidate TSConfigRootDirs`로 저장소 전체 린트가 죽는다.** `monorepo` 레시피가 `apps/web/eslint.config.mjs`를 지우는 이유가 정확히 이것이다(실측 기록). **해소는 루트 설정이 `packages/**`를 무시해 스코프 안의 설정이 항상 하나이게 만드는 것이다.**

- [ ] **Step 1: `eslint.base.mjs`를 만든다**

현재 `eslint.config.mjs`의 내용을 함수로 옮긴다. **주석은 하드윈 사실의 기록이므로 그대로 옮긴다.**

```js
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';

/**
 * oxlint + ESLint 하이브리드 구성의 **공유 부분**.
 *
 * 이 파일은 실행 설정이 아니라 라이브러리다 — 이름이 `eslint.config.*`이면
 * ESLint가 설정으로 자동 탐색해 의도치 않은 중첩이 생기고, 그것이
 * `multiple candidate TSConfigRootDirs`의 원인이 된다(설계 3.1절).
 *
 * @param {string} tsconfigRootDir 이 설정을 소비하는 패키지의 절대경로
 * @param {unknown[]} extra oxlint 스프레드 **앞**에 끼울 추가 config
 */
export function baseConfig(tsconfigRootDir, extra = []) {
  return tseslint.config(
    {
      // .superpowers/는 git-ignored 스크래치(SDD 워크스페이스), .claude/는
      // 에이전트 워크트리다. ESLint는 .gitignore를 읽지 않으므로 여기서 따로
      // 제외해야 한다. 특히 .claude/worktrees/ 안에는 node_modules가 없어
      // projectService가 실패하고, 그 결과 저장소 전체 lint가 깨진다.
      ignores: [
        '**/dist/**',
        'coverage/**',
        '.superpowers/**',
        '.claude/**',
        '**/tests/fixtures/**',
        // packages/jest-config/tests/config.test.ts가 execFileSync로 실제 jest를
        // 돌리며 만드는 임시 프로젝트 픽스처. .gitignore는 git 추적만 막을 뿐
        // ESLint와는 무관하므로 여기서 따로 제외해야 한다 — 테스트가 죽거나
        // 타임아웃되면 afterEach 정리가 안 돼 잔여물이 남고, 그러면 그 잔여
        // .js/.ts 파일이 어떤 tsconfig에도 속하지 않아 projectService가 파싱에
        // 실패해 저장소 전체 lint가 깨진다(실측 확인됨. tests/tsconfig.json의
        // include: ["."]는 점(dot)으로 시작하는 이 디렉터리를 포함하지 않는다).
        '**/tests/.fixtures/**',
        // devkit-cli/templates/는 생성물에 복사될 파일들이다. 이 저장소의
        // tsconfig 어디에도 속하지 않으므로 projectService가 실패해 ESLint가
        // 크래시한다.
        '**/templates/**',
      ],
    },

    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },

    {
      // 어떤 tsconfig에도 속하지 않는 설정 파일들 — 타입 인식 자체를 끈다.
      // eslint.base.mjs 자신도 여기 포함해야 한다: 이름이 `*.config.*`가
      // 아니라 위 glob에 안 걸리는데, 어떤 tsconfig에도 속하지 않으므로
      // projectService가 파싱에 실패한다.
      files: ['**/*.config.{ts,mts,cts,js,mjs,cjs}', 'eslint.base.mjs'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: false,
          project: false,
        },
      },
    },

    ...extra,

    // ⬇️ 반드시 마지막: oxlint가 담당하는 규칙을 여기서 비활성화한다.
    // 앞이나 중간에 두면 뒤따르는 config가 규칙을 다시 켜서 이중 보고가 남는다.
    //
    // 경로를 절대경로로 푸는 것이 요구다 — 패키지 설정이 이 함수를 부를 때
    // cwd는 그 패키지 디렉토리이므로, './.oxlintrc.json' 같은 상대경로는
    // 저장소 루트가 아니라 패키지 안을 가리켜 파일을 못 찾는다.
    ...oxlint.buildFromOxlintConfigFile(
      fileURLToPath(new URL('./.oxlintrc.json', import.meta.url)),
    ),
  );
}
```

- [ ] **Step 2: 루트 `eslint.config.mjs`를 얇게 만든다**

```js
import { baseConfig } from './eslint.base.mjs';

/**
 * 루트 파일 전용 ESLint 설정.
 *
 * `packages/**`를 무시하는 것이 이 파일의 핵심이다. 각 패키지가 자기
 * eslint.config.mjs를 갖게 되면서, 스코프가 겹치면 typescript-eslint의
 * tsconfigRootDir 자동추론이 후보를 여럿 등록해
 * `multiple candidate TSConfigRootDirs`로 저장소 전체 lint가 죽는다
 * (설계 3.1절 — monorepo 레시피가 apps/web/eslint.config.mjs를 지우는
 * 이유와 같은 기전이다). 겹치지 않게 하는 것이 유일한 방어다.
 */
export default [
  { ignores: ['packages/**'] },
  ...baseConfig(import.meta.dirname),
];
```

- [ ] **Step 3: 패키지별 `eslint.config.mjs`를 만든다 (6개)**

`jest-config`를 **제외한** 6개 패키지에:

```js
import { baseConfig } from '../../eslint.base.mjs';

export default baseConfig(import.meta.dirname);
```

- [ ] **Step 4: `jest-config`의 설정은 CJS 예외를 얹는다**

`packages/jest-config/eslint.config.mjs`:

```js
import { baseConfig } from '../../eslint.base.mjs';

export default baseConfig(import.meta.dirname, [
  {
    // @devbak/jest-config가 소비자에게 재노출하는 CJS 설정 객체.
    // "type" 필드 없는 package.json 아래에서 동작해야 하므로 CJS(.js)로 남아야
    // 한다(README 참고). sourceType: 'commonjs'로 module/require를 알려진
    // 전역으로 인식시켜 no-undef를 피한다.
    files: ['*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
]);
```

`files` 패턴이 루트 시절의 `packages/jest-config/*.js`에서 `*.js`로 바뀐 것에 주의하라 — 이제 설정이 그 패키지 안에 있으므로 경로가 패키지 기준이다.

- [ ] **Step 5: 스크립트와 태스크를 배선한다**

7개 패키지 각각: `"lint": "eslint ."`

`turbo.json`:

```jsonc
"lint": {},
"//#lint:ox": {},
"//#lint:root": {}
```

루트 `package.json`:

```jsonc
"lint": "turbo run lint:ox lint lint:root",
"lint:root": "eslint .",
"lint:ox": "oxlint",
"lint:es": "turbo run lint lint:root",
"lint:fix": "oxlint --fix && turbo run lint -- --fix && eslint . --fix"
```

**루트 태스크 이름이 패키지 태스크(`lint`)와 다른 것은 요구다.** 같으면 루트 `lint` 스크립트가 `turbo run lint`인데 turbo가 루트 패키지의 `lint`를 실행하려 하고, 그것이 다시 turbo를 불러 **무한 재귀한다**(설계 1.5절, Turborepo 공식 문서가 명시).

- [ ] **Step 6: 격리가 실제로 됐는지 확인한다 — 이 태스크의 핵심 검증**

```bash
pnpm lint 2>&1 | tail -20
```

Expected: 에러 0. **`multiple candidate TSConfigRootDirs`가 한 번도 나오지 않아야 한다.** 나오면 Step 2의 `ignores: ['packages/**']`가 빠졌거나 `eslint.base.mjs` 이름이 `*.config.*` 형태로 잘못된 것이다 — 테스트를 느슨하게 하지 말고 격리를 고쳐라.

두 린터를 각각 돌려 확인한다:

```bash
pnpm lint:ox 2>&1 | grep -c error
pnpm lint:es 2>&1 | tail -5
```

Expected: oxlint 에러 0(warning 3은 이월된 기존 항목), ESLint 에러 0.

패키지 하나만 린트할 수 있는지도 확인한다:

```bash
pnpm exec turbo run lint --filter=@devbak/tsconfig
```

- [ ] **Step 7: 커밋**

```bash
git add -A eslint.base.mjs eslint.config.mjs packages/*/eslint.config.mjs packages/*/package.json package.json turbo.json
git commit -m "build: ESLint를 패키지별로 분할하고 루트 설정을 격리한다"
```

---

## Task 5: 캐시 검증과 문서

**Files:**
- Modify: `README.md` (루트 — "이 저장소에서 개발하기" 절)
- Modify: `work-log.md`
- Modify: `/Users/dabot/.claude/projects/-Users-dabot-Documents-develop-eslint/memory/project_turbo-toolkit_2026-08-04.md`

**Interfaces:**
- Consumes: Task 1~4의 전체 파이프라인
- Produces: 없음 (검증·문서 전용)

- [ ] **Step 1: 설계 6절의 6개 검증을 전부 수행한다**

각 항목의 실제 출력을 보고서에 남겨라.

```bash
# 1. 테스트 개수 보존
pnpm test 2>&1 | grep -E "Test Files|Tests "

# 2. 린트 에러 0 + multiple candidate 없음
pnpm lint 2>&1 | tail -10
pnpm lint 2>&1 | grep -c "multiple candidate" || echo "multiple candidate 없음"

# 3. 빌드
pnpm build

# 4. 두 번째 실행이 FULL TURBO
pnpm build && pnpm test && pnpm lint

# 5. 부분 무효화 — 이 작업의 존재 이유
#    turbo는 mtime이 아니라 파일 **내용 해시**로 캐시 키를 만든다(Task 1 실측).
#    touch만으로는 무효화되지 않으므로 내용을 실제로 바꿔야 한다.
printf '\n// cache invalidation check\n' >> packages/eslint-plugin-fsd/src/index.ts
pnpm test 2>&1 | grep -E "cache hit|cache miss"
git checkout -- packages/eslint-plugin-fsd/src/index.ts

# 6. e2e 격리
pnpm test 2>&1 | grep -c "e2e" || echo "기본 test에 e2e 미포함"
```

Expected 5번: `eslint-plugin-fsd`만 `cache miss`, 나머지 6개는 `cache hit`. **이게 안 되면 turbo를 넣은 의미가 없다** — 원인을 찾아 보고하라.

- [ ] **Step 2: `pnpm test:e2e`가 여전히 동작하는지 확인한다**

```bash
pnpm build
pnpm test:e2e 2>&1 | tail -10
```

Expected: e2e 11개 통과. **수 분~수십 분이 걸린다** — Bash `timeout`을 600000(10분)으로 주거나 `run_in_background: true`로 띄우고, 출력을 파일로 남겨라. 끝나면 `~/Documents/develop/devkit-e2e-*` 잔여물을 확인하고 `rm -r`로 정리한다(`rm -rf`는 쓰지 마라).

- [ ] **Step 3: 루트 `README.md`의 "이 저장소에서 개발하기" 절을 고친다**

현재 명령 목록을 새 것으로 바꾸고, 캐시 동작과 `--filter`를 안내한다. 다음을 반영하라:

- `pnpm build`·`pnpm test`·`pnpm lint`·`pnpm typecheck`가 전부 turbo를 거친다
- 두 번째 실행은 캐시로 즉시 끝나고, 바뀐 패키지만 재실행된다
- 한 패키지만 고르려면 `pnpm exec turbo run test --filter=@devbak/tsconfig`
- `pnpm test:e2e`는 캐시하지 않는다(네트워크·디스크·외부 상태에 의존)
- **"린트는 oxlint + ESLint 하이브리드다" 절을 갱신한다** — `pnpm lint`가 더는 `oxlint && eslint .`가 아니다. turbo가 `lint:ox`·`lint`·`lint:root`를 **독립 병렬 실행**하므로 **단락 평가가 사라졌고**, 하나가 실패해도 다른 쪽 결과가 나온다. 다만 `lint:ox`·`lint:es`를 각각 돌리는 진단 경로는 그대로 유효하다.

- [ ] **Step 4: `work-log.md`에 기록한다**

파일 맨 위(최신이 위)에 `## 2026-08-04` 항목을 추가하고, 기존 항목의 형식(`- **변경 파일**:` / `- **내용**:` / `- **커밋**:`)을 따른다. 내용에는 무엇을 왜 바꿨는지와 **얻은 것/얻지 못한 것**을 정확히 적어라 — 패키지 간 의존이 0이라 스케줄링 이득은 없고 캐싱과 도그푸딩이 전부라는 사실.

- [ ] **Step 5: memory를 갱신한다**

`project_turbo-toolkit_2026-08-04.md`는 **이미 존재한다.** 새로 만들지 말고 읽은 뒤 덧붙여라:

- 구현 완료 상태와 커밋 범위
- Task 3에서 타입 오류가 드러났다면 그 내용
- Task 4의 격리가 실제로 통했는지(`multiple candidate`가 안 났는지)
- 부분 무효화 실측 결과

`MEMORY.md`에는 이미 한 줄이 있으므로 **건드리지 마라.**

- [ ] **Step 6: 커밋**

```bash
git add README.md work-log.md
git commit -m "docs: turbo 도입에 맞춰 개발 안내를 갱신한다"
```

---

## 완료 확인

설계 7절의 완료 기준을 하나씩 확인한다.

- [ ] `turbo.json`·`eslint.base.mjs`가 있고 패키지 7개가 각자 `eslint.config.mjs`·`vitest.config.ts`를 갖는다 (Task 2·4)
- [ ] 루트 `vitest.config.ts`·`vitest.e2e.config.ts`가 삭제됐다 (Task 2)
- [ ] 테스트 363개 통과(Task 2는 362 보존, Task 4가 `lint-coverage.test.ts` 1개를 더해 363) (Task 2·4·5)
- [ ] `pnpm lint` 에러 0, `multiple candidate TSConfigRootDirs` 없음 (Task 4·5)
- [ ] 두 번째 실행이 `>>> FULL TURBO` (Task 1·5)
- [ ] **한 패키지만 고치면 그 패키지 태스크만 재실행** (Task 5)
- [ ] `pnpm test:e2e`가 e2e만 돌리고 기본 `pnpm test`에 섞이지 않는다 (Task 2·5)
- [ ] `pnpm lint:ox`·`pnpm lint:es` 진단 경로가 살아 있다 (Task 4)
- [ ] `turbo run test --filter=@devbak/tsconfig`로 한 패키지만 검사할 수 있다 (Task 4·5)
- [ ] README에 새 명령과 캐시 동작이 반영됐다 (Task 5)
