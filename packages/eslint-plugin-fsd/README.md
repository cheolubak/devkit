# eslint-plugin-fsd

Feature-Sliced Design 구조를 강제하는 ESLint 플러그인 (ESLint v9 / v10 flat config).

## 설치

```bash
pnpm add -D eslint-plugin-fsd
```

요구 사항: ESLint `^9.0.0 || ^10.0.0` (flat config 전용). 개발·테스트는 ESLint 10 기준으로 검증한다.

## 사용

```js
// eslint.config.js
import fsd from 'eslint-plugin-fsd';

export default [
  fsd.configs.recommended,
];
```

개별 규칙 + alias 커스터마이즈:

```js
import fsd from 'eslint-plugin-fsd';

export default [
  {
    plugins: { fsd },
    rules: {
      'fsd/no-higher-level-imports': 'error',
      'fsd/no-cross-imports': 'error',
      'fsd/no-public-api-sidestep': ['error', { alias: ['@', '~'] }],
    },
  },
];
```

## 규칙

| 규칙 | 강제 내용 |
|------|-----------|
| `no-higher-level-imports` | 상위 레이어 import 금지 (레이어 방향) |
| `no-cross-imports` | 같은 레이어 형제 슬라이스 import 금지 |
| `no-public-api-sidestep` | 다른 슬라이스/세그먼트 내부 경로 직접 import 금지 |

## 규약

- 레이어: `app > pages > widgets > features > entities > shared`
- `pages` 레이어 별칭: `views`, `screens` (Next.js 라우팅 폴더 충돌 회피)
- FSD 루트는 `src/`로 자동 인식. **Next.js 프로젝트는 `src/` 레이아웃 사용 권장** (FSD 레이어는 `src/` 안에, 라우팅 `app/`·`pages/`는 프로젝트 루트에).
- `recommended` 프리셋은 프로젝트 루트의 Next.js 라우팅 폴더 `app/`·`pages/`를 `ignores`로 제외한다 (루트 `pages/` 라우팅 파일이 FSD `pages` 레이어로 오인되어 `no-cross-imports`가 오탐하는 것을 방지). 만약 `src/` 없이 FSD `app`/`pages` 레이어를 프로젝트 루트에 두는 구성이라면 `recommended` 대신 규칙을 직접 켜서 이 제외를 피하라.
- alias 기본값 `@`, `~` → FSD 루트(src) 기준 해석
