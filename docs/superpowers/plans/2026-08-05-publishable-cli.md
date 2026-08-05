# devkit-cli 게시 가능화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@cheolubak/devkit-cli`를 GitHub Packages에 게시해 `pnpm dlx @cheolubak/devkit-cli create my-api --type nest` 한 줄로 쓸 수 있게 한다.

**Architecture:** 패키지가 실행되는 레이아웃(저장소 소스 / 게시된 tarball)을 `src/lib/layout.ts` 한 곳에서 판별하고, 레이아웃에 따라 갈리는 세 가지(`assertDistFresh` 검사 여부, `toolkitRoot` 존재 여부, 템플릿 경로)를 거기에 맞춘다. 검증은 `pnpm pack`으로 만든 실제 tarball을 임시 디렉토리에 풀어 돌리는 e2e 1건이 담당한다.

**Tech Stack:** TypeScript (ESM, strict), tsup, vitest, pnpm 워크스페이스, turbo, GitHub Packages

## Global Constraints

- 패키지 매니저는 **pnpm**. `npm`을 쓰지 않는다(레지스트리 조회용 `npm view` 제외).
- TypeScript strict mode, 2-space 들여쓰기.
- **주석은 한국어이며 "왜"(결정의 근거·실측 사실)를 적는다.** 코드를 그대로 옮긴 주석은 쓰지 않는다.
- **검증은 `pnpm lint:ox`와 `pnpm lint:es`를 둘 다** 돌린다. `eslint-plugin-oxlint`가 겹치는 규칙을 ESLint 쪽에서 끄므로 `no-unused-vars` 같은 것은 oxlint에만 산다. `pnpm lint`는 단락 평가라 한쪽만 돌 수 있다.
- **기준선(이 계획 시작 시점): `pnpm test` 42파일/365개, `pnpm typecheck` 7/7, `pnpm lint:ox` 에러 0·warning 3, `pnpm lint:es` 8/8, `pnpm test:e2e` 11/11.** 테스트 개수가 달라지면 정확한 수와 산출 근거를 보고한다.
- **`docs/superpowers/**`와 `work-log.md`의 기존 줄을 수정하지 않는다** — 과거 기록이다. 추가만 한다.
- 커밋 메시지는 imperative mood, 한국어.
- **게시는 Task 7에서만 한다.** 그 전 태스크에서 `pnpm publish`를 `--dry-run` 없이 실행하지 않는다. GitHub Packages는 같은 버전 재게시가 불가능하다.
- 버전은 `0.1.0`이다. 올리지 않는다.

---

## File Structure

| 파일 | 책임 | 태스크 |
| --- | --- | --- |
| `packages/devkit-cli/src/lib/layout.ts` (신설) | 패키지 루트 탐색과 레이아웃 판별. 레이아웃을 아는 **유일한** 곳 | 1 |
| `packages/devkit-cli/src/bin.ts` | `assertDistFresh`가 레이아웃을 인지, `toolkitRoot`를 조건부로 계산 | 1, 2 |
| `packages/devkit-cli/src/ops/copy-overlay.ts` | `templatesRoot()`를 패키지 루트 기준으로 단순화 | 1 |
| `packages/devkit-cli/src/lib/version.ts` | 중복된 walk-up을 `packageRoot()`로 대체 | 1 |
| `packages/devkit-cli/src/types.ts` | `Ctx.toolkitRoot`를 `string \| null`로 | 2 |
| `packages/devkit-cli/src/update/index.ts` | 자기보호 가드가 `null`을 다룸 | 2 |
| `packages/devkit-cli/tests/registry-version.test.ts` | 관문 대상을 "선언되는 이름"으로 | 3 |
| `packages/devkit-cli/package.json` | `private` 제거, `publishConfig` 추가 | 4 |
| `package.json` (루트) | `publish:packages` 필터 제거 | 4 |
| `packages/devkit-cli/tests/e2e/packed.e2e.test.ts` (신설) | tarball 실물 경로 검증 | 5 |
| `README.md`, `packages/devkit-cli/README.md` | 게시 전제 서술 갱신 | 6 |

---

### Task 1: 레이아웃 판별을 한 곳으로 모은다

**Files:**
- Create: `packages/devkit-cli/src/lib/layout.ts`
- Create: `packages/devkit-cli/tests/layout.test.ts`
- Modify: `packages/devkit-cli/src/bin.ts` (`assertDistFresh`)
- Modify: `packages/devkit-cli/src/ops/copy-overlay.ts` (`templatesRoot`)
- Modify: `packages/devkit-cli/src/lib/version.ts` (`devkitVersion`)
- Test: `packages/devkit-cli/tests/layout.test.ts`, 기존 `packages/devkit-cli/tests/bin.test.ts`

**Interfaces:**
- Produces:
  - `export type Layout = 'source' | 'bundled'`
  - `export function packageRoot(from: string): string` — `from`(파일 또는 디렉토리 경로)에서 위로 올라가며 `package.json`이 있는 첫 디렉토리를 낸다. 못 찾으면 던진다.
  - `export function packageLayout(pkgRoot: string): Layout`
- Consumes: 없음

**배경 — 왜 `src` 존재로 판별하는가**

게시된 tarball에는 `dist/`와 `templates/`만 들어간다(`files: ["dist", "templates"]`). `src/`는 없다. 이것이 두 레이아웃을 가르는 가장 직접적인 사실이고, `assertDistFresh`가 실제로 읽는 대상이기도 하다. `templates` 위치로 판별하면 근거가 둘로 갈린다.

**배경 — `templatesRoot()`가 왜 단순해지는가**

