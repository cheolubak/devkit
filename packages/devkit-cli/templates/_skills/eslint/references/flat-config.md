# Flat Config 기본 구조

ESLint v9의 Flat Config는 `eslint.config.mjs` 하나에서 **설정 객체 배열**로 모든 규칙을 조합한다. 위에서 아래로 순서대로 병합되며, 뒤 객체가 앞 객체를 덮어쓴다. `.eslintrc`·`.eslintignore`·`extends` 문자열은 더 이상 쓰지 않는다.

## tseslint.config 헬퍼

typescript-eslint가 제공하는 `tseslint.config()`는 배열을 그대로 반환하지만 타입 추론과 `extends` 헬퍼를 지원해 실수를 줄여준다.

```js
// eslint.config.mjs
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier,
);
```

설치:

```bash
pnpm add -D eslint typescript-eslint @eslint/js eslint-config-prettier
```

## 프리셋 차이 (recommended vs type-checked)

- `recommended`: 타입 정보 없이 AST만으로 검사. 빠르지만 타입 기반 버그는 못 잡는다.
- `recommendedTypeChecked`: 타입 정보를 사용. `no-floating-promises` 같은 강력한 규칙 포함. **실무 기본값.**
- `strictTypeChecked`: `recommendedTypeChecked`의 상위 집합 + 더 공격적인 규칙(`no-unnecessary-condition` 등). 견고성 우선 프로젝트.
- `stylisticTypeChecked`: 코드 동작이 아닌 스타일 성격의 타입 규칙(`consistent-type-definitions`, `no-redundant-type-constituents` 등). 위 프리셋과 조합해서 쓴다.

조합 예 (엄격 + 스타일):

```js
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  eslintConfigPrettier,
);
```

## projectService: true 를 쓰는 이유

구버전에서는 `parserOptions.project: './tsconfig.json'`으로 tsconfig 경로를 직접 지정했다. v8부터 권장되는 `projectService: true`는:

- **자동 탐색**: 각 파일에 맞는 가장 가까운 `tsconfig.json`을 알아서 찾는다. 모노레포·다중 tsconfig에서 경로를 나열할 필요가 없다.
- **성능**: TypeScript 언어 서비스 API를 재사용해 대규모 프로젝트에서 더 빠르고 메모리 효율적이다.
- **설정 파일 처리**: `eslint.config.mjs` 같이 어떤 tsconfig에도 포함되지 않는 파일을 `allowDefaultProject`로 예외 처리할 수 있다.

```js
{
  languageOptions: {
    parserOptions: {
      projectService: {
        // tsconfig에 포함되지 않는 루트 설정 파일 허용
        allowDefaultProject: ['*.js', '*.mjs', 'eslint.config.mjs'],
      },
      tsconfigRootDir: import.meta.dirname,
    },
  },
}
```

`tsconfigRootDir: import.meta.dirname`는 상대 경로 해석 기준을 설정 파일 위치로 고정한다. 항상 넣는다.

## 타입 인식 규칙이 잡아주는 실무 버그

`recommendedTypeChecked` 이상에서만 동작하는(타입 정보가 필요한) 규칙들. 실제 런타임 버그를 막는다.

```ts
// no-floating-promises: await/catch 없이 버려진 Promise
async function save() { /* ... */ }
save(); // ❌ 에러가 무시되고 완료 전에 다음 코드 실행됨
await save(); // ✅

// no-misused-promises: async 함수를 동기 콜백 자리에 넘김
element.addEventListener('click', async () => { /* ... */ }); // ❌ 컨텍스트에 따라 경고
if (asyncFn()) { /* ... */ } // ❌ 항상 truthy(Promise)

// await-thenable: thenable이 아닌 값에 await
await 42; // ❌ 무의미한 await

// no-unnecessary-condition (strict): 항상 참/거짓인 조건
const name: string = getName();
if (name) { /* ... */ } // ❌ string은 항상 정의됨(옵셔널이 아니면)
```

특정 규칙만 조정:

```js
{
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
}
```

## ignores 규칙 (단독 객체 vs files 조합)

Flat Config에는 `.eslintignore`가 없다. 무시 패턴은 설정 객체의 `ignores`로 표현한다. 두 형태를 구분해야 한다.

```js
export default tseslint.config(
  // 1) 전역 무시: ignores만 있는 단독 객체 → 모든 파일에서 무시
  { ignores: ['**/dist/**', '**/*.generated.ts'] },

  // 2) 특정 config에 한정: files와 함께 → 이 config 블록에만 적용
  {
    files: ['**/*.ts'],
    ignores: ['**/*.test.ts'], // *.ts 규칙에서 테스트 파일만 제외
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
```

- `ignores`만 있고 다른 키가 없는 객체 = 전역 무시(구 `.eslintignore` 역할).
- `files`와 같은 객체에 있는 `ignores` = 그 블록의 대상에서만 제외.
- `node_modules`와 `.git`은 기본으로 무시되므로 넣지 않아도 된다.

## eslint-config-prettier: 포맷 규칙 끄기

ESLint와 Prettier가 같은 포맷 규칙(따옴표·세미콜론·들여쓰기)을 다루면 충돌한다. `eslint-config-prettier`를 **배열 맨 마지막 요소**로 두어 포맷 관련 규칙을 일괄 비활성화한다.

```js
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  // ...다른 설정...
  eslintConfigPrettier, // ⚠️ 반드시 마지막
);
```

포맷팅 규칙 자체와 Prettier 설정은 prettier 스킬을 참조한다. ESLint는 "코드 품질/버그", Prettier는 "코드 모양"으로 역할을 분리한다.

## CLI

```bash
pnpm eslint .              # 전체 검사
pnpm eslint . --fix        # 자동 수정 가능한 규칙 적용
pnpm eslint src/app.ts     # 특정 파일
pnpm eslint . --max-warnings 0  # 경고도 실패로 취급(CI)
```
