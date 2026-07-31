# Phase 1 — 소비자 활성화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 완성됐지만 소비자가 0인 `@devbak/eslint-config-nest`를 NestJS 3개 프로젝트에서 실제로 돌아가게 만들고, 그 과정에서 반복되는 설정을 빌드 불필요한 JSON 패키지 3개로 추출한다.

**Architecture:** 툴킷 저장소(`~/Documents/develop/eslint`)에 설정 패키지를 만들고, 소비자 프로젝트는 pnpm `link:` 프로토콜로 상대 경로 심볼릭 링크를 건다. npm 배포는 하지 않는다. `devlog-api`를 먼저 완주해 문제를 전부 드러낸 뒤 나머지 둘에 전파한다.

**Tech Stack:** pnpm workspace, ESLint 10 flat config, typescript-eslint 8, eslint-plugin-zod 4, Prettier 3, Jest 29/30 (ts-jest), TypeScript 5

## Global Constraints

- **패키지 매니저는 pnpm만 쓴다.** `npm`/`yarn` 명령을 쓰지 않는다.
- **들여쓰기는 2 space.** JSON·YAML·TS 전부.
- **커밋 메시지는 imperative mood, 한글 허용.** 커밋 본문 끝에 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` 를 넣는다.
- **저장소가 4개다.** 툴킷(`eslint`)과 소비자 3개(`devlog-api`, `account-api`, `eungam-api`)는 **각각 독립된 git 저장소**다. 커밋은 각 저장소에서 따로 한다. 소비자 저장소는 현재 전부 `main`에 미커밋 변경 0건이며, 작업 시작 시 `feature/devkit-adoption` 브랜치를 만든다. **`main`에 직접 커밋하지 않는다.**
- **툴킷 저장소는 `feature/devkit-roadmap` 브랜치에서 계속 작업한다.** 설계 문서와 이 계획이 이미 그 브랜치에 있다.
- **머지는 rebase 방식만.** merge commit을 만들지 않는다.
- **npm publish를 하지 않는다.** 어떤 태스크에서도 `npm publish` / `pnpm publish`를 실행하지 않는다.
- **패키지 스코프는 `@devbak`.** 새 패키지 이름은 전부 `@devbak/`로 시작한다.
- **새로 만드는 설정 패키지 3개는 빌드하지 않는다.** 전부 JSON 파일이며 `tsup`·`dist`·`src`가 없다. 빌드가 필요한 것은 기존 `eslint-config-nest`와 `eslint-plugin-fsd`뿐이다.
- **경로 기준:** 이 문서의 모든 상대 경로는 `~/Documents/develop/`를 기준으로 한다. 툴킷은 `eslint/`, 소비자는 `devlog-api/` 등이다.

---

## File Structure

### 툴킷 저장소 (`eslint/`) — 신규

| 파일 | 책임 |
| --- | --- |
| `packages/prettier-config/package.json` | 패키지 매니페스트. `main`이 `index.json`을 가리킨다 |
| `packages/prettier-config/index.json` | Prettier 설정 본문 (3개 프로젝트 공통값) |
| `packages/prettier-config/README.md` | 사용법 |
| `packages/prettier-config/tests/config.test.ts` | JSON 내용 단언 |
| `packages/prettier-config/tests/tsconfig.json` | 테스트 파일용 TS 프로젝트 (아래 주의 참조) |
| `packages/tsconfig/package.json` | 패키지 매니페스트. 빌드·main 없음 |
| `packages/tsconfig/nest.json` | NestJS 공통 `compilerOptions` **부분집합** |
| `packages/tsconfig/README.md` | 사용법 + 상대 경로 주의 |
| `packages/tsconfig/tests/config.test.ts` | 경로성 옵션 부재 단언 |
| `packages/tsconfig/tests/tsconfig.json` | 테스트 파일용 TS 프로젝트 |
| `packages/jest-config/package.json` | 패키지 매니페스트 |
| `packages/jest-config/nest/jest-preset.json` | 유닛 테스트 프리셋 |
| `packages/jest-config/nest-e2e/jest-preset.json` | e2e 프리셋 |
| `packages/jest-config/README.md` | 사용법 |
| `packages/jest-config/tests/config.test.ts` | 프리셋 내용 단언 |
| `packages/jest-config/tests/tsconfig.json` | 테스트 파일용 TS 프로젝트 |

> **`tests/tsconfig.json`을 빠뜨리면 `pnpm lint`가 깨진다.** 저장소의 `eslint.config.mjs`는 `projectService: true`로 타입 인식을 켜므로, 모든 `.ts` 파일이 어떤 TS 프로젝트에 속해야 한다. 새 패키지 3개는 빌드가 없어 루트 `tsconfig.json`이 아예 없으므로, 테스트 파일이 무소속이 되어 ESLint가 파싱 단계에서 실패한다. `eslint-config-nest`가 같은 문제를 겪고 `tests/tsconfig.json`을 추가해 해결한 전례가 있다(work-log 2026-07-29).
>
> 세 패키지의 `tests/tsconfig.json`은 **내용이 동일하다.** `fixtures`가 없으므로 `exclude`는 두지 않고, JSON을 import하므로 `resolveJsonModule`을 켠다:
>
> ```json
> {
>   "extends": "../../../tsconfig.base.json",
>   "compilerOptions": {
>     "noEmit": true,
>     "declaration": false,
>     "resolveJsonModule": true
>   },
>   "include": ["."]
> }
> ```

### 툴킷 저장소 — 수정

| 파일 | 변경 |
| --- | --- |
| `packages/eslint-plugin-fsd/package.json` | peer `eslint`를 `^10.0.0`으로 좁히고, 비어 있는 메타데이터 5종을 채운다 |
| `packages/eslint-plugin-fsd/README.md` | ESLint v9 지원 표기 제거 |
| `work-log.md` | Phase 1 결과 기록 |

### 소비자 저장소 3곳 — 공통 변경

| 파일 | 변경 |
| --- | --- |
| `.eslintrc.js` | **삭제** |
| `eslint.config.mjs` | **신규** — `@devbak/eslint-config-nest` + 프로젝트별 `ignores` |
| `.prettierrc` | **삭제** (`package.json`의 `prettier` 필드로 대체) |
| `tsconfig.json` | `@devbak/tsconfig/nest.json`을 extends하고 경로·엄격도만 로컬 유지 |
| `package.json` | 의존성 교체, `prettier` 필드 추가, `jest.preset` 도입, `lint` 스크립트 교체 |
| `test/jest-e2e.json` | `preset` 도입 |

**왜 이 분해인가.** 설정 패키지를 파일 종류(prettier / tsconfig / jest)로 나눈 것은, 셋의 **소비 메커니즘이 완전히 다르기** 때문이다 — Prettier는 `package.json`의 `prettier` 필드로 모듈을 해석하고, TypeScript는 `extends`로 JSON을 병합하며, Jest는 `jest-preset.json` 파일명 관습으로 찾는다. 하나가 깨져도 나머지는 영향받지 않아야 하고, 각각 독립적으로 검증 가능해야 한다.

---

## Task 순서와 근거

`devlog-api`가 **가장 크고 복잡하므로 먼저** 한다(Prisma 7 생성 코드, zod, telemetry, docker-compose e2e). 여기서 막히는 것은 나머지 둘에서도 막힌다.

Task 1~2가 **Prettier부터**인 이유는, 그것이 만들 수 있는 가장 단순한 패키지라 **`link:` 배선 자체를 먼저 검증**할 수 있기 때문이다. ESLint 마이그레이션은 변수가 많아 실패 시 원인이 링크인지 설정인지 구분하기 어렵다.

---

### Task 1: `@devbak/prettier-config` 패키지 생성

**Files:**
- Create: `eslint/packages/prettier-config/package.json`
- Create: `eslint/packages/prettier-config/index.json`
- Create: `eslint/packages/prettier-config/README.md`
- Test: `eslint/packages/prettier-config/tests/config.test.ts`
- Create: `eslint/packages/prettier-config/tests/tsconfig.json`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: 패키지 이름 `@devbak/prettier-config`, 소비자는 `package.json`에 `"prettier": "@devbak/prettier-config"` 로 참조한다. 설정 본문은 `{ singleQuote: true, trailingComma: "all" }`.

- [ ] **Step 1: 실패하는 테스트와 테스트용 TS 프로젝트를 쓴다**

`eslint/packages/prettier-config/tests/tsconfig.json` 를 만든다. 이것을 빠뜨리면 Step 5의 `pnpm lint`가 파싱 단계에서 실패한다:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["."]
}
```

`eslint/packages/prettier-config/tests/config.test.ts` 를 만든다:

```ts
import { describe, expect, it } from 'vitest';
import config from '../index.json';

describe('@devbak/prettier-config', () => {
  it('세 소비자 프로젝트의 .prettierrc와 동일한 값을 갖는다', () => {
    expect(config).toEqual({
      singleQuote: true,
      trailingComma: 'all',
    });
  });

  it('경로에 의존하는 옵션을 담지 않는다', () => {
    // 공유 설정이 소비자의 파일 구조를 가정하면 안 된다.
    expect(config).not.toHaveProperty('filepath');
    expect(config).not.toHaveProperty('overrides');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd ~/Documents/develop/eslint && pnpm vitest run packages/prettier-config`
Expected: FAIL — `Cannot find module '../index.json'`

- [ ] **Step 3: 패키지 파일을 만든다**

`eslint/packages/prettier-config/index.json`:

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

`eslint/packages/prettier-config/package.json`:

