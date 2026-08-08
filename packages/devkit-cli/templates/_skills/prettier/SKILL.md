---
name: prettier
description: "Prettier 3 코드 포맷팅 설정. prettier.config, Tailwind 클래스 정렬 플러그인, import 정렬, ESLint 역할 분리, lint-staged/CI.\nAPPLIES: `prettier.config.*`·포맷 스크립트·클래스/import 정렬 플러그인을 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"Prettier 설정\", \"코드 포맷\", \"포맷팅\", \"prettier.config\", \"자동 정렬\", \"클래스 정렬\", \"import 정렬\", \"포맷 통일\", \"format 스크립트\", 코드 포맷팅/정렬 설정 시.\nSKIP: 코드 규칙·품질 검사는 eslint. 스타일링 자체는 tailwind-patterns."
---

> 참조:
> - [references/config.md](references/config.md) - prettier.config.mjs 옵션, .prettierignore, 에디터/포맷 온세이브
> - [references/plugins.md](references/plugins.md) - prettier-plugin-tailwindcss 클래스 정렬, import 정렬 플러그인
> - [references/integration.md](references/integration.md) - ESLint 역할 분리, lint-staged + husky, CI 포맷 체크

# Prettier 3 코드 포맷팅

Prettier는 **코드 포맷(따옴표·줄바꿈·들여쓰기·줄 길이)** 만 담당한다. 코드 품질 규칙(미사용 변수, import 순서 규칙 등)은 ESLint의 몫이다. 이 역할 분리를 지키면 도구 충돌이 없다. 자세한 분리 전략은 [integration.md](references/integration.md) 참조.

## 설치

```bash
pnpm add -D prettier
```

## 기본 설정 (prettier.config.mjs)

ESM 프로젝트에서는 `prettier.config.mjs`를 권장한다. `@type` 주석으로 자동완성과 타입 검사를 얻는다.

```js
// prettier.config.mjs
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  plugins: ['prettier-plugin-tailwindcss'],
};
```

JSON 설정을 선호하면 `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

## 스크립트 (package.json)

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

## 핵심 원칙

- **포맷은 Prettier, 규칙은 ESLint.** ESLint 쪽에서 `eslint-config-prettier`로 포맷 관련 규칙을 꺼서 충돌을 없앤다.
- **`eslint-plugin-prettier`(Prettier를 ESLint 규칙으로 실행)는 비권장.** 이유와 대안은 [integration.md](references/integration.md).
- **플러그인 순서 주의.** `prettier-plugin-tailwindcss`는 반드시 `plugins` 배열의 **마지막**에 둔다. 자세한 조합은 [plugins.md](references/plugins.md).
- 커밋 전 스테이징 파일만 포맷하려면 `lint-staged` + `husky`, CI에서는 `pnpm format:check`로 검증한다.
