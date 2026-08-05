# 레지스트리 설치 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 패키지를 `link:` 상대경로 대신 **GitHub Packages에서 설치**하게 바꾸고, 그에 필요한 스코프 개명(`@devbak/*` → `@cheolubak/*`)과 실제 게시까지 마친다.

**Architecture:** 기계적 개명을 먼저 끝내 초록불을 확보하고, 그 위에 연산 교체(`linkDeps` → `registryDeps`)·`.npmrc` 템플릿·위치 제약 제거를 얹는다. **게시는 되돌릴 수 없으므로 마지막 태스크로 분리**하고, 앞의 모든 것이 통과해야 도달한다.

**Tech Stack:** pnpm workspace, Turborepo, GitHub Packages(npm registry), vitest, TypeScript 5.6

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-05-registry-install-design.md`. 절 번호는 이 문서를 가리킨다.
- 패키지 매니저는 **pnpm**. `npm`을 쓰지 않는다.
- TypeScript strict mode, 2-space 들여쓰기.
- **주석·문서는 한국어.** "왜 그런가"(결정의 근거·실측 사실)를 적는다. 기존 주석은 하드윈 사실의 기록이므로 옮길 때 지우지 마라.
- 커밋 메시지는 imperative mood, 한국어.
- **기준선: 테스트 363개(41파일) 통과, oxlint 에러 0(warning 3), ESLint 에러 0, typecheck 7/7.** 태스크마다 유지돼야 한다.
- **검증은 `pnpm lint:ox`와 `pnpm lint:es`를 둘 다** 돌린다. `pnpm lint`는 turbo가 병렬 실행하지만 첫 실패에서 나머지를 죽이므로, 전체를 보려면 `--continue`를 붙인다.
- **새 스코프는 `@cheolubak`**, 레지스트리는 `https://npm.pkg.github.com`, 버전은 전부 `0.1.0`, 소비 선언은 `^0.1.0`.
- **CLI 명령 이름 `devbak`은 바꾸지 않는다**(설계 2.1-2). 루트 스크립트 `"devbak"`, bin 필드 `"devbak"`, 사용법 문구 전부 그대로.
- **`docs/superpowers/**`와 `work-log.md`의 기존 항목은 절대 건드리지 마라**(설계 1.3절). 과거 기록이다.
- **`pnpm test:e2e`는 Task 8 전까지 돌리지 마라** — 수십 분이 걸리고, Task 3 이후에는 게시 전이라 반드시 실패한다.
- 브랜치는 `feature/registry-install`.

---

## 파일 구조

| 파일 | 책임 | 태스크 |
| --- | --- | --- |
| `packages/*/package.json` | `name` 개명, 게시 메타데이터 | 1, 6 |
| `packages/devkit-cli/src/ops/link-deps.ts` → `registry-deps.ts` | 버전 범위 선언 | 3 |
| `packages/devkit-cli/src/ops/index.ts` | export 교체 | 3 |
| `packages/devkit-cli/src/recipes/*.ts` | `registryDeps` 호출 | 3 |
| `packages/devkit-cli/templates/_shared/_npmrc` | 레지스트리 설정 | 4 |
| `packages/devkit-cli/src/lib/categories.ts` | `_npmrc` → `deps` | 4 |
| `packages/devkit-cli/templates/*/CLAUDE.md`·`pnpm-workspace.yaml` | `link:` 서술 → 레지스트리 서술 | 5 |
| `packages/devkit-cli/src/bin.ts` | 위치 제약 제거 | 6 |
| `README.md`·`packages/*/README.md` | 소비 방법 | 1, 8 |
| `.gitignore` | 루트 `.npmrc` 제외 | 6 |

---

## Task 1: 스코프 개명 (기계적)

**Files:**
- Modify: `packages/*/package.json` (7개 — `name` 필드)
- Modify: `packages/devkit-cli/src/**`, `packages/devkit-cli/templates/**`, `packages/*/tests/**`, `packages/*/README.md`, `README.md`
- **금지**: `docs/superpowers/**`, `work-log.md`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: 모든 패키지가 `@cheolubak/<name>`. 이후 태스크는 이 이름을 쓴다.

- [ ] **Step 1: 개명 전 기준선과 참조 수를 기록한다**

```bash
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
echo "--- 바꿀 것 (코드·템플릿·테스트·현행 README)"
grep -rc "@devbak" --include="*.ts" --include="*.json" --include="*.mjs" --include="*.js" packages/ README.md 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$2} END {print s "건"}'
echo "--- 손대지 말 것 (과거 기록)"
grep -rc "@devbak" docs/ work-log.md 2>/dev/null | grep -v ":0$" | awk -F: '{s+=$2} END {print s "건"}'
```

Expected: 테스트 363, 바꿀 것 77건, 과거 기록 246건. **이 숫자를 보고서에 적어라** — Step 5에서 대조한다.

- [ ] **Step 2: 코드·템플릿·테스트·현행 README에서 치환한다**

```bash
grep -rl "@devbak" --include="*.ts" --include="*.json" --include="*.mjs" --include="*.js" --include="*.md" packages/ README.md 2>/dev/null \
  | xargs sed -i '' 's|@devbak/|@cheolubak/|g'
```

macOS의 `sed -i`는 빈 확장자 인자를 요구한다(`-i ''`). Linux면 `sed -i`만 쓴다.

**`packages/` 와 루트 `README.md` 밖으로 나가지 않는 것이 요구다.** `docs/`·`work-log.md`가 포함되면 과거 기록이 오염된다.