```json
{
  "name": "@devbak/prettier-config",
  "version": "0.1.0",
  "description": "개인 프로젝트 공용 Prettier 설정 (빌드 없음, JSON 단일 파일)",
  "license": "MIT",
  "keywords": [
    "prettier",
    "prettier-config"
  ],
  "main": "./index.json",
  "files": [
    "index.json"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

`eslint/packages/prettier-config/README.md`:

````markdown
# @devbak/prettier-config

개인 프로젝트 공용 Prettier 설정. **빌드가 없다** — `index.json` 한 파일이 전부다.

## 사용법

소비자 `package.json`에 링크와 참조를 함께 넣는다.

```jsonc
{
  "prettier": "@devbak/prettier-config",
  "devDependencies": {
    "@devbak/prettier-config": "link:../eslint/packages/prettier-config",
    "prettier": "^3.0.0"
  }
}
```

`.prettierrc` 파일은 삭제한다. 남겨두면 그쪽이 우선해서 공유 설정이 무시된다.

## 담은 값

| 옵션 | 값 | 이유 |
| --- | --- | --- |
| `singleQuote` | `true` | 기존 3개 프로젝트가 전부 이 값이었다 |
| `trailingComma` | `"all"` | 위와 같다. Prettier 3의 기본값과도 같지만 의도를 고정한다 |

## 왜 빌드가 없는가

JSON이므로 트랜스파일할 것이 없다. 이는 부수 효과가 크다 — `link:` 의존은 라이프사이클 스크립트를 실행하지 않으므로, 빌드가 필요한 패키지는 `dist`가 낡으면 소비자가 조용히 옛 설정을 쓰게 된다. 이 패키지는 그 문제를 아예 겪지 않는다.
````

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd ~/Documents/develop/eslint && pnpm vitest run packages/prettier-config`
Expected: PASS (2 tests)

- [ ] **Step 5: 저장소 전체 게이트를 돌린다**

Run: `cd ~/Documents/develop/eslint && pnpm lint && pnpm test && pnpm build`
Expected: 전부 exit 0. 기존 테스트 77개 + 신규 2개 = **79개 통과**.

새 패키지에 `build` 스크립트가 없으므로 `pnpm -r build`는 그 패키지를 건너뛴다. 이는 정상이다.

- [ ] **Step 6: 커밋**

```bash
cd ~/Documents/develop/eslint
git add packages/prettier-config
git commit -m "$(cat <<'EOF'
feat: @devbak/prettier-config 패키지 추가

3개 NestJS 프로젝트의 .prettierrc가 바이트 단위로 동일해 추출했다.
JSON 한 파일이라 빌드가 없고, link: 의존의 dist 최신성 문제를 겪지 않는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `devlog-api`에 prettier-config 링크 — `link:` 배선 검증

**Files:**
- Modify: `devlog-api/package.json`
- Delete: `devlog-api/.prettierrc`

**Interfaces:**
- Consumes: Task 1의 `@devbak/prettier-config`
- Produces: `link:../eslint/packages/prettier-config` 상대 경로 패턴. Task 5·6과 account/eungam 태스크가 같은 형태를 쓴다.

이 태스크의 진짜 목적은 Prettier 설정 통일이 아니라 **`link:` 프로토콜이 실제로 동작하는지 확인**하는 것이다. 실패하면 이후 모든 태스크가 막히므로 여기서 일찍 드러낸다.

- [ ] **Step 1: 브랜치를 만들고 기준선을 기록한다**

```bash
cd ~/Documents/develop/devlog-api
git checkout -b feature/devkit-adoption
pnpm prettier --check "src/**/*.ts" > /tmp/prettier-before.txt 2>&1; echo "exit=$?"
```

Expected: `exit=0` — 기존 `.prettierrc`로 이미 포맷이 맞춰져 있어야 한다.

만약 exit이 0이 아니면 **먼저 `pnpm prettier --write "src/**/*.ts"` 로 포맷을 맞추고 별도 커밋**한 뒤 진행한다. 포맷 차이가 남아 있으면 Step 5의 검증이 무의미해진다.

- [ ] **Step 2: 링크와 참조를 추가한다**

`devlog-api/package.json`을 편집한다. 최상위에 `prettier` 필드를 추가하고, `devDependencies`에 링크를 넣는다:

```jsonc
{
  // ... 기존 필드 유지
  "prettier": "@devbak/prettier-config",
  "devDependencies": {
    // ... 기존 항목 유지
    "@devbak/prettier-config": "link:../eslint/packages/prettier-config"
  }
}
```

- [ ] **Step 3: 기존 설정 파일을 지우고 설치한다**

```bash
cd ~/Documents/develop/devlog-api
rm .prettierrc
pnpm install
ls -l node_modules/@devbak/prettier-config
```

Expected: 마지막 명령이 `~/Documents/develop/eslint/packages/prettier-config` 로 향하는 **심볼릭 링크**를 보여준다.

`.prettierrc`를 반드시 지워야 한다. 남아 있으면 Prettier가 그쪽을 우선해서 `package.json`의 `prettier` 필드가 무시되고, 이 태스크의 검증이 통과해도 아무것도 증명하지 못한다.

- [ ] **Step 4: 설정이 실제로 해석되는지 직접 확인한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm prettier --find-config-path src/main.ts
```

Expected: `package.json` 경로가 출력된다.

- [ ] **Step 5: 포맷 결과가 이전과 동일한지 검증한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm prettier --check "src/**/*.ts"; echo "exit=$?"
```

Expected: `exit=0`.

**이것이 이 태스크의 핵심 검증이다.** 링크가 해석되지 않으면 Prettier는 기본값(큰따옴표)으로 떨어지고, `singleQuote: true`로 작성된 소스 전체가 위반으로 잡혀 요란하게 실패한다. 즉 조용한 실패가 불가능한 테스트다.

- [ ] **Step 6: 커밋**

```bash
cd ~/Documents/develop/devlog-api
git add package.json pnpm-lock.yaml
git rm --cached .prettierrc 2>/dev/null || true
git add -A
git commit -m "$(cat <<'EOF'
chore: Prettier 설정을 @devbak/prettier-config 링크로 교체

.prettierrc를 삭제하고 package.json의 prettier 필드로 공유 설정을
참조한다. prettier --check가 이전과 동일하게 통과하므로 설정값이
바뀌지 않았음이 보장된다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `devlog-api` ESLint 8 → 10 flat config 마이그레이션

**Files:**
- Delete: `devlog-api/.eslintrc.js`
- Create: `devlog-api/eslint.config.mjs`
- Modify: `devlog-api/package.json`

**Interfaces:**
- Consumes: 기존 `@devbak/eslint-config-nest` (기본 export는 `Linter.Config[]` 배열이므로 spread해서 쓴다)
- Produces: `eslint.config.mjs` 형태. Task 7·8이 같은 구조를 쓰되 `ignores` 목록만 프로젝트별로 다르다.

- [ ] **Step 1: 툴킷을 빌드한다**

```bash
cd ~/Documents/develop/eslint
pnpm build
ls packages/eslint-config-nest/dist/index.js
```

Expected: 파일이 존재한다.

**이 단계를 건너뛰면 안 된다.** `eslint-config-nest`는 `main`이 `dist/index.js`인데 `dist`는 `.gitignore` 대상이고, `link:` 의존은 `prepublishOnly` 같은 라이프사이클 스크립트를 실행하지 않는다. 빌드하지 않으면 다음 단계에서 모듈 해석 실패로 죽는다.

- [ ] **Step 2: 기준선을 기록한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm exec tsc --noEmit > /tmp/devlog-tsc-before.txt 2>&1; echo "tsc exit=$?"
pnpm test 2>&1 | tail -5 > /tmp/devlog-test-before.txt; cat /tmp/devlog-test-before.txt
```

통과한 테스트 수를 기록해 둔다. Task 6에서 비교한다.

- [ ] **Step 3: 의존성을 교체한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm remove eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  eslint-config-prettier eslint-plugin-prettier eslint-plugin-perfectionist
pnpm add -D eslint@^10.8.0 typescript-eslint@^8.65.0 eslint-plugin-zod@^4.9.0
pnpm add -D "@devbak/eslint-config-nest@link:../eslint/packages/eslint-config-nest"
```

세 가지를 짚는다.

- **`eslint-plugin-prettier`·`eslint-config-prettier` 제거**는 설계 4.5절의 결정이다. 린터가 포매터 일을 하면 느려지고, 이 저장소가 채택한 oxlint 하이브리드 방향과 어긋난다. 포맷은 Task 2에서 이미 `prettier --check`로 분리됐다.
- **`eslint-plugin-perfectionist` 제거**는 `perfectionist/sort-imports`를 포기한다는 뜻이다. import 정렬은 포맷 관심사이고, 같은 이유로 ESLint에서 뺀다. 되살리고 싶으면 Task 4의 (c) 분류로 프로젝트 로컬 config에 다시 넣을 수 있으나, 그 전에 ESLint 10 호환 여부를 실제로 확인해야 한다.
- **`zod`는 이미 있다**(`devlog-api`만 해당). `eslint-config-nest`의 필수 peer 4개 중 `zod`가 여기서는 새로 설치되지 않는다.

- [ ] **Step 4: peer가 전부 해석되는지 확인한다**

```bash
cd ~/Documents/develop/devlog-api
node -e "['eslint','typescript-eslint','eslint-plugin-zod','zod'].forEach(m=>console.log(m, require.resolve(m)))"
```

Expected: 4개 모듈 경로가 모두 출력된다. 하나라도 실패하면 `pnpm add -D <모듈>`로 채운다.

`eslint-config-nest`는 peer 4개가 전부 필수이고 `peerDependenciesMeta`가 없다. `link:` 의존은 레지스트리 설치와 peer 자동 설치 동작이 다를 수 있어 여기서 명시적으로 확인한다.

- [ ] **Step 5: flat config를 작성한다**

`devlog-api/eslint.config.mjs` 를 만든다:

```js
import nest from '@devbak/eslint-config-nest';

export default [
  {
    // 전역 무시. 이 객체는 반드시 배열 맨 앞에 두고 ignores만 담아야
    // 전체 설정에 적용된다(다른 키를 함께 넣으면 일반 config가 된다).
    //
    // Prisma 생성 코드를 반드시 제외해야 한다. eslint-config-nest는
    // projectService로 타입 인식을 켜므로, 생성된 client.ts(수만 줄)가
    // 대상에 들어가면 린트가 사실상 끝나지 않는다.
    ignores: [
      'dist/**',
      'coverage/**',
      'src/database/generated/**',
    ],
  },

  ...nest,
];
```

`.mjs` 확장자를 쓴다. `devlog-api/package.json`에 `"type": "module"`이 없어 `.js`는 CommonJS로 해석되고, flat config의 `export default`가 깨진다.

