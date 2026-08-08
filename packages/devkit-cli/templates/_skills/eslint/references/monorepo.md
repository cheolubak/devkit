# pnpm 모노레포 공유 ESLint config

pnpm workspace에서는 각 앱이 ESLint 설정을 중복 작성하지 않고, 공유 config 패키지(`@repo/eslint-config`) 하나를 참조한다. base/next/nest 프리셋을 export 하고, 각 앱의 `eslint.config.mjs`에서 import 해 조합한다.

## 워크스페이스 구조

```
my-monorepo/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
├── apps/
│   ├── web/            # Next.js
│   │   └── eslint.config.mjs
│   └── api/            # NestJS
│       └── eslint.config.mjs
└── packages/
    └── eslint-config/
        ├── package.json
        ├── base.js
        ├── next.js
        └── nest.js
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

## 공유 config 패키지

### package.json (exports로 프리셋 노출)

```jsonc
// packages/eslint-config/package.json
{
  "name": "@repo/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./base": "./base.js",
    "./next": "./next.js",
    "./nest": "./nest.js"
  },
  "dependencies": {
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-simple-import-sort": "^12.0.0",
    "@next/eslint-plugin-next": "^15.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-jsx-a11y": "^6.0.0",
    "eslint-plugin-jest": "^28.0.0",
    "globals": "^15.0.0"
  }
}
```

`peerDependencies`로 `eslint`를 두고 루트에서 설치하는 것이 이상적이나, 단순화를 위해 각 앱이 `eslint`를 devDependency로 갖게 해도 된다.

### base.js — 공통 타입 인식 설정

```js
// packages/eslint-config/base.js
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import eslintConfigPrettier from 'eslint-config-prettier';

/** 각 앱에서 tsconfigRootDir를 넘겨 재사용한다. */
export const baseConfig = tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);

export default baseConfig;
```

### next.js — Next.js 프리셋

```js
// packages/eslint-config/next.js
// @ts-check
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import { baseConfig } from './base.js';

export const nextConfig = tseslint.config(
  ...baseConfig,
  nextPlugin.configs['core-web-vitals'],
  {
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
);

export default nextConfig;
```

### nest.js — NestJS 프리셋

```js
// packages/eslint-config/nest.js
// @ts-check
import tseslint from 'typescript-eslint';
import globals from 'globals';
import jest from 'eslint-plugin-jest';
import { baseConfig } from './base.js';

export const nestConfig = tseslint.config(
  ...baseConfig,
  {
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    ...jest.configs['flat/recommended'],
  },
);

export default nestConfig;
```

## 각 앱에서 소비

`projectService`가 각 앱의 tsconfig를 자동 탐색하지만, `tsconfigRootDir`는 앱 디렉토리로 고정해야 상대 경로가 어긋나지 않는다.

```js
// apps/web/eslint.config.mjs
// @ts-check
import { nextConfig } from '@repo/eslint-config/next';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...nextConfig,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
);
```

```js
// apps/api/eslint.config.mjs
// @ts-check
import { nestConfig } from '@repo/eslint-config/nest';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...nestConfig,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
);
```

각 앱 `package.json`에 워크스페이스 의존성을 추가한다.

```jsonc
// apps/web/package.json
{
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "eslint": "^9.0.0"
  },
  "scripts": { "lint": "eslint ." }
}
```

설치:

```bash
pnpm install
```

## Turborepo lint 태스크 캐싱

`turbo.json`에 `lint` 태스크를 등록하면 변경되지 않은 패키지의 린트 결과를 캐시에서 즉시 반환해 CI가 빨라진다.

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "lint": {
      // 공유 config가 바뀌면 모든 소비 패키지 캐시 무효화
      "dependsOn": ["^lint"],
      "inputs": [
        "$TURBO_DEFAULT$",
        "eslint.config.mjs",
        "../../packages/eslint-config/**"
      ],
      "outputs": []
    }
  }
}
```

- `lint`는 산출물이 없으므로 `"outputs": []`.
- `inputs`에 `eslint.config.mjs`와 공유 config 경로를 넣어, 설정 변경 시 캐시가 무효화되도록 한다.

## 루트 스크립트

```jsonc
// 루트 package.json
{
  "scripts": {
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint -- --fix"
  }
}
```

Turbo 없이 단순하게 가려면 pnpm 재귀 실행도 가능하다.

```jsonc
{
  "scripts": {
    "lint": "pnpm -r --parallel exec eslint ."
  }
}
```

실행:

```bash
pnpm lint          # 전체 워크스페이스 린트 (Turbo 캐시)
pnpm --filter web lint   # 특정 앱만
```