- [ ] **Step 3: `@devbak`이 스코프 아닌 형태로 남았는지 본다**

```bash
grep -rn "@devbak" --include="*.ts" --include="*.json" --include="*.mjs" --include="*.js" --include="*.md" packages/ README.md 2>/dev/null
```

Expected: 출력 없음. 남았다면 `@devbak/` 형태가 아닌 것(예: `@devbak 표준 툴킷`, `## @devbak 의존`)이다 — **이것들은 문맥을 보고 손으로 고쳐라.** 브랜드 서술은 `@cheolubak`으로 바꾸는 것이 자연스럽지 않을 수 있다(예: "`@devbak` 표준 툴킷" → "devkit 표준 툴킷"). 판단이 서지 않으면 보고하고 물어라.

- [ ] **Step 4: 과거 기록이 안 바뀌었는지 확인한다 — 이 태스크의 핵심 방어**

```bash
git diff --stat docs/ work-log.md
```

Expected: **출력 없음.** 하나라도 나오면 치환이 범위를 넘은 것이다 — `git checkout -- docs/ work-log.md`로 되돌리고 Step 2를 다시 하라.

- [ ] **Step 5: 스냅샷을 갱신하고 diff를 눈으로 본다**

```bash
pnpm exec vitest run packages/devkit-cli/tests -u
git diff packages/devkit-cli/tests/__snapshots__
```

Expected: 스냅샷 diff가 **`@devbak` → `@cheolubak` 치환뿐**이어야 한다. 다른 변화가 보이면 되돌아가 원인을 찾아라.

- [ ] **Step 6: 전체 검증**

```bash
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm typecheck
pnpm lint:ox; pnpm lint:es
```

Expected: 테스트 **363개**, typecheck 7/7, 린트 에러 0.

- [ ] **Step 7: 커밋**

```bash
git add packages/ README.md
git commit -m "refactor: 패키지 스코프를 @cheolubak 로 개명한다"
```

---

## Task 2: 게시 메타데이터

**Files:**
- Modify: `packages/{tsconfig,prettier-config,jest-config,vitest-config,eslint-config-nest,eslint-plugin-fsd}/package.json` (6개)
- Modify: `packages/devkit-cli/package.json`

**Interfaces:**
- Consumes: Task 1의 새 이름
- Produces: 6개 패키지가 게시 가능 상태, `devkit-cli`는 `private: true`

- [ ] **Step 1: 설정 패키지 6개에 게시 필드를 넣는다**

각 패키지의 `package.json`에서 기존 `publishConfig`를 아래로 교체하고 `repository`를 추가한다(`<pkg>`는 디렉토리 이름):

```jsonc
"publishConfig": {
  "access": "public",
  "registry": "https://npm.pkg.github.com"
},
"repository": {
  "type": "git",
  "url": "git+https://github.com/cheolubak/devkit.git",
  "directory": "packages/<pkg>"
}
```

**`repository`가 요구다.** GitHub Packages는 이 필드로 저장소를 매칭해 패키지를 귀속시킨다(설계 4.1절). 없으면 게시가 거부되거나 엉뚱한 저장소에 붙는다.

- [ ] **Step 2: `devkit-cli`를 게시 대상에서 뺀다**

`packages/devkit-cli/package.json`에서 `publishConfig`를 **지우고** 다음을 추가한다:

```jsonc
"private": true,
```

이유를 이해하고 하라 — `findToolkitRoot`가 `pnpm-workspace.yaml`을 위로 찾아 올라가고 못 찾으면 던진다. `pnpm dlx`로 실행하면 그 파일이 없어 **첫 줄에서 죽는다.** 게시해도 쓸 수 없다(설계 1.4절).

- [ ] **Step 3: JSON이 유효하고 게시 대상이 6개인지 확인한다**

```bash
for p in packages/*/package.json; do node -e "
const j=require('./$p');
console.log((j.private?'private ':'PUBLISH ') + j.name + ' / registry=' + (j.publishConfig?.registry ?? '-') + ' / repo.directory=' + (j.repository?.directory ?? '-'));
"; done
```

Expected: `PUBLISH` 6개(전부 registry·repo.directory 있음), `private` 1개(`@cheolubak/devkit-cli`).

- [ ] **Step 4: 검증**

```bash
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm lint:ox; pnpm lint:es
```