- [ ] **Step 6: 옛 설정을 지우고 스크립트를 교체한다**

```bash
cd ~/Documents/develop/devlog-api
rm .eslintrc.js
```

`devlog-api/package.json`의 `scripts`에서 `lint`를 바꾸고 형식 검사 스크립트를 추가한다:

```jsonc
{
  "scripts": {
    // 변경 전: "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"test/**/*.ts\""
    // ... 나머지 스크립트는 그대로 둔다
  }
}
```

flat config에서는 대상 파일을 CLI glob이 아니라 설정 파일의 `files`/`ignores`로 정하는 것이 정석이다. 기존처럼 glob을 넘기면 `ignores`가 무시되어 Prisma 생성 코드가 다시 딸려 들어온다.

`--fix`를 `lint`에서 떼어낸 것도 의도적이다. `lint`가 코드를 조용히 고치면 CI와 로컬 결과가 갈린다.

- [ ] **Step 7: ESLint가 크래시 없이 뜨는지 확인한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm exec eslint --print-config src/app.controller.ts > /tmp/devlog-eslint-config.json; echo "exit=$?"
node -e "const c=require('/tmp/devlog-eslint-config.json'); console.log('활성 규칙 수:', Object.keys(c.rules).length)"
```

Expected: `exit=0`, 활성 규칙 수가 0보다 크다.

이 단계는 **린트 위반과 설정 오류를 분리**한다. `--print-config`는 파일을 검사하지 않고 설정 조립만 하므로, 여기서 실패하면 원인은 설정이지 코드가 아니다.

- [ ] **Step 8: 커밋 (위반 해소 전)**

```bash
cd ~/Documents/develop/devlog-api
git add -A
git commit -m "$(cat <<'EOF'
chore: ESLint 8 → 10 flat config 마이그레이션

.eslintrc.js를 삭제하고 @devbak/eslint-config-nest를 link:로 참조하는
eslint.config.mjs를 도입했다. eslint-plugin-prettier와 perfectionist는
포맷 관심사이므로 ESLint에서 분리했다.

Prisma 생성 코드를 전역 ignores에 넣었다. 타입 인식이 켜져 있어
제외하지 않으면 린트가 끝나지 않는다.

위반 해소는 다음 커밋에서 한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `devlog-api` 위반 전수 분류 및 해소

**Files:**
- Modify: `devlog-api/src/**` (분류 결과에 따라)
- Modify: `devlog-api/eslint.config.mjs` (분류 (c)에 해당하는 경우만)
- Create: `eslint/.superpowers/devlog-violations.md` (분류 기록. 툴킷 저장소의 스크래치 디렉토리이며 커밋하지 않는다)

**Interfaces:**
- Consumes: Task 3의 `eslint.config.mjs`
- Produces: 위반 분류 결과. Task 10의 work-log 기록과 `eslint-config-nest` 픽스처 보강에 쓰인다.

이 태스크는 **탐색적이다.** 위반의 개수와 종류를 미리 알 수 없으므로, 계획이 규정하는 것은 결과가 아니라 **판정 절차**다.

- [ ] **Step 1: 위반을 기계가 읽을 수 있는 형태로 뽑는다**

```bash
cd ~/Documents/develop/devlog-api
pnpm exec eslint . -f json > /tmp/devlog-violations.json 2>/dev/null
node -e "
const r = require('/tmp/devlog-violations.json');
const byRule = {};
for (const f of r) for (const m of f.messages) {
  const k = m.ruleId ?? '(fatal)';
  byRule[k] = (byRule[k] ?? 0) + 1;
}
const rows = Object.entries(byRule).sort((a,b) => b[1]-a[1]);
console.log('총 위반:', rows.reduce((s,[,n])=>s+n,0));
for (const [rule, n] of rows) console.log(String(n).padStart(5), rule);
"
```

`(fatal)`이 하나라도 나오면 **즉시 멈춘다.** fatal은 린트 위반이 아니라 파싱·설정 오류이며, Task 3으로 돌아가야 한다.

- [ ] **Step 2: 규칙별로 세 갈래로 판정한다**

각 규칙에 대해 대표 위반을 실제로 열어보고 판정한다.

| 판정 | 뜻 | 조치 |
| --- | --- | --- |
| (a) 실제 결함 | 코드가 진짜 잘못됐다 | 코드를 고친다 |
| (b) Nest 관용구 오탐 | 프레임워크 관용구를 잘못 지적했다 | `eslint-config-nest`를 고치고 픽스처에 회귀 테스트를 추가한다 (Task 9) |
| (c) 프로젝트 고유 사정 | 이 프로젝트만의 사정이다 | `devlog-api/eslint.config.mjs`에서 로컬 완화. **공유 설정을 건드리지 않는다** |

**예상되는 주요 규칙과 판정 지침** (실측 근거 있음):

- **`@typescript-eslint/no-explicit-any`** — 기존 `.eslintrc.js`가 이 규칙을 `off`로 꺼두었으므로 다수 발생이 확실하다. 대부분 **(a)**다. 타입을 붙일 수 있으면 붙이고, 외부 라이브러리 경계처럼 불가피한 곳만 `unknown` + 좁히기로 바꾼다. 건수가 과하게 많아 한 태스크에 담을 수 없으면 **(c)로 `warn` 강등** 후 별도 후속 작업으로 넘기고 work-log에 남긴다.
- **`@typescript-eslint/no-floating-promises`** — `eslint-config-nest` 설계가 "이 패키지의 존재 이유"로 지목한 규칙이다. 발화하면 거의 전부 **(a)**이며 실제 버그일 가능성이 높다. `await`를 붙이거나, 의도적 fire-and-forget이면 `void` 연산자를 명시한다. **몇 건이 나왔는지 반드시 기록한다** — Phase 1의 가장 흥미로운 지표다.
- **`@typescript-eslint/no-unsafe-*` 계열** — `eslint-config-nest` 설계 4.2절이 "픽스처가 노출하지 못해 미시험으로 남는다"고 명시한 위험군이다. `@Body()` DTO 경로에서 나올 가능성이 높다. 여기서 처음 실체가 드러나므로 **(a)/(b) 판정을 특히 신중히** 하고 결과를 그 문서에 피드백한다.
- **`@typescript-eslint/require-await`** — 구현이 아직 동기인 `async` 핸들러에서 난다. Nest 관용구가 아니라 실제 불필요한 `async`이므로 보통 **(a)**다.

- [ ] **Step 3: 분류 결과를 기록한다**

`eslint/.superpowers/devlog-violations.md` 에 다음 형식으로 적는다. 이 디렉토리는 저장소의 ESLint·oxlint 무시 목록에 이미 들어 있고 커밋하지 않는다.

```markdown
# devlog-api 위반 분류 (2026-07-31)

총 N건.

| 규칙 | 건수 | 판정 | 조치 |
| --- | --- | --- | --- |
| @typescript-eslint/no-explicit-any | 00 | (a) | 타입 명시 |
| @typescript-eslint/no-floating-promises | 00 | (a) | await 추가 |

## (b)로 판정한 항목 — eslint-config-nest에 반영 필요
(없으면 "없음"이라고 적는다)

## (c)로 판정한 항목 — 로컬 완화
(없으면 "없음"이라고 적는다)
```

- [ ] **Step 4: (a)를 고친다**

판정 결과에 따라 소스를 수정한다. 수정할 때마다 해당 규칙만 다시 돌려 확인한다:

```bash
cd ~/Documents/develop/devlog-api
pnpm exec eslint . --rule '{"@typescript-eslint/no-floating-promises":"error"}' --no-eslintrc 2>/dev/null || \
  pnpm exec eslint .
```

- [ ] **Step 5: (c)를 로컬 완화한다** (해당 항목이 있는 경우만)

`devlog-api/eslint.config.mjs`의 `...nest` **뒤에** 완화 객체를 추가한다. 앞에 두면 상류 설정이 덮어써서 효과가 없다:

```js
import nest from '@devbak/eslint-config-nest';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'src/database/generated/**'],
  },

  ...nest,

  {
    // 프로젝트 고유 완화. 각 항목에 이유를 반드시 적는다.
    // 이유를 적을 수 없으면 그것은 (c)가 아니라 (a)다.
    name: 'devlog-api/local',
    files: ['**/*.ts'],
    rules: {
      // 예시 — 실제 판정 결과로 대체한다
    },
  },
];
```

- [ ] **Step 6: 전체 게이트를 통과시킨다**

```bash
cd ~/Documents/develop/devlog-api
pnpm lint; echo "lint exit=$?"
pnpm exec tsc --noEmit; echo "tsc exit=$?"
pnpm test 2>&1 | tail -5
pnpm build; echo "build exit=$?"
```

Expected: `lint`·`tsc`·`build` 전부 exit 0. 테스트 통과 수가 Task 3 Step 2에서 기록한 값과 **같거나 많다.**

- [ ] **Step 7: 커밋**

```bash
cd ~/Documents/develop/devlog-api
git add -A
git commit -m "$(cat <<'EOF'
fix: ESLint 10 마이그레이션으로 드러난 위반 해소

no-explicit-any는 기존 설정이 꺼두었던 규칙이고, no-floating-promises는
타입 체커가 잡지 못하는 await 누락을 잡았다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `@devbak/tsconfig` 패키지 생성 및 `devlog-api` 적용

**Files:**
- Create: `eslint/packages/tsconfig/package.json`
- Create: `eslint/packages/tsconfig/nest.json`
- Create: `eslint/packages/tsconfig/README.md`
- Test: `eslint/packages/tsconfig/tests/config.test.ts`
- Create: `eslint/packages/tsconfig/tests/tsconfig.json`
- Modify: `devlog-api/tsconfig.json`
- Modify: `devlog-api/package.json`

**Interfaces:**
- Consumes: 없음 (독립 패키지)
- Produces: `@devbak/tsconfig/nest.json`. 소비자는 `"extends": "@devbak/tsconfig/nest.json"`으로 참조하고, **경로성 옵션(`outDir`, `baseUrl`)과 엄격도 옵션은 로컬에 남긴다.**

**이 태스크의 핵심 제약 두 가지.**

1. **`outDir`·`baseUrl`을 공유 파일에 넣으면 안 된다.** TypeScript는 `extends`된 설정의 상대 경로를 **그 경로가 선언된 파일 위치 기준**으로 해석한다. 공유 파일에 `"outDir": "./dist"`를 넣으면 `node_modules/@devbak/tsconfig/dist`를 가리키게 된다.
2. **엄격도 옵션을 넣으면 안 된다.** 실측 결과 `devlog-api`는 `strict: true`인데 `account-api`·`eungam-api`는 `strictNullChecks`·`noImplicitAny`·`strictBindCallApply`가 전부 `false`다. 공유 파일에 `strict`를 넣으면 두 프로젝트에 타입 에러가 쏟아지고, 그것을 고치는 일은 Phase 1의 범위가 아니다.

따라서 공유하는 것은 **세 프로젝트가 글자 그대로 일치하는 부분집합뿐**이다.

- [ ] **Step 1: 실패하는 테스트와 테스트용 TS 프로젝트를 쓴다**

`eslint/packages/tsconfig/tests/tsconfig.json` — Task 1과 내용이 같다. 빠뜨리면 Step 5의 `pnpm lint`가 실패한다:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["."]
}
```

