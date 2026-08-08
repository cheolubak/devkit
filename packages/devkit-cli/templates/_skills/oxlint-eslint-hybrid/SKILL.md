---
name: oxlint-eslint-hybrid
description: "oxlint(Rust 초고속 린터) + ESLint 하이브리드 린팅 구성. oxlint로 대부분의 correctness를 빠르게 잡고 ESLint는 플러그인 규칙만 담당, eslint-plugin-oxlint로 중복 규칙 비활성화. 타입 인식(tsgolint) 트레이드오프.\nAPPLIES: oxlint를 ESLint와 함께 구성하거나 린트 속도를 개선할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"oxlint\", \"oxc\", \"oxlint eslint 같이\", \"하이브리드 린팅\", \"린트 빠르게\", \"eslint 느려\", \"린트 속도\", \"Rust 린터\", \"린터 두 개\", oxlint와 ESLint를 함께 구성/오케스트레이션할 때.\nSKIP: ESLint 단독 규칙/Flat Config 자체는 eslint. 코드 포맷팅(oxfmt/Prettier)은 prettier. 타입 에러 해결은 typescript-patterns."
version: 1.0.0
---

> 참조:
> - [references/hybrid-setup.md](references/hybrid-setup.md) - 전체 설치·`.oxlintrc.json`·`eslint.config` 통합, eslint-plugin-oxlint 배치 순서 **CRITICAL**
> - [references/division-of-labor.md](references/division-of-labor.md) - oxlint vs ESLint 역할 분담, 타입 인식(tsgolint) 트레이드오프, 마이그레이션 도구
> - [references/workflow-integration.md](references/workflow-integration.md) - lint-staged/husky, CI(GitHub Actions·GitLab), VS Code, 모노레포

# oxlint + ESLint 하이브리드 린팅

[oxlint](https://oxc.rs)는 Rust로 작성된 린터로 ESLint 대비 **50~100배 빠르다**(수백 개 파일을 수백 밀리초에). 하지만 ESLint의 방대한 플러그인 생태계(`eslint-plugin-next`, 커스텀 규칙, 프레임워크 전용 규칙)를 아직 다 대체하지 못한다. 그래서 현실적 최적은 **둘을 함께 쓰되 역할을 나누는 하이브리드**다.

## 왜 하이브리드인가

| | oxlint | ESLint |
|---|--------|--------|
| 속도 | 매우 빠름 (Rust, 병렬) | 느림 (JS, 단일 스레드 위주) |
| 커버리지 | correctness 중심 ~500+ 규칙 | 플러그인 생태계 전체 |
| 타입 인식 | opt-in(tsgolint), 아직 제한적 | 성숙(typescript-eslint) |
| 설정 | `.oxlintrc.json` 제로 설정 지향 | Flat Config 조합 |

**전략**: oxlint가 빠르게 잡을 수 있는 대부분의 correctness는 oxlint에게 맡기고(에디터·pre-commit에서 즉각 피드백), ESLint는 oxlint가 못 하는 **플러그인/프레임워크 전용 규칙**만 담당한다. 그리고 `eslint-plugin-oxlint`로 **oxlint가 이미 검사하는 규칙을 ESLint에서 꺼서** 이중 보고를 없애고 ESLint 실행도 가볍게 만든다.

## 3단계 구성

### 1. 설치

```bash
pnpm add -D oxlint eslint-plugin-oxlint
# 이미 ESLint(Flat Config)가 있다고 가정. 없으면 eslint 스킬 먼저.
```

### 2. oxlint 설정 (`.oxlintrc.json`)

```jsonc
// .oxlintrc.json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "import"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  }
}
```

### 3. ESLint에서 중복 규칙 끄기 (배치 순서가 핵심)

`eslint-plugin-oxlint`을 **config 배열의 맨 끝**에 spread한다. 그래야 앞에서 켠 규칙 중 oxlint가 담당하는 것들을 "off"로 마지막에 덮어쓴다.

```js
// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  // ... 프레임워크 플러그인(next, react-hooks 등)

  // ⬇️ 반드시 마지막: oxlint가 담당하는 규칙을 여기서 비활성화
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
```

> `buildFromOxlintConfigFile('./.oxlintrc.json')`는 실제 oxlint 설정을 읽어 정확히 겹치는 규칙만 끈다(권장). 설정 파일과 무관하게 프리셋으로 끄려면 `...oxlint.configs['flat/recommended']`(correctness만) 또는 `...oxlint.configs['flat/all']`(nursery 제외 전체).

## 실행 순서

두 린터를 **순차 실행**한다. 빠른 oxlint를 먼저 돌려 대부분을 빠르게 걸러내고, 통과하면 ESLint로 나머지를 검사한다.

```jsonc
// package.json
{
  "scripts": {
    "lint": "oxlint && eslint .",
    "lint:ox": "oxlint",
    "lint:es": "eslint .",
    "lint:fix": "oxlint --fix && eslint . --fix"
  }
}
```

- **에디터/pre-commit**: oxlint만으로 즉각 피드백(빠르니까).
- **CI**: `oxlint && eslint .`로 둘 다. oxlint가 먼저 실패하면 느린 ESLint를 아예 안 돌려 시간을 아낀다.

## 타입 인식(type-aware)은 어떻게?

과거엔 "타입 인식 규칙(떠도는 Promise 등)은 ESLint만 가능"이 하이브리드의 핵심 근거였다. 이제 oxlint도 **`tsgolint`**(TypeScript 컴파일러 Go 포팅)로 타입 인식을 opt-in 지원한다.

```bash
pnpm add -D oxlint-tsgolint
```
```jsonc
// .oxlintrc.json — 전체 타입 인식 켜기
{ "options": { "typeAware": true } }
```

다만 2026년 현재 oxlint 타입 인식은 **커버리지가 typescript-eslint보다 아직 좁다.** 권장:

- **기본**: 타입 인식은 ESLint(typescript-eslint)에 맡기고 oxlint는 비타입 규칙만 → 가장 안정적.
- **속도 최우선/실험**: oxlint `typeAware`를 켜고 ESLint의 타입 규칙과 중복분을 조정. tsgolint가 성숙하면 ESLint 의존을 더 줄일 수 있다.

역할 분담 상세와 마이그레이션 도구(`@oxlint/migrate`)는 → [references/division-of-labor.md](references/division-of-labor.md).

## 흔한 실수

- **eslint-plugin-oxlint를 배열 앞/중간에 배치** — 뒤에 오는 config가 규칙을 다시 켜버려 중복 보고가 남는다. 반드시 **맨 끝**.
- **oxlint와 ESLint에 같은 규칙을 각각 error로 유지** — 같은 위반이 두 번 보고된다. `buildFromOxlintConfigFile`로 정확히 끄는 게 목적.
- **oxlint를 포맷터로 기대** — oxlint는 린터다. 포맷팅은 Prettier(또는 oxfmt) 몫 → prettier 스킬.
- **CI에서 ESLint를 먼저 실행** — 느린 쪽을 먼저 돌리면 하이브리드의 속도 이점이 사라진다. `oxlint && eslint` 순서 유지.
- **`.oxlintrc.json` 없이 프리셋만 사용하며 규칙 어긋남** — oxlint 실제 규칙과 ESLint에서 끄는 규칙이 불일치하면 틈이 생긴다. 한쪽을 소스로 삼아(`buildFromOxlintConfigFile`) 동기화.

## 워크플로 통합

lint-staged/husky pre-commit, GitHub Actions/GitLab CI, VS Code 확장, pnpm 모노레포(Turbo 캐시) 구성은 → [references/workflow-integration.md](references/workflow-integration.md).