Expected: 테스트 363개, 린트 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add packages/*/package.json
git commit -m "build: 게시 메타데이터를 넣고 devkit-cli를 게시 대상에서 뺀다"
```

---

## Task 3: `linkDeps` → `registryDeps`

**Files:**
- Create: `packages/devkit-cli/src/ops/registry-deps.ts`
- Delete: `packages/devkit-cli/src/ops/link-deps.ts`
- Modify: `packages/devkit-cli/src/ops/index.ts`
- Modify: `packages/devkit-cli/src/recipes/{nest,next,monorepo}.ts`
- Modify: `packages/devkit-cli/src/types.ts` (`StepKind`)
- Replace: `packages/devkit-cli/tests/link-deps.test.ts` → `tests/registry-deps.test.ts`

**Interfaces:**
- Consumes: Task 1의 `@cheolubak/*` 이름
- Produces:
  - `registryDeps(packages: string[], options?: RegistryDepsOptions): Step` — `kind: 'registryDeps'`
  - `RegistryDepsOptions { file?: string }`
  - `DEVKIT_VERSION_RANGE = '^0.1.0'`
  - **사라짐**: `linkSpec`, `normalizeToPosix`, `LinkDepsOptions`, `linkDeps`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/registry-deps.test.ts` 신규(기존 `link-deps.test.ts`는 Step 5에서 지운다):

```ts
import { describe, expect, it } from 'vitest';
import { registryDeps, DEVKIT_VERSION_RANGE } from '../src/ops/registry-deps.js';
import type { Ctx } from '../src/types.js';

const CTX: Ctx = {
  targetDir: '/a/b/demo',
  toolkitRoot: '/a/b/eslint',
  name: 'demo',
  log: () => {},
};

describe('registryDeps', () => {
  it('버전 범위로 devDependencies 패치를 낸다 — 경로에 의존하지 않는다', async () => {
    const changes = await registryDeps(['tsconfig', 'prettier-config']).plan!(CTX);

    expect(changes).toEqual([
      {
        kind: 'json',
        file: 'package.json',
        patch: {
          devDependencies: {
            '@cheolubak/tsconfig': DEVKIT_VERSION_RANGE,
            '@cheolubak/prettier-config': DEVKIT_VERSION_RANGE,
          },
        },
      },
    ]);
  });

  it('대상 깊이가 달라도 같은 값을 낸다 — link: 시절의 깊이 계산이 사라졌다', async () => {
    const deep: Ctx = { ...CTX, targetDir: '/a/b/mono/apps/web' };

    const shallow = await registryDeps(['tsconfig']).plan!(CTX);
    const nested = await registryDeps(['tsconfig']).plan!(deep);

    expect(nested).toEqual(shallow);
  });

  it('file 옵션을 그대로 전달한다', async () => {
    const changes = await registryDeps(['tsconfig'], { file: 'apps/web/package.json' }).plan!(CTX);
    expect(changes[0]).toMatchObject({ kind: 'json', file: 'apps/web/package.json' });
  });

  it('describe()가 파일과 패키지 목록을 낸다 — 스냅샷의 근거다', () => {
    expect(registryDeps(['tsconfig']).describe()).toEqual({
      file: 'package.json',
      packages: ['tsconfig'],
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm exec vitest run packages/devkit-cli/tests/registry-deps.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: `registry-deps.ts`를 만든다**

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { applyPatch, type JsonObject } from './merge-json.js';

/**
 * 소비자가 선언할 버전 범위.
 *
 * 패키지 7개가 락스텝으로 같은 버전을 쓴다(설계 2.1-4) — 서로 import하지
 * 않아 따로 굴릴 이유가 없다. 0.x 에서 캐럿은 `>=0.1.0 <0.2.0` 이다.
 */
export const DEVKIT_VERSION_RANGE = '^0.1.0';

export interface RegistryDepsOptions {
  /** targetDir 기준 상대 경로. 기본값 'package.json' */
  file?: string;
}

/**
 * @cheolubak/* 를 레지스트리 버전 범위로 선언한다.
 *
 * link: 시절에는 소비자에서 툴킷까지의 **상대경로를 계산**해야 했다 —
 * 모노레포 루트와 apps/web 의 깊이가 다르고 pnpm catalog: 가 link: 를
 * 거부했기 때문이다. 레지스트리 설치에는 그 계산이 통째로 필요 없다:
 * 대상이 어디에 있든 값이 같다.
 */
