# FSD 격리(isolation)를 린트로 강제

FSD 규칙은 사람이 지키게 두면 반드시 무너진다. **격리를 린트로 자동 강제**해야 규칙이 살아있다. 강제해야 할 것은 세 가지:

1. **레이어 방향** — 하위 레이어만 import (상위 참조 금지)
2. **슬라이스 격리** — 같은 레이어의 형제 슬라이스 간 import 금지
3. **Public API** — 다른 슬라이스는 `index.ts`로만 접근 (내부 경로 직접 참조 금지)

두 가지 강제 수단이 있다: **Steiger(FSD 네이티브, 권장)** 와 **eslint-plugin-boundaries(ESLint 통합)**. oxlint에는 아키텍처 경계 규칙이 없으므로 이 강제는 항상 Steiger/ESLint 쪽에 둔다.

## 목차

- [방법 A: Steiger (권장)](#방법-a-steiger-권장)
- [방법 B: eslint-plugin-boundaries](#방법-b-eslint-plugin-boundaries)
- [oxlint 하이브리드에서의 위치](#oxlint-하이브리드에서의-위치)
- [CI·pre-commit 배선](#cipre-commit-배선)
- [A vs B 선택](#a-vs-b-선택)

## 방법 A: Steiger (권장)

[Steiger](https://github.com/feature-sliced/steiger)는 FSD 공식 아키텍처 린터다. 폴더 구조를 이해하고 있어 **레이어/슬라이스 매핑을 수동으로 정의할 필요가 없다.** `recommended` 프리셋 하나로 격리·Public API·구조 위반을 전부 검출한다.

```bash
pnpm add -D steiger @feature-sliced/steiger-plugin
```

```js
// steiger.config.js
import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

export default defineConfig([
  ...fsd.configs.recommended,
]);
```

```bash
pnpm steiger ./src           # 검사
pnpm steiger ./src --watch   # 감시 모드(파일 변경 시 증분 재검사)
pnpm steiger ./src --fix     # 자동 수정 가능한 위반 교정
```

### 격리 관련 핵심 규칙

`recommended`에 포함된 규칙 중 **격리를 담당하는 것**:

| 규칙 | 강제 내용 |
|------|-----------|
| `fsd/forbidden-imports` | 아래 두 하위 규칙의 상위 묶음 |
| ↳ `fsd/no-higher-level-imports` | **레이어 방향** — 상위 레이어 import 차단 |
| ↳ `fsd/no-cross-imports` | **슬라이스 격리** — 같은 레이어 형제 슬라이스 import 차단 |
| `fsd/public-api` | 슬라이스에 `index.ts`(Public API) 존재 강제 |
| `fsd/no-public-api-sidestep` | 내부 경로 직접 import(Public API 우회) 차단 |

> 이 규칙명들이 곧 SKILL.md/import-rules.md에서 말한 격리 규칙의 실제 구현이다. `fsd/no-cross-imports`가 슬라이스 격리, `fsd/no-higher-level-imports`가 레이어 방향에 정확히 대응한다.

### 규칙 조정 (레이어/폴더별 예외)

특정 레이어에서 규칙을 완화해야 할 때. 예: `widgets` 간 cross-import를 예외 허용, `shared`에는 Public API 강제 해제.

```js
// steiger.config.js
import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

export default defineConfig([
  ...fsd.configs.recommended,

  {
    // widgets 사이 cross-import는 팀 합의로 허용
    files: ['src/widgets/**'],
    rules: { 'fsd/no-cross-imports': 'off' },
  },
  {
    // shared 레이어는 세그먼트가 곧 최상위라 슬라이스 Public API 강제 제외
    files: ['src/shared/**'],
    rules: { 'fsd/public-api': 'off' },
  },
  {
    // 폐기된 processes 경고를 끄고 싶다면
    rules: { 'fsd/no-processes': 'off' },
  },
]);
```

- 심각도는 `'error' | 'warn' | 'off'`. `--fail-on-warnings`로 경고도 실패 처리.
- `ignores: ['**/__mocks__/**']`로 특정 폴더 제외.
- Steiger는 `src/app` 존재로 FSD 루트를 자동 감지한다.

## 방법 B: eslint-plugin-boundaries

이미 ESLint 파이프라인이 있고 **격리도 같은 `eslint` 실행에서 함께 검사**하고 싶을 때. 대신 레이어/슬라이스를 **수동 매핑**해야 한다.

```bash
pnpm add -D eslint-plugin-boundaries
```

### 1) 레이어를 element로 매핑

```js
// eslint.config.mjs (발췌)
import boundaries from 'eslint-plugin-boundaries';

export default [
  {
    plugins: { boundaries },
    settings: {
      // 각 레이어를 element type으로 정의. 슬라이스가 있는 레이어는 capture로 슬라이스명 포착
      'boundaries/elements': [
        { type: 'app',      pattern: 'src/app',        mode: 'folder' },
        { type: 'pages',    pattern: 'src/pages/*',    mode: 'folder', capture: ['slice'] },
        { type: 'widgets',  pattern: 'src/widgets/*',  mode: 'folder', capture: ['slice'] },
        { type: 'features', pattern: 'src/features/*', mode: 'folder', capture: ['slice'] },
        { type: 'entities', pattern: 'src/entities/*', mode: 'folder', capture: ['slice'] },
        { type: 'shared',   pattern: 'src/shared/*',   mode: 'folder', capture: ['segment'] },
      ],
    },
  },
];
```

### 2) 레이어 방향 강제 (`boundaries/element-types`)

기본을 disallow로 두고, 각 레이어가 **자신보다 아래 레이어만** import하도록 허용 목록을 준다.

```js
{
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: ['app'],      allow: ['pages', 'widgets', 'features', 'entities', 'shared'] },
        { from: ['pages'],    allow: ['widgets', 'features', 'entities', 'shared'] },
        { from: ['widgets'],  allow: ['features', 'entities', 'shared'] },
        { from: ['features'], allow: ['entities', 'shared'] },
        { from: ['entities'], allow: ['shared'] },
        { from: ['shared'],   allow: ['shared'] },
      ],
    }],
  },
}
```

### 3) Public API 강제 (`boundaries/entry-point`)

슬라이스는 `index.ts`로만 진입하도록 강제(내부 경로 직접 import 차단).

```js
{
  rules: {
    'boundaries/entry-point': ['error', {
      default: 'disallow',
      rules: [
        // 슬라이스 레이어는 index만 진입점으로 허용
        { target: ['pages', 'widgets', 'features', 'entities'], allow: 'index.(ts|tsx)' },
        // shared는 세그먼트 단위 접근 허용
        { target: ['shared'], allow: '*/index.(ts|tsx)' },
      ],
    }],
  },
}
```

### 4) 슬라이스 격리 (같은 레이어 형제 차단)

같은 레이어의 **다른 슬라이스** import를 막는다. eslint-plugin-boundaries는 captured 값 매칭으로 "importer와 다른 슬라이스"를 표현한다.

```js
// element-types 의 features 규칙을, "자기 자신 슬라이스만 허용"으로 좁힌다
{ from: ['features'], allow: [
    'entities', 'shared',
    ['features', { slice: '{{ from.captured.slice }}' }],  // 같은 slice만 허용
]},
```

> ⚠️ **버전 주의**: 템플릿 보간 문법이 플러그인 메이저 버전마다 다르다. v6+는 Handlebars식 `{{ from.captured.slice }}`, 그 이전은 `${from.slice}`를 쓴다. 설치한 버전의 selectors 문서를 확인해 토큰을 맞춘다. 슬라이스 격리는 이처럼 표현이 까다로워, **격리만 놓고 보면 Steiger가 훨씬 단순하고 정확하다**(방법 A의 `fsd/no-cross-imports`가 설정 없이 처리).

## oxlint 하이브리드에서의 위치

oxlint에는 FSD 아키텍처 경계 규칙이 없다. 따라서:

- **Steiger를 쓰면**: oxlint(빠른 correctness) + ESLint(플러그인 규칙) + **Steiger(아키텍처 경계)** 세 축으로 나뉜다. 각자 잘하는 일만 한다.
- **eslint-plugin-boundaries를 쓰면**: 경계 검사가 ESLint 실행 안에 들어간다. `eslint-plugin-oxlint`는 boundaries 규칙을 끄지 않으므로(oxlint에 대응 규칙이 없음) 충돌 없이 공존한다.

oxlint+ESLint 하이브리드 자체 구성은 `oxlint-eslint-hybrid` 스킬 참조.

## CI·pre-commit 배선

```jsonc
// package.json
{
  "scripts": {
    "lint": "oxlint && eslint . && steiger ./src",
    "lint:arch": "steiger ./src",
    "lint:arch:ci": "steiger ./src --reporter json"
  }
}
```

- **CI**: `steiger ./src`(pretty) 또는 `--reporter json`. 위반이 남고 error가 있으면 exit 1, `--fail-on-warnings`면 경고도 실패.
- **pre-commit**: 경계 위반은 커밋 단계에서 잡는 게 이상적이지만 전체 스캔이라 느릴 수 있다. 변경 파일이 많은 레이어 리팩터링 PR에서 특히 유효하므로 CI 필수 + pre-push 권장.
- **마이그레이션 중**: 아직 정리 안 된 레이어는 `files` 오버라이드로 규칙을 `warn`으로 낮춰 두고, 정리되는 대로 `error`로 올린다(→ migration.md의 "린트로 역행 방지").

## A vs B 선택

| | Steiger (A) | eslint-plugin-boundaries (B) |
|---|---|---|
| 설정량 | 거의 없음(`recommended`) | 레이어/슬라이스 수동 매핑 |
| 슬라이스 격리 | 기본 제공(`no-cross-imports`) | captured 매칭(버전별 문법) |
| 실행 | 별도 명령(`steiger`) | 기존 `eslint`에 통합 |
| FSD 특화 | 전용(구조 규칙까지) | 범용 경계 린터 |
| 권장 | **격리·구조 강제의 기본** | 단일 ESLint 실행 통합이 중요할 때 |

> 대부분의 경우 **Steiger(A)** 로 시작하라. FSD를 알고 있어 오설정 여지가 적고, 슬라이스 격리·Public API를 설정 없이 정확히 강제한다. ESLint 하나로 모든 걸 돌려야 하는 특수 요구가 있을 때만 B를 고려한다.
