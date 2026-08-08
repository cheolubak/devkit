---
name: eslint
description: "ESLint Flat Config(v9) 통합 설정. Next.js/React + NestJS 타입 인식 린팅, pnpm 모노레포 공유 config.\nAPPLIES: `eslint.config.*`·`.eslintrc*`를 만들거나 고칠 때, 린트 규칙·에러를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"ESLint 설정\", \"lint 설정\", \"eslint.config\", \"flat config\", \"린트 규칙\", \"타입 린팅\", \"lint 에러\", \"코드 검사 설정\", ESLint 구성/규칙/에러 해결 시.\nSKIP: 코드 포맷팅(들여쓰기·따옴표)은 prettier. 타입 에러 자체는 typescript-patterns. Next.js 배포 CI는 nextjs-deployment. oxlint와 함께 쓰는 하이브리드 구성은 oxlint-eslint-hybrid."
---

> 참조:
> - [references/flat-config.md](references/flat-config.md) - Flat Config 기본 구조, tseslint.config, 타입 인식 린팅
> - [references/nextjs-react.md](references/nextjs-react.md) - eslint-config-next, react-hooks, jsx-a11y, import 정렬
> - [references/nestjs-node.md](references/nestjs-node.md) - NestJS/Node 타입 린팅, no-floating-promises 등
> - [references/monorepo.md](references/monorepo.md) - pnpm workspace 공유 config 패키지, Turbo 캐시

# ESLint Flat Config (v9)

ESLint v9부터 `eslint.config.mjs`(Flat Config)가 기본이다. 구버전 `.eslintrc`·`.eslintignore`는 쓰지 않는다. typescript-eslint의 `tseslint.config()` 헬퍼로 타입 안전하게 설정을 조합한다.

## 설치

```bash
pnpm add -D eslint typescript-eslint @eslint/js eslint-config-prettier
```

## 최소 타입 인식 설정

가장 자주 쓰는 뼈대. TypeScript 타입 정보를 활용해 실제 버그(떠도는 Promise 등)까지 잡는다.

```js
// eslint.config.mjs
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // .eslintignore 대체: ignores만 있는 단독 객체 (전역 무시)
  { ignores: ['**/dist/**', '**/build/**', '**/.next/**', '**/coverage/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // 타입 인식 규칙
  {
    languageOptions: {
      parserOptions: {
        projectService: true, // tsconfig 자동 탐색 (구버전 project 대체)
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // JS 설정 파일 등에는 타입 인식 린팅 비활성화
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // 항상 배열 마지막: 포맷 관련 규칙 끄기 (포맷은 Prettier 담당)
  eslintConfigPrettier,
);
```

```jsonc
// package.json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

## 프리셋 선택 기준

| 프리셋 | 타입 정보 | 용도 |
| --- | --- | --- |
| `recommended` | 불필요(빠름) | 타입 미설정 프로젝트, 러프한 검사 |
| `recommendedTypeChecked` | 필요 | 실무 기본값. 타입 기반 버그 탐지 |
| `strictTypeChecked` | 필요 | 더 엄격. 신규/견고성 중시 프로젝트 |
| `stylisticTypeChecked` | 필요 | 스타일 성격 규칙(중복 타입 등). 위와 조합 |

포맷팅(들여쓰기·따옴표·세미콜론)은 ESLint가 아니라 Prettier가 담당한다. `eslint-config-prettier`를 항상 마지막에 두어 충돌 규칙을 끈다. 상세는 prettier 스킬 참조.

## 자주 만나는 상황

- 타입 인식 규칙이 느리거나 tsconfig를 못 찾음 -> `projectService: true` + `tsconfigRootDir` 확인. 상세는 [references/flat-config.md](references/flat-config.md).
- Next.js/React 설정 -> [references/nextjs-react.md](references/nextjs-react.md)
- NestJS/Node 서버 설정 -> [references/nestjs-node.md](references/nestjs-node.md)
- 모노레포 공유 config -> [references/monorepo.md](references/monorepo.md)