export function registryDeps(packages: string[], options: RegistryDepsOptions = {}): Step {
  const file = options.file ?? 'package.json';

  const patch = (): JsonObject => {
    const devDependencies: JsonObject = {};
    for (const pkg of packages) {
      devDependencies[`@cheolubak/${pkg}`] = DEVKIT_VERSION_RANGE;
    }
    return { devDependencies };
  };

  return {
    kind: 'registryDeps',
    label: `의존 선언 — ${packages.map((p) => `@cheolubak/${p}`).join(', ')}`,
    describe: () => ({ file, packages }),
    plan: () => Promise.resolve([{ kind: 'json', file, patch: patch() }]),
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonObject;
      const merged = applyPatch(parsed, patch());
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      for (const pkg of packages) ctx.log(`  의존: @cheolubak/${pkg}@${DEVKIT_VERSION_RANGE}`);
    },
  };
}
```

`ctx`가 `plan`에서 쓰이지 않는 것이 요점이다 — 경로 의존이 사라졌다는 사실이 시그니처에 드러난다.

- [ ] **Step 4: `StepKind`와 export를 고친다**

`src/types.ts`의 `StepKind`에서 `'linkDeps'`를 `'registryDeps'`로 바꾼다.

`src/ops/index.ts`:

```ts
export { registryDeps, DEVKIT_VERSION_RANGE } from './registry-deps.js';
export type { RegistryDepsOptions } from './registry-deps.js';
```

(`linkDeps`·`linkSpec`·`LinkDepsOptions` 줄은 지운다.)

- [ ] **Step 5: 옛 파일과 테스트를 지운다**

```bash
git rm packages/devkit-cli/src/ops/link-deps.ts packages/devkit-cli/tests/link-deps.test.ts
```

`linkSpec`·`normalizeToPosix`는 소비처가 사라졌으므로 함께 없어진다. **쓰이지 않는 채 남겨 두지 않는다**(설계 5.1절).

- [ ] **Step 6: 세 레시피의 호출을 바꾼다**

각 파일의 import와 호출을 교체한다(패키지 목록은 그대로):

| 파일 | 바뀐 호출 |
| --- | --- |
| `src/recipes/nest.ts` | `registryDeps(['eslint-config-nest', 'prettier-config', 'tsconfig', 'jest-config'])` |
| `src/recipes/next.ts` | `registryDeps(['eslint-plugin-fsd', 'prettier-config', 'vitest-config'])` |
| `src/recipes/monorepo.ts` | `registryDeps(['eslint-plugin-fsd', 'prettier-config'])` |

import 목록의 `linkDeps`도 `registryDeps`로 바꾼다.

- [ ] **Step 7: 스냅샷을 갱신하고 diff를 본다**

```bash
(cd packages/devkit-cli && pnpm exec vitest run -u)
git diff packages/devkit-cli/tests/__snapshots__
```

**패키지 디렉토리 안에서 돌리는 것이 요구다**(Task 1 실측). 루트에서 `vitest run packages/devkit-cli/tests -u` 를 쓰면 vitest 기본 glob 이 `tests/e2e/**` 까지 잡아 e2e 11 개가 딸려 온다 — 패키지 안에서 돌면 그 패키지의 `vitest.config.ts`(`include: ['tests/*.test.ts']`)가 적용돼 한 단계만 매칭한다.

Expected: 스냅샷 diff가 `linkDeps` → `registryDeps`(kind·label)뿐이어야 한다. `describe()`가 `{file, packages}`로 같으므로 그 부분은 안 바뀐다.

- [ ] **Step 8: 검증하고 커밋**

```bash
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm typecheck; pnpm lint:ox; pnpm lint:es
```

Expected: 테스트 **363개**(옛 테스트 파일이 빠지고 새 파일이 들어와 개수가 달라질 수 있다 — **정확한 수를 보고하라**), typecheck 7/7, 린트 에러 0.

```bash
git add -A packages/devkit-cli
git commit -m "refactor: linkDeps 를 registryDeps 로 바꿔 경로 의존을 없앤다"
```

---

## Task 4: `.npmrc` 템플릿과 카테고리

**Files:**
- Create: `packages/devkit-cli/templates/_shared/_npmrc`
- Modify: `packages/devkit-cli/src/lib/categories.ts`
- Test: `packages/devkit-cli/tests/categories.test.ts`

**Interfaces:**
- Consumes: Task 1의 스코프
- Produces: 생성물이 `.npmrc`를 갖는다. `categoryOf('.npmrc') === 'deps'`

**배경:** GitHub Packages는 **공개 패키지도 설치에 토큰을 요구한다**(설계 0.2절, 공식 문서 인용). 이 파일이 없으면 생성된 프로젝트가 `pnpm install`부터 실패한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/categories.test.ts`의 `categoryOf` `it.each` 목록에 두 줄을 추가한다:

```ts
    ['.npmrc', 'deps'],
    ['_npmrc', 'deps'],
```

언더스코어 형태도 함께 넣는 이유는 기존 관용이다 — 템플릿은 `_npmrc`로 담기고 `copyOverlay`가 점 이름으로 되돌리므로, **오버레이 커버리지와 실제 소비자 경로가 둘 다 걸려야** 한다(`_gitignore`·`_prettierignore`가 같은 형태다).

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm exec vitest run packages/devkit-cli/tests/categories.test.ts
```

Expected: FAIL — `.npmrc`가 `null`로 나온다.

- [ ] **Step 3: 카테고리 패턴을 추가한다**

`src/lib/categories.ts`의 `FILE_PATTERNS`에 추가한다(`_?\.?prettierignore` 줄 근처가 자연스럽다):

```ts
  // .npmrc 는 레지스트리 접근 설정이라 의존성과 함께 움직인다(설계 5.3절).
  // 덕분에 `devbak update --only deps` 가 기존 link: 프로젝트를 버전 범위로
  // 옮기는 마이그레이션 경로가 된다 — 별도 도구가 필요 없다.
  [/^_?\.?npmrc$/, 'deps'],
```

- [ ] **Step 4: 템플릿 파일을 만든다**

`packages/devkit-cli/templates/_shared/_npmrc`:

```
@cheolubak:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`_shared/`에 두는 이유: 세 유형이 모두 `copyOverlay('_shared')`를 부르므로 한 곳에 두면 셋 다 받는다.

**파일명이 `_npmrc`인 것은 요구다.** npm이 패키지에서 점 파일을 거르므로 언더스코어로 담고 `copyOverlay`가 점 이름으로 되돌린다.

- [ ] **Step 5: 검증하고 커밋**

```bash
pnpm exec vitest run packages/devkit-cli/tests/categories.test.ts packages/devkit-cli/tests/overlay-coverage.test.ts
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm lint:ox; pnpm lint:es
```

Expected: `overlay-coverage`가 통과해야 한다 — 새 오버레이 파일이 어느 카테고리에도 안 걸리면 그 테스트가 실패하도록 돼 있다. **테스트 개수를 정확히 보고하라**(카테고리 테스트가 2건 늘어난다).

```bash
git add packages/devkit-cli
git commit -m "feat: 생성물에 GitHub Packages 레지스트리 설정을 놓는다"
```

---

## Task 5: 템플릿 문서의 `link:` 서술 교체

**Files:**
- Modify: `packages/devkit-cli/templates/{next,monorepo}/CLAUDE.md`
- Modify: `packages/devkit-cli/templates/monorepo/pnpm-workspace.yaml`
- Modify: `packages/devkit-cli/templates/monorepo/.claude/agents/devkit-reviewer.md` (필요시)

**Interfaces:**
- Consumes: Task 3·4의 새 소비 방식
- Produces: 생성물의 문서가 실제 동작과 일치

**배경:** Task 1은 **이름만** 바꿨다. 이 파일들에는 `link:` 자체를 설명하는 **문장**이 남아 있어 지금은 거짓이다.

- [ ] **Step 1: 거짓이 된 서술을 찾는다**

```bash
grep -rn "link:" packages/devkit-cli/templates/
grep -rn "catalog" packages/devkit-cli/templates/monorepo/
```

각 위치를 읽고 무엇이 거짓인지 보고서에 적어라. 알려진 것 셋:

1. `templates/next/CLAUDE.md`의 "## @cheolubak 의존" 절 — *"`package.json`의 `@cheolubak/*`는 `link:` 상대경로로 `~/Documents/develop/eslint`를…"*
2. `templates/monorepo/CLAUDE.md`의 같은 절 + *"`@cheolubak/*`는 catalog에 넣을 수 없다"*
3. `templates/monorepo/pnpm-workspace.yaml`의 주석 — *"`@cheolubak/*` 는 여기에 넣을 수 없다. pnpm이 catalog 항목의 `link:` 프로토콜을…"*

- [ ] **Step 2: 서술을 새 사실로 바꾼다**

담아야 할 사실:

- `@cheolubak/*`는 **GitHub Packages에서 설치**되며 `.npmrc`가 레지스트리를 가리킨다.
- **`GITHUB_TOKEN` 환경변수가 필요하다** — 없으면 `pnpm install`이 실패한다. 공개 패키지도 마찬가지다.
- 버전은 `^0.1.0` 범위이며, 갱신하려면 버전을 올려 다시 설치한다(`link:` 시절처럼 symlink가 즉시 반영되지 않는다).
- **`catalog:` 금지가 풀렸다.** 그 제약은 `catalog:`가 `link:` 프로토콜을 거부해서 생긴 것이었고, 버전 범위는 catalog에 넣을 수 있다. 다만 지금 구조를 바꾸지는 않는다(설계 2.2절 비범위) — **주석은 "넣을 수 없다"가 아니라 "지금은 넣지 않았다"로** 고쳐라. 거짓을 남기지 말되 없는 변경을 암시하지도 마라.

- [ ] **Step 3: 리뷰어 문서에 남은 `link:` 언급을 확인한다**

```bash
grep -rn "link:" packages/devkit-cli/templates/*/.claude/
```

있으면 같은 기준으로 고치고, 없으면 그대로 둔다.

- [ ] **Step 4: 검증하고 커밋**

```bash
grep -rn "link:" packages/devkit-cli/templates/ || echo "link: 서술 없음"
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm lint:ox; pnpm lint:es
```

Expected: `link:` 서술이 남아 있지 않다(또는 남았다면 **왜 정당한지** 보고하라 — 예: 과거를 설명하는 문장). 테스트 개수 유지.

`tests/review-assets.test.ts`가 리뷰 자산 문서를 구조 단언하므로 통과를 확인하라.

```bash
git add packages/devkit-cli/templates
git commit -m "docs: 생성물 문서의 link: 서술을 레지스트리 설치로 바꾼다"
```

---

## Task 6: 위치 제약 제거

**Files:**
- Modify: `packages/devkit-cli/src/bin.ts`
- Modify: `.gitignore`
- Test: `packages/devkit-cli/tests/bin.test.ts`

**Interfaces:**
- Consumes: Task 3의 경로 비의존 선언
- Produces: `devbak create <name>`이 **cwd 기준**으로 대상을 만든다

**배경:** `create`가 형제 디렉토리에만 만든 이유는 `link:` 상대경로가 깨지기 때문이었다(설계 0.1절). 그 이유가 사라졌다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/bin.test.ts`에 추가:

