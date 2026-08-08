# Next.js / React 린팅

Next.js + React 프로젝트를 Flat Config로 린팅한다. 핵심은 `eslint-config-next`(또는 `@next/eslint-plugin-next`), `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, 그리고 import 정렬이다.

## 설치

```bash
pnpm add -D eslint typescript-eslint @eslint/js \
  @next/eslint-plugin-next eslint-plugin-react-hooks eslint-plugin-jsx-a11y \
  eslint-plugin-simple-import-sort eslint-config-prettier @eslint/eslintrc
```

## eslint-config-next 통합 (2026 기준)

Next.js가 제공하는 규칙은 두 경로로 들어온다. 프로젝트의 버전에 따라 둘 중 하나를 쓴다.

### 방법 A — 네이티브 flat export (권장, 지원되는 경우)

최신 `@next/eslint-plugin-next`는 flat 프리셋을 직접 export 한다. `FlatCompat` 없이 바로 스프레드한다.

> ⚠️ `@next/eslint-plugin-next` 16 기준 flat config는 `nextPlugin.configs['core-web-vitals']`에 있다(`recommended`, `*-legacy`도 함께 노출된다). 구버전 문서에 나오는 `nextPlugin.flatConfig.*`는 16에서 **`undefined`** 라 그대로 쓰면 설정이 조용히 비어버린다. 설치본에서 `Object.keys(require('@next/eslint-plugin-next').configs)`로 확인하는 게 가장 확실하다.
>
> `eslint-config-next` 16의 `.`·`./core-web-vitals`·`./typescript`는 이미 **flat config 배열**을 export하므로 `FlatCompat`으로 감싸면 안 된다. 그냥 import해서 스프레드한다.

```js
// eslint.config.mjs
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/.next/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  nextPlugin.configs['core-web-vitals'], // @next/next 규칙 (flat)
  {
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);
```

### 방법 B — FlatCompat 로 legacy 프리셋 변환

`next/core-web-vitals`·`next/typescript`가 아직 legacy(`.eslintrc`) 형식으로만 제공되면 `@eslint/eslintrc`의 `FlatCompat`으로 변환해 사용한다. `create-next-app`이 생성하는 기본 설정도 이 방식이다.

```js
// eslint.config.mjs
// @ts-check
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import eslintConfigPrettier from 'eslint-config-prettier';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  { ignores: ['**/.next/**', '**/dist/**'] },
  // legacy 프리셋을 flat 배열로 변환해 스프레드
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  eslintConfigPrettier,
);
```

`import.meta.dirname`은 Node 20.11+ 에서 바로 쓸 수 있다. 구버전 호환이 필요하면 위처럼 `fileURLToPath`로 `__dirname`을 만든다.

## eslint-plugin-react-hooks

React 훅의 두 가지 핵심 규칙. Next.js App Router에서도 필수다.

- `react-hooks/rules-of-hooks`: 훅을 조건문·반복문 안에서 호출하는 실수를 잡는다. (error 고정 권장)
- `react-hooks/exhaustive-deps`: `useEffect`/`useCallback`/`useMemo`의 의존성 배열 누락을 잡는다.

```js
{
  plugins: { 'react-hooks': reactHooks },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'react-hooks/exhaustive-deps': 'warn', // error로 올리면 리팩터링 부담↑
  },
}
```

## eslint-plugin-jsx-a11y

JSX 접근성 검사. `alt` 누락, 잘못된 ARIA, 키보드 핸들러 없는 `onClick` 등을 잡는다. 깊이 있는 접근성 패턴은 nextjs-a11y 스킬을 참조하고, 여기서는 규칙만 활성화한다.

```js
import jsxA11y from 'eslint-plugin-jsx-a11y';

{
  plugins: { 'jsx-a11y': jsxA11y },
  rules: { ...jsxA11y.flatConfigs.recommended.rules },
}
```

## import 순서 정렬: simple-import-sort (권장)

`eslint-plugin-import`도 `import/order`로 정렬을 지원하지만, 타입 인식 프로젝트에서 느리고 설정이 복잡하다. **`eslint-plugin-simple-import-sort`**가 더 빠르고 `--fix`로 자동 정렬돼 실무에서 권장된다.

```js
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default tseslint.config(
  // ...
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
);
```

그룹 커스터마이즈(React 먼저, 그다음 외부, 내부 `@/` alias 순):

```js
{
  rules: {
    'simple-import-sort/imports': [
      'error',
      {
        groups: [
          ['^react', '^next', '^@?\\w'], // React/Next → 외부 패키지
          ['^@/'],                       // 내부 alias
          ['^\\.'],                      // 상대 경로
          ['^.+\\.s?css$'],              // 스타일
        ],
      },
    ],
  },
}
```

정렬은 `pnpm eslint . --fix`로 적용된다. Prettier의 import 정렬 플러그인과 겹치면 하나만 쓴다(역할 분리는 prettier 스킬 참조).

## package.json 스크립트

```jsonc
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

`next lint`는 Next.js 최신 버전에서 deprecated 되었으므로 `eslint .`를 직접 호출한다.
