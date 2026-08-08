# 워크플로 통합 (pre-commit · CI · 에디터 · 모노레포)

하이브리드 린터를 실제 개발 흐름에 꽂는 방법. 핵심 원칙은 **빠른 oxlint를 먼저, 느린 ESLint를 나중에** 두어 대부분의 상황에서 oxlint 속도의 이득을 취하는 것.

## 목차

- [package.json 스크립트](#packagejson-스크립트)
- [pre-commit (husky + lint-staged)](#pre-commit-husky--lint-staged)
- [GitHub Actions](#github-actions)
- [GitLab CI](#gitlab-ci)
- [VS Code 에디터](#vs-code-에디터)
- [pnpm 모노레포 (Turborepo)](#pnpm-모노레포-turborepo)

## package.json 스크립트

```jsonc
{
  "scripts": {
    "lint": "oxlint && eslint .",
    "lint:ox": "oxlint",
    "lint:es": "eslint .",
    "lint:fix": "oxlint --fix && eslint . --fix",
    "lint:ci": "oxlint --format=github && eslint ."
  }
}
```

`oxlint && eslint`: oxlint가 실패하면 뒤의 ESLint를 아예 실행하지 않아(short-circuit) 느린 검사를 건너뛴다.

## pre-commit (husky + lint-staged)

커밋 훅에서는 **oxlint만** 돌리는 것이 실용적이다. 매우 빠르고 대부분의 실수를 즉시 잡는다. 무거운 타입 인식 ESLint는 CI로 미룬다.

```bash
pnpm add -D husky lint-staged
pnpm exec husky init
```

```jsonc
// package.json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx,mjs,cjs}": "oxlint"
  }
}
```

```sh
# .husky/pre-commit
pnpm exec lint-staged
```

> 팀이 커밋 시점에 ESLint까지 강제하고 싶다면 `"*.{ts,tsx}": ["oxlint", "eslint --max-warnings=0"]`처럼 배열로 순차 실행. 다만 커밋이 느려지므로 트레이드오프를 팀과 합의한다.

## GitHub Actions

```yaml
# .github/workflows/lint.yml
name: Lint
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 'lts/*', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      # oxlint 먼저 — GitHub 어노테이션 포맷으로 PR에 인라인 표시
      - run: pnpm oxlint --format=github
      # 통과하면 ESLint
      - run: pnpm eslint .
```

`--format=github`은 위반을 PR diff에 인라인 어노테이션으로 남긴다.

## GitLab CI

oxlint는 GitLab Code Quality 리포트를 생성할 수 있다.

```yaml
# .gitlab-ci.yml
lint:
  image: node:lts
  stage: test
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - pnpm oxlint --format=gitlab > gitlab-oxlint-report.json
    - pnpm eslint .
  artifacts:
    reports:
      codequality:
        - gitlab-oxlint-report.json
```

## VS Code 에디터

oxlint 공식 확장(`oxc.oxc-vscode`)을 설치하면 저장 시 밀리초 단위 피드백을 받는다. ESLint 확장과 **병행**하되 역할을 분리한다.

```jsonc
// .vscode/settings.json
{
  "oxc.enable": true,
  // (선택) 타입 인식을 에디터에서 켜기 — oxlint-tsgolint 필요
  "oxc.typeAware": false,

  // ESLint 확장은 유지하되, oxlint가 끄는 규칙은 자동으로 안 뜸
  "eslint.useFlatConfig": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "explicit",
    "source.fixAll.eslint": "explicit"
  }
}
```

```jsonc
// .vscode/extensions.json — 팀 권장 확장
{ "recommendations": ["oxc.oxc-vscode", "dbaeumer.vscode-eslint"] }
```

> `oxc.typeAware`(에디터 설정)는 `.oxlintrc.json`의 `options.typeAware`를 덮어쓴다. 팀 기본은 config에, 개인 실험은 에디터 설정에 둔다.

## pnpm 모노레포 (Turborepo)

`.oxlintrc.json`을 **루트에 하나** 두면 모든 패키지에 적용된다(oxlint는 단일 설정으로 전체를 빠르게 스캔). ESLint 공유 config는 별도 패키지(`@repo/eslint-config`)로 두는 기존 패턴을 유지하고, 그 config 끝에 `eslint-plugin-oxlint`를 붙인다.

```jsonc
// turbo.json
{
  "tasks": {
    "lint": {
      "dependsOn": ["^lint"],
      "inputs": ["$TURBO_DEFAULT$", ".oxlintrc.json"]
    }
  }
}
```

- 루트 `.oxlintrc.json`을 `inputs`에 넣어야 설정 변경 시 Turbo 캐시가 무효화된다.
- 각 패키지의 `lint` 스크립트는 동일하게 `oxlint && eslint .`. oxlint는 루트 설정을 자동 상속하므로 패키지별 중복 설정이 필요 없다.
- ESLint 공유 config 패키지 구성 자체는 `eslint` 스킬의 monorepo 참조와 `nextjs-monorepo`를 따른다.
