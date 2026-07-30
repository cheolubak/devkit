# eslint-plugin-fsd React/Next 프리셋 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `eslint-plugin-fsd`가 서브패스 `eslint-plugin-fsd/react`와 `eslint-plugin-fsd/next`로 consumer용 flat config 프리셋을 제공한다. 루트 진입점은 React 의존이 0인 상태를 유지한다.

**Architecture:** 엔트리 3개(`index` / `react` / `next`)를 tsup으로 각각 번들하고 `exports` 맵으로 노출한다. React 생태계 플러그인 4개는 optional peerDependency이며, 루트 진입점이 이들을 import하지 않는다는 사실을 모듈 그래프 테스트로 고정한다. 프리셋은 단일 객체가 아니라 **config 배열**이며 `ignores`는 FSD config에만 건다.

**Tech Stack:** TypeScript(strict, ESM), ESLint flat config v9/v10, tsup(번들+dts), Vitest, pnpm workspace.

설계 근거는 `docs/superpowers/specs/2026-07-29-fsd-react-preset-design.md`에 있다. 이 계획과 스펙이 어긋나면 스펙이 우선이다.

## Global Constraints

- 패키지 매니저는 **pnpm**만 쓴다. `npm`/`yarn` 명령을 쓰지 않는다.
- 새 의존성은 `packages/eslint-plugin-fsd`의 `devDependencies`에 설치한다(루트가 아니다). 이유: 테스트 파일이 패키지 디렉토리에 있어 모듈 해석이 거기서 시작된다. 설치 명령은 `pnpm --filter eslint-plugin-fsd add -D <pkg>`.
- TypeScript strict, 2-space 들여쓰기, ESM(`type: module`), `verbatimModuleSyntax: true`.
- 테스트는 Vitest, 테스트 이름은 **한글**로 쓴다(기존 파일과 동일).
- 커밋 메시지는 conventional commits + 한글 본문. 커밋 끝에 다음 줄을 넣는다:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- 각 태스크 종료 시 `pnpm test`와 `pnpm lint`가 **둘 다 통과**해야 한다. `pnpm lint`는 `oxlint && eslint .`이다.
- 상류 플러그인 버전은 이 값으로 고정한다: `eslint-plugin-react@^7.37.0`, `eslint-plugin-react-hooks@^7.0.0`, `eslint-plugin-jsx-a11y@^6.10.0`, `@next/eslint-plugin-next@^16.0.0`.
- `eslint-plugin-react`는 severity를 **숫자**로 쓴다(`0` = off, `2` = error). 문자열 `'off'`/`'error'`가 아니다.
- 기존 `plugin.configs.recommended`는 **단일 객체 그대로 유지**한다. 배열로 바꾸지 않는다.

---

### Task 1: 프리셋 조립 헬퍼

상류 flat config에 파일 스코프를 씌우는 순수 함수를 만든다. 외부 의존성이 없어 단독으로 테스트된다.

**Files:**
- Create: `packages/eslint-plugin-fsd/src/lib/preset.ts`
- Test: `packages/eslint-plugin-fsd/tests/preset.test.ts`

**Interfaces:**
- Consumes: 없음 (`eslint`의 `Linter` 타입만 사용)
- Produces:
  - `JSX_FILES: string[]` — 값 `['**/*.{jsx,tsx}']`
  - `HOOK_FILES: string[]` — 값 `['**/*.{js,jsx,ts,tsx}']`
  - `scopeToFiles(config: Linter.Config, files: string[]): Linter.Config`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/eslint-plugin-fsd/tests/preset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Linter } from 'eslint';
import { scopeToFiles, JSX_FILES, HOOK_FILES } from '../src/lib/preset';

describe('scopeToFiles', () => {
  it('files를 씌운 새 객체를 반환한다', () => {
    const base: Linter.Config = { rules: { 'a/b': 'error' } };
    const scoped = scopeToFiles(base, JSX_FILES);
    expect(scoped.files).toEqual(['**/*.{jsx,tsx}']);
    expect(scoped.rules).toEqual({ 'a/b': 'error' });
  });

  it('원본 config를 변경하지 않는다', () => {
    const base: Linter.Config = { rules: {} };
    scopeToFiles(base, JSX_FILES);
    expect(base.files).toBeUndefined();
  });

  it('이미 files가 있으면 덮어쓴다', () => {
    const base: Linter.Config = { files: ['**/*.js'], rules: {} };
    expect(scopeToFiles(base, JSX_FILES).files).toEqual(JSX_FILES);
  });
});