`eslint/packages/tsconfig/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import nest from '../nest.json';

describe('@devbak/tsconfig/nest.json', () => {
  it('세 프로젝트가 일치하는 옵션만 담는다', () => {
    expect(nest.compilerOptions).toEqual({
      module: 'commonjs',
      declaration: true,
      removeComments: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      allowSyntheticDefaultImports: true,
      target: 'ES2021',
      sourceMap: true,
      incremental: true,
      skipLibCheck: true,
    });
  });

  it('상대 경로 옵션을 담지 않는다', () => {
    // extends된 설정의 상대 경로는 선언된 파일 위치 기준으로 해석되므로,
    // 여기에 두면 node_modules 안을 가리키게 된다.
    expect(nest.compilerOptions).not.toHaveProperty('outDir');
    expect(nest.compilerOptions).not.toHaveProperty('baseUrl');
    expect(nest.compilerOptions).not.toHaveProperty('rootDir');
    expect(nest.compilerOptions).not.toHaveProperty('paths');
  });

  it('엄격도 옵션을 담지 않는다', () => {
    // devlog-api는 strict:true, account/eungam은 개별 옵션이 false다.
    // 공유 파일이 엄격도를 정하면 두 프로젝트가 깨진다.
    for (const key of [
      'strict',
      'strictNullChecks',
      'noImplicitAny',
      'strictBindCallApply',
      'forceConsistentCasingInFileNames',
      'noFallthroughCasesInSwitch',
    ]) {
      expect(nest.compilerOptions).not.toHaveProperty(key);
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd ~/Documents/develop/eslint && pnpm vitest run packages/tsconfig`
Expected: FAIL — `Cannot find module '../nest.json'`

- [ ] **Step 3: 패키지 파일을 만든다**

`eslint/packages/tsconfig/nest.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "incremental": true,
    "skipLibCheck": true
  }
}
```

`eslint/packages/tsconfig/package.json`:

```json
{
  "name": "@devbak/tsconfig",
  "version": "0.1.0",
  "description": "개인 프로젝트 공용 tsconfig 베이스 (빌드 없음)",
  "license": "MIT",
  "keywords": [
    "tsconfig",
    "typescript",
    "nestjs"
  ],
  "files": [
    "nest.json"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

`main`·`exports`를 두지 않는다. `extends`는 파일 경로로 해석되므로 필요 없고, `exports`를 잘못 쓰면 오히려 서브패스 접근이 막힌다.

`eslint/packages/tsconfig/README.md`:

````markdown
# @devbak/tsconfig

개인 프로젝트 공용 tsconfig 베이스. **빌드가 없다.**

## 사용법

```jsonc
// 소비자 tsconfig.json
{
  "extends": "@devbak/tsconfig/nest.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": "./",
    "strict": true
  }
}
```

```jsonc
// 소비자 package.json
{
  "devDependencies": {
    "@devbak/tsconfig": "link:../eslint/packages/tsconfig"
  }
}
```

## 로컬에 반드시 남겨야 하는 것

**경로성 옵션** — `outDir`, `baseUrl`, `rootDir`, `paths`.
TypeScript는 `extends`된 설정의 상대 경로를 **그 경로가 선언된 파일 위치 기준**으로 해석한다. 공유 파일에 `"outDir": "./dist"`를 두면 `node_modules/@devbak/tsconfig/dist`를 가리킨다.

**엄격도 옵션** — `strict` 및 개별 `strict*` 플래그.
프로젝트마다 엄격도가 다르고, 공유 파일이 이를 정하면 느슨한 프로젝트가 한꺼번에 깨진다. 각자의 속도로 조이도록 로컬에 남긴다.

## 담은 값

NestJS 프로젝트 3개(`devlog-api`, `account-api`, `eungam-api`)의 `tsconfig.json`이 **글자 그대로 일치하는 부분집합**이다. 추측으로 넣은 옵션은 없다.

## 새 프리셋을 추가할 때

`next.json`·`lib.json`은 아직 없다. 실제로 반복되는 것을 확인한 뒤에 만든다 — 소비자 없이 만든 설정은 예외 없이 현실과 어긋난다.
````

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd ~/Documents/develop/eslint && pnpm vitest run packages/tsconfig`
Expected: PASS (3 tests)

- [ ] **Step 5: 툴킷 게이트 + 커밋**

```bash
cd ~/Documents/develop/eslint
pnpm lint && pnpm test && pnpm build
git add packages/tsconfig
git commit -m "$(cat <<'EOF'
feat: @devbak/tsconfig 패키지 추가

NestJS 3개 프로젝트의 tsconfig가 글자 그대로 일치하는 부분집합만 담았다.
경로성 옵션(outDir/baseUrl)은 extends 시 선언 파일 기준으로 해석되므로
제외했고, 엄격도는 프로젝트마다 달라 제외했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: `devlog-api`의 해석 결과 기준선을 뜬다**

```bash
cd ~/Documents/develop/devlog-api
pnpm exec tsc --showConfig > /tmp/devlog-tsconfig-before.json
```

`--showConfig`는 `extends` 병합과 기본값 적용을 모두 마친 **최종 해석 결과**를 출력한다. 이것이 이 태스크의 회귀 테스트 기준이다.

- [ ] **Step 7: `devlog-api`를 공유 베이스로 전환한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm add -D "@devbak/tsconfig@link:../eslint/packages/tsconfig"
```

`devlog-api/tsconfig.json` 전체를 다음으로 교체한다:

```json
{
  "extends": "@devbak/tsconfig/nest.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": "./",
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 8: 해석 결과가 동일한지 검증한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm exec tsc --showConfig > /tmp/devlog-tsconfig-after.json
diff <(node -e "const c=require('/tmp/devlog-tsconfig-before.json');console.log(JSON.stringify(c.compilerOptions,Object.keys(c.compilerOptions).sort(),2))") \
     <(node -e "const c=require('/tmp/devlog-tsconfig-after.json');console.log(JSON.stringify(c.compilerOptions,Object.keys(c.compilerOptions).sort(),2))")
echo "diff exit=$?"
```

Expected: `diff exit=0` — 출력 없음.

차이가 나오면 공유 파일이나 로컬 파일에서 빠진 옵션이 있는 것이다. **차이를 없앤 뒤 진행한다.** 여기서 넘어가면 컴파일 동작이 조용히 바뀐다.

- [ ] **Step 9: 실제 컴파일과 린트를 확인한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm exec tsc --noEmit; echo "tsc exit=$?"
pnpm lint; echo "lint exit=$?"
pnpm build; echo "build exit=$?"
```

Expected: 전부 exit 0. `lint`도 확인해야 하는 이유는 `eslint-config-nest`가 `projectService`로 이 tsconfig를 읽기 때문이다.

- [ ] **Step 10: 커밋**

```bash
cd ~/Documents/develop/devlog-api
git add -A
git commit -m "$(cat <<'EOF'
chore: tsconfig를 @devbak/tsconfig/nest.json 기반으로 교체

tsc --showConfig 결과가 교체 전후로 동일함을 확인했다. 경로성 옵션과
엄격도는 로컬에 남겨 해석 결과가 바뀌지 않도록 했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `@devbak/jest-config` 패키지 생성 및 `devlog-api` 적용

**Files:**
- Create: `eslint/packages/jest-config/package.json`
- Create: `eslint/packages/jest-config/nest/jest-preset.json`
- Create: `eslint/packages/jest-config/nest-e2e/jest-preset.json`
- Create: `eslint/packages/jest-config/README.md`
- Test: `eslint/packages/jest-config/tests/config.test.ts`
- Create: `eslint/packages/jest-config/tests/tsconfig.json`
- Modify: `devlog-api/package.json`
- Modify: `devlog-api/test/jest-e2e.json`

**Interfaces:**
- Consumes: 없음 (독립 패키지)
- Produces: `@devbak/jest-config/nest` 와 `@devbak/jest-config/nest-e2e`. Jest는 `preset` 문자열 뒤에 `/jest-preset.json`을 붙여 찾으므로 **디렉토리마다 그 이름의 파일이 있어야 한다.**

`rootDir`와 `coverageDirectory`는 프리셋에 넣지 않는다. Task 5와 같은 이유 — 경로가 설정 파일 위치 기준으로 해석되어 `node_modules` 안을 가리키게 된다.

- [ ] **Step 1: 실패하는 테스트와 테스트용 TS 프로젝트를 쓴다**

`eslint/packages/jest-config/tests/tsconfig.json` — Task 1·5와 내용이 같다. 빠뜨리면 Step 5의 `pnpm lint`가 실패한다:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false,
    "resolveJsonModule": true
  },
  "include": ["."]
}
```

`eslint/packages/jest-config/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import unit from '../nest/jest-preset.json';
import e2e from '../nest-e2e/jest-preset.json';