```ts
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('create 대상 경로', () => {
  it('기준 디렉토리 아래에 만든다 — 툴킷의 형제로 강제하지 않는다', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'devbak-cwd-'));
    created.push(sandbox);
    // 존재하는 대상으로 부딪혀 "어느 경로를 대상으로 잡았는지"를 에러에서 읽는다.
    // 레시피를 실제로 돌리면 네트워크·설치가 붙어 단위 테스트가 아니게 된다.
    mkdirSync(join(sandbox, 'taken'));

    await expect(
      main(['create', 'taken', '--type', 'nest'], { cwd: sandbox }),
    ).rejects.toThrow(new RegExp(`${escapeRegExp(join(sandbox, 'taken'))}.*이미 존재합니다`));
  });

  it('기준을 안 주면 process.cwd()를 쓴다 — CLI 의 기본 경로', async () => {
    // 툴킷 저장소 안에서 돌리므로 대상은 <저장소>/taken-here 가 된다.
    await expect(main(['create', 'taken-here', '--type', 'nest'])).rejects.toThrow(
      new RegExp(`${escapeRegExp(join(process.cwd(), 'taken-here'))}`),
    );
  });
});
```

`escapeRegExp`는 파일 안에 두는 작은 헬퍼다:

```ts
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**`process.chdir()`를 쓰지 않는 것이 요구다.** cwd는 프로세스 전역 상태라 같은 워커에서 도는 다른 테스트와 순서가 얽힌다. 기준 디렉토리를 **인자로 주입**하면 테스트가 전역을 건드리지 않고, 의존이 시그니처에 드러난다 — 이 저장소가 `findToolkitRoot`에서 cwd 폴백을 일부러 막은 것과 같은 결이다(암묵보다 명시).

두 번째 테스트는 **기본값이 실제로 `process.cwd()`인지**를 고정한다. 이게 없으면 주입 경로만 검증되고 CLI가 실제로 쓰는 경로는 미검증으로 남는다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm exec vitest run packages/devkit-cli/tests/bin.test.ts
```

