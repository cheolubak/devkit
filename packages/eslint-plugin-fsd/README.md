# @cheolubak/eslint-plugin-fsd

Feature-Sliced Design 구조를 강제하는 ESLint 플러그인 (ESLint v9 / v10 flat config).

## 설치

```bash
pnpm add -D @cheolubak/eslint-plugin-fsd
```

요구 사항: ESLint `^9.0.0 || ^10.0.0` (flat config 전용). 개발·테스트는 ESLint 10 기준으로 검증한다.

## 사용

```js
// eslint.config.js
import fsd from '@cheolubak/eslint-plugin-fsd';

export default [
  fsd.configs.recommended,
];
```

### React / Next.js 프리셋

FSD 규칙과 React 생태계 규칙을 함께 켜려면 서브패스를 쓴다.

```js
// Next.js 앱
import fsdNext from '@cheolubak/eslint-plugin-fsd/next';

export default [...fsdNext];
```

```js
// 순수 React 앱
import fsdReact from '@cheolubak/eslint-plugin-fsd/react';

export default [...fsdReact];
```

프리셋은 config **배열**이므로 스프레드(`...`)로 편다. `fsd.configs.recommended`는 단일 객체라 스프레드하지 않는다.

**JSX/TSX 파서는 이 패키지가 설계 차원에서 설정하지 않는다.** 프리셋 앞에 파서를 직접 지정하라.

다만 서브패스별로 실제 동작은 다르다. `/next`는 `eslint-plugin-jsx-a11y`의 `flatConfigs.recommended`를 그대로 얹어 쓰는데, 그 config가 `**/*.{jsx,tsx}`에 대해 `languageOptions.parserOptions.ecmaFeatures.jsx: true`를 갖고 있어 **JSX 파싱이 부수적으로 켜진다.** 이건 `@cheolubak/eslint-plugin-fsd`가 설계한 동작이 아니라 jsx-a11y의 upstream config에 얹혀가는 부수 효과이므로, jsx-a11y가 그 필드를 바꾸면 예고 없이 사라질 수 있다 — 여기에 의존하지 말 것. `/react`는 jsx-a11y를 포함하지 않으므로 이 부수 효과가 없고, `.jsx` 파일을 린트하려면 파서 설정이 항상 필요하다. `/next`에서 `/react`로 옮길 때 이 차이 때문에 `.jsx` 파싱이 갑자기 깨질 수 있으니 유의하라.

아래 예시의 `typescript-eslint`는 이 패키지의 peer가 아니라 **consumer가 직접 고르는 파서**다. TypeScript 프로젝트라면 이미 설치돼 있을 것이고, 없으면 `pnpm add -D typescript-eslint`로 추가한다.

```js
import tseslint from 'typescript-eslint';
import fsdNext from '@cheolubak/eslint-plugin-fsd/next';

export default [
  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
  ...fsdNext,
];
```

서브패스별로 필요한 peer는 다음과 같다. 모두 optional이므로 쓰지 않는 서브패스의 패키지는 설치할 필요가 없다.

| 서브패스 | 필요한 패키지 |
|---|---|
| `@cheolubak/eslint-plugin-fsd` | 없음 |
| `@cheolubak/eslint-plugin-fsd/react` | `eslint-plugin-react-hooks` |
| `@cheolubak/eslint-plugin-fsd/next` | 위 1개 + `eslint-plugin-jsx-a11y`, `@next/eslint-plugin-next` |

```bash
# Next.js 앱 기준
pnpm add -D eslint-plugin-react-hooks eslint-plugin-jsx-a11y @next/eslint-plugin-next
```

프리셋이 대신 해주는 일 — **두 서브패스 공통**:

- `ignores`를 FSD 규칙에만 건다. 다른 플러그인의 규칙은 `app/`·`pages/`에서 그대로 동작한다.
- `react-hooks` 규칙을 `.ts`/`.js`까지 적용한다. 커스텀 훅은 JSX 없는 파일에도 있기 때문이다.
- 상류 플러그인마다 다른 flat config 접근 경로(`configs.flat.*`, 최상위 `flatConfigs.*`, `configs['core-web-vitals']`)를 감춘다.

> **`react-hooks` recommended가 켜는 규칙은 16개다** (13개 `error` + 3개 `warn`), 그리고 여기에는 React Compiler 규칙 계열(`immutability`, `purity`, `use-memo`, `set-state-in-render` 등)이 이미 포함돼 있다. `HOOK_FILES`로 `.js`/`.jsx`/`.ts`/`.tsx` 전체에 스코프되므로, 기존 코드베이스에 `/react`를 처음 적용하면 이 규칙들에서 대량의 에러가 쏟아질 수 있다 — `@cheolubak/eslint-plugin-fsd` 자체의 노이즈로 오인하지 말 것. 전체 규칙 목록은 [`eslint-plugin-react-hooks` 문서](https://www.npmjs.com/package/eslint-plugin-react-hooks)를 참고하고, 필요하면 프리셋 스프레드 **뒤에** config를 추가해 개별 규칙을 완화하라.
>
> ```js
> export default [
>   ...fsdReact,
>   { rules: { 'react-hooks/immutability': 'off' } },
> ];
> ```

**`/next`에만 해당**:

- `jsx-a11y` 규칙은 `.jsx`/`.tsx`로 좁힌다.
- `@next/next` 규칙에는 파일 스코프를 걸지 않는다 — Next.js 규칙이 가장 필요한 `app/`·`pages/`에서 돌아야 하기 때문이다.

> **`eslint-plugin-react`를 포함하지 않는 이유**: 7.37.5는 ESLint 10에서 제거된 `context.getFilename()`을 호출해 크래시한다(`settings.react.version: 'detect'` 경로). 직접 추가하려면 ESLint 9을 쓰거나 `version`을 명시값으로 고정해야 하며, 그래도 미가드 경로가 남아 있다.

> **peer 경고 안내**: `eslint-plugin-jsx-a11y`(6.10.2)는 아직 ESLint 10을 `peerDependencies`로 선언하지 않는다. 설치 시 경고가 나오지만 제거된 ESLint API를 호출하지 않으므로 **정상 동작한다.** 상류가 선언을 갱신하면 사라진다.

### 개별 규칙 직접 사용

프리셋 대신 규칙을 하나씩 켜고 alias를 커스터마이즈할 수도 있다.

```js
import fsd from '@cheolubak/eslint-plugin-fsd';

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
