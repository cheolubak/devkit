# eslint-plugin-fsd

Feature-Sliced Design 구조를 강제하는 ESLint 플러그인 (ESLint v9 flat config).

## 설치

```bash
pnpm add -D eslint-plugin-fsd
```

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
- FSD 루트는 `src/`로 자동 인식. **Next.js 프로젝트는 `src/` 레이아웃 사용 권장** (루트 라우팅 `app/`·`pages/` 오탐 방지)
- alias 기본값 `@`, `~` → FSD 루트(src) 기준 해석