describe('파일 스코프 상수', () => {
  it('JSX_FILES는 jsx/tsx만 대상으로 한다', () => {
    expect(JSX_FILES).toEqual(['**/*.{jsx,tsx}']);
  });

  it('HOOK_FILES는 JSX 없는 ts/js까지 포함한다', () => {
    expect(HOOK_FILES).toEqual(['**/*.{js,jsx,ts,tsx}']);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "../src/lib/preset"`

- [ ] **Step 3: 최소 구현 작성**

`packages/eslint-plugin-fsd/src/lib/preset.ts`:

```ts
import type { Linter } from 'eslint';

/** JSX가 등장하는 파일. React/a11y 규칙 대상. */
export const JSX_FILES = ['**/*.{jsx,tsx}'];

/**
 * 훅이 존재할 수 있는 모든 파일.
 * 커스텀 훅은 JSX가 없는 .ts 파일에도 살기 때문에 jsx/tsx로 좁히지 않는다.
 */
export const HOOK_FILES = ['**/*.{js,jsx,ts,tsx}'];

/**
 * flat config에 files 스코프를 씌운 새 객체를 반환한다.
 * 상류 플러그인이 export한 config 객체를 그대로 공유하므로 원본을 변경하지 않는다.
 */
export function scopeToFiles(config: Linter.Config, files: string[]): Linter.Config {
  return { ...config, files };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test`
Expected: PASS (기존 42개 + 신규 5개 = 47개)

- [ ] **Step 5: 린트 확인**

Run: `pnpm lint`
Expected: 종료 코드 0, 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add packages/eslint-plugin-fsd/src/lib/preset.ts packages/eslint-plugin-fsd/tests/preset.test.ts
git commit -F - <<'EOF'
feat: 프리셋 조립 헬퍼 추가

상류 flat config에 파일 스코프를 씌우는 scopeToFiles와 대상 파일
상수를 추가한다. 원본 config를 변경하지 않고 새 객체를 반환한다.

HOOK_FILES가 jsx/tsx로 좁혀지지 않는 이유: 커스텀 훅은 JSX 없는
.ts 파일에도 존재하며 rules-of-hooks는 거기서도 유효하다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: `eslint-plugin-fsd/react` 프리셋

> **2026-07-30 개정:** `eslint-plugin-react`를 제외한다. ESLint 10에서 제거된 `context.getFilename()`을 호출해 크래시하는 것이 실런타임 검증으로 확인됐다(설계 문서 2.1절). 프리셋은 FSD + `eslint-plugin-react-hooks` 두 개짜리 배열이다.

FSD 규칙 + `eslint-plugin-react-hooks`를 배열로 조립한다.

**Files:**
- Create: `packages/eslint-plugin-fsd/src/react.ts`
- Modify: `packages/eslint-plugin-fsd/package.json` (peerDependencies, peerDependenciesMeta, devDependencies)
- Test: `packages/eslint-plugin-fsd/tests/react-preset.test.ts`

**Interfaces:**
- Consumes: Task 1의 `scopeToFiles`, `HOOK_FILES`. 기존 `src/index.ts`의 default export `plugin`(`plugin.configs.recommended`를 그대로 재사용). `JSX_FILES`는 이 태스크에서 쓰지 않는다(Task 3의 jsx-a11y가 쓴다) — import하면 미사용 import로 린트가 실패한다.
- Produces: `src/react.ts`의 default export — `Linter.Config[]`, 길이 **2**. 인덱스 순서는 `[FSD, react-hooks]`이며 Task 3이 이 배열을 spread한다.

**상류 사실(확인 완료, 추측 아님):**
- `reactHooks.configs.flat.recommended` → `{ plugins: { 'react-hooks': plugin }, rules }`
- `react-hooks`는 타입을 제공하지만 flat config 타입이 **부정확**하다(`plugins: { react: any }`로 선언하지만 실제로는 `react-hooks` 키로 등록). 그래서 경계에서 `as unknown as Linter.Config`로 고정한다.
- `plugin.configs.recommended`는 캐스팅하지 **않는다**. 이미 `Linter.Config`에 구조적으로 할당 가능해서 캐스팅하면 `@typescript-eslint/no-unnecessary-type-assertion` 에러가 난다.

- [ ] **Step 1: 의존성 설치**

```bash
pnpm --filter eslint-plugin-fsd add -D 'eslint-plugin-react-hooks@^7.0.0'
pnpm --filter eslint-plugin-fsd remove eslint-plugin-react
```

두 번째 명령은 이전 개정에서 설치됐던 `eslint-plugin-react`를 제거한다. 이미 없으면 무해하게 실패하므로 그냥 넘어간다.

- [ ] **Step 2: package.json에 optional peer 선언**

`packages/eslint-plugin-fsd/package.json`의 `peerDependencies`에 한 줄을 추가하고, `peerDependenciesMeta` 블록을 새로 만든다. `eslint-plugin-react` 항목이 남아 있으면 **세 곳(peerDependencies, peerDependenciesMeta, devDependencies)에서 모두 제거**한다. 최종 형태:

```json
  "peerDependencies": {
    "eslint": "^9.0.0 || ^10.0.0",
    "eslint-plugin-react-hooks": "^7.0.0"
  },
  "peerDependenciesMeta": {
    "eslint-plugin-react-hooks": { "optional": true }
  },
```

`eslint`는 optional이 아니다. `peerDependenciesMeta`에 넣지 않는다.

- [ ] **Step 3: 실패하는 테스트 작성**

`packages/eslint-plugin-fsd/tests/react-preset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import reactPreset from '../src/react';
import plugin from '../src/index';

describe('react 프리셋', () => {
  it('config 2개짜리 배열이다', () => {
    expect(Array.isArray(reactPreset)).toBe(true);
    expect(reactPreset).toHaveLength(2);
  });

  it('FSD config는 기존 recommended 객체를 그대로 재사용한다', () => {
    expect(reactPreset[0]).toBe(plugin.configs.recommended);
  });

  it('ignores는 FSD config에만 걸린다', () => {
    expect(reactPreset[0].ignores).toEqual(['app/**', 'pages/**']);
    expect(reactPreset[1].ignores).toBeUndefined();
  });

  it('hooks 규칙은 JSX 없는 ts/js까지 적용한다', () => {
    expect(reactPreset[1].files).toEqual(['**/*.{js,jsx,ts,tsx}']);
  });

  it('react-hooks 네임스페이스로 등록된다', () => {
    expect(Object.keys(reactPreset[1].plugins ?? {})).toEqual(['react-hooks']);
  });

  it('rules-of-hooks가 켜져 있다', () => {
    expect(reactPreset[1].rules?.['react-hooks/rules-of-hooks']).toBeDefined();
  });

  it('eslint-plugin-react와 @next/next 규칙은 포함하지 않는다', () => {
    const allRules = reactPreset.flatMap((config) => Object.keys(config.rules ?? {}));
    expect(allRules.some((rule) => rule.startsWith('react/'))).toBe(false);
    expect(allRules.some((rule) => rule.startsWith('@next/next/'))).toBe(false);
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "../src/react"`

- [ ] **Step 5: 최소 구현 작성**

`packages/eslint-plugin-fsd/src/react.ts`:

```ts
import type { Linter } from 'eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import plugin from './index';
import { scopeToFiles, HOOK_FILES } from './lib/preset';

// eslint-plugin-react-hooks의 flat config 타입은 부정확하다. plugins를
// { react: any }로 선언하지만 실제로는 react-hooks 키로 등록한다.
// 경계에서 Linter.Config로 고정해 아래 조립 코드가 정확한 타입 위에서 돌게 한다.
const hooksRecommended = reactHooks.configs.flat.recommended as unknown as Linter.Config;

/**
 * FSD + React 프리셋.
 *
 * 단일 객체가 아니라 배열인 이유: ignores는 그것을 가진 config 객체의 모든
 * 규칙에 걸린다. FSD 규칙만 Next.js 라우팅 폴더에서 제외해야 하므로
 * config를 나눈다. 설계 문서 3.2 참조.
 *
 * eslint-plugin-react는 의도적으로 제외한다. ESLint 10에서 제거된
 * context.getFilename()을 호출해 크래시한다. 설계 문서 2.1 참조.
 * 그 결과 JSX 파싱 설정도 프리셋이 제공하지 않는다 — consumer 책임(3.3).
 */
const config: Linter.Config[] = [
  plugin.configs.recommended,
  scopeToFiles(hooksRecommended, HOOK_FILES),
];

export default config;
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm test`
Expected: PASS (47개 + 신규 7개 = 54개)

`hooksRecommended`만 `as unknown as Linter.Config`로 캐스팅하는 이유: 상류 타입의 `plugins` 필드가 ESLint의 `Linter.Config`와 구조적으로 호환되지 않아 단일 캐스팅은 "Conversion of type ... may be a mistake" 에러가 날 수 있다. `as unknown as`는 항상 컴파일되며, `@typescript-eslint/no-unnecessary-type-assertion`에도 걸리지 않는다.

반대로 `plugin.configs.recommended`, `@next/eslint-plugin-next`, (Task 3의 셰임을 거친) `jsx-a11y`는 이미 `Linter.Config`에 할당 가능하므로 **캐스팅하지 않는다.** 불필요한 캐스팅은 린트 에러가 된다.

- [ ] **Step 7: 타입 체크와 린트 확인**

```bash
pnpm exec tsc -p packages/eslint-plugin-fsd/tsconfig.json --noEmit
pnpm exec tsc -p packages/eslint-plugin-fsd/tests/tsconfig.json
pnpm lint
```
Expected: 셋 다 종료 코드 0

- [ ] **Step 8: 커밋**

```bash
git add packages/eslint-plugin-fsd/src/react.ts packages/eslint-plugin-fsd/tests/react-preset.test.ts packages/eslint-plugin-fsd/package.json pnpm-lock.yaml
git commit -F - <<'EOF'
feat: React 프리셋 추가

FSD 규칙에 eslint-plugin-react-hooks를 얹은 프리셋을 src/react.ts에
만든다. react-hooks는 optional peer로 선언한다.

단일 객체가 아니라 배열인 이유: ignores는 그것을 가진 config의 모든
규칙에 걸리므로, FSD 규칙만 Next.js 라우팅 폴더에서 제외하려면
config를 나눠야 한다.

react-hooks 규칙은 ts/js까지 적용한다. 커스텀 훅은 JSX 없는 파일에도
존재하기 때문이다.

eslint-plugin-react는 포함하지 않는다. ESLint 10에서 제거된
context.getFilename()을 호출해 크래시하는 것을 실런타임 검증으로
확인했다. 설계 문서 2.1 참조.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: `eslint-plugin-fsd/next` 프리셋

react 프리셋에 `jsx-a11y`와 `@next/next`를 얹는다. **Next 규칙에는 파일 스코프를 걸지 않는다** — `app/`·`pages/`에서 돌아야 하기 때문이다.

**Files:**
- Create: `packages/eslint-plugin-fsd/src/next.ts`
- Create: `packages/eslint-plugin-fsd/src/types/eslint-plugin-jsx-a11y.d.ts`
- Modify: `packages/eslint-plugin-fsd/package.json`
- Test: `packages/eslint-plugin-fsd/tests/next-preset.test.ts`

**Interfaces:**
- Consumes: Task 2의 `src/react.ts` default export(`Linter.Config[]`, 길이 **2** — `[FSD, react-hooks]`), Task 1의 `scopeToFiles`/`JSX_FILES`.
- Produces: `src/next.ts`의 default export — `Linter.Config[]`, 길이 **4**. 순서는 `[FSD, react-hooks, jsx-a11y, @next/next]`.

**상류 사실(확인 완료):**
- `jsx-a11y`는 flat config를 **최상위 `flatConfigs`**로 export한다(`configs.flat`이 아니다). **타입 정의를 제공하지 않으므로 셰임이 필요하다.**
- `@next/eslint-plugin-next`는 `configs['core-web-vitals']`를 `Linter.Config` 타입으로 제공한다. 타입 셰임 불필요.

- [ ] **Step 1: 의존성 설치**

```bash
pnpm --filter eslint-plugin-fsd add -D 'eslint-plugin-jsx-a11y@^6.10.0' '@next/eslint-plugin-next@^16.0.0'
```

- [ ] **Step 2: package.json에 optional peer 추가**

`peerDependencies`와 `peerDependenciesMeta`에 두 항목씩 더한다. 최종 형태:

```json
  "peerDependencies": {
    "eslint": "^9.0.0 || ^10.0.0",
    "eslint-plugin-react-hooks": "^7.0.0",
    "eslint-plugin-jsx-a11y": "^6.10.0",
    "@next/eslint-plugin-next": "^16.0.0"
  },
  "peerDependenciesMeta": {
    "eslint-plugin-react-hooks": { "optional": true },
    "eslint-plugin-jsx-a11y": { "optional": true },
    "@next/eslint-plugin-next": { "optional": true }
  },
```

- [ ] **Step 3: jsx-a11y 타입 셰임 작성**

`packages/eslint-plugin-fsd/src/types/eslint-plugin-jsx-a11y.d.ts`:

```ts
// eslint-plugin-jsx-a11y 6.10.2는 타입 정의를 제공하지 않는다.
// 우리가 실제로 쓰는 표면(flatConfigs)만 최소한으로 선언한다.
declare module 'eslint-plugin-jsx-a11y' {
  import type { Linter } from 'eslint';

  const plugin: {
    flatConfigs: {
      recommended: Linter.Config;
      strict: Linter.Config;
    };
  };

  export default plugin;
}
```

`tsconfig.json`의 `include`가 `["src"]`이므로 이 파일은 자동으로 잡힌다. 설정 변경 불필요.

- [ ] **Step 4: 실패하는 테스트 작성**

`packages/eslint-plugin-fsd/tests/next-preset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import nextPreset from '../src/next';
import reactPreset from '../src/react';
import plugin from '../src/index';

describe('next 프리셋', () => {
  it('config 4개짜리 배열이다', () => {
    expect(Array.isArray(nextPreset)).toBe(true);
    expect(nextPreset).toHaveLength(4);
  });

  it('앞의 2개는 react 프리셋을 그대로 포함한다', () => {
    expect(nextPreset.slice(0, 2)).toEqual(reactPreset);
  });

  it('ignores는 여전히 FSD config에만 걸린다', () => {
    expect(nextPreset[0]).toBe(plugin.configs.recommended);
    for (const config of nextPreset.slice(1)) {
      expect(config.ignores).toBeUndefined();
    }
  });

  it('Next 규칙에는 파일 스코프를 걸지 않는다', () => {
    // app/·pages/에서 돌아야 하므로 files가 없어야 한다.
    expect(nextPreset[3].files).toBeUndefined();
  });

  it('jsx-a11y 규칙은 jsx/tsx로 좁힌다', () => {
    expect(nextPreset[2].files).toEqual(['**/*.{jsx,tsx}']);
  });

  it('세 플러그인 네임스페이스가 fsd와 충돌 없이 등록된다', () => {
    const keys = nextPreset.flatMap((config) => Object.keys(config.plugins ?? {}));
    expect(keys.sort()).toEqual(['@next/next', 'fsd', 'jsx-a11y', 'react-hooks']);
  });

  it('core-web-vitals 규칙을 포함하고 eslint-plugin-react 규칙은 없다', () => {
    expect(nextPreset[3].rules?.['@next/next/no-img-element']).toBeDefined();
    expect(nextPreset[3].rules?.['@next/next/no-sync-scripts']).toBeDefined();
    const allRules = nextPreset.flatMap((config) => Object.keys(config.rules ?? {}));
    expect(allRules.some((rule) => rule.startsWith('react/'))).toBe(false);
  });
});
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "../src/next"`

- [ ] **Step 6: 최소 구현 작성**

`packages/eslint-plugin-fsd/src/next.ts`:

```ts
import type { Linter } from 'eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import nextPlugin from '@next/eslint-plugin-next';
import reactPreset from './react';
import { scopeToFiles, JSX_FILES } from './lib/preset';

/**
 * FSD + React + a11y + Next.js 프리셋.
 *
 * @next/next config에는 files를 걸지 않는다. Next.js 규칙은 프로젝트 루트의
 * app/·pages/ 라우팅 폴더에서 돌아야 하며, 거기가 바로 이 규칙들이 가장
 * 필요한 위치다. FSD config만 그 폴더를 ignores로 제외한다.
 */
const config: Linter.Config[] = [
  ...reactPreset,
  scopeToFiles(jsxA11y.flatConfigs.recommended, JSX_FILES),
  nextPlugin.configs['core-web-vitals'],
];

export default config;
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test`
Expected: PASS (54개 + 신규 7개 = 61개)

- [ ] **Step 8: 타입 체크와 린트 확인**

```bash
pnpm exec tsc -p packages/eslint-plugin-fsd/tsconfig.json --noEmit
pnpm exec tsc -p packages/eslint-plugin-fsd/tests/tsconfig.json
pnpm lint
```
Expected: 셋 다 종료 코드 0

- [ ] **Step 9: 커밋**

```bash
git add packages/eslint-plugin-fsd/src/next.ts packages/eslint-plugin-fsd/src/types packages/eslint-plugin-fsd/tests/next-preset.test.ts packages/eslint-plugin-fsd/package.json pnpm-lock.yaml
git commit -F - <<'EOF'
feat: Next.js 프리셋 추가

react 프리셋에 jsx-a11y와 @next/eslint-plugin-next를 얹는다.

@next/next config에는 files 스코프를 걸지 않는다. Next.js 규칙은
app/·pages/ 라우팅 폴더에서 돌아야 하고 거기가 이 규칙들이 가장
필요한 곳이다. FSD config만 그 폴더를 제외한다.

eslint-plugin-jsx-a11y는 타입을 제공하지 않아 우리가 쓰는 표면만
선언하는 셰임을 추가한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: 루트 진입점 의존성 격리 회귀 테스트

이 프로젝트가 서브패스 방식을 고른 유일한 이유를 지키는 테스트다. 누군가 `src/index.ts`나 그 하위 모듈에 React import를 추가하면 즉시 실패해야 한다.

**Files:**
- Test: `packages/eslint-plugin-fsd/tests/entry-isolation.test.ts`
- Modify: `packages/eslint-plugin-fsd/package.json` (`devDependencies`에 `@types/node` 추가)

**Interfaces:**
- Consumes: 소스 파일을 문자열로 읽을 뿐이며 다른 태스크의 export를 import하지 않는다.
- Produces: 없음 (테스트 전용)

> **2026-07-30 개정:** 이 태스크는 `node:fs`/`node:path`/`node:url`을 쓰는 첫 파일이다. 그런데 이 저장소에는 `@types/node`가 설치돼 있지 않아, 타입 인식 린팅에서 `node:*` import가 해석되지 않고 반환값이 `error` 타입이 되어 `@typescript-eslint/no-unsafe-*`가 연쇄로 터진다(실측 27건). 따라서 Step 0에서 `@types/node`를 먼저 설치한다. 원래 계획의 "이 태스크는 아무것도 설치하지 않는다"는 전제는 폐기한다.

- [ ] **Step 0: `@types/node` 설치**

```bash
pnpm --filter eslint-plugin-fsd add -D '@types/node@^24'
```

설치 후 `pnpm exec tsc -p packages/eslint-plugin-fsd/tests/tsconfig.json`이 `TS2307: Cannot find module 'node:fs'` 없이 통과하는지 확인한다. 설치 위치가 루트가 아니라 패키지인 이유는 다른 devDependency와 같다 — 테스트 파일이 패키지 디렉토리에 있어 모듈·타입 해석이 거기서 시작된다.

**설계:** `src/index.ts`에서 시작해 상대 경로 import를 재귀적으로 따라가며 bare specifier를 모으고, React 패키지가 하나도 없음을 단언한다. 두 번째 테스트는 **탐지기 자체가 동작함을 증명**한다 — 이게 없으면 정규식이 깨져도 첫 테스트가 조용히 통과한다.

- [ ] **Step 1: 테스트 작성**

`packages/eslint-plugin-fsd/tests/entry-isolation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

const REACT_PACKAGES = [
  'eslint-plugin-react-hooks',
  'eslint-plugin-jsx-a11y',
  '@next/eslint-plugin-next',
  // 프리셋에 포함하지 않지만, 되돌아오면 즉시 알아야 하므로 함께 감시한다(설계 2.1)
  'eslint-plugin-react',
];

const IMPORT_PATTERN = /import\s+(?:type\s+)?(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g;

function resolveRelative(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`상대 import 해석 실패: ${specifier} (from ${fromFile})`);
}

/** entry에서 상대 import를 재귀적으로 따라가며 bare specifier를 모은다. */
function collectBareSpecifiers(entry: string): string[] {
  const visited = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) queue.push(resolveRelative(file, specifier));
      else bare.add(specifier);
    }
  }

  return [...bare];
}

describe('루트 진입점 의존성 격리', () => {
  it('src/index.ts는 React 플러그인을 로드하지 않는다', () => {
    const bare = collectBareSpecifiers(resolve(SRC, 'index.ts'));
    for (const pkg of REACT_PACKAGES) {
      expect(bare).not.toContain(pkg);
    }
  });

  it('탐지기가 실제로 동작한다 (src/react.ts에서는 검출된다)', () => {
    const bare = collectBareSpecifiers(resolve(SRC, 'react.ts'));
    expect(bare).toContain('eslint-plugin-react-hooks');
  });

  it('탐지기가 src/next.ts의 세 패키지를 모두 본다', () => {
    const bare = collectBareSpecifiers(resolve(SRC, 'next.ts'));
    expect(bare).toContain('eslint-plugin-react-hooks');
    expect(bare).toContain('eslint-plugin-jsx-a11y');
    expect(bare).toContain('@next/eslint-plugin-next');
  });

  it('어느 엔트리도 eslint-plugin-react를 로드하지 않는다', () => {
    // 설계 2.1: ESLint 10에서 크래시하므로 제외했다. 되돌아오면 여기서 잡힌다.
    for (const entry of ['index.ts', 'react.ts', 'next.ts']) {
      expect(collectBareSpecifiers(resolve(SRC, entry))).not.toContain('eslint-plugin-react');
    }
  });
});
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `pnpm test`
Expected: PASS (61개 + 신규 4개 = 65개)

이 테스트는 Task 1~3이 올바르면 처음부터 통과한다. TDD의 red 단계가 없는 회귀 가드다.

- [ ] **Step 3: 탐지기가 진짜 잡는지 수동 확인**

`packages/eslint-plugin-fsd/src/index.ts` 맨 위에 임시로 다음 줄을 넣는다(설치돼 있는 패키지를 써야 모듈 해석 실패가 아니라 격리 단언이 실패한다):

```ts
import reactHooks from 'eslint-plugin-react-hooks';
```

Run: `pnpm test`
Expected: FAIL — "src/index.ts는 React 플러그인을 로드하지 않는다" 실패

확인한 뒤 **그 줄을 반드시 되돌린다.** 되돌린 후 `pnpm test`가 다시 65개 통과해야 한다.

- [ ] **Step 4: 린트 확인**

Run: `pnpm lint`
Expected: 종료 코드 0

- [ ] **Step 5: 커밋**

```bash
git add packages/eslint-plugin-fsd/tests/entry-isolation.test.ts packages/eslint-plugin-fsd/package.json pnpm-lock.yaml
git commit -F - <<'EOF'
test: 루트 진입점의 React 의존성 격리 회귀 테스트

src/index.ts에서 상대 import를 재귀적으로 따라가며 bare specifier를
모아 React 패키지가 없음을 단언한다. 서브패스 방식을 고른 이유가
조용히 무너지는 것을 막는다.

탐지기 자체가 동작함을 증명하는 테스트를 함께 둔다. 이게 없으면
정규식이 깨져도 격리 테스트가 통과해버린다.

node 빌트인을 쓰는 첫 파일이라 @types/node를 함께 설치한다. 없으면
타입 인식 린팅이 node:* import를 error 타입으로 보고 no-unsafe-*를
연쇄로 터뜨린다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: 패키지 매니페스트와 빌드 다중 엔트리

지금까지 테스트는 `../src/react`를 직접 import했다. 실제 consumer가 `eslint-plugin-fsd/react`로 접근하려면 `exports` 맵과 빌드 산출물이 필요하다.

**Files:**
- Modify: `packages/eslint-plugin-fsd/tsup.config.ts`
- Modify: `packages/eslint-plugin-fsd/package.json` (exports)

**Interfaces:**
- Consumes: Task 2·3이 만든 `src/react.ts`, `src/next.ts`
- Produces: `dist/index.js`, `dist/react.js`, `dist/next.js`와 각각의 `.d.ts`

- [ ] **Step 1: tsup 엔트리 확장**

`packages/eslint-plugin-fsd/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts', 'src/next.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 2: exports 맵 확장**

`packages/eslint-plugin-fsd/package.json`의 `exports`를 다음으로 교체한다:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./react": {
      "types": "./dist/react.d.ts",
      "import": "./dist/react.js"
    },
    "./next": {
      "types": "./dist/next.d.ts",
      "import": "./dist/next.js"
    }
  },
```

`main`과 `types` 최상위 필드는 그대로 둔다(exports를 지원하지 않는 도구용 폴백).

- [ ] **Step 3: 빌드 실행**

Run: `pnpm build`
Expected: 성공. `ESM dist/index.js`, `ESM dist/react.js`, `ESM dist/next.js`와 `DTS` 3종이 출력된다.

- [ ] **Step 4: 산출물 검증**

```bash
node -e "
const { existsSync, readFileSync } = require('node:fs');
const dist = 'packages/eslint-plugin-fsd/dist';
const required = ['index.js','react.js','next.js','index.d.ts','react.d.ts','next.d.ts'];
const missing = required.filter((f) => !existsSync(\`\${dist}/\${f}\`));
if (missing.length > 0) throw new Error('누락: ' + missing.join(', '));

const reactPkgs = ['eslint-plugin-react-hooks','eslint-plugin-jsx-a11y','@next/eslint-plugin-next'];
const indexSrc = readFileSync(\`\${dist}/index.js\`, 'utf8');
const leaked = reactPkgs.filter((p) => indexSrc.includes(p));
if (leaked.length > 0) throw new Error('루트 산출물에 React 의존 유출: ' + leaked.join(', '));

console.log('OK: 엔트리 3종 생성, 루트 산출물에 React 의존 없음');
"
```
Expected: `OK: 엔트리 3종 생성, 루트 산출물에 React 의존 없음`

만약 tsup의 코드 스플리팅으로 `dist/index.js`가 공유 청크를 import하고 있어 검사가 애매해지면, `tsup.config.ts`에 `splitting: false`를 추가해 엔트리별로 완전히 독립된 번들을 만든다. 그러면 위 검사가 정확해진다.

- [ ] **Step 5: 테스트와 린트 재확인**

```bash
pnpm test
pnpm lint
```
Expected: 65개 통과, 린트 종료 코드 0

- [ ] **Step 6: 커밋**

```bash
git add packages/eslint-plugin-fsd/tsup.config.ts packages/eslint-plugin-fsd/package.json
git commit -F - <<'EOF'
build: React/Next 프리셋 서브패스 export 추가

tsup 엔트리를 3개로 늘리고 exports 맵에 ./react와 ./next를 연다.
consumer가 eslint-plugin-fsd/next로 접근할 수 있게 된다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: README 갱신

consumer가 서브패스와 필요한 peer를 알 수 있어야 한다.

**Files:**
- Modify: `packages/eslint-plugin-fsd/README.md`

**Interfaces:**
- Consumes: Task 5의 서브패스 경로(`eslint-plugin-fsd/react`, `eslint-plugin-fsd/next`)
- Produces: 없음 (문서)

- [ ] **Step 1: 사용 섹션 아래에 프리셋 문서 추가**

`README.md`의 `## 사용` 섹션에서 `fsd.configs.recommended` 예시 바로 다음에 아래 내용을 삽입한다:

````markdown
### React / Next.js 프리셋

FSD 규칙과 React 생태계 규칙을 함께 켜려면 서브패스를 쓴다.

```js
// Next.js 앱
import fsdNext from 'eslint-plugin-fsd/next';

export default [...fsdNext];
```

```js
// 순수 React 앱
import fsdReact from 'eslint-plugin-fsd/react';

export default [...fsdReact];
```

프리셋은 config **배열**이므로 스프레드(`...`)로 편다. `fsd.configs.recommended`는 단일 객체라 스프레드하지 않는다.

**JSX/TSX 파서는 프리셋이 설정하지 않는다.** 프리셋 앞에 파서를 직접 지정하라. TypeScript 프로젝트 예시:

```js
import tseslint from 'typescript-eslint';
import fsdNext from 'eslint-plugin-fsd/next';

export default [
  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
  ...fsdNext,
];
```

서브패스별로 필요한 peer는 다음과 같다. 모두 optional이므로 쓰지 않는 서브패스의 패키지는 설치할 필요가 없다.

| 서브패스 | 필요한 패키지 |
|---|---|
| `eslint-plugin-fsd` | 없음 |
| `eslint-plugin-fsd/react` | `eslint-plugin-react-hooks` |
| `eslint-plugin-fsd/next` | 위 1개 + `eslint-plugin-jsx-a11y`, `@next/eslint-plugin-next` |

```bash
# Next.js 앱 기준
pnpm add -D eslint-plugin-react-hooks eslint-plugin-jsx-a11y @next/eslint-plugin-next
```

프리셋이 대신 해주는 일:

- `ignores`를 FSD 규칙에만 건다. `@next/next` 규칙은 `app/`·`pages/`에서 그대로 동작한다.
- `react-hooks` 규칙을 `.ts`/`.js`까지 적용한다. 커스텀 훅은 JSX 없는 파일에도 있기 때문이다.
- `jsx-a11y` 규칙은 `.jsx`/`.tsx`로 좁힌다.
- 상류 플러그인마다 다른 flat config 접근 경로(`configs.flat.*`, 최상위 `flatConfigs.*`, `configs['core-web-vitals']`)를 감춘다.

> **`eslint-plugin-react`를 포함하지 않는 이유**: 7.37.5는 ESLint 10에서 제거된 `context.getFilename()`을 호출해 크래시한다(`settings.react.version: 'detect'` 경로). 직접 추가하려면 ESLint 9을 쓰거나 `version`을 명시값으로 고정해야 하며, 그래도 미가드 경로가 남아 있다.

> **peer 경고 안내**: `eslint-plugin-jsx-a11y`(6.10.2)는 아직 ESLint 10을 `peerDependencies`로 선언하지 않는다. 설치 시 경고가 나오지만 제거된 ESLint API를 호출하지 않으므로 **정상 동작한다.** 상류가 선언을 갱신하면 사라진다.
````

- [ ] **Step 2: 문서와 실제 동작이 일치하는지 확인**

README에 적은 규칙 이름이 실제 프리셋에 있는지 확인한다:

```bash
node -e "
import('./packages/eslint-plugin-fsd/dist/next.js').then(({ default: preset }) => {
  const rules = Object.assign({}, ...preset.map((c) => c.rules ?? {}));
  const keys = preset.flatMap((c) => Object.keys(c.plugins ?? {})).sort();
  console.log('config 개수      =', preset.length);
  console.log('플러그인 키      =', JSON.stringify(keys));
  console.log('rules-of-hooks   =', rules['react-hooks/rules-of-hooks']);
  console.log('react/ 규칙 존재 =', Object.keys(rules).some((r) => r.startsWith('react/')));
});
"
```
Expected: config 개수 `4`, 플러그인 키 `["@next/next","fsd","jsx-a11y","react-hooks"]`, `rules-of-hooks`는 정의됨, `react/ 규칙 존재`는 `false`

- [ ] **Step 3: 커밋**

```bash
git add packages/eslint-plugin-fsd/README.md
git commit -F - <<'EOF'
docs: README에 React/Next 프리셋 사용법 추가

서브패스별 필요 peer 표, 사용 예시, 프리셋이 대신 해주는 일을
정리한다. eslint-plugin-react와 jsx-a11y가 ESLint 10을 peer로
선언하지 않아 나오는 경고가 예상된 동작임을 명시한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## 완료 조건

모든 태스크를 마친 뒤 아래가 전부 통과해야 한다.

```bash
pnpm lint     # oxlint && eslint . — 종료 코드 0
pnpm test     # 65개 통과
pnpm build    # dist에 엔트리 3종 + dts 3종
pnpm exec tsc -p packages/eslint-plugin-fsd/tsconfig.json --noEmit
pnpm exec tsc -p packages/eslint-plugin-fsd/tests/tsconfig.json
```

추가로 컨트롤러가 **런타임 스모크 검증**을 한 번 수행한다(설계 6.1): `next` 프리셋을 `ESLint` 인스턴스에 실어 실제 소스를 린트하고 fatal 오류가 없으며 각 플러그인 규칙이 최소 하나씩 리포트되는지 확인한다. 구조 단언만으로는 2.1절의 결함을 잡지 못했기 때문이다.

작업 종료 후 CLAUDE.md 규칙에 따라 `work-log.md`에 기록을 추가하고 memory를 갱신한다.

## 스펙 대비 커버리지

| 스펙 섹션 | 담당 태스크 |
|---|---|
| 2.1 `eslint-plugin-react` 제외 | Task 2 (미포함), Task 4 (되돌아오면 실패하는 가드) |
| 3.1 서브패스 export | Task 5 (매니페스트), Task 4 (격리 보증) |
| 3.2 프리셋은 배열 / ignores 위치 | Task 2, Task 3 |
| 3.3 JSX 파싱은 consumer 책임 | Task 6 (README 파서 설정 예시) |
| 3.4 기존 API 불변 | Task 2 (테스트로 `configs.recommended` 동일성 단언) |
| 4 패키지 매니페스트 | Task 2, 3 (peer), Task 5 (exports, tsup) |
| 5 에러 처리 미가공 | 구현 없음 — 의도적. Task 6에서 설치 표로 대응 |
| 6 테스트 전략 6개 항목 | Task 2, 3 (4개), Task 4 (루트 격리 + react 제외 가드) |
| 6.1 런타임 스모크 검증 | 컨트롤러가 Task 3 이후 수행, 원장에 기록 |
| 7 문서 변경 | Task 6 |
