# 하이브리드 전체 설정

oxlint + ESLint를 겹침 없이 함께 돌리는 완전한 설정 레시피. 핵심은 **`eslint-plugin-oxlint`의 배치 순서**와 **단일 소스 동기화**다.

## 목차

- [설치](#설치)
- [.oxlintrc.json 상세](#oxlintrcjson-상세)
- [ESLint config 통합 (배치 순서)](#eslint-config-통합-배치-순서)
- [세 가지 비활성화 방식 비교](#세-가지-비활성화-방식-비교)
- [Next.js/React 예시](#nextjsreact-예시)
- [NestJS/Node 예시](#nestjsnode-예시)
- [검증 방법](#검증-방법)

## 설치

```bash
pnpm add -D oxlint eslint-plugin-oxlint
# 타입 인식을 oxlint로도 돌리려면(선택)
pnpm add -D oxlint-tsgolint
```

ESLint Flat Config가 아직 없다면 `eslint` 스킬로 먼저 구성한다. 이 스킬은 "이미 ESLint가 있는 상태에 oxlint를 얹는" 시나리오를 가정한다.

## .oxlintrc.json 상세

oxlint는 제로 설정으로도 동작하지만, 팀은 보통 `.oxlintrc.json`(또는 `oxlint.config.ts`)을 커밋해 로컬·에디터·CI 일관성을 맞춘다.

```jsonc
// .oxlintrc.json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "import", "jsx-a11y"],
  "categories": {
    "correctness": "error",   // 거의 확실한 버그
    "suspicious": "warn",     // 의심스러운 코드
    "perf": "warn"
  },
  "rules": {
    // 개별 규칙 오버라이드
    "no-console": "warn"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.spec.ts"],
      "rules": { "no-console": "off" }
    }
  ],
  "ignorePatterns": ["dist", "build", ".next", "coverage"]
}
```

카테고리 severity는 CLI로도 조정 가능:

```bash
oxlint -D correctness -D suspicious   # deny(error)
oxlint -W perf                        # warn
oxlint -A no-console                  # allow(off)
```

## ESLint config 통합 (배치 순서)

**규칙: `eslint-plugin-oxlint`은 항상 config 배열의 맨 끝에 spread한다.** Flat Config는 뒤 항목이 앞 항목을 덮어쓰므로, 맨 끝에 둬야 "oxlint가 담당하는 규칙 off"가 최종 반영된다.

```js
// eslint.config.mjs
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';

export default tseslint.config(
  // 1) 베이스
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // 2) 프레임워크/플러그인 (oxlint가 못 하는 것들)
  // ...next, react-hooks, jsx-a11y, import-x 등

  // 3) 프로젝트 커스텀 규칙
  { rules: { /* ... */ } },

  // 4) ⬇️ 반드시 마지막: oxlint 담당 규칙 비활성화
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
```

## 세 가지 비활성화 방식 비교

| 방식 | 끄는 범위 | 언제 |
|------|-----------|------|
| `buildFromOxlintConfigFile('./.oxlintrc.json')` | 실제 oxlint 설정과 **정확히 일치**하는 규칙 | **권장** — 단일 소스 동기화 |
| `configs['flat/recommended']` | correctness 카테고리 대응 규칙 | oxlint를 correctness만 쓸 때 |
| `configs['flat/all']` | nursery 제외 oxlint 지원 전 규칙 | oxlint를 광범위하게 켤 때 |

`buildFromOxlintConfigFile`이 가장 안전하다: `.oxlintrc.json` 하나만 바꾸면 ESLint에서 끄는 목록도 자동으로 따라온다. 프리셋 방식은 두 설정이 어긋날 위험이 있다.

## Next.js/React 예시

```js
// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import oxlint from 'eslint-plugin-oxlint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': next, 'react-hooks': reactHooks },
    rules: {
      ...next.configs.recommended.rules,     // oxlint에 없는 Next 전용
      ...reactHooks.configs.recommended.rules,
    },
  },
  // 맨 끝: oxlint 중복 제거
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
```

`.oxlintrc.json`의 `plugins`에 `["react", "typescript", "import", "jsx-a11y"]`를 두면 리액트/JSX 기본 correctness는 oxlint가 빠르게 담당하고, ESLint는 `@next/next`·`react-hooks` 같은 프레임워크 전용 규칙에 집중한다.

## NestJS/Node 예시

백엔드는 타입 인식 규칙(`no-floating-promises` 등)이 중요하다. 안정성을 위해 **타입 인식은 ESLint에 두고** oxlint는 비타입 correctness만 맡기는 구성이 무난하다.

```js
// eslint.config.mjs (NestJS)
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';

export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,   // no-floating-promises 등 타입 규칙 유지
  {
    languageOptions: { parserOptions: { projectService: true } },
  },
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
```

## 검증 방법

설정이 실제로 겹침 없이 동작하는지 확인:

```bash
# 1) 각각 단독 실행되는지
pnpm oxlint
pnpm eslint .

# 2) 같은 위반이 양쪽에서 중복 보고되지 않는지
#    (예: no-debugger 를 코드에 넣고 oxlint/eslint 출력에 한 번만 나오는지 확인)

# 3) ESLint가 oxlint 규칙을 정말 껐는지 — 특정 규칙 검사
pnpm eslint --print-config src/index.ts | grep -A1 '"no-debugger"'
#   → "off" 로 나오면 정상
```
