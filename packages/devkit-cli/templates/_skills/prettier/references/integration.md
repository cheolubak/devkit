# Prettier 통합: ESLint · lint-staged · CI (integration.md)

## ESLint와의 역할 분리 (핵심)

Prettier와 ESLint는 담당 영역이 다르다. 겹치지 않게 나눠야 충돌·중복 경고가 없다.

| 도구 | 담당 |
| --- | --- |
| **Prettier** | 코드 포맷: 따옴표, 세미콜론, 들여쓰기, 줄 길이, 줄바꿈 위치 |
| **ESLint** | 코드 품질: 미사용 변수, 위험 패턴, import 규칙, React Hooks 규칙 등 |

> ESLint 설정 자체(Flat Config, 타입 인식 린팅, 규칙 구성)는 **eslint 스킬**을 참조한다. 여기서는 Prettier와의 접점만 다룬다.

### eslint-config-prettier로 포맷 규칙 끄기 (권장)

ESLint에도 포맷 관련 규칙이 있어 Prettier 결과와 충돌할 수 있다. `eslint-config-prettier`를 ESLint 설정 **마지막**에 넣어 그 포맷 규칙들을 전부 끈다. 이러면 포맷은 온전히 Prettier가, 품질만 ESLint가 담당한다.

```bash
pnpm add -D eslint-config-prettier
```

Flat Config(ESLint v9)에서는 배열 마지막 요소로 spread 한다.

```js
// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // ...프로젝트 규칙...
  eslintConfigPrettier, // 반드시 마지막: 포맷 관련 규칙 비활성화
);
```

이 조합에서 실행은 두 명령을 따로 돌린다. 서로 간섭하지 않는다.

```bash
pnpm eslint .          # 품질 검사
pnpm prettier --write . # 포맷
```

### eslint-plugin-prettier는 왜 비권장인가

`eslint-plugin-prettier`는 Prettier를 **ESLint 규칙으로 실행**해서 포맷 위반을 린트 에러로 표시한다. 편해 보이지만 단점이 크다.

- **성능**: 파일마다 Prettier를 ESLint 안에서 다시 돌려 린트가 느려진다.
- **에러 노이즈**: 포맷 차이 하나하나가 빨간 밑줄로 떠서 실제 코드 품질 에러에 섞인다. 편집기가 온통 포맷 경고로 뒤덮인다.
- **역할 혼동**: "포맷은 Prettier, 품질은 ESLint"라는 분리를 깨뜨린다.

권장 방식은 위의 `eslint-config-prettier`(규칙을 끄는 방식)이고, 포맷은 `prettier --write` 또는 에디터 포맷 온 세이브로 처리한다.

굳이 하나의 명령으로 합치고 싶다면 그때만 아래처럼 쓴다(권장하지 않음).

```bash
pnpm add -D eslint-plugin-prettier eslint-config-prettier
```

```js
// eslint.config.mjs (비권장 방식)
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  // ...
  eslintPluginPrettierRecommended, // Prettier를 ESLint 규칙으로 실행 + config-prettier 포함
];
```

## lint-staged + husky (커밋 전 자동 포맷)

커밋 시 **스테이징된 파일만** 골라 ESLint 수정과 Prettier 포맷을 돌린다. 전체 코드베이스를 매번 훑지 않아 빠르다.

```bash
pnpm add -D lint-staged husky
pnpm dlx husky init
```

`husky init`이 `.husky/pre-commit`을 생성한다. 내용을 lint-staged 실행으로 바꾼다.

```sh
# .husky/pre-commit
pnpm lint-staged
```

`package.json`에 대상 파일별 명령을 정의한다. `eslint --fix`를 먼저, `prettier --write`를 나중에 둔다(품질 수정 후 최종 포맷).

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

> `.json`/`.md`/`.css`는 ESLint 대상이 아니므로 Prettier만 돌린다.

## pnpm 스크립트

```json
// package.json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint ."
  }
}
```

- `format`: 로컬에서 전체 포맷 적용.
- `format:check`: 변경 없이 위반 여부만 검사(종료 코드로 실패 판정). CI에서 사용.

## CI 포맷 체크 (GitHub Actions)

`format:check`가 실패하면 워크플로가 실패하도록 구성한다. 포맷되지 않은 코드가 머지되는 것을 막는다.

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Check formatting
        run: pnpm format:check

      - name: Lint
        run: pnpm lint
```

`format:check`와 `lint`를 각각 스텝으로 두면 실패 원인(포맷 vs 품질)이 로그에서 명확히 구분된다.