Expected: FAIL — 대상이 툴킷의 형제로 계산되어 sandbox 경로가 에러에 안 나온다.

- [ ] **Step 3: `main`이 기준 디렉토리를 주입받게 하고 경로 계산을 바꾼다**

`src/bin.ts`에 옵션 인자를 하나 더한다. **기본값이 있으므로 기존 호출부는 그대로 동작한다.**

```ts
export interface MainOptions {
  /**
   * `create` 의 대상을 해석할 기준 디렉토리. 기본값은 `process.cwd()`.
   *
   * 인자로 받는 이유는 테스트다 — cwd 는 프로세스 전역 상태라
   * `process.chdir()` 로 바꾸면 같은 워커의 다른 테스트와 순서가 얽힌다.
   */
  cwd?: string;
}

export async function main(argv: string[], options: MainOptions = {}): Promise<void> {
```

`runCreate` 호출부에 그 값을 넘기고, `runCreate`의 시그니처에 `baseDir: string`을 더한 뒤 아래 Step 3-2의 계산을 쓴다.

- [ ] **Step 3-2: `runCreate`의 경로 계산을 바꾼다**

`src/bin.ts`의 `runCreate`에서:

```ts
const targetDir = resolve(dirname(toolkitRoot), name);
```

를 다음으로 바꾼다:

```ts
// 기준 디렉토리(기본값 process.cwd()) 아래에 만든다. link: 시절에는
// 생성물이 툴킷의 형제여야 상대경로가 성립해 부모 디렉토리로
// 강제했지만, 레지스트리 설치에는 그 이유가 없다(설계 5.4절).
// nest new·create-next-app 과 같은 관습이다.
const targetDir = resolve(baseDir, name);
```

`baseDir`은 Step 3에서 더한 `runCreate`의 인자이며, `main`이 `options.cwd ?? process.cwd()`를 넘긴다.