지금은 `import.meta.url` 기준으로 `../templates`와 `../../templates`를 차례로 시험한다. 번들되면 파일이 `dist/chunk-*.js`가 되어 깊이가 달라지기 때문이다. 그런데 **두 레이아웃 모두 템플릿은 패키지 루트 바로 아래(`<pkgRoot>/templates`)에 있다.** 파일이 아니라 패키지 루트를 기준으로 잡으면 후보가 하나가 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/layout.test.ts`:

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageLayout, packageRoot } from '../src/lib/layout.js';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makePkg(extra: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'devbak-layout-'));
  created.push(root);
  writeFileSync(join(root, 'package.json'), '{"name":"x","version":"0.0.1"}\n');
  for (const dir of extra) mkdirSync(join(root, dir), { recursive: true });
  return root;
}

describe('packageRoot', () => {
  it('package.json이 있는 첫 조상을 낸다', () => {
    const root = makePkg(['dist']);
    expect(packageRoot(join(root, 'dist', 'bin.js'))).toBe(root);
  });

  it('중첩된 깊이에서도 같은 루트를 낸다 — 번들 여부로 답이 갈리지 않는다', () => {
    const root = makePkg(['src/ops']);
    expect(packageRoot(join(root, 'src', 'ops', 'copy-overlay.ts'))).toBe(root);
  });

  it('찾지 못하면 던진다 — 조용히 상위 아무 곳이나 고르지 않는다', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'devbak-orphan-'));
    created.push(orphan);
    // tmpdir 위로는 package.json이 없다고 단정할 수 없으므로, 루트까지
    // 올라가도 못 찾는 상황 대신 "던진다"는 계약만 확인한다.
    expect(() => packageRoot('/')).toThrow(/package\.json/);
  });
});

describe('packageLayout', () => {
  it('src가 있으면 source다', () => {
    expect(packageLayout(makePkg(['src', 'dist']))).toBe('source');
  });

  it('src가 없으면 bundled다 — 게시본에는 dist와 templates만 들어간다', () => {
    expect(packageLayout(makePkg(['dist', 'templates']))).toBe('bundled');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/layout.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/lib/layout.js"`

- [ ] **Step 3: `layout.ts`를 만든다**

`packages/devkit-cli/src/lib/layout.ts`:

```ts
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * 이 패키지가 실행되는 형태.
 *
 * `source` 는 이 저장소에서 직접 실행하는 경우(개발·e2e), `bundled` 는 게시된
 * tarball 을 소비자가 설치해 실행하는 경우다. `files: ["dist", "templates"]`
 * 이므로 게시본에는 `src` 가 없고, 그것이 두 레이아웃을 가르는 사실이다.
 */
export type Layout = 'source' | 'bundled';

/**
 * `from` 에서 위로 올라가며 `package.json` 이 있는 첫 디렉토리를 낸다.
 *
 * 파일 위치를 기준으로 상대 깊이를 세지 않는 이유는 tsup 번들 때문이다 —
 * `src/ops/copy-overlay.ts` 는 번들되면 `dist/chunk-*.js` 가 되어 깊이가
 * 달라진다. 패키지 루트를 찾아 거기서부터 잡으면 번들 여부와 무관해진다.
 *
 * 못 찾으면 던진다. 조용히 상위 아무 디렉토리나 고르면 템플릿을 엉뚱한 곳에서
 * 읽으려 하다 원인을 알 수 없는 실패가 된다.
 */
export function packageRoot(from: string): string {
  let dir = resolve(from);
  if (existsSync(dir) && !statSync(dir).isDirectory()) dir = dirname(dir);
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`${from} 에서 위로 탐색했지만 package.json을 찾지 못했습니다.`);
    }
    dir = parent;
  }
}

/** 패키지 루트를 보고 레이아웃을 판정한다. */
export function packageLayout(pkgRoot: string): Layout {
  return existsSync(join(pkgRoot, 'src')) ? 'source' : 'bundled';
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/layout.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: `assertDistFresh`가 레이아웃을 인지하게 한다**

`packages/devkit-cli/src/bin.ts`에서 import를 추가하고:

```ts
import { packageLayout, packageRoot } from './lib/layout.js';
```

`assertDistFresh`의 본문 맨 앞에 조기 반환을 넣는다. 기존 주석은 유지하고 아래 문단을 덧붙인다:

```ts
export function assertDistFresh(pkgDir: string): void {
  // 게시본에는 src 가 없다. 여기서 newestMtime 을 부르면 readdirSync 가
  // ENOENT 로 죽는다. 검사를 건너뛰는 것이 방어를 포기하는 것은 아니다 —
  // 게시 경로는 prepublishOnly: pnpm build 가 tarball 을 만들 때 이미
  // 보장하고, 게시본의 dist 는 그 버전에 얼어붙어 낡을 수 없다.
  if (packageLayout(pkgDir) === 'bundled') return;

  const distBin = join(pkgDir, 'dist', 'bin.js');
  if (!existsSync(distBin)) return;
  if (newestMtime(join(pkgDir, 'src')) > statSync(distBin).mtimeMs) {
    throw new Error('devkit-cli의 dist가 src보다 오래됐습니다. `pnpm build`를 먼저 실행하세요.');
  }
}
```

- [ ] **Step 6: `assertDistFresh`의 양쪽 레이아웃을 고정하는 테스트를 더한다**

`packages/devkit-cli/tests/bin.test.ts`의 기존 import에 `assertDistFresh`를 추가한다:

```ts
import { assertDistFresh, findToolkitRoot, main } from '../src/bin.js';
```

파일 끝에 붙인다:

```ts
describe('assertDistFresh', () => {
  it('source 레이아웃에서 dist가 src보다 오래되면 던진다', () => {
    const pkg = mkdtempSync(join(tmpdir(), 'devbak-fresh-'));
    created.push(pkg);
    mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(join(pkg, 'dist', 'bin.js'), '');
    // dist 를 먼저 쓰고 src 를 나중에 써서 src 가 더 새롭게 만든다.
    mkdirSync(join(pkg, 'src'), { recursive: true });
    writeFileSync(join(pkg, 'src', 'bin.ts'), '');

    expect(() => assertDistFresh(pkg)).toThrow(/pnpm build/);
  });

  it('bundled 레이아웃에서는 검사하지 않는다 — src가 없어도 죽지 않는다', () => {
    // 게시본의 실제 모양: dist 와 templates 만 있고 src 가 없다.
    // 이 방어가 없으면 readdirSync 가 ENOENT 로 던져 CLI 가 첫 줄에서 죽는다.
    const pkg = mkdtempSync(join(tmpdir(), 'devbak-bundled-'));
    created.push(pkg);
    mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(join(pkg, 'dist', 'bin.js'), '');
    mkdirSync(join(pkg, 'templates'), { recursive: true });

    expect(() => assertDistFresh(pkg)).not.toThrow();
  });
});
```

- [ ] **Step 7: 두 번째 테스트가 실제로 회귀를 잡는지 확인한다**

`assertDistFresh`의 조기 반환 두 줄을 잠시 주석 처리하고 돌린다:

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/bin.test.ts
```

