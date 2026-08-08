# Prettier 플러그인 (plugins.md)

## 플러그인 순서 규칙 (가장 중요)

`plugins` 배열의 **순서가 결과에 영향**을 준다. 핵심 규칙:

- **`prettier-plugin-tailwindcss`는 반드시 배열의 맨 마지막**에 둔다. 다른 플러그인(특히 import 정렬)의 파싱 결과를 마지막에 넘겨받아 클래스만 재정렬하기 때문이다.
- import 정렬 플러그인은 tailwindcss 플러그인보다 **앞**에 온다.

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  plugins: [
    '@ianvs/prettier-plugin-sort-imports', // import 정렬은 앞
    'prettier-plugin-tailwindcss', // tailwind는 항상 마지막
  ],
};
```

## Tailwind 클래스 정렬: prettier-plugin-tailwindcss

Tailwind 공식 플러그인으로, 클래스 이름을 권장 순서(레이아웃 → 박스 → 타이포 → 시각 등)로 자동 정렬한다.

```bash
pnpm add -D prettier-plugin-tailwindcss
```

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  plugins: ['prettier-plugin-tailwindcss'],
};
```

### Tailwind v4 CSS 기반 설정

Tailwind v4는 `tailwind.config.js` 없이 CSS 파일에서 설정하는 방식이 기본이다. 이때는 `tailwindStylesheet` 옵션으로 진입 CSS 파일을 알려준다. (Tailwind v3까지 쓰던 `tailwindConfig` 옵션의 대체.)

```js
// prettier.config.mjs (Tailwind v4)
/** @type {import("prettier").Config} */
export default {
  // v4: CSS 진입점 지정
  tailwindStylesheet: './src/app/globals.css',
  plugins: ['prettier-plugin-tailwindcss'],
};
```

```js
// prettier.config.mjs (Tailwind v3, 참고)
export default {
  tailwindConfig: './tailwind.config.ts',
  plugins: ['prettier-plugin-tailwindcss'],
};
```

### 함수/유틸 안의 클래스 정렬: tailwindFunctions

`clsx`, `cn`, `cva` 같은 함수의 인자로 전달되는 클래스 문자열도 정렬하려면 `tailwindFunctions`에 함수명을 등록한다. `tv`(tailwind-variants)나 `cva`도 여기에 추가한다.

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  tailwindStylesheet: './src/app/globals.css',
  tailwindFunctions: ['clsx', 'cn', 'cva', 'tv'],
  plugins: ['prettier-plugin-tailwindcss'],
};
```

이렇게 하면 아래 코드의 클래스가 자동 정렬된다.

```tsx
// cn(...) 인자 안의 클래스도 정렬됨
<div className={cn('text-white flex p-4', isActive && 'bg-blue-500')} />
```

## import 정렬

두 가지 대표 선택지가 있다. **하나만** 고른다.

### 1) @ianvs/prettier-plugin-sort-imports (세밀한 그룹 제어)

정규식 기반으로 import 그룹 순서를 직접 정의할 수 있다. 외부 라이브러리 → 내부 alias → 상대 경로 순으로 정렬하는 데 적합하다.

```bash
pnpm add -D @ianvs/prettier-plugin-sort-imports
```

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  importOrder: [
    '<BUILTIN_MODULES>', // node: 내장 모듈
    '<THIRD_PARTY_MODULES>', // 외부 패키지
    '',
    '^@/(.*)$', // 내부 alias
    '',
    '^[./]', // 상대 경로
  ],
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  plugins: [
    '@ianvs/prettier-plugin-sort-imports',
    'prettier-plugin-tailwindcss', // 항상 마지막
  ],
};
```

### 2) prettier-plugin-organize-imports (TS 언어 서비스 기반)

TypeScript 언어 서비스를 사용해 import를 정렬하고 **미사용 import를 제거**한다. 설정이 거의 없어 간편하지만 그룹 순서 커스터마이즈는 불가능하다.

```bash
pnpm add -D prettier-plugin-organize-imports
```

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  plugins: [
    'prettier-plugin-organize-imports',
    'prettier-plugin-tailwindcss', // 항상 마지막
  ],
};
```

> 주의: `prettier-plugin-organize-imports`는 미사용 import를 지우므로, ESLint의 `unused-imports`/`import/order` 규칙과 역할이 겹칠 수 있다. 한쪽에서만 정리하도록 조율한다 ([integration.md](integration.md) 참조).

## 플러그인 조합 예시 (완성형)

Next.js + Tailwind v4 + 세밀한 import 정렬 조합:

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,

  // import 정렬 (@ianvs)
  importOrder: [
    '<BUILTIN_MODULES>',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@/(.*)$',
    '',
    '^[./]',
  ],
  importOrderParserPlugins: ['typescript', 'jsx'],

  // Tailwind v4
  tailwindStylesheet: './src/app/globals.css',
  tailwindFunctions: ['clsx', 'cn', 'cva'],

  plugins: [
    '@ianvs/prettier-plugin-sort-imports',
    'prettier-plugin-tailwindcss', // 반드시 마지막
  ],
};
```