describe('@devbak/jest-config', () => {
  it('유닛 프리셋이 세 프로젝트 공통값을 담는다', () => {
    expect(unit).toEqual({
      moduleFileExtensions: ['js', 'json', 'ts'],
      testRegex: '.*\\.spec\\.ts$',
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      collectCoverageFrom: ['**/*.(t|j)s'],
      testEnvironment: 'node',
    });
  });

  it('e2e 프리셋이 세 프로젝트 공통값을 담는다', () => {
    expect(e2e).toEqual({
      moduleFileExtensions: ['js', 'json', 'ts'],
      testRegex: '.e2e-spec.ts$',
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      testEnvironment: 'node',
    });
  });

  it('경로에 의존하는 옵션을 담지 않는다', () => {
    // rootDir·coverageDirectory는 설정 파일 위치 기준으로 해석되므로
    // 프리셋에 두면 node_modules 안을 가리킨다.
    for (const preset of [unit, e2e]) {
      expect(preset).not.toHaveProperty('rootDir');
      expect(preset).not.toHaveProperty('coverageDirectory');
      expect(preset).not.toHaveProperty('moduleNameMapper');
      expect(preset).not.toHaveProperty('setupFiles');
    }
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd ~/Documents/develop/eslint && pnpm vitest run packages/jest-config`
Expected: FAIL — `Cannot find module '../nest/jest-preset.json'`

- [ ] **Step 3: 패키지 파일을 만든다**

`eslint/packages/jest-config/nest/jest-preset.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "testRegex": ".*\\.spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "testEnvironment": "node"
}
```

`eslint/packages/jest-config/nest-e2e/jest-preset.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "testEnvironment": "node"
}
```

`eslint/packages/jest-config/package.json`:

```json
{
  "name": "@devbak/jest-config",
  "version": "0.1.0",
  "description": "NestJS 프로젝트용 Jest 프리셋 (빌드 없음)",
  "license": "MIT",
  "keywords": [
    "jest",
    "jest-preset",
    "nestjs",
    "ts-jest"
  ],
  "files": [
    "nest",
    "nest-e2e"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

`eslint/packages/jest-config/README.md`:

````markdown
# @devbak/jest-config

NestJS 프로젝트용 Jest 프리셋. **빌드가 없다.**

## 사용법

```jsonc
// 소비자 package.json
{
  "jest": {
    "preset": "@devbak/jest-config/nest",
    "rootDir": "src",
    "coverageDirectory": "../coverage"
  },
  "devDependencies": {
    "@devbak/jest-config": "link:../eslint/packages/jest-config"
  }
}
```

```jsonc
// 소비자 test/jest-e2e.json
{
  "preset": "@devbak/jest-config/nest-e2e",
  "rootDir": "."
}
```

`ts-jest`는 소비자가 직접 설치해야 한다. 프리셋은 `transform`에서 이름으로만 참조한다.

## 로컬에 반드시 남겨야 하는 것

`rootDir`, `coverageDirectory`, `moduleNameMapper`, `setupFiles`.
전부 경로에 의존하며 설정 파일 위치를 기준으로 해석되므로, 프리셋에 두면 `node_modules` 안을 가리킨다.

## 담은 값

NestJS 프로젝트 3개의 Jest 설정이 **일치하는 부분집합**이다. `devlog-api`의 e2e 설정에만 있는 `testTimeout`·`moduleNameMapper`는 그 프로젝트 로컬에 남겼다.
````

- [ ] **Step 4: 테스트 통과를 확인한다**

Run: `cd ~/Documents/develop/eslint && pnpm vitest run packages/jest-config`
Expected: PASS (3 tests)

- [ ] **Step 5: 툴킷 게이트 + 커밋**

```bash
cd ~/Documents/develop/eslint
pnpm lint && pnpm test && pnpm build
git add packages/jest-config
git commit -m "$(cat <<'EOF'
feat: @devbak/jest-config 패키지 추가

NestJS 3개 프로젝트의 jest 설정 중 일치하는 부분집합을 프리셋으로 뽑았다.
경로 의존 옵션(rootDir/coverageDirectory/moduleNameMapper)은 설정 파일
위치 기준으로 해석되므로 프리셋에서 제외했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: `devlog-api`의 테스트 기준선을 기록한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm test 2>&1 | tail -5 | tee /tmp/devlog-jest-before.txt
```

통과 테스트 수를 기록한다.

- [ ] **Step 7: `devlog-api`를 프리셋으로 전환한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm add -D "@devbak/jest-config@link:../eslint/packages/jest-config"
```

`devlog-api/package.json`의 `jest` 블록 전체를 다음으로 교체한다:

```json
{
  "jest": {
    "preset": "@devbak/jest-config/nest",
    "rootDir": "src",
    "coverageDirectory": "../coverage"
  }
}
```

`devlog-api/test/jest-e2e.json` 전체를 다음으로 교체한다:

```json
{
  "preset": "@devbak/jest-config/nest-e2e",
  "rootDir": ".",
  "testTimeout": 30000,
  "moduleNameMapper": {
    "^src/(.*)$": "<rootDir>/../src/$1"
  },
  "setupFiles": []
}
```

- [ ] **Step 8: 유닛 테스트가 동일하게 도는지 확인한다**

```bash
cd ~/Documents/develop/devlog-api
pnpm test 2>&1 | tail -5
```

Expected: 통과 수가 Step 6과 **동일하다.**

수가 줄었다면 `testRegex`가 다르게 적용된 것이다. 프리셋 해석 실패 시 Jest는 조용히 기본값으로 도는 것이 아니라 에러를 내지만, `rootDir` 병합이 어긋나면 테스트가 0개로 잡힐 수 있으므로 반드시 수를 비교한다.

- [ ] **Step 9: e2e 설정이 로드되는지 확인한다 (Docker 없이)**

```bash
cd ~/Documents/develop/devlog-api
pnpm exec jest --config ./test/jest-e2e.json --listTests; echo "exit=$?"
```

Expected: `exit=0`, e2e 스펙 파일 경로들이 출력된다.

`--listTests`는 테스트를 **실행하지 않고** 설정 해석과 파일 탐색만 한다. `pretest:e2e`가 docker compose를 띄우므로 실제 e2e 실행은 이 태스크의 범위가 아니다.

- [ ] **Step 10: 커밋**

```bash
cd ~/Documents/develop/devlog-api
git add -A
git commit -m "$(cat <<'EOF'
chore: jest 설정을 @devbak/jest-config 프리셋으로 교체

유닛 테스트 통과 수가 교체 전후로 동일하고, e2e 설정도 --listTests로
로드를 확인했다. 경로 의존 옵션은 로컬에 남겼다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `account-api` 전체 적용

**Files:**
- Delete: `account-api/.eslintrc.js`, `account-api/.prettierrc`
- Create: `account-api/eslint.config.mjs`
- Modify: `account-api/package.json`, `account-api/tsconfig.json`, `account-api/test/jest-e2e.json`

**Interfaces:**
- Consumes: Task 1·5·6의 세 설정 패키지와 기존 `@devbak/eslint-config-nest`
- Produces: 없음 (최종 소비자)

`devlog-api`와 다른 점이 셋 있다. **`zod`가 설치돼 있지 않고**(필수 peer이므로 새로 설치해야 한다), **Prisma 생성 코드가 없으며**, **tsconfig 엄격도가 느슨하다**(`strictNullChecks: false` 등).

- [ ] **Step 1: 툴킷을 빌드하고 브랜치를 만든다**

```bash
cd ~/Documents/develop/eslint && pnpm build
cd ~/Documents/develop/account-api
git checkout -b feature/devkit-adoption
```

- [ ] **Step 2: 기준선을 기록한다**

```bash
cd ~/Documents/develop/account-api
pnpm prettier --check "src/**/*.ts"; echo "prettier exit=$?"
pnpm exec tsc --showConfig > /tmp/account-tsconfig-before.json
pnpm test 2>&1 | tail -5 | tee /tmp/account-jest-before.txt
```

`prettier --check`가 실패하면 먼저 `pnpm prettier --write "src/**/*.ts"`로 맞추고 별도 커밋한다.

- [ ] **Step 3: 의존성을 교체한다**

```bash
cd ~/Documents/develop/account-api
pnpm remove eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  eslint-config-prettier eslint-plugin-prettier eslint-plugin-perfectionist
pnpm add -D eslint@^10.8.0 typescript-eslint@^8.65.0 eslint-plugin-zod@^4.9.0 zod@^4.4.3
pnpm add -D "@devbak/eslint-config-nest@link:../eslint/packages/eslint-config-nest"
pnpm add -D "@devbak/prettier-config@link:../eslint/packages/prettier-config"
pnpm add -D "@devbak/tsconfig@link:../eslint/packages/tsconfig"
pnpm add -D "@devbak/jest-config@link:../eslint/packages/jest-config"
```

`zod`를 새로 설치한다. `eslint-config-nest`의 필수 peer 4개 중 하나이며 이 프로젝트에는 없었다. 런타임에서 zod를 쓰지 않더라도 린트 설정이 요구하므로 devDependency로 넣는다.

- [ ] **Step 4: peer 해석을 확인한다**

```bash
cd ~/Documents/develop/account-api
node -e "['eslint','typescript-eslint','eslint-plugin-zod','zod'].forEach(m=>console.log(m, require.resolve(m)))"
ls -l node_modules/@devbak/
```

Expected: 4개 모듈 경로가 출력되고, `@devbak/` 아래 4개 심볼릭 링크가 보인다.

- [ ] **Step 5: 설정 파일을 교체한다**

```bash
cd ~/Documents/develop/account-api
rm .eslintrc.js .prettierrc
```

`account-api/eslint.config.mjs` 를 만든다:

```js
import nest from '@devbak/eslint-config-nest';

export default [
  {
    // 전역 무시. 이 객체는 배열 맨 앞에 두고 ignores만 담는다.
    ignores: ['dist/**', 'coverage/**'],
  },

  ...nest,
];
```

`account-api/tsconfig.json` 전체를 교체한다:

```json
{
  "extends": "@devbak/tsconfig/nest.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": "./",
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

느슨한 엄격도를 **그대로 유지한다.** 조이는 것은 Phase 1의 범위가 아니며, 여기서 조이면 타입 에러 해소가 이 태스크에 딸려 들어와 범위가 터진다.

`account-api/package.json`에서 `prettier` 필드 추가, `jest` 블록 교체, `lint` 스크립트 교체:

```jsonc
{
  "prettier": "@devbak/prettier-config",
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"test/**/*.ts\""
  },
  "jest": {
    "preset": "@devbak/jest-config/nest",
    "rootDir": "src",
    "coverageDirectory": "../coverage"
  }
}
```

`account-api/test/jest-e2e.json` 전체를 교체한다:

```json
{
  "preset": "@devbak/jest-config/nest-e2e",
  "rootDir": "."
}
```

- [ ] **Step 6: 설정 해석이 이전과 동일한지 검증한다**

```bash
cd ~/Documents/develop/account-api
pnpm install
pnpm prettier --find-config-path src/main.ts
pnpm prettier --check "src/**/*.ts"; echo "prettier exit=$?"
pnpm exec tsc --showConfig > /tmp/account-tsconfig-after.json
diff <(node -e "const c=require('/tmp/account-tsconfig-before.json');console.log(JSON.stringify(c.compilerOptions,Object.keys(c.compilerOptions).sort(),2))") \
     <(node -e "const c=require('/tmp/account-tsconfig-after.json');console.log(JSON.stringify(c.compilerOptions,Object.keys(c.compilerOptions).sort(),2))")
echo "tsconfig diff exit=$?"
pnpm exec eslint --print-config src/main.ts > /dev/null; echo "eslint config exit=$?"
```

Expected: `prettier exit=0`, `tsconfig diff exit=0`, `eslint config exit=0`.

- [ ] **Step 7: 위반을 분류하고 해소한다**

```bash
cd ~/Documents/develop/account-api
pnpm exec eslint . -f json > /tmp/account-violations.json 2>/dev/null
node -e "
const r = require('/tmp/account-violations.json');
const byRule = {};
for (const f of r) for (const m of f.messages) {
  const k = m.ruleId ?? '(fatal)';
  byRule[k] = (byRule[k] ?? 0) + 1;
}
const rows = Object.entries(byRule).sort((a,b) => b[1]-a[1]);
console.log('총 위반:', rows.reduce((s,[,n])=>s+n,0));
for (const [rule, n] of rows) console.log(String(n).padStart(5), rule);
"
```

Task 4 Step 2의 (a)/(b)/(c) 판정 기준을 그대로 적용한다.

- (a) 실제 결함 → 코드를 고친다
- (b) Nest 관용구 오탐 → `eslint-config-nest` 수정 대상으로 기록 (Task 9에서 반영)
- (c) 프로젝트 고유 사정 → `account-api/eslint.config.mjs`의 `...nest` **뒤에** 완화 객체를 추가하고 이유를 주석으로 적는다

이 프로젝트는 tsconfig 엄격도가 느슨하므로 **`no-unsafe-*` 계열이 `devlog-api`보다 많이 나올 가능성이 높다.** `strictNullChecks: false`에서는 타입 정보의 정밀도가 떨어져 typescript-eslint의 타입 인식 규칙 판정이 달라진다. 건수가 감당 불가능하면 (c)로 해당 계열을 `warn` 강등하고 work-log에 사유와 함께 남긴다 — **`error`를 유지한 채 억지로 고치려 들지 않는다.**

`(fatal)`이 나오면 즉시 멈추고 Step 5로 돌아간다.

- [ ] **Step 8: 전체 게이트를 통과시킨다**

```bash
cd ~/Documents/develop/account-api
pnpm lint; echo "lint exit=$?"
pnpm exec tsc --noEmit; echo "tsc exit=$?"
pnpm test 2>&1 | tail -5
pnpm exec jest --config ./test/jest-e2e.json --listTests > /dev/null; echo "e2e config exit=$?"
pnpm build; echo "build exit=$?"
```

Expected: `lint`·`tsc`·`e2e config`·`build` 전부 exit 0. 유닛 테스트 통과 수가 Step 2 기준선과 동일하다.

- [ ] **Step 9: 커밋**

```bash
cd ~/Documents/develop/account-api
git add -A
git commit -m "$(cat <<'EOF'
chore: devkit 설정 패키지 도입 및 ESLint 10 마이그레이션

eslint-config-nest, prettier-config, tsconfig, jest-config를 link:로
연결했다. tsconfig 해석 결과와 prettier 포맷 결과가 교체 전후 동일하고
유닛 테스트 통과 수도 같다.

tsconfig 엄격도는 기존의 느슨한 설정을 그대로 유지했다. 조이는 것은
별도 작업이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `eungam-api` 전체 적용

**Files:**
- Delete: `eungam-api/.eslintrc.js`, `eungam-api/.prettierrc`
- Create: `eungam-api/eslint.config.mjs`
- Modify: `eungam-api/package.json`, `eungam-api/tsconfig.json`, `eungam-api/test/jest-e2e.json`

**Interfaces:**
- Consumes: Task 1·5·6의 세 설정 패키지와 기존 `@devbak/eslint-config-nest`
- Produces: 없음 (최종 소비자)

`account-api`와 설정이 동일하지만 **ORM이 TypeORM**이라 `*.entity.ts` 14개가 있다. 데코레이터 사용 패턴이 달라 `no-unsafe-*` 계열의 양상이 다를 수 있다.

- [ ] **Step 1: 툴킷을 빌드하고 브랜치를 만든다**

```bash
cd ~/Documents/develop/eslint && pnpm build
cd ~/Documents/develop/eungam-api
git checkout -b feature/devkit-adoption
```

- [ ] **Step 2: 기준선을 기록한다**

```bash
cd ~/Documents/develop/eungam-api
pnpm prettier --check "src/**/*.ts"; echo "prettier exit=$?"
pnpm exec tsc --showConfig > /tmp/eungam-tsconfig-before.json
pnpm test 2>&1 | tail -5 | tee /tmp/eungam-jest-before.txt
```

`prettier --check`가 실패하면 먼저 `pnpm prettier --write "src/**/*.ts"`로 맞추고 별도 커밋한다.

- [ ] **Step 3: 의존성을 교체한다**

```bash
cd ~/Documents/develop/eungam-api
pnpm remove eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  eslint-config-prettier eslint-plugin-prettier eslint-plugin-perfectionist
pnpm add -D eslint@^10.8.0 typescript-eslint@^8.65.0 eslint-plugin-zod@^4.9.0 zod@^4.4.3
pnpm add -D "@devbak/eslint-config-nest@link:../eslint/packages/eslint-config-nest"
pnpm add -D "@devbak/prettier-config@link:../eslint/packages/prettier-config"
pnpm add -D "@devbak/tsconfig@link:../eslint/packages/tsconfig"
pnpm add -D "@devbak/jest-config@link:../eslint/packages/jest-config"
```

- [ ] **Step 4: peer 해석을 확인한다**

```bash
cd ~/Documents/develop/eungam-api
node -e "['eslint','typescript-eslint','eslint-plugin-zod','zod'].forEach(m=>console.log(m, require.resolve(m)))"
ls -l node_modules/@devbak/
```

Expected: 4개 모듈 경로가 출력되고, `@devbak/` 아래 4개 심볼릭 링크가 보인다.

- [ ] **Step 5: 설정 파일을 교체한다**

```bash
cd ~/Documents/develop/eungam-api
rm .eslintrc.js .prettierrc
```

`eungam-api/eslint.config.mjs` 를 만든다:

```js
import nest from '@devbak/eslint-config-nest';

export default [
  {
    // 전역 무시. 이 객체는 배열 맨 앞에 두고 ignores만 담는다.
    ignores: ['dist/**', 'coverage/**'],
  },

  ...nest,
];
```

`eungam-api/tsconfig.json` 전체를 교체한다:

```json
{
  "extends": "@devbak/tsconfig/nest.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": "./",
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

`eungam-api/package.json`에서 `prettier` 필드 추가, `jest` 블록 교체, `lint` 스크립트 교체:

```jsonc
{
  "prettier": "@devbak/prettier-config",
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"test/**/*.ts\""
  },
  "jest": {
    "preset": "@devbak/jest-config/nest",
    "rootDir": "src",
    "coverageDirectory": "../coverage"
  }
}
```

`eungam-api/test/jest-e2e.json` 전체를 교체한다:

```json
{
  "preset": "@devbak/jest-config/nest-e2e",
  "rootDir": "."
}
```

- [ ] **Step 6: 설정 해석이 이전과 동일한지 검증한다**

```bash
cd ~/Documents/develop/eungam-api
pnpm install
pnpm prettier --find-config-path src/main.ts
pnpm prettier --check "src/**/*.ts"; echo "prettier exit=$?"
pnpm exec tsc --showConfig > /tmp/eungam-tsconfig-after.json
diff <(node -e "const c=require('/tmp/eungam-tsconfig-before.json');console.log(JSON.stringify(c.compilerOptions,Object.keys(c.compilerOptions).sort(),2))") \
     <(node -e "const c=require('/tmp/eungam-tsconfig-after.json');console.log(JSON.stringify(c.compilerOptions,Object.keys(c.compilerOptions).sort(),2))")
echo "tsconfig diff exit=$?"
pnpm exec eslint --print-config src/main.ts > /dev/null; echo "eslint config exit=$?"
```

Expected: `prettier exit=0`, `tsconfig diff exit=0`, `eslint config exit=0`.

- [ ] **Step 7: 위반을 분류하고 해소한다**

```bash
cd ~/Documents/develop/eungam-api
pnpm exec eslint . -f json > /tmp/eungam-violations.json 2>/dev/null
node -e "
const r = require('/tmp/eungam-violations.json');
const byRule = {};
for (const f of r) for (const m of f.messages) {
  const k = m.ruleId ?? '(fatal)';
  byRule[k] = (byRule[k] ?? 0) + 1;
}
const rows = Object.entries(byRule).sort((a,b) => b[1]-a[1]);
console.log('총 위반:', rows.reduce((s,[,n])=>s+n,0));
for (const [rule, n] of rows) console.log(String(n).padStart(5), rule);
"
```

Task 4 Step 2의 (a)/(b)/(c) 판정 기준을 그대로 적용한다.

- (a) 실제 결함 → 코드를 고친다
- (b) Nest 관용구 오탐 → `eslint-config-nest` 수정 대상으로 기록 (Task 9에서 반영)
- (c) 프로젝트 고유 사정 → `eungam-api/eslint.config.mjs`의 `...nest` **뒤에** 완화 객체를 추가하고 이유를 주석으로 적는다

**TypeORM 엔티티에 주의한다.** `@Column()` 데코레이터가 붙은 프로퍼티는 초기화 없이 선언되는 것이 정상 관용구다(`@Column() name: string;`). `strictNullChecks`가 꺼져 있어 `strictPropertyInitialization`도 함께 꺼지므로 타입 에러는 나지 않지만, 린트 규칙이 이를 지적하면 그것은 **(b) 관용구 오탐**이다 — `devlog-api`(Prisma)에는 없던 패턴이므로 `eslint-config-nest` 픽스처에 TypeORM 엔티티 케이스를 추가할 근거가 된다.

`(fatal)`이 나오면 즉시 멈추고 Step 5로 돌아간다.

- [ ] **Step 8: 전체 게이트를 통과시킨다**

```bash
cd ~/Documents/develop/eungam-api
pnpm lint; echo "lint exit=$?"
pnpm exec tsc --noEmit; echo "tsc exit=$?"
pnpm test 2>&1 | tail -5
pnpm exec jest --config ./test/jest-e2e.json --listTests > /dev/null; echo "e2e config exit=$?"
pnpm build; echo "build exit=$?"
```

Expected: `lint`·`tsc`·`e2e config`·`build` 전부 exit 0. 유닛 테스트 통과 수가 Step 2 기준선과 동일하다.

- [ ] **Step 9: 커밋**

```bash
cd ~/Documents/develop/eungam-api
git add -A
git commit -m "$(cat <<'EOF'
chore: devkit 설정 패키지 도입 및 ESLint 10 마이그레이션

eslint-config-nest, prettier-config, tsconfig, jest-config를 link:로
연결했다. tsconfig 해석 결과와 prettier 포맷 결과가 교체 전후 동일하고
유닛 테스트 통과 수도 같다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 툴킷 매니페스트 정렬 및 (b) 판정 반영

**Files:**
- Modify: `eslint/packages/eslint-plugin-fsd/package.json`
- Modify: `eslint/packages/eslint-plugin-fsd/README.md`
- Modify: `eslint/packages/eslint-config-nest/src/index.ts` (Task 4·7·8에서 (b) 판정이 나온 경우만)
- Modify: `eslint/packages/eslint-config-nest/tests/fixtures/nest-app/src/idioms.ts` (동상)

**Interfaces:**
- Consumes: Task 4·7·8의 (b) 판정 목록
- Produces: 없음 (마무리)

- [ ] **Step 1: `eslint-plugin-fsd`의 peer 범위를 좁힌다**

`eslint/packages/eslint-plugin-fsd/package.json`의 `peerDependencies.eslint`를 `"^9.0.0 || ^10.0.0"` 에서 `"^10.0.0"` 으로 바꾼다.

v9는 한 번도 검증한 적이 없고, 검증할 계획도 없다(배포하지 않으므로 CI 매트릭스가 불필요하다). 지원하지 않는 버전을 지원한다고 선언하지 않는 것이 정직하며, `eslint-config-nest`의 선례와도 맞는다.

- [ ] **Step 2: 비어 있는 메타데이터를 채운다**

같은 파일에 `description`·`license`·`keywords`·`engines`를 추가한다. `eslint-config-nest`와 형식을 맞춘다:

```jsonc
{
  "name": "@devbak/eslint-plugin-fsd",
  "version": "0.1.0",
  "description": "Feature-Sliced Design 레이어 경계를 강제하는 ESLint 플러그인 (ESLint 10 flat config 전용)",
  "license": "MIT",
  "keywords": [
    "eslint",
    "eslint-plugin",
    "feature-sliced-design",
    "fsd",
    "architecture"
  ],
  "engines": {
    "node": "^20.19.0 || ^22.13.0 || >=24"
  }
  // ... 나머지 기존 필드 유지
}
```

`repository`는 넣지 않는다. 배포하지 않으므로 레지스트리 링크가 필요 없고, 저장소 이름 변경이 미결 사항으로 남아 있어(설계 7절) 지금 박으면 곧 틀린 값이 된다.

- [ ] **Step 3: README에서 v9 지원 표기를 지운다**

`eslint/packages/eslint-plugin-fsd/README.md`에서 "ESLint v9/v10 flat config" 형태의 표기를 찾아 **v10 전용**으로 바꾼다.

```bash
cd ~/Documents/develop/eslint
grep -n "v9\|9\.0\.0\|ESLint 9" packages/eslint-plugin-fsd/README.md
```

검색 결과에 나온 각 줄을 v10 전용 서술로 고친다.

- [ ] **Step 4: (b) 판정을 `eslint-config-nest`에 반영한다**

Task 4·7·8에서 (b)로 판정된 항목이 **있는 경우에만** 수행한다. 없으면 이 단계를 건너뛰고 그 사실을 work-log에 적는다.

각 항목마다 두 가지를 함께 한다.

1. `packages/eslint-config-nest/tests/fixtures/nest-app/src/idioms.ts` 에 해당 관용구를 재현하는 코드를 추가한다. **이것을 먼저 한다** — 픽스처가 관용구를 노출해야 회귀 테스트가 성립한다.
2. `packages/eslint-config-nest/src/index.ts` 의 `nest/test-idioms` 또는 새 config 객체에서 해당 규칙을 끄고, **어떤 Nest 관용구 때문인지 주석으로 남긴다.**

기존 코드가 세운 원칙을 그대로 따른다 — 규칙을 끄기 전에 "이 발화가 관용구 오탐인가, 아니면 픽스처 코드가 실제로 나쁜가"를 판단하고, 후자면 규칙이 아니라 코드를 고친다.

- [ ] **Step 5: 툴킷 전체 게이트**

```bash
cd ~/Documents/develop/eslint
pnpm lint; echo "lint exit=$?"
pnpm test; echo "test exit=$?"
pnpm build; echo "build exit=$?"
pnpm exec tsc --noEmit -p packages/eslint-plugin-fsd/tsconfig.json; echo "fsd tsc exit=$?"
pnpm exec tsc --noEmit -p packages/eslint-config-nest/tsconfig.json; echo "nest tsc exit=$?"
```

Expected: 전부 exit 0. 테스트 수는 기존 77 + Task 1의 2 + Task 5의 3 + Task 6의 3 = **85개 이상**(Step 4에서 회귀 테스트를 추가했다면 더 많다).

- [ ] **Step 6: 커밋**

```bash
cd ~/Documents/develop/eslint
git add -A
git commit -m "$(cat <<'EOF'
chore: eslint-plugin-fsd peer를 ESLint 10 전용으로 좁히고 메타데이터 보강

v9는 검증한 적이 없고 배포하지 않으므로 CI 매트릭스로 실체화할 계획도
없다. 지원하지 않는 버전을 선언하지 않는 쪽이 정직하다.

description·license·keywords·engines를 eslint-config-nest와 같은 형식으로
채웠다. repository는 저장소 이름 변경이 미결이라 넣지 않았다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 최종 검증 및 기록

**Files:**
- Modify: `eslint/work-log.md`
- Modify: `~/.claude/projects/-Users-dabot-Documents-develop/memory/devkit-roadmap.md`

**Interfaces:**
- Consumes: Task 1~9 전부
- Produces: Phase 1 완료 기록

- [ ] **Step 1: `dist` 삭제 후 재빌드 검증**

설계 4.7절의 완료 기준 중 가장 중요한 항목이다. `link:` 배선이 우연히 캐시된 산출물에 기대고 있지 않은지 확인하는 유일한 방법이다.

```bash
cd ~/Documents/develop/eslint
rm -rf packages/*/dist
cd ~/Documents/develop/devlog-api && pnpm lint 2>&1 | tail -3; echo "빌드 전 devlog lint exit=$?"
```

Expected: **실패한다.** `@devbak/eslint-config-nest`의 `dist/index.js`가 없으므로 모듈 해석에 실패해야 한다.

여기서 성공하면 이상 신호다 — 어딘가에 낡은 복사본이 남아 있다는 뜻이므로 `node_modules`를 확인한다.

- [ ] **Step 2: 재빌드 후 3개 프로젝트가 전부 살아나는지 확인한다**

```bash
cd ~/Documents/develop/eslint && pnpm build
for p in devlog-api account-api eungam-api; do
  cd ~/Documents/develop/$p
  echo "===== $p ====="
  pnpm lint > /dev/null 2>&1; echo "  lint exit=$?"
  pnpm exec tsc --noEmit > /dev/null 2>&1; echo "  tsc exit=$?"
  pnpm build > /dev/null 2>&1; echo "  build exit=$?"
done
```

Expected: 9개 exit code가 전부 0.

- [ ] **Step 3: 미사용 패키지가 없는지 확인한다**

설계 4.7절의 "선언만 하고 미사용인 패키지가 없을 것" 기준을 검증한다.

```bash
for p in devlog-api account-api eungam-api; do
  cd ~/Documents/develop/$p
  echo "===== $p ====="
  echo -n "  prettier 필드: "; node -e "console.log(require('./package.json').prettier ?? '❌ 없음')"
  echo -n "  tsconfig extends: "; node -e "console.log(require('./tsconfig.json').extends ?? '❌ 없음')"
  echo -n "  jest preset: "; node -e "console.log(require('./package.json').jest?.preset ?? '❌ 없음')"
  echo -n "  eslint.config.mjs: "; test -f eslint.config.mjs && echo "있음" || echo "❌ 없음"
  echo -n "  옛 설정 잔존: "; ls .eslintrc.js .prettierrc 2>/dev/null | tr '\n' ' '; echo
done
```

Expected: 3개 프로젝트 전부 4개 항목이 채워져 있고, 옛 설정 파일이 하나도 남아 있지 않다.

- [ ] **Step 4: work-log를 기록한다**

`eslint/work-log.md`의 `## 2026-07-31` 섹션 끝에 다음 형식으로 추가한다. **실제 측정값으로 채운다** — 아래는 형식 예시이며 `NN` 자리를 실제 숫자로 바꾼다.

```markdown
### Phase 1 완료 — 소비자 활성화
- **변경 파일**: `packages/{prettier-config,tsconfig,jest-config}/**`(신규), `packages/eslint-plugin-fsd/{package.json,README.md}`, 소비자 3개 저장소의 설정 파일
- **내용**: 완성됐지만 소비자가 0이던 `@devbak/eslint-config-nest`를 NestJS 3개 프로젝트에 실제로 적용하고, 반복 설정을 빌드 없는 JSON 패키지 3개로 추출했다.
  - **소비 방식**: npm 배포 없이 pnpm `link:` 프로토콜로 상대 경로 심볼릭 링크. `prettier-config`/`tsconfig`/`jest-config`는 JSON뿐이라 빌드가 없고, `dist` 최신성 문제를 겪지 않는다.
  - **회귀 검증 방식**: 설정 교체가 동작을 바꾸지 않았음을 세 가지로 증명했다 — `prettier --check` exit 0(링크 실패 시 기본값으로 떨어져 요란히 깨진다), `tsc --showConfig` 전후 diff 0, jest 통과 수 동일.
  - **추출에서 뺀 것**: `outDir`·`baseUrl`·`rootDir`·`coverageDirectory` 등 경로성 옵션은 `extends`/`preset` 시 선언 파일 위치 기준으로 해석되어 `node_modules` 안을 가리키므로 전부 로컬에 남겼다. tsconfig 엄격도도 뺐다 — `devlog-api`는 `strict: true`인데 나머지 둘은 `strictNullChecks`/`noImplicitAny`/`strictBindCallApply`가 꺼져 있어, 공유 파일이 엄격도를 정하면 두 프로젝트가 한꺼번에 깨진다.
  - **ESLint에서 뺀 것**: `eslint-plugin-prettier`·`eslint-config-prettier`(포맷은 `prettier --check`로 분리), `eslint-plugin-perfectionist`(import 정렬도 포맷 관심사).
  - **위반 분류 결과**: 총 NN건. (a) 실제 결함 NN건, (b) 관용구 오탐 NN건, (c) 프로젝트 고유 NN건. `no-floating-promises`가 NN건을 잡았다 — 타입 체커가 통과시키는 await 누락이다.
  - **`eslint-plugin-fsd` 정리**: peer `eslint`를 `^9.0.0 || ^10.0.0` → `^10.0.0`으로 좁혔다. v9는 검증한 적이 없고 배포하지 않아 CI 매트릭스로 실체화할 계획도 없으므로, 지원 주장을 철회하는 쪽이 정직하다. 비어 있던 `description`/`license`/`keywords`/`engines`도 채웠다.
- **검증**: 툴킷 `pnpm lint`·`pnpm test`(NN개)·`pnpm build` 통과. 소비자 3개 전부 `pnpm lint`·`tsc --noEmit`·`pnpm build` exit 0, 유닛 테스트 통과 수 마이그레이션 전과 동일. `dist` 삭제 후 3개 프로젝트가 예상대로 실패하고 재빌드 후 전부 복구됨을 확인(link: 배선이 캐시에 기대지 않음).
- **커밋**: 툴킷 `feature/devkit-roadmap`, 소비자 3개는 각자 `feature/devkit-adoption`. 전부 main 미머지.
- **follow-up**: Phase 2(`eslint-plugin-nest-arch`). 소비자 3개가 ESLint 10으로 올라왔으므로 드라이런은 설정 한 줄 추가로 끝난다.
```

- [ ] **Step 5: memory를 갱신한다**

`~/.claude/projects/-Users-dabot-Documents-develop/memory/devkit-roadmap.md` 의 본문에서 Phase 1을 완료로 바꾸고, 블로커 문장을 실제 해법으로 교체한다. `How to apply` 절의 "Phase 1 착수 전에 배포 경로를 정하는 것이 유일한 블로커다"를 다음으로 바꾼다:

```markdown
**How to apply:** 이 저장소에서 새 패키지를 제안하기 전에 기존 패키지의 소비자가 있는지 먼저 확인한다. 배포하지 않고 pnpm `link:` 상대 경로로 소비하며(`link:../eslint/packages/<name>`), 빌드가 필요한 패키지(`eslint-config-nest`, `eslint-plugin-fsd`)는 소비자를 손대기 전에 툴킷에서 `pnpm build`를 돌려야 한다 — `link:` 의존은 라이프사이클 스크립트를 실행하지 않아 `dist`가 낡으면 소비자가 조용히 옛 규칙으로 린트한다.
```

- [ ] **Step 6: 커밋**

```bash
cd ~/Documents/develop/eslint
git add work-log.md
git commit -m "$(cat <<'EOF'
docs: work-log에 Phase 1 완료 기록

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 계획 셀프 리뷰

**1. 스펙 커버리지** — 설계 4절의 각 항목을 태스크에 대응시켰다.

| 스펙 | 태스크 |
| --- | --- |
| 4.1 목표 (적용하면서 중복을 발견해 추출) | Task 1·5·6이 전부 "실측 일치 부분집합만" 추출 |
| 4.2 `link:` 소비 방식 | Task 2가 배선을 단독 검증, 이후 전 태스크가 사용 |
| 4.2 `dist` 최신성 요구사항 | Task 3 Step 1, Task 10 Step 1~2 |
| 4.3 마이그레이션 순서 (devlog → account → eungam) | Task 3~6 → Task 7 → Task 8 |
| 4.3 단계 1~7 (빌드/의존성/peer/config/prettier제거/분류/스크립트) | Task 3 Step 1~6, Task 4 |
| 4.4 위반 (a)/(b)/(c) 분류 | Task 4 Step 2, Task 7 Step 7, Task 8 Step 7 |
| 4.5 `eslint-plugin-prettier` 제거 | Task 3 Step 3, Task 7 Step 3, Task 8 Step 3 |
| 4.6 설정 패키지 추출 | Task 1(prettier), 5(tsconfig), 6(jest) |
| 4.6 `vitest-config`는 Phase 1 범위 밖 | 태스크 없음 — 의도적 |
| 4.7 완료 기준 (dist 삭제 후 재빌드, 미사용 패키지 없음) | Task 10 Step 1~3 |
| 7절 `eslint-plugin-fsd` follow-up | Task 9 |

**스펙 대비 좁힌 것 1건.** 설계 4.6절 표는 `@devbak/tsconfig`의 서브패스로 `/nest`·`/next`·`/lib`를 적었으나, 이 계획은 **`nest.json`만** 만든다. 근거는 같은 절의 원칙이다 — "세 프로젝트에서 반복되는 것만 뽑는다". `next`·`lib`는 이번에 손대는 프로젝트가 없어 반복을 실측할 수 없다. `vitest-config`를 뺀 것과 같은 판단이며, README에 그 사실을 적는다(Task 5 Step 3).

**2. 플레이스홀더 스캔** — 통과. 탐색적 성격의 Task 4·7 Step 7·8 Step 7은 결과를 예측할 수 없으나, "적절히 처리한다" 대신 **판정 절차와 예상 규칙별 구체적 지침**을 담았다. work-log 템플릿의 `NN`은 실행 시 측정값으로 채우라고 명시된 자리표시자이며, 그 사실을 단계 본문에 적었다.

**3. 타입·이름 일관성** — 확인 완료.

- 패키지 이름: `@devbak/prettier-config`, `@devbak/tsconfig`, `@devbak/jest-config`가 Task 1·5·6의 생성과 Task 2·7·8의 소비에서 일치한다.
- 링크 경로: `link:../eslint/packages/<name>` 형태가 전 태스크에서 일치한다.
- 참조 형태: `"prettier": "@devbak/prettier-config"`(패키지 루트), `"extends": "@devbak/tsconfig/nest.json"`(파일 경로), `"preset": "@devbak/jest-config/nest"`(디렉토리, Jest가 `/jest-preset.json`을 덧붙임) — 세 메커니즘의 차이를 각 태스크가 같은 형태로 쓴다.
- flat config: `import nest from '@devbak/eslint-config-nest'` 후 `...nest`로 spread. 기본 export가 `Linter.Config[]` 배열이므로 옳다.
- 완화 객체 위치: Task 4 Step 5, Task 7 Step 7, Task 8 Step 7이 모두 "`...nest` **뒤에**"로 일치한다.

---

## 알려진 리스크

| 리스크 | 드러나는 지점 | 대응 |
| --- | --- | --- |
| 새 패키지의 테스트 파일이 어떤 TS 프로젝트에도 속하지 않아 `pnpm lint`가 파싱 단계에서 실패 | Task 1·5·6 Step 5 | 각 태스크 Step 1이 `tests/tsconfig.json`을 함께 만든다. `eslint-config-nest`가 같은 문제를 겪은 전례가 있다 |
| `link:` 의존에서 필수 peer 4개가 자동 설치되지 않음 | Task 3 Step 4 | 해당 단계가 명시적으로 `require.resolve`로 확인하고, 실패 시 직접 설치 |
| Jest가 서브디렉토리 프리셋(`@devbak/jest-config/nest`)을 해석하지 못함 | Task 6 Step 8 | 통과 테스트 수 비교로 즉시 드러남. 실패 시 `"preset": "@devbak/jest-config/nest/jest-preset.json"` 전체 경로로 대체 |
| `no-explicit-any` 위반이 감당 불가능하게 많음 | Task 4 Step 2 | (c)로 `warn` 강등 후 후속 작업으로 분리. 계획에 명시됨 |
| `account-api`·`eungam-api`의 느슨한 tsconfig에서 `no-unsafe-*`가 폭증 | Task 7·8 Step 7 | 같은 방식으로 (c) `warn` 강등. "`error`를 유지한 채 억지로 고치지 않는다"고 명시 |
| 소비자 저장소가 툴킷 저장소 없이는 린트 불가 상태가 됨 | 상시 | 의도된 트레이드오프. 개인 사용 전제이며 두 저장소가 같은 머신의 형제 디렉토리에 있다(설계 2.1절) |