Expected: `bundled 레이아웃에서는 검사하지 않는다`가 ENOENT로 FAIL.
확인한 뒤 **주석을 반드시 되돌리고** 다시 돌려 PASS를 확인한다.

- [ ] **Step 8: `templatesRoot()`를 패키지 루트 기준으로 단순화한다**

`packages/devkit-cli/src/ops/copy-overlay.ts`의 `templatesRoot`를 통째로 교체한다:

```ts
/**
 * 템플릿 트리의 루트.
 *
 * 두 레이아웃 모두 템플릿은 패키지 루트 바로 아래에 있다(게시본은 files 로
 * `templates` 를 함께 싣는다). 그래서 파일 기준 상대 깊이를 세지 않고 패키지
 * 루트를 찾아 거기서 잡는다 — 번들되면 이 파일이 dist/chunk-*.js 가 되어
 * 깊이가 달라지므로, 깊이를 세는 방식은 레이아웃마다 후보를 늘려야 한다.
 */
function templatesRoot(): string {
  const root = join(packageRoot(fileURLToPath(import.meta.url)), 'templates');
  if (!existsSync(root)) {
    throw new Error(`templates 디렉토리를 찾지 못했습니다 (확인한 경로: ${root}).`);
  }
  return root;
}
```

import에 `packageRoot`를 추가한다:

```ts
import { packageRoot } from '../lib/layout.js';
```

`existsSync`·`fileURLToPath`·`join`이 이미 import돼 있는지 확인하고, `dirname`이 이 변경으로 안 쓰이게 되면 지운다(oxlint의 `no-unused-vars`가 잡는다).

- [ ] **Step 9: `devkitVersion()`의 중복 walk-up을 없앤다**

`packages/devkit-cli/src/lib/version.ts`의 `devkitVersion` 본문을 교체한다. 기존 함수 주석은 유지한다:

```ts
export function devkitVersion(): string {
  const pkgPath = join(packageRoot(fileURLToPath(import.meta.url)), 'package.json');
  const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(`${pkgPath} 에 version 문자열이 없습니다.`);
  }
  return parsed.version;
}
```

import를 정리한다 — `packageRoot`를 더하고, `existsSync`·`dirname`이 안 쓰이면 지운다.

**왜 하는가**: `packageRoot`와 글자 그대로 같은 walk를 두 번 구현한 상태였다. 한쪽만 고치면 갈라진다.

- [ ] **Step 10: 전체 검증**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
```

Expected: 테스트 43파일/372개(신규 `layout.test.ts` 5건 + `bin.test.ts` 2건 = 365+7), typecheck 7/7, oxlint 에러 0·warning 3, ESLint 8/8.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "refactor: 패키지 레이아웃 판별을 layout.ts 한 곳으로 모은다"
```

---

### Task 2: `toolkitRoot`를 nullable로 만든다

**Files:**
- Modify: `packages/devkit-cli/src/types.ts` (`Ctx.toolkitRoot`)
- Modify: `packages/devkit-cli/src/bin.ts` (`main`, `runCreate`, `runUpdateCommand`)
- Modify: `packages/devkit-cli/src/update/index.ts` (`UpdateOptions.toolkitRoot`, 자기보호 가드)
- Modify: `packages/devkit-cli/tests/flatten.test.ts:30` (주석 정정)
- Test: `packages/devkit-cli/tests/update-flow.test.ts`

**Interfaces:**
- Consumes: `packageLayout(pkgRoot)` (Task 1)
- Produces: `Ctx.toolkitRoot: string | null`, `UpdateOptions.toolkitRoot: string | null`

**배경 — 왜 `null`인가**

`toolkitRoot`의 실사용처는 `runUpdate`의 자기보호 가드 하나다(`targetDir === toolkitRoot`면 거부 — 툴킷 저장소 자신이 프로젝트 템플릿으로 덮이는 것을 막는다). 게시본에는 툴킷 저장소라는 개념이 없다.