**기존 안전장치는 그대로 둔다** — 대상이 이미 있으면 던진다. 임의 경로를 받게 되면서 오히려 더 중요해진다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
pnpm exec vitest run packages/devkit-cli/tests/bin.test.ts
```

Expected: PASS. 기존 `bin.test.ts` 테스트들도 전부 통과해야 한다 — 깨지면 **테스트를 고치지 말고** 보고하라.

- [ ] **Step 5: 루트 `.npmrc`를 gitignore에 넣는다**

`.gitignore`에 추가:

```
# 게시용 토큰이 들어간다. 절대 커밋되면 안 된다.
.npmrc
```

**이것을 빠뜨리면 다음 태스크에서 토큰이 커밋될 수 있다.** 순서가 중요하다.

- [ ] **Step 6: 검증하고 커밋**

```bash
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm typecheck; pnpm lint:ox; pnpm lint:es
```

```bash
git add packages/devkit-cli .gitignore
git commit -m "feat: create 의 위치 제약을 없애고 cwd 기준으로 만든다"
```

---

## Task 7: 게시 준비와 dry-run

**Files:**
- Create: `.npmrc` (루트 — **커밋되지 않는다**)
- Modify: `package.json` (루트 — `publish` 스크립트)

**Interfaces:**
- Consumes: Task 2의 게시 메타데이터, Task 6의 `.gitignore`
- Produces: `pnpm publish:packages` 스크립트, dry-run 통과

**🚨 이 태스크는 게시하지 않는다.** 준비와 예행뿐이다. 실제 게시는 Task 8이며 사람의 확인을 받는다.

- [ ] **Step 1: `.gitignore`에 `.npmrc`가 있는지 먼저 확인한다**

```bash
grep -n "^\.npmrc$" .gitignore && echo "OK" || echo "없다 — Task 6 Step 5를 먼저 하라"
```

Expected: `OK`. **없으면 여기서 멈춰라** — 토큰이 커밋된다.

- [ ] **Step 2: 게시용 토큰을 루트 `.npmrc`에 둔다**

```bash
gh auth token > /dev/null && echo "gh 토큰 사용 가능"
cat > .npmrc <<'EOF'
@cheolubak:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
EOF
git status --porcelain .npmrc
```

Expected: `git status`가 `.npmrc`를 **보고하지 않는다**(무시되고 있다).

토큰은 환경변수로 넣는다:

```bash
export GITHUB_TOKEN=$(gh auth token)
```

**`gh auth token`이 주는 토큰에 `write:packages` 권한이 없을 수 있다.** 있는지 먼저 확인하고, 없으면 그 사실을 보고하라 — PAT 발급은 사람이 해야 한다.

```bash
gh auth status 2>&1 | grep -i "scopes"
```

- [ ] **Step 3: 루트에 게시 스크립트를 넣는다**

`package.json`의 `scripts`에:

```jsonc
"publish:packages": "pnpm -r --filter '!@cheolubak/devkit-cli' publish --no-git-checks"
```

`--no-git-checks`를 쓰는 이유: 이 저장소는 브랜치에서 작업하고 태그를 쓰지 않아 pnpm의 기본 브랜치 검사에 걸린다. **버전 관리는 사람이 한다.**

- [ ] **Step 4: dry-run으로 무엇이 올라가는지 본다 — 이 태스크의 핵심**

```bash
pnpm build
pnpm publish:packages --dry-run 2>&1 | tee /tmp/publish-dryrun.txt
```

**출력에서 반드시 확인할 것:**

| 확인 | 기대 |
| --- | --- |
| 패키지 수 | **6개**(`devkit-cli` 없음) |
| `tsconfig` | `base.json`·`nest.json`·`next.json`·`lib.json` 4개만 |
| `prettier-config` | `index.json` 하나 |
| `jest-config` | `nest.js`·`nest-e2e.js` 2개 |
| `vitest-config` | `next.js`·`node.js` 2개 |
| `eslint-config-nest`·`eslint-plugin-fsd` | `dist/` 만 |
| 어느 패키지든 | `src/`·`tests/`·`node_modules` **없음** |

**`files` 화이트리스트가 맞는지가 이 단계의 목적이다.** 게시는 되돌릴 수 없으므로 여기서 걸러야 한다. 출력 전문을 보고서에 남겨라.

- [ ] **Step 5: 검증하고 커밋**

```bash
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm lint:ox; pnpm lint:es
git status --porcelain | grep npmrc && echo "🚨 .npmrc 가 추적되고 있다" || echo "OK"
```

```bash
git add package.json
git commit -m "build: 게시 스크립트를 추가한다"
```

---

## Task 8: 실제 게시와 최종 검증

**🚨 이 태스크는 되돌릴 수 없는 행위를 포함한다.** GitHub Packages는 삭제가 제한적이고 **같은 버전 재게시가 안 된다.**

**Files:**
- Modify: `README.md`, `packages/*/README.md`
- Modify: `work-log.md`
- Modify: memory 파일

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 없음 (게시·검증·문서)

- [ ] **Step 1: 게시 전 최종 확인 — 사람에게 묻는다**

**여기서 멈추고 컨트롤러에게 보고하라.** Task 7의 dry-run 출력을 요약해 제시하고 **"게시해도 되는가"를 명시적으로 물어라.** 승인 없이 다음 단계로 가지 마라.

보고에 담을 것: 올라갈 패키지 6개의 이름·버전·파일 목록, `devkit-cli`가 제외됐다는 확인, 토큰 권한 확인 결과.

- [ ] **Step 2: 게시한다 (승인 후에만)**

```bash
export GITHUB_TOKEN=$(gh auth token)
pnpm build
pnpm publish:packages 2>&1 | tee /tmp/publish.txt
```

실패하면 **재시도 전에 원인을 보고하라.** 부분 성공(일부만 올라감) 상태일 수 있으므로 무엇이 올라갔는지 먼저 확인한다:

```bash
for p in tsconfig prettier-config jest-config vitest-config eslint-config-nest eslint-plugin-fsd; do
  echo -n "@cheolubak/$p: "
  npm view "@cheolubak/$p" version --registry=https://npm.pkg.github.com 2>&1 | tail -1
done
```

- [ ] **Step 3: 실제로 설치되는지 확인한다 — 이 전환의 최종 증거**

```bash
SANDBOX=$(mktemp -d)
cd "$SANDBOX"
cat > .npmrc <<'EOF'
@cheolubak:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
EOF
pnpm init
pnpm add -D @cheolubak/tsconfig@^0.1.0
ls node_modules/@cheolubak/tsconfig/
cd - && rm -r "$SANDBOX"
```

Expected: `base.json`·`nest.json`·`next.json`·`lib.json`이 보인다. **이게 안 되면 게시가 실질적으로 실패한 것이다.**

- [ ] **Step 4: `devbak create` → `pnpm install`을 실제로 해 본다**

```bash
cd /Users/dabot/Documents/develop/eslint
pnpm build
SANDBOX=$(mktemp -d)
cd "$SANDBOX"
node /Users/dabot/Documents/develop/eslint/packages/devkit-cli/dist/bin.js create demo-api --type nest --no-verify
cd demo-api && cat .npmrc && grep -A5 devDependencies package.json
cd / && rm -r "$SANDBOX"
```

Expected: `.npmrc`가 놓이고 `package.json`에 `"@cheolubak/tsconfig": "^0.1.0"` 형태가 보인다. `--no-verify`여도 `pnpm install`은 돌므로 **설치가 성공해야 한다**(레지스트리에서 실제로 받아진다는 뜻).

**cwd 기준 생성도 여기서 확인된다** — 대상이 sandbox 안에 생겼는가?

- [ ] **Step 5: e2e가 토큰 없이 조용히 통과하지 않게 한다**

설계 7.1절의 요구다. 전환 후 e2e는 `pnpm install`이 레지스트리를 타므로 **`GITHUB_TOKEN` 없이는 반드시 실패한다.** 그런데 그 실패가 `pnpm install` 깊숙한 곳의 401로 나오면 원인을 알기 어렵고, 더 나쁘게는 누군가 `--passWithNoTests`류로 덮어 **e2e가 있다는 사실이 거짓 안심**을 주게 된다.

`packages/devkit-cli/tests/e2e/create.e2e.test.ts`와 `update.e2e.test.ts` 양쪽 맨 위에 같은 가드를 넣는다:

```ts
// e2e 는 생성물에서 pnpm install 을 돌리고, 그 설치가 GitHub Packages 를
// 탄다. GitHub Packages 는 **공개 패키지도** 토큰을 요구하므로(설계 0.2절)
// 토큰이 없으면 pnpm install 깊숙한 곳에서 401 로 죽는다. 원인을 읽을 수
// 있게 여기서 먼저 멈춘다 — 조용히 건너뛰면 e2e 가 있다는 사실이 거짓
// 안심을 준다.
if (process.env.GITHUB_TOKEN === undefined || process.env.GITHUB_TOKEN === '') {
  throw new Error(
    'e2e 에는 GITHUB_TOKEN 이 필요합니다 (@cheolubak/* 를 GitHub Packages 에서 설치합니다).\n' +
      '  export GITHUB_TOKEN=$(gh auth token)\n' +
      '토큰에 read:packages 권한이 있어야 합니다.',
  );
}
```

`describe.skip`이나 조건부 통과를 **쓰지 마라.** 건너뛰면 초록불이 나오고, 그것이 이 저장소가 반복해서 막아 온 형태다.

가드가 실제로 작동하는지 확인하고 원복한다:

```bash
env -u GITHUB_TOKEN pnpm exec vitest run --config packages/devkit-cli/vitest.e2e.config.ts 2>&1 | grep -i "GITHUB_TOKEN" | head -3
```

Expected: 위 메시지가 보이고 **설치가 시작되기 전에** 멈춘다(수십 분 걸리지 않는다).

- [ ] **Step 6: e2e를 돌린다**

```bash
cd /Users/dabot/Documents/develop/eslint
export GITHUB_TOKEN=$(gh auth token)
pnpm test:e2e 2>&1 | tee /tmp/e2e-output.txt
```

**수 분~수십 분이 걸린다.** Bash `timeout`을 600000(10분)으로 주거나 `run_in_background: true`로 띄우고 출력을 파일로 남겨라.

Expected: 11개 통과. 실패하면 **테스트를 고치지 말고** 원인을 조사해 보고하라 — 이 전환이 뭔가를 깨뜨렸다는 뜻이다.

끝나면 잔여물을 정리한다(`rm -rf` 금지, `rm -r` 사용):

```bash
ls -d ~/Documents/develop/devkit-e2e-* 2>/dev/null && rm -r ~/Documents/develop/devkit-e2e-*
```

- [ ] **Step 7: README를 고친다**

**루트 `README.md`**:
- "기존 프로젝트에 붙이기"의 `link:` 예시를 `pnpm add -D @cheolubak/eslint-config-nest`로 교체
- **"위치 제약" 절 삭제** (근거가 사라졌다)
- `.npmrc`와 `GITHUB_TOKEN`이 필요하다는 사실 추가 — **공개 패키지도 그렇다**는 점을 명시
- "빌드 없는 쪽이 기본" 문단의 `link:` 근거 서술을 현재 사실로 조정

**`packages/*/README.md` 7개**: 설치 예시를 `link:`에서 `pnpm add -D`로 바꾼다. `devkit-cli`는 게시하지 않으므로 그 README에는 **저장소에서 실행한다**고 적는다.

- [ ] **Step 8: `work-log.md`에 기록한다**

파일 맨 위에 `## 2026-08-05` 항목을 추가하고 기존 형식(`- **변경 파일**:` / `- **내용**:` / `- **커밋**:`)을 따른다. **turbo 때처럼 전체를 한 항목으로** 적어라.

