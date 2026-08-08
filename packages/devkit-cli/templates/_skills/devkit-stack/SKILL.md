---
name: devkit-stack
description: "이 프로젝트가 @cheolubak/* devkit 툴킷으로 이미 결정한 것들. 린트·포맷·타입·테스트·검증 라이브러리의 출처와, 다른 스킬의 안내와 어긋날 때의 우선순위.\nAPPLIES: 의존성을 추가하거나 설정 파일(eslint.config.mjs·tsconfig.json·prettier)을 고칠 때, 입력 검증을 붙일 때, 다른 스킬이 안내한 설치 명령을 실행하기 전에. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"의존성 추가\", \"패키지 설치\", \"eslint 설정\", \"lint 에러\", \"검증 붙여줘\", \"DTO\", \"스키마\", \"tsconfig\", \"테스트 설정\", \"이 프로젝트 규칙\", devkit 툴킷이 이미 정한 영역을 건드릴 때.\nSKIP: 없다. 다른 스킬과 충돌하면 이 문서가 이긴다."
---

# devkit 스택 — 이미 결정된 것

이 프로젝트는 `@cheolubak/*` devkit 툴킷으로 생성됐다. 아래는 **이미 결정돼 있어
다시 고르지 않는 것**이다. 다른 스킬이 다른 선택지를 안내하더라도 이 프로젝트에서는
여기 적힌 것을 쓴다.

## 출처

| 영역 | 패키지 | 소비 지점 |
| --- | --- | --- |
| 린트(NestJS) | `@cheolubak/eslint-config-nest` | `eslint.config.mjs` |
| 린트(FSD 경계) | `@cheolubak/eslint-plugin-fsd` | `eslint.config.mjs` |
| 포맷 | `@cheolubak/prettier-config` | `package.json` 의 `prettier` 키 |
| 타입 | `@cheolubak/tsconfig` | `tsconfig.json` 의 `extends` |
| 테스트(NestJS) | `@cheolubak/jest-config` | `jest.config.js`·`jest-e2e.config.js` |
| 테스트(Next.js) | `@cheolubak/vitest-config` | `vitest.config.ts` |

이 패키지들은 GitHub Packages에서 설치된다. `.npmrc`가
`@cheolubak:registry=https://npm.pkg.github.com`을 가리키므로 `GITHUB_TOKEN`
환경변수가 없으면 `pnpm install`이 실패한다 — **공개 패키지도 마찬가지다.**

기계 검증은 네 겹이며 CI에서 이미 돈다: `prettier`(포맷) · `oxlint`(비타입
correctness) · ESLint(타입 인식 규칙) · `tsc --noEmit`(타입).

## 우선순위

**다른 스킬의 안내가 이 문서와 어긋나면 이 문서가 이긴다.** 어긋나는 지점은
아래 셋이며, 전부 실측으로 확인된 것이다.

### 1. 입력 검증은 zod다 — `class-validator`가 아니다

`nestjs-validation`·`nestjs-crud` 스킬은 `class-validator` 데코레이터 기반 DTO를
가르친다. **이 프로젝트에는 적용하지 않는다.** `class-validator`·
`class-transformer`를 설치하지 않고, DTO 클래스에 검증 데코레이터를 붙이지 않는다.

대신 zod 스키마를 선언하고 그 스키마에서 타입을 뽑는다.

```ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

두 스킬의 나머지 내용(모듈 배치, 페이지네이션, 에러 매핑, 리포지토리 경계)은
그대로 유효하다. 검증 라이브러리 부분만 위로 바꿔 읽는다.

### 2. 린트 설정은 `@cheolubak/eslint-config-nest`를 확장한다

`eslint` 스킬은 `pnpm add -D eslint typescript-eslint @eslint/js eslint-config-prettier`
후 flat config를 직접 조립하라고 안내한다. **이 프로젝트는 그러지 않는다.**
`@eslint/js`·`eslint-config-prettier`·`eslint-plugin-prettier`는 생성 시점에
의도적으로 **제거된** 패키지다. 다시 설치하면 포맷 규칙이 ESLint로 새어들어와
Prettier와 이중으로 싸운다.

규칙을 더할 일이 있으면 `eslint.config.mjs`에서 기존 config를 확장한다.
포맷 관련 규칙은 추가하지 않는다 — 포맷은 Prettier 전담이다.

### 3. FSD 경계 강제는 `@cheolubak/eslint-plugin-fsd`다 — `steiger`가 아니다

`fsd-architecture` 스킬은 `steiger`를 전제로 쓰였다. **이 프로젝트는 `steiger`를
설치하지 않는다.** 레이어·슬라이스·Public API 개념은 그대로 쓰되, 경계 위반은
`eslint.config.mjs`의 `@cheolubak/eslint-plugin-fsd` 규칙이 잡는다.

Next.js App Router와 이름이 충돌하므로 FSD의 `pages` 레이어는 **`views`**로 쓴다
(`src/views/`). 이것도 생성 시점에 정해진 것이다.

## 새 의존성을 추가하기 전에

위 표의 영역에 이미 답이 있는지 먼저 본다. 있으면 추가하지 않는다. 없으면
추가하되, 런타임에 `import` 되는 것은 `dependencies`에 넣는다 —
`devDependencies`에 두면 `pnpm install --prod` 배포에서 빠져 `Cannot find module`로
죽는다.