지금 게시본에서 `findToolkitRoot`를 부르면 **소비자가 pnpm 모노레포일 때 소비자의 워크스페이스 루트를 찾는다.** 그러면 사용자가 그 루트에서 `devbak update`를 돌릴 때 가드가 정당한 사용을 거부한다. `pnpm dlx`면 아예 던진다. `null`은 "검사 생략"이 아니라 **"툴킷 저장소가 존재하지 않는다"는 사실의 표현**이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/update-flow.test.ts` 파일 끝에 추가한다. 파일 상단의 기존 import와 헬퍼를 그대로 쓴다(`runUpdate`, `mkdtempSync`, `tmpdir`, `join`, `writeFileSync`, `created`가 이미 있다 — 없으면 추가한다):

```ts
describe('toolkitRoot가 null일 때 (게시본 실행)', () => {
  it('자기보호 가드가 발동하지 않는다 — 소비자 워크스페이스 루트를 막으면 안 된다', async () => {
    // 게시본에는 툴킷 저장소가 없다. 예전처럼 findToolkitRoot 로 위를 뒤지면
    // 소비자가 모노레포일 때 소비자의 루트를 toolkitRoot 로 잡아버리고,
    // 사용자가 바로 그 루트에서 update 를 돌릴 때 거부당한다.
    const target = mkdtempSync(join(tmpdir(), 'devbak-consumer-'));
    created.push(target);
    writeFileSync(join(target, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeFileSync(
      join(target, 'package.json'),
      `${JSON.stringify({ name: 'consumer', devkit: { type: 'nest', version: '0.1.0' } }, null, 2)}\n`,
    );

    await expect(
      runUpdate({
        targetDir: target,
        toolkitRoot: null,
        dryRun: true,
        yes: true,
        skipInstall: true,
        log: () => {},
      }),
    ).resolves.toBeUndefined();
  });

  it('toolkitRoot가 있으면 그 디렉토리를 대상으로 삼는 것은 여전히 막는다', async () => {
    const toolkit = mkdtempSync(join(tmpdir(), 'devbak-toolkit-'));
    created.push(toolkit);
    writeFileSync(join(toolkit, 'package.json'), '{"name":"eslint-workspace"}\n');

    await expect(
      runUpdate({
        targetDir: toolkit,
        toolkitRoot: toolkit,
        dryRun: true,
        yes: true,
        skipInstall: true,
        log: () => {},
      }),
    ).rejects.toThrow(/툴킷 저장소 자신은 update 대상이 될 수 없습니다/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/update-flow.test.ts
```

Expected: 첫 번째가 타입 에러 또는 FAIL(`toolkitRoot: null`이 `string`에 할당 불가).

- [ ] **Step 3: `Ctx.toolkitRoot`의 타입을 넓힌다**

`packages/devkit-cli/src/types.ts`:

```ts
export interface Ctx {
  /** 생성될 프로젝트의 절대경로 */
  targetDir: string;
  /**
   * 툴킷 저장소 루트의 절대경로. **게시본으로 실행하면 `null` 이다** —
   * 그 경우 툴킷 저장소라는 것이 존재하지 않는다(설계 3.2절). 검사를
   * 생략한다는 뜻이 아니라 대상이 없다는 뜻이다.
   */
  toolkitRoot: string | null;
  /** 프로젝트 이름 (= basename(targetDir)) */
  name: string;
  log: (message: string) => void;
}
```

- [ ] **Step 4: `runUpdate`의 가드를 고친다**

`packages/devkit-cli/src/update/index.ts`:

```ts
export interface UpdateOptions {
  targetDir: string;
  /** 게시본 실행에서는 null 이다. types.ts 의 Ctx.toolkitRoot 와 같은 계약이다. */
  toolkitRoot: string | null;
  // (나머지 필드는 그대로)
```

그리고 본문:

```ts
  const targetDir = resolve(options.targetDir);
  const toolkitRoot = options.toolkitRoot === null ? null : resolve(options.toolkitRoot);

  // 1. 대상 확정. 툴킷 저장소 자신을 대상으로 삼으면 `pnpm devbak update` 한 번에
  // 이 저장소가 프로젝트 템플릿으로 덮인다 — 무심코 칠 수 있는 명령이라 막는다.
  // 게시본(toolkitRoot === null)에는 막을 저장소가 없다.
  if (toolkitRoot !== null && targetDir === toolkitRoot) {
    throw new Error(
      '툴킷 저장소 자신은 update 대상이 될 수 없습니다. 대상 프로젝트 경로를 지정하세요.',
    );
  }
```

- [ ] **Step 5: `main()`이 레이아웃에 따라 `toolkitRoot`를 정하게 한다**

`packages/devkit-cli/src/bin.ts`의 `main` 안:

```ts
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  assertDistFresh(pkgDir);
  // 게시본에는 툴킷 저장소가 없다. 여기서 findToolkitRoot 를 부르면 소비자가
  // 모노레포일 때 소비자의 pnpm-workspace.yaml 을 찾아 toolkitRoot 로 삼고,
  // 그러면 자기보호 가드가 정당한 update 를 거부한다.
  const toolkitRoot = packageLayout(pkgDir) === 'source' ? findToolkitRoot(pkgDir) : null;
```

`runCreate`와 `runUpdateCommand`의 `toolkitRoot` 파라미터 타입도 `string | null`로 바꾼다.

- [ ] **Step 6: `flatten.test.ts`의 낡은 주석을 고친다**

`packages/devkit-cli/tests/flatten.test.ts:30`:

```ts
    // toolkitRoot는 매핑되지 않는다 — 하위 ctx 로 내려가도 툴킷 저장소는
    // 그대로 하나다(자기보호 가드가 보는 값이다).
```

기존 주석("`link:` 상대경로 계산의 기준점이다")은 그 계산이 사라져 거짓이 됐다. 최종 리뷰 M-6이 잡은 항목이다.

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run
```

Expected: 전부 PASS. 스냅샷이 깨지면 `toolkitRoot` 타입 변경 때문인지 확인하고, 값이 그대로면 `pnpm exec vitest run -u`로 갱신한다(**패키지 디렉토리에서 돌린다** — 루트에서 돌리면 기본 glob이 e2e까지 잡는다).

- [ ] **Step 8: 전체 검증**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
```

Expected: 테스트 43파일/374개(Task 1의 372 + 신규 2건), 나머지 기준선 유지.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "fix: 게시본에는 툴킷 저장소가 없다는 것을 타입으로 표현한다"
```

---

### Task 3: 버전 관문의 대상을 "선언되는 이름"으로 좁힌다

**Files:**
- Modify: `packages/devkit-cli/tests/registry-version.test.ts`

**Interfaces:**
- Consumes: 기존 `declaredShortNames()`, `publishedPackages()`, `satisfiesCaretZero()`
- Produces: 없음

**배경**

지금 버전 검사는 **`private`이 아닌 패키지 전부**를 훑는다. Task 4에서 `devkit-cli`의 `private: true`를 떼는 순간 CLI가 검사 대상에 들어온다. 그런데 관문이 검사하려던 명제는 **"생성물이 `^0.1.0`으로 선언한 범위가 실제 게시본을 가리키는가"**다. CLI는 아무도 의존으로 선언하지 않고 사람이 `pnpm dlx`로 부르는 도구라 이 명제의 대상이 아니다.

대상을 `declaredShortNames()`(레시피가 `registryDeps`로 실제 선언하는 이름)로 좁히면 **`devkit-cli`가 자동으로 빠지고**, 예외 목록을 손으로 관리하지 않아도 된다.

- [ ] **Step 1: 버전 검사 테스트를 고쳐 쓴다**

`packages/devkit-cli/tests/registry-version.test.ts`의 첫 번째 `it`를 교체한다:

```ts
  it('레시피가 선언하는 패키지의 version 이 전부 범위를 만족한다', async () => {
    // 대상은 "게시되는 것 전부"가 아니라 "생성물이 ^0.1.0 으로 선언하는 것"이다.
    // devkit-cli 는 아무 레시피도 선언하지 않는 도구라 여기 해당하지 않는다 —
    // 예외 목록을 손으로 들지 않아도 자동으로 빠진다.
    //
    // 어긋나면 devbak 이 심는 범위가 실제 게시본을 못 가리키고, 생성물은
    // 에러 없이 옛 버전을 설치한다 — 조용한 실패다.
    const byName = new Map(
      (await publishedPackages()).map((p) => [(p.name ?? '').replace('@cheolubak/', ''), p]),
    );
    const declared = declaredShortNames();
    // 선언이 하나도 없으면 아래 루프가 0회 돌아 "검사할 것이 없으니 통과"가 된다.
    expect(declared.size).toBeGreaterThan(0);

    for (const name of declared) {
      const pkg = byName.get(name);
      expect(pkg, `레시피가 선언한 @cheolubak/${name} 가 워크스페이스에 없다`).toBeDefined();
      expect(
        satisfiesCaretZero(pkg?.version ?? '', DEVKIT_VERSION_RANGE),
        `${pkg?.name ?? name}@${pkg?.version ?? '(버전 없음)'} 이 ${DEVKIT_VERSION_RANGE} 를 벗어난다`,
      ).toBe(true);
    }
  });
```

두 번째 `it`(존재 검사)는 그대로 둔다 — 역할이 다르다(오타 방어).

- [ ] **Step 2: 통과를 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/registry-version.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 3: 관문이 실제로 무는지 실증한다 (건너뛰지 말 것)**

`packages/devkit-cli/src/ops/registry-deps.ts`의 `DEVKIT_VERSION_RANGE`를 잠시 `'^0.2.0'`으로 바꾸고 돌린다.

Expected: FAIL, 메시지에 `@cheolubak/...@0.1.0 이 ^0.2.0 를 벗어난다`.

**확인 후 반드시 `'^0.1.0'`으로 되돌리고** 다시 통과를 확인한다. `git diff`가 비었는지 본다.

- [ ] **Step 4: `devkit-cli`가 대상에서 빠지는지 확인한다**

`packages/devkit-cli/package.json`의 `"private": true`를 잠시 지우고 관문을 돌린다.

Expected: PASS — `devkit-cli`가 `publishedPackages()`에는 들어오지만 `declaredShortNames()`에 없으므로 버전 검사를 받지 않는다.

**확인 후 `"private": true`를 되돌린다**(제거는 Task 4의 일이다). `git diff`가 비었는지 본다.

- [ ] **Step 5: 전체 검증과 커밋**

```bash
pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "test: 버전 관문의 대상을 레시피가 선언하는 패키지로 좁힌다"
```

Expected: 테스트 개수 변화 없음(374개).

---

### Task 4: 게시 메타데이터

**Files:**
- Modify: `packages/devkit-cli/package.json`
- Modify: `package.json` (루트, `publish:packages`)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: `devkit-cli`를 게시 대상으로 바꾼다**

`packages/devkit-cli/package.json`에서 `"private": true` 줄을 지우고, 나머지 6개와 같은 모양으로 `publishConfig`를 넣는다(`repository`는 이미 있는지 확인하고 없으면 추가):

```json
  "publishConfig": {
    "access": "public",
    "registry": "https://npm.pkg.github.com"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/cheolubak/devkit.git",
    "directory": "packages/devkit-cli"
  },
```

`files`(`["dist", "templates"]`)·`bin`(`{"devbak": "./dist/bin.js"}`)·`prepublishOnly`(`pnpm build`)는 **이미 있다. 바꾸지 않는다.**

- [ ] **Step 2: 게시 스크립트의 제외 필터를 걷어낸다**

루트 `package.json`의 `publish:packages`에서 `--filter '!@cheolubak/devkit-cli'`를 지운다. 결과가 워크스페이스 전체 재귀 게시가 되도록 한다(`pnpm`이 `private: true`인 패키지를 자체적으로 거른다).

- [ ] **Step 3: dry-run으로 tarball을 확인한다 (게시하지 않는다)**

```bash
pnpm build
cd packages/devkit-cli && GITHUB_TOKEN=$(gh auth token) pnpm publish --dry-run --no-git-checks
```

Expected 출력에 다음이 보인다:
- `@cheolubak/devkit-cli@0.1.0`
- `dist/bin.js`, `dist/index.js`, `dist/index.d.ts`, `dist/bin.d.ts`, `dist/chunk-*.js`
- `templates/` 아래 전부 — `_npmrc`, `_gitignore`, `_prettierignore`, `**/.claude/**`, `**/.github/**` 포함
- `src/` **없음**
- 총 32개 내외

파일 목록을 보고서에 남긴다. **`--dry-run` 없이 실행하지 않는다.**

- [ ] **Step 4: 전체 검증과 커밋**

```bash
pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "build: devkit-cli 를 게시 대상으로 바꾼다"
```

---

### Task 5: pack 기반 e2e

**Files:**
- Create: `packages/devkit-cli/tests/e2e/packed.e2e.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

**배경**

게시본 경로는 코드가 실제로 갈라진다(레이아웃 판별, `src` 부재, `toolkitRoot === null`). 저장소 경로만 도는 기존 e2e 11개는 그 갈래를 밟지 않는다. 이번 레지스트리 전환에서 얻은 교훈이 정확히 이것이다 — **`link:`가 감춘 결함은 실제 설치 경로를 밟는 e2e만 잡았다.**

`pnpm pack`은 `files` 화이트리스트를 그대로 적용하므로 "템플릿이 tarball에서 빠졌다" 같은 것도 함께 잡힌다. 게시 없이 tarball 실물을 밟는다.

- [ ] **Step 1: 테스트를 쓴다**

`packages/devkit-cli/tests/e2e/packed.e2e.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// 다른 e2e 파일과 같은 가드다. 생성물의 pnpm install 이 GitHub Packages 를
// 타므로 토큰이 없으면 401 로 죽는다 — 조용히 건너뛰지 않고 알아볼 수 있는
// 메시지로 먼저 실패시킨다.
if (process.env.GITHUB_TOKEN === undefined || process.env.GITHUB_TOKEN === '') {
  throw new Error(
    'GITHUB_TOKEN 이 없어 e2e 를 돌릴 수 없습니다. ' +
      '`GITHUB_TOKEN=$(gh auth token) pnpm test:e2e` 로 실행하세요. ' +
      '토큰에 read:packages 권한이 있어야 합니다.',
  );
}

const PKG = resolve(import.meta.dirname, '..', '..');
const created: string[] = [];

afterAll(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** tarball 을 만들어 풀고, 풀린 패키지 루트를 낸다. */
function packAndExtract(): string {
  const out = mkdtempSync(join(tmpdir(), 'devbak-pack-'));
  created.push(out);
  execFileSync('pnpm', ['pack', '--pack-destination', out], {
    cwd: PKG,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'));
  if (tgz === undefined) {
    throw new Error(`pnpm pack 이 tarball 을 남기지 않았습니다: ${out}`);
  }
  execFileSync('tar', ['-xzf', join(out, tgz), '-C', out], { stdio: 'pipe' });
  return join(out, 'package');
}

describe('게시본(tarball) 으로 실행하기', () => {
  it('tarball 에는 dist 와 templates 만 있고 src 는 없다', () => {
    const root = packAndExtract();
    expect(existsSync(join(root, 'dist', 'bin.js'))).toBe(true);
    expect(existsSync(join(root, 'templates', 'nest'))).toBe(true);
    // _npmrc 는 npm 이 dot-file 을 거르므로 밑줄 이름으로 실린다.
    expect(existsSync(join(root, 'templates', '_shared', '_npmrc'))).toBe(true);
    // src 가 실리면 assertDistFresh 가 게시본에서도 돌아 레이아웃 판별이 깨진다.
    expect(existsSync(join(root, 'src'))).toBe(false);
  });

  it('풀린 bin.js 로 nest 프로젝트를 만든다 — 툴킷 저장소 없이 동작한다', () => {
    const root = packAndExtract();
    const work = mkdtempSync(join(tmpdir(), 'devbak-packed-work-'));
    created.push(work);

    // cwd 를 임시 디렉토리로 둔다. 툴킷 워크스페이스 밖이므로
    // pnpm-workspace.yaml 범위 문제가 없고 사용자 디렉토리도 오염되지 않는다.
    execFileSync('node', [join(root, 'dist', 'bin.js'), 'create', 'packed-api', '--type', 'nest', '--no-verify'], {
      cwd: work,
      stdio: 'pipe',
      encoding: 'utf8',
    });

    const project = join(work, 'packed-api');
    const pkg = readFileSync(join(project, 'package.json'), 'utf8');
    expect(pkg).toContain('"@cheolubak/tsconfig": "^0.1.0"');
    expect(pkg).not.toContain('link:');
    expect(existsSync(join(project, '.npmrc'))).toBe(true);
    expect(existsSync(join(project, 'eslint.config.mjs'))).toBe(true);
    // 설치가 실제로 됐는지 — 레지스트리 경로가 통했다는 증거다.
    expect(existsSync(join(project, 'node_modules', '@cheolubak', 'tsconfig'))).toBe(true);
  });
});
```

- [ ] **Step 2: 돌려서 통과를 확인한다**

```bash
cd packages/devkit-cli && GITHUB_TOKEN=$(gh auth token) pnpm exec vitest run --config vitest.e2e.config.ts tests/e2e/packed.e2e.test.ts
```

Expected: PASS (2 tests). `pnpm pack`은 현재 `dist`를 그대로 담으므로 **먼저 `pnpm build`가 돼 있어야 한다**(루트에서 `pnpm test:e2e`로 돌리면 turbo가 `dependsOn: ["build"]`로 처리한다).

- [ ] **Step 3: 이 테스트가 실제로 게시본 갈래를 무는지 확인한다**

Task 1에서 넣은 `assertDistFresh`의 `bundled` 조기 반환을 잠시 주석 처리하고 **빌드한 뒤** 두 번째 테스트를 돌린다.

Expected: FAIL — 풀린 tarball에 `src`가 없어 ENOENT.

**확인 후 주석을 되돌리고 다시 빌드해 PASS를 확인한다.** `git diff`가 비었는지 본다.

- [ ] **Step 4: 전체 e2e를 돌린다**

```bash
GITHUB_TOKEN=$(gh auth token) pnpm test:e2e
```

Expected: **13/13** (기존 11 + 신규 2). 수 분 걸린다.

끝나고 잔재를 확인한다 — `git status`가 깨끗하고 `ls -d /Users/dabot/Documents/develop/devkit-e2e-*`가 비어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "test: tarball 실물로 게시본 경로를 검증한다"
```

---

### Task 6: 문서

**Files:**
- Modify: `README.md` (`## CLI 설치` 절 전체, 패키지 표 아래 빌드 문단, 트러블슈팅 표)
- Modify: `packages/devkit-cli/README.md` (첫 문단)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

**배경**

`private: true`를 전제로 쓴 서술이 네 곳 있고 전부 거짓이 된다.

- [ ] **Step 1: 루트 README의 `## CLI 설치` 절을 다시 쓴다**

`pnpm dlx`를 주 경로로 올리고 클론은 개발·기여용으로 내린다. 절의 도입부를 이렇게 바꾼다(기존 "설치하는 것이 아니라 클론해서 쓴다" 문단을 대체):

```markdown
## CLI 설치

`devbak`은 설치 없이 바로 쓸 수 있다.

```bash
pnpm dlx @cheolubak/devkit-cli create my-api --type nest
```

**단, GitHub Packages는 공개 패키지도 익명 접근을 허용하지 않는다.** CLI를
받는 것부터 인증이 필요하므로 `~/.npmrc`에 스코프와 토큰을 한 번 설정해야
한다.

```
@cheolubak:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
gh auth refresh -h github.com -s read:packages   # 브라우저에서 승인
export GITHUB_TOKEN=$(gh auth token)             # ~/.zshrc 에 넣어두면 편하다
```

토큰은 생성물의 `pnpm install`에도 그대로 쓰인다 — 생성물이 `@cheolubak/*`
설정 패키지를 같은 레지스트리에서 받기 때문이다.
```

그 아래에 기존 클론 절차를 **`### 개발·기여용 — 저장소에서 실행하기`** 소절로 옮긴다. `pnpm install` → `pnpm build` → `pnpm devbak ...`와 "빌드가 필수인 이유"(저장소 실행에는 라이프사이클 훅이 없어 낡은 `dist`로 도는 것을 CLI가 스스로 막는다), `git pull` 뒤 재빌드 안내를 유지한다. **`### 저장소 밖 어디서든 쓰기 (선택)`의 alias 절은 삭제한다** — `pnpm dlx`가 그 자리를 대신한다.

- [ ] **Step 2: 패키지 표 아래 빌드 문단을 고친다**

`README.md`의 30~37행 문단 끝에 있는 괄호를 고친다. 현재는 이렇게 돼 있다:

> `devkit-cli`는 `private: true`라 게시되지 않고 저장소에서 직접 실행되므로, 이 검사가 유일한 방어선이다

게시 경로는 `prepublishOnly: pnpm build`가 지키므로 거짓이다. 이렇게 바꾼다:

> 게시 경로는 `prepublishOnly: pnpm build`가 지키지만, 저장소에서 직접 실행할 때는 어떤 훅도 돌지 않으므로 이 검사가 유일한 방어선이다

패키지 표의 `@cheolubak/devkit-cli` 행 설명도 확인하고, 게시되지 않는다는 서술이 있으면 지운다.

- [ ] **Step 3: 트러블슈팅 표를 고친다**

`툴킷 저장소 루트를 찾지 못했습니다` 행을 지운다 — 게시본에서는 그 에러가 나지 않고, 저장소 실행에서 나면 저장소가 깨진 것이다. 대신 `pnpm dlx` 경로의 실제 실패를 넣는다:

```markdown
| `pnpm dlx` 가 `401`/`ERR_PNPM_FETCH_401` 로 실패 | `~/.npmrc`에 `@cheolubak` 스코프 설정이 없거나 `GITHUB_TOKEN`이 비어 있다. 위 설치 절 참고 |
```

- [ ] **Step 4: `packages/devkit-cli/README.md`의 첫 문단을 고친다**

현재 "**이 패키지는 게시하지 않는다** (`private: true`). ... 저장소를 클론해 `pnpm build` 후 `pnpm devbak ...`로 저장소 안에서 직접 실행한다."를 이렇게 바꾼다:

```markdown
```bash
pnpm dlx @cheolubak/devkit-cli create my-api --type nest
```

`~/.npmrc`에 `@cheolubak` 스코프와 토큰이 있어야 한다(GitHub Packages는
공개 패키지도 익명 접근을 허용하지 않는다). 자세한 것은
[루트 README의 CLI 설치](../../README.md#cli-설치).

이 저장소에서 직접 실행할 수도 있다 — `pnpm install && pnpm build` 후
`pnpm devbak ...`. 개발·기여할 때 쓰는 경로다.
```

`## 위치 — 실행한 위치(cwd) 기준이다` 절은 그대로 둔다(여전히 사실이다).

- [ ] **Step 5: 서술이 사실인지 확인한다**

문서에 적은 명령을 실제로 돌려 확인한다:

```bash
pnpm devbak --help                 # 저장소 경로가 여전히 동작하는가
grep -rn "private: true\|게시하지 않는다" README.md packages/devkit-cli/README.md
```

두 번째 명령의 결과에 게시 관련 거짓 서술이 남아 있지 않아야 한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "docs: CLI 를 pnpm dlx 로 쓰는 경로를 주 경로로 올린다"
```

---

### Task 7: 게시와 최종 검증

**Files:**
- Modify: `work-log.md` (추가만)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

**⚠️ 이 태스크만 실제로 게시한다. `0.1.0`은 되돌릴 수 없다.**

- [ ] **Step 1: 게시 전 확인**

```bash
gh auth status | grep -i scopes          # write:packages 가 있어야 한다
git status --porcelain                   # 비어 있어야 한다
pnpm build
GITHUB_TOKEN=$(gh auth token) npm view @cheolubak/devkit-cli versions --registry=https://npm.pkg.github.com
```

마지막 명령은 **404여야 한다**(한 번도 게시된 적 없음). 버전이 나오면 **멈추고 보고한다** — 같은 버전 재게시는 불가능하다.

- [ ] **Step 2: 게시한다**

```bash
cd packages/devkit-cli && GITHUB_TOKEN=$(gh auth token) pnpm publish --no-git-checks
```

Expected: `+ @cheolubak/devkit-cli@0.1.0`

실패하면 **멈추고 보고한다.** 버전을 올려 재시도하지 않는다.

- [ ] **Step 3: 레지스트리에서 확인한다**

```bash
GITHUB_TOKEN=$(gh auth token) npm view @cheolubak/devkit-cli versions --registry=https://npm.pkg.github.com
```

Expected: `[ '0.1.0' ]`

- [ ] **Step 4: `pnpm dlx`로 실제 실행한다 — 이 작업의 최종 증거**

```bash
cd "$(mktemp -d)"
GITHUB_TOKEN=$(gh auth token) pnpm dlx @cheolubak/devkit-cli create dlx-demo --type nest --no-verify
ls dlx-demo
cat dlx-demo/package.json | grep cheolubak
```

Expected: 프로젝트가 생성되고 `@cheolubak/*`가 `^0.1.0`으로 선언돼 있다.
확인 후 임시 디렉토리를 지운다.

**실패하면 무엇이 어떻게 실패했는지 정확히 보고한다.** 게시는 이미 됐으므로 되돌릴 수 없고, 고치려면 `0.1.1`이 필요하다.

- [ ] **Step 5: 전체 검증**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
GITHUB_TOKEN=$(gh auth token) pnpm test:e2e
```

Expected: 테스트 43파일/374개, typecheck 7/7, oxlint 에러 0·warning 3, ESLint 8/8, e2e 13/13.

- [ ] **Step 6: `work-log.md`에 오늘 항목을 추가한다**

`## 2026-08-05` 아래에 새 `###` 항목으로 **추가만** 한다. 기존 항목을 수정하지 않는다. 형식:

```markdown
### devkit-cli 게시 가능화
- **변경 파일**: (실제 목록)
- **내용**: (레이아웃 판별 도입, toolkitRoot nullable, 관문 대상 축소, pack e2e, 게시)
- **커밋**: (범위)
```

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "docs: devkit-cli 게시를 작업 기록에 남긴다"
```

---

## 완료 확인

설계 5절의 완료 기준과 대조한다.

1. `pnpm pack` → 임시 디렉토리에서 `create --type nest --no-verify` 성공 — Task 5
2. 저장소 경로(`pnpm devbak`) 그대로 동작, 기존 e2e 11개 통과 — Task 5 Step 4
3. `assertDistFresh`가 저장소에서는 여전히 낡은 `dist`를 막는다 — Task 1 Step 6
4. 소비자 모노레포 루트에서 `devbak update`가 오작동하지 않는다 — Task 2 Step 1
5. 관문이 `devkit-cli`를 제외하고 여전히 드리프트를 문다 — Task 3 Step 3·4
6. `@cheolubak/devkit-cli@0.1.0` 게시, `pnpm dlx` 실행 — Task 7 Step 2·4
7. 문서 네 곳 갱신 — Task 6
8. 기준선 유지 — 각 태스크 마지막 단계

최종 수치: 테스트 **43파일/374개**, typecheck 7/7, `lint:ox` 에러 0·warning 3, `lint:es` 8/8, e2e **13/13**.