담을 것: 스코프 개명(과거 기록은 제외했다는 사실 포함), 게시 6개·`devkit-cli` 제외 이유, `linkDeps`→`registryDeps`, `.npmrc`와 토큰 요구, 위치 제약 제거, 그리고 **실제 게시 결과**.

- [ ] **Step 9: memory를 갱신한다**

`/Users/dabot/.claude/projects/-Users-dabot-Documents-develop-eslint/memory/project_registry-install_2026-08-05.md`가 **이미 존재한다.** 새로 만들지 말고 읽은 뒤 구현·게시 결과를 덧붙여라. `MEMORY.md`에는 이미 한 줄이 있으니 **건드리지 마라.**

- [ ] **Step 10: 최종 검증과 커밋**

```bash
pnpm test 2>&1 | grep -oE "Tests  [0-9]+ passed" | awk '{s+=$2} END {print "테스트: " s}'
pnpm typecheck; pnpm lint:ox; pnpm lint:es; pnpm build
git status --porcelain | grep npmrc && echo "🚨 .npmrc 추적됨" || echo "OK"
```

```bash
git add README.md packages/*/README.md work-log.md
git commit -m "docs: 레지스트리 설치로 바뀐 소비 방법을 문서에 반영한다"
```

---

## 완료 확인

설계 8절의 완료 기준을 하나씩 확인한다.

- [ ] 7개 패키지가 `@cheolubak/*`이고 코드·템플릿·테스트·현행 README에 `@devbak` 참조가 0건 (Task 1)
- [ ] `docs/superpowers/**`·`work-log.md`의 **기존 항목**이 그대로다 (Task 1 Step 4)
- [ ] `devkit-cli`가 `private: true`, 나머지 6개에 `repository`·`publishConfig.registry` (Task 2)
- [ ] `registryDeps`로 바뀌고 `linkSpec`·`normalizeToPosix`가 사라졌다 (Task 3)
- [ ] 생성물이 `.npmrc`를 갖고 `categoryOf('.npmrc') === 'deps'` (Task 4)
- [ ] 템플릿 문서에 거짓이 된 `link:` 서술이 없다 (Task 5)
- [ ] 위치 제약이 제거되고 `create`가 cwd 기준이다 (Task 6)
- [ ] 6개 패키지가 `0.1.0`으로 게시됐다 (Task 8)
- [ ] 빈 디렉토리에서 `pnpm add -D @cheolubak/tsconfig`가 성공한다 (Task 8 Step 3)
- [ ] `devbak create` → `pnpm install`이 성공한다 (Task 8 Step 4)
- [ ] e2e 11개 통과, 토큰 없으면 알아볼 수 있게 실패 (Task 8 Step 5·6)
- [ ] 테스트·lint·typecheck 기준선 유지 (전 태스크)
- [ ] `.npmrc`가 커밋되지 않았다 (Task 6·7·8)
