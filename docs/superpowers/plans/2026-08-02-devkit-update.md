# `devkit update` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 존재하는 프로젝트(devkit 산출물이든 아니든)에 devkit 표준을 재적용하는 `devbak update` 서브커맨드를 만든다.

**Architecture:** `create`가 쓰는 레시피를 그대로 재사용하고, `Step.kind`가 `copyOverlay`·`mergeJson`·`linkDeps`인 것만 남긴다. 각 op에 `plan()`을 추가해 **쓰기 전에 최종 내용을 전부 계산**하고, 그 결과를 사람에게 보여준 뒤 같은 바이트를 쓴다. `run()`은 `plan()` + 생성 시점 가드 + 쓰기로 재구성되므로 두 경로가 갈라질 수 없다.

**Tech Stack:** TypeScript (ESM, strict), Node 20+ (`node:fs/promises`, `node:readline/promises`), vitest, tsup, pnpm

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-02-devkit-update-design.md` (이하 "설계"). 절 번호는 이 문서를 가리킨다.
- 패키지 매니저는 **pnpm**. `npm`을 쓰지 않는다.
- TypeScript strict mode, 2-space 들여쓰기, `async/await` (`.then()` 체인 금지 — 기존 `catch(() => …)` 관용은 유지).
- 주석·에러 메시지·커밋 메시지는 **한국어**. 기존 코드의 문체(왜 그런지를 적는다)를 따른다.
- 검증 명령: `pnpm lint:es`(ESLint 단독), `pnpm lint`(oxlint && eslint — 단락 평가라 oxlint가 실패하면 ESLint가 아예 안 돈다), `pnpm test`, `pnpm build`.
- **`create` 경로의 산출물은 Task 7의 마커 한 키를 빼면 바이트 단위로 동일해야 한다.** 기존 스냅샷 테스트가 이를 지킨다.
- 새 파일은 전부 `packages/devkit-cli/` 아래. 다른 패키지를 건드리지 않는다.
- 브랜치는 `feature/devkit-update`. 커밋 메시지는 imperative mood.

---

## 파일 구조

| 파일 | 책임 | 상태 |
| --- | --- | --- |
| `src/types.ts` | `PlannedChange`, `Step.plan?`, `Step.children?` | 수정 |
| `src/run.ts` | `compose`가 `children`을 노출 | 수정 |
| `src/ops/copy-overlay.ts` | `plan` 구현, `run`을 `plan` 기반으로 | 수정 |
| `src/ops/remove-files.ts` | `removes` 노출 (계획에서만 반영, 디스크는 안 건드림) | 수정 |
| `src/ops/merge-json.ts` | `plan` 구현, `run`을 `plan` 기반으로 | 수정 |
| `src/ops/link-deps.ts` | `plan` 구현, `run`을 `plan` 기반으로 | 수정 |
| `src/lib/categories.ts` | `categoryOfJsonPath`, 키 테이블 확장 | 수정 |
| `src/lib/version.ts` | `devkitVersion()` — 마커에 넣을 버전 | 신규 |
| `src/lib/confirm.ts` | y/N 프롬프트 (주입 가능) | 신규 |
| `src/update/flatten.ts` | `flattenSteps` — `compose` 재귀 | 신규 |
| `src/update/json-patch.ts` | `filterPatch`, `reduceJsonOverlay` | 신규 |
| `src/update/plan.ts` | `buildPlan` — 조립 | 신규 |
| `src/update/index.ts` | `runUpdate` — 흐름 | 신규 |
| `src/recipes/{nest,next,monorepo}.ts` | `markerPatch` 스프레드 | 수정 |
| `src/bin.ts` | `runCreate` / `runUpdate` 분기 | 수정 |

`plan.ts`와 `index.ts`를 나누는 이유는 테스트 때문이다. 플랜 생성은 읽기만 하는 함수라 단위 테스트가 쉽고, 흐름은 프롬프트·설치·git이 얽혀 통합 테스트 영역이다.

---

## Task 1: JSON 키 경로 카테고리 분류

**Files:**
- Modify: `packages/devkit-cli/src/lib/categories.ts`
- Test: `packages/devkit-cli/tests/categories.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `type Category` (기존)
  - `MARKER_KEY: 'devkit'`
  - `PROJECT_OWNED_KEYS: readonly string[]` — `['name', 'version']`
  - `categoryOfJsonPath(path: string): Category | null` — 표에 걸리면 카테고리, 더 내려가야 하면 `null`
  - `assertKnownJsonPath(path: string): never` 대신 호출자가 `UnknownCategoryError`를 던진다 (기존 클래스 재사용)

설계 6.2절의 표를 구현한다. `JSON_KEY_CATEGORIES`를 **점 경로 prefix 테이블**로 바꾼다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/categories.test.ts` 끝에 추가:

```ts
import { categoryOfJsonPath, MARKER_KEY, PROJECT_OWNED_KEYS } from '../src/lib/categories.js';

describe('categoryOfJsonPath', () => {
  it.each([
    ['dependencies', 'deps'],
    ['devDependencies', 'deps'],
    ['devDependencies.eslint', 'deps'],
    ['devDependencies.@devbak/tsconfig', 'deps'],
    ['prettier', 'lint'],
    ['jest', 'test'],
    ['scripts.lint', 'lint'],
    ['scripts.format', 'lint'],
    ['scripts.format:check', 'lint'],
    ['scripts.test', 'test'],
    ['scripts.test:watch', 'test'],
    ['scripts.test:e2e', 'test'],
    ['scripts.build', 'repo'],
    ['scripts.dev', 'repo'],
    ['scripts.typecheck', 'repo'],
    ['packageManager', 'repo'],
    ['private', 'repo'],
    ['type', 'repo'],
  ])('%s → %s', (path, expected) => {
    expect(categoryOfJsonPath(path)).toBe(expected);
  });

  it('중간 노드는 null을 반환해 더 내려가게 한다', () => {
    // scripts 자체에는 카테고리가 없다 — 하위 키마다 다르기 때문이다.
    expect(categoryOfJsonPath('scripts')).toBeNull();
  });

  it('표에 없는 경로도 null이다 — 던지는 것은 호출자의 몫이다', () => {
    expect(categoryOfJsonPath('nonsense')).toBeNull();
  });

  it('더 긴 prefix가 이긴다', () => {
    // 'scripts.test'와 'scripts.test:e2e'가 둘 다 있을 때 후자가 이겨야
    // 한다. 'scripts.test'가 이기면 'scripts.test:e2e'는 영영 안 걸린다.
    expect(categoryOfJsonPath('scripts.test:e2e')).toBe('test');
  });
});

describe('마커·프로젝트 고유 키', () => {
  it('마커 키는 devkit이다', () => {
    expect(MARKER_KEY).toBe('devkit');
  });

  it('name·version은 프로젝트 고유값이라 재적용 대상이 아니다', () => {
    expect([...PROJECT_OWNED_KEYS]).toEqual(['name', 'version']);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/categories.test.ts
```

Expected: FAIL — `categoryOfJsonPath is not a function` / import 실패

- [ ] **Step 3: 구현한다**

`src/lib/categories.ts`에서 기존 `JSON_KEY_CATEGORIES` 블록을 아래로 **교체**한다(주석 포함):

```ts
/**
 * `package.json` 의 **키 경로** 카테고리(설계 6.2절).
 *
 * `package.json` 만 키 단위인 이유는 그 파일의 키가 실제로 여러 카테고리에
 * 걸쳐 있기 때문이다 — `prettier` 는 lint, `devDependencies` 는 deps,
 * `jest` 는 test 다. 파일 하나로 뭉뚱그리면 `--only lint` 가 의존성까지
 * 갱신한다. 다른 JSON 파일(`tsconfig.json`·`turbo.json`)은 파일 카테고리를
 * 그대로 물려받는다.
 *
 * 점 경로 prefix 매칭이며 **더 긴 쪽이 이긴다**. `devDependencies.eslint` 는
 * `devDependencies` 에 걸리고, `scripts.lint` 는 `scripts` 에 항목이 없으므로
 * 자기 자신에 걸린다.
 *
 * 여기 없는 경로를 만나면 호출자가 던진다(설계 6.3절). 조용히 건너뛰면 그
 * 키는 어떤 `--only` 로도 갱신되지 않으면서 성공을 보고한다.
 */
export const JSON_KEY_CATEGORIES: Readonly<Record<string, Category>> = {
  dependencies: 'deps',
  devDependencies: 'deps',
  prettier: 'lint',
  jest: 'test',
  'scripts.lint': 'lint',
  'scripts.format': 'lint',
  'scripts.format:check': 'lint',
  'scripts.test': 'test',
  'scripts.test:watch': 'test',
  'scripts.test:e2e': 'test',
  'scripts.build': 'repo',
  'scripts.dev': 'repo',
  'scripts.typecheck': 'repo',
  packageManager: 'repo',
  private: 'repo',
  type: 'repo',
};

/**
 * 유형 마커의 키. 카테고리를 갖지 않는다 — `--only` 로 거르는 대상이
 * 아니라 전체 update 만 심는 별도 취급이다(설계 4.2절).
 */
export const MARKER_KEY = 'devkit';

/**
 * 프로젝트 고유값이라 재적용 대상에서 제외하는 `package.json` 키.
 *
 * 템플릿의 `"name": "__NAME__"` 은 create 가 디렉토리 이름으로 치환하는
 * 자리다. update 가 이를 다시 쓰면 사용자가 바꾼 패키지 이름을 디렉토리
 * 이름으로 되돌린다(설계 5.5절).
 */
export const PROJECT_OWNED_KEYS: readonly string[] = ['name', 'version'];

/**
 * 점 경로에 해당하는 카테고리. 더 내려가야 하면 `null`.
 *
 * `null` 은 "모른다"가 아니라 "이 노드에서는 결정할 수 없으니 자식으로
 * 내려가라"는 뜻이다. 잎(leaf)에 닿았는데도 `null` 이면 그때 호출자가
 * `UnknownCategoryError` 를 던진다.
 */
export function categoryOfJsonPath(path: string): Category | null {
  let best: { key: string; category: Category } | null = null;

  for (const [key, category] of Object.entries(JSON_KEY_CATEGORIES)) {
    if (path !== key && !path.startsWith(`${key}.`)) continue;
    if (best === null || key.length > best.key.length) {
      best = { key, category };
    }
  }

  return best?.category ?? null;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/categories.test.ts
pnpm lint:es
```

Expected: 전부 PASS. 기존 `JSON_KEY_CATEGORIES` 테스트가 있다면 새 표에 맞춰 고친다(`prettier`·`devDependencies`는 그대로 있으므로 대개 통과한다).

- [ ] **Step 5: 커밋**

```bash
git add packages/devkit-cli/src/lib/categories.ts packages/devkit-cli/tests/categories.test.ts
git commit -m "feat: JSON 키 경로 카테고리 분류를 점 경로 prefix 테이블로 확장"
```

---

## Task 2: `Step.plan` 타입과 `copyOverlay.plan`

**Files:**
- Modify: `packages/devkit-cli/src/types.ts`
- Modify: `packages/devkit-cli/src/run.ts`
- Modify: `packages/devkit-cli/src/ops/copy-overlay.ts`
- Test: `packages/devkit-cli/tests/plan-ops.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `Category` (직접 쓰지는 않음)
- Produces:
  - `type PlannedChange = { kind: 'file'; relPath: string; content: string } | { kind: 'json'; file: string; patch: JsonObject }`
  - `Step.plan?: (ctx: Ctx) => Promise<PlannedChange[]>`
  - `Step.children?: { steps: Step[]; mapCtx: (ctx: Ctx) => Ctx }`
  - `Step.removes?: string[]` — `removeFiles`가 노출하는 대상 경로
  - `copyOverlay(...)`의 `plan`이 `{kind:'file'}` 배열을 반환. `relPath`는 **POSIX `/`**, 내용은 `__KEY__` 치환 완료 상태

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/plan-ops.test.ts` 신규:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyOverlay } from '../src/ops/copy-overlay.js';
import type { Ctx } from '../src/types.js';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-plan-'));
  created.push(dir);
  return { targetDir: dir, toolkitRoot: '/toolkit', name: 'demo', log: () => {} };
}

describe('copyOverlay.plan', () => {
  it('템플릿 트리를 상대경로와 최종 내용으로 낸다', async () => {
    const step = copyOverlay('_shared');
    const changes = await step.plan!(makeCtx());

    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file)).sort();
    expect(paths).toEqual([
      '.claude/commands/review.md',
      '.github/workflows/claude-review.yml',
    ]);
    expect(changes.every((c) => c.kind === 'file')).toBe(true);
  });

  it('언더스코어 접두를 점 이름으로 되돌린다', async () => {
    const step = copyOverlay('nest');
    const changes = await step.plan!(makeCtx());
    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file));

    expect(paths).toContain('.gitignore');
    expect(paths).toContain('.prettierignore');
    expect(paths).not.toContain('_gitignore');
  });

  it('__NAME__을 치환한 내용을 낸다 — 계획과 실제 쓰기가 같은 바이트여야 한다', async () => {
    const step = copyOverlay('monorepo');
    const changes = await step.plan!(makeCtx());
    const pkg = changes.find((c) => c.kind === 'file' && c.relPath === 'package.json');

    expect(pkg).toBeDefined();
    expect(pkg!.kind === 'file' && pkg!.content).toContain('"name": "demo"');
    expect(pkg!.kind === 'file' && pkg!.content).not.toContain('__NAME__');
  });

  it('plan은 아무것도 쓰지 않는다', async () => {
    const ctx = makeCtx();
    await copyOverlay('_shared').plan!(ctx);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(ctx.targetDir)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/plan-ops.test.ts
```

Expected: FAIL — `step.plan is not a function`

- [ ] **Step 3: 타입을 넓힌다**

`src/types.ts`에서 `Step` 인터페이스를 교체하고 `PlannedChange`를 추가한다:

```ts
import type { JsonObject } from './ops/merge-json.js';

/**
 * 쓰기 전에 계산해 둔 변경. update 는 이것을 사람에게 보여주고 확인을 받은
 * 뒤 같은 바이트를 쓴다(설계 5.1절).
 */
export type PlannedChange =
  | { kind: 'file'; relPath: string; content: string }
  | { kind: 'json'; file: string; patch: JsonObject };

export interface Step {
  kind: StepKind;
  label: string;
  /** 스냅샷 테스트용 직렬화. 실행하지 않고 레시피를 검사할 수 있게 한다. */
  describe: () => unknown;
  /**
   * 이 단계가 만들 최종 내용. 아무것도 쓰지 않는다.
   *
   * run 은 이것을 호출해 쓰므로 계획과 실제가 갈라질 수 없다(설계 5.2절).
   * delegate·removeFiles·makeDirs 는 재적용 대상이 아니라 갖지 않는다.
   */
  plan?: (ctx: Ctx) => Promise<PlannedChange[]>;
  /**
   * compose 전용. update 가 하위 레시피까지 따라 들어가기 위해 노출한다 —
   * monorepo 가 next 를 apps/web 에 합성한 구조를 update 가 복제하지 않는다.
   */
  children?: { steps: Step[]; mapCtx: (ctx: Ctx) => Ctx };
  /**
   * removeFiles 전용. update 는 이 단계를 **실행하지 않지만** 계획에는
   * 반영해야 한다 — monorepo 는 next 를 합성한 뒤 apps/web 의
   * eslint.config.mjs·.claude 를 지운다. 무시하면 update 가 매번
   * 되살리고, 그 파일들은 저장소 전체 린트를 죽인다(설계 5.7절).
   */
  removes?: string[];
  run: (ctx: Ctx) => Promise<void>;
}
```

`src/ops/remove-files.ts`의 `removeFiles`가 반환하는 Step에 `removes`를 추가한다(`run`은 그대로):

```ts
  return {
    kind: 'removeFiles',
    label: `삭제: ${paths.join(', ')}`,
    describe: () => ({ paths, required }),
    // update 는 이 단계를 실행하지 않지만, 계획에서는 반영해야 한다.
    // 자세한 이유는 types.ts 의 Step.removes 주석과 설계 5.7절.
    removes: paths,
    run: async (ctx: Ctx) => {
```

`src/run.ts`의 `compose`에 `children`을 추가한다:

```ts
export function compose(label: string, steps: Step[], mapCtx: (ctx: Ctx) => Ctx): Step {
  return {
    kind: 'compose',
    label,
    describe: () => ({ label, steps: steps.map((s) => s.describe()) }),
    children: { steps, mapCtx },
    run: async (ctx: Ctx) => {
      await run(steps, mapCtx(ctx));
    },
  };
}
```

- [ ] **Step 4: `copyOverlay`를 `plan` 기반으로 재구성한다**

`src/ops/copy-overlay.ts`에서 `copyTree`를 **읽기 전용 수집 함수**로 바꾸고, 쓰기는 `run`으로 옮긴다:

```ts
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ctx, PlannedChange, Step } from '../types.js';
import { pathExists } from './path-exists.js';

/** '_' 접두어를 '.'으로 바꾼다. _gitignore → .gitignore */
export function templateFileName(name: string): string {
  return name.startsWith('_') ? `.${name.slice(1)}` : name;
}

/** dist/ 기준으로 templates/ 디렉토리를 찾는다. */
function templatesRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
}

/**
 * 템플릿 트리를 읽어 (상대경로, 최종 내용) 목록으로 만든다. **쓰지 않는다.**
 *
 * 상대경로는 POSIX `/` 로 고정한다 — 카테고리 패턴 테이블이 `/` 를 기준으로
 * 쓰였고(categoryOf 가 스스로 정규화하긴 하지만), 변경 목록 출력도 플랫폼과
 * 무관해야 스냅샷이 안정적이다.
 */
async function collectTree(
  from: string,
  relDir: string,
  vars: Record<string, string>,
): Promise<PlannedChange[]> {
  const entries = await readdir(from, { withFileTypes: true });

  const nested = await Promise.all(
    entries.map(async (entry): Promise<PlannedChange[]> => {
      const name = templateFileName(entry.name);
      const rel = relDir === '' ? name : posix.join(relDir, name);

      if (entry.isDirectory()) {
        return await collectTree(join(from, entry.name), rel, vars);
      }

      let content = await readFile(join(from, entry.name), 'utf8');
      for (const [key, value] of Object.entries(vars)) {
        content = content.replaceAll(`__${key}__`, value);
      }
      return [{ kind: 'file', relPath: rel, content }];
    }),
  );

  return nested.flat();
}
```

`assertNoDrift`는 그대로 둔다. `copyOverlay` 본문을 교체한다:

```ts
export function copyOverlay(
  template: string,
  vars: Record<string, string> = {},
  options: CopyOverlayOptions = {},
): Step {
  const expectUpstream = options.expectUpstream ?? {};

  const plan = async (ctx: Ctx): Promise<PlannedChange[]> =>
    await collectTree(join(templatesRoot(), template), '', { NAME: ctx.name, ...vars });

  return {
    kind: 'copyOverlay',
    label: `오버레이 복사: templates/${template}`,
    describe: () => ({ template, vars: Object.keys(vars), expectUpstream: Object.keys(expectUpstream) }),
    plan,
    run: async (ctx: Ctx) => {
      // 드리프트 감지는 생성 시점 전용 가드다 — 공식 CLI 산출물이 바뀌었는지
      // 본다. plan 에 두지 않는 것이 요구다: update 는 plan 만 호출하므로
      // 사람이 고친 기존 파일을 상류 변경으로 오인하지 않는다(설계 1.3절).
      await assertNoDrift(ctx.targetDir, expectUpstream);

      const changes = await plan(ctx);
      for (const change of changes) {
        if (change.kind !== 'file') continue;
        const target = join(ctx.targetDir, ...change.relPath.split('/'));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, change.content);
        ctx.log(`  복사: ${change.relPath.split('/').join(sep)}`);
      }
    },
  };
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/plan-ops.test.ts packages/devkit-cli/tests/fs-ops.test.ts packages/devkit-cli/tests/copy-overlay-drift.test.ts
pnpm lint:es
```

Expected: 전부 PASS. 기존 `fs-ops`·`copy-overlay-drift` 테스트가 깨지면 **쓰기 동작이 달라진 것**이므로 되돌아가 고친다 — `create` 산출물은 바이트 단위로 같아야 한다.

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src/types.ts packages/devkit-cli/src/run.ts \
        packages/devkit-cli/src/ops/copy-overlay.ts packages/devkit-cli/tests/plan-ops.test.ts
git commit -m "feat: Step.plan을 도입하고 copyOverlay를 plan 기반으로 재구성"
```

---

## Task 3: `mergeJson.plan`과 `linkDeps.plan`

**Files:**
- Modify: `packages/devkit-cli/src/ops/merge-json.ts`
- Modify: `packages/devkit-cli/src/ops/link-deps.ts`
- Test: `packages/devkit-cli/tests/plan-ops.test.ts`

**Interfaces:**
- Consumes: Task 2의 `PlannedChange`, `Step.plan`
- Produces: 두 op의 `plan`이 `[{ kind: 'json', file, patch }]` **한 개**를 반환. `file`은 op의 `file` 옵션 그대로(예: `package.json`, `apps/web/package.json`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/plan-ops.test.ts`에 추가:

```ts
import { linkDeps } from '../src/ops/link-deps.js';
import { mergeJson } from '../src/ops/merge-json.js';

describe('mergeJson.plan', () => {
  it('패치를 그대로 낸다 — 대상 파일을 읽지 않는다', async () => {
    // 대상에 package.json이 아예 없어도 plan은 성공해야 한다. update의
    // 기준 내용은 조립자가 정하기 때문이다(가상 파일맵, 설계 5.4절).
    const step = mergeJson({ prettier: '@devbak/prettier-config' });
    const changes = await step.plan!(makeCtx());

    expect(changes).toEqual([
      { kind: 'json', file: 'package.json', patch: { prettier: '@devbak/prettier-config' } },
    ]);
  });

  it('file 옵션을 그대로 전달한다', async () => {
    const step = mergeJson({ scripts: { lint: null } }, { file: 'apps/web/package.json' });
    const changes = await step.plan!(makeCtx());

    expect(changes[0]).toMatchObject({ kind: 'json', file: 'apps/web/package.json' });
  });
});

describe('linkDeps.plan', () => {
  it('toolkitRoot까지의 상대경로로 devDependencies 패치를 낸다', async () => {
    const ctx = { ...makeCtx(), targetDir: '/a/b/demo', toolkitRoot: '/a/b/eslint' };
    const changes = await linkDeps(['tsconfig', 'prettier-config']).plan!(ctx);

    expect(changes).toEqual([
      {
        kind: 'json',
        file: 'package.json',
        patch: {
          devDependencies: {
            '@devbak/tsconfig': 'link:../eslint/packages/tsconfig',
            '@devbak/prettier-config': 'link:../eslint/packages/prettier-config',
          },
        },
      },
    ]);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/plan-ops.test.ts
```

Expected: FAIL — `step.plan is not a function`

- [ ] **Step 3: `mergeJson`을 재구성한다**

`src/ops/merge-json.ts`의 `mergeJson` 본문을 교체한다:

```ts
export function mergeJson(patch: JsonObject, options: MergeJsonOptions = {}): Step {
  const file = options.file ?? 'package.json';
  const required = options.required ?? [];

  return {
    kind: 'mergeJson',
    label: `${file} 병합`,
    describe: () => ({ file, patch, required }),
    // 패치는 정적이므로 대상 파일을 읽지 않는다. 기준 내용을 무엇으로 볼지는
    // 조립자가 정한다 — create 는 디스크, update 는 가상 파일맵이다(설계 5.4절).
    plan: async () => [{ kind: 'json', file, patch }],
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;

      if (!isPlainObject(parsed)) {
        throw new Error(`Invalid JSON in ${file}: expected object`);
      }

      // required 는 생성 시점 전용 가드다 — 위임 대상(공식 CLI)의 산출물이
      // 바뀌었는지 본다. plan 에 두지 않는 것이 요구다: 여기 적힌 키들은
      // 이 패치가 지우는 대상이라 기존 프로젝트에는 없다(설계 1.2절).
      for (const key of required) {
        if (!hasPath(parsed, key)) {
          throw new Error(
            `${file}에 '${key}'가 없습니다. 위임 대상(공식 CLI)의 산출물이 바뀌었을 수 있습니다. ` +
              `해당 레시피를 재검증하세요 (설계 6.2절).`,
          );
        }
      }

      const merged = applyPatch(parsed, patch);
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      ctx.log(`  병합: ${file}`);
    },
  };
}
```

- [ ] **Step 4: `linkDeps`를 재구성한다**

`src/ops/link-deps.ts`의 `linkDeps` 본문을 교체한다:

```ts
export function linkDeps(packages: string[], options: LinkDepsOptions = {}): Step {
  const file = options.file ?? 'package.json';

  const buildPatch = (ctx: Ctx): JsonObject => {
    const devDependencies: JsonObject = {};
    for (const pkg of packages) {
      devDependencies[`@devbak/${pkg}`] = linkSpec(ctx.targetDir, ctx.toolkitRoot, pkg);
    }
    return { devDependencies };
  };

  return {
    kind: 'linkDeps',
    label: `link: 배선 — ${packages.map((p) => `@devbak/${p}`).join(', ')}`,
    describe: () => ({ file, packages }),
    plan: async (ctx: Ctx) => [{ kind: 'json', file, patch: buildPatch(ctx) }],
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonObject;
      const merged = applyPatch(parsed, buildPatch(ctx));
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      for (const pkg of packages) ctx.log(`  링크: @devbak/${pkg}`);
    },
  };
}
```

`Ctx` 타입 import가 없으면 추가한다: `import type { Ctx, Step } from '../types.js';`

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests
pnpm lint:es
```

Expected: 전부 PASS (스냅샷 포함 — `describe()`를 안 바꿨으므로 스냅샷은 그대로여야 한다)

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src/ops/merge-json.ts packages/devkit-cli/src/ops/link-deps.ts \
        packages/devkit-cli/tests/plan-ops.test.ts
git commit -m "feat: mergeJson·linkDeps에 plan을 추가하고 run을 plan 기반으로 재구성"
```

---

## Task 4: 레시피 평탄화 (`compose` 재귀)

**Files:**
- Create: `packages/devkit-cli/src/update/flatten.ts`
- Test: `packages/devkit-cli/tests/flatten.test.ts` (신규)

**Interfaces:**
- Consumes: Task 2의 `Step.children`
- Produces: `flattenSteps(steps: Step[], ctx: Ctx): Array<{ step: Step; ctx: Ctx }>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/flatten.test.ts` 신규:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monorepoRecipe } from '../src/recipes/monorepo.js';
import { flattenSteps } from '../src/update/flatten.js';
import type { Ctx } from '../src/types.js';

const CTX: Ctx = {
  targetDir: '/a/b/demo',
  toolkitRoot: '/a/b/eslint',
  name: 'demo',
  log: () => {},
};

describe('flattenSteps', () => {
  it('compose 안으로 들어가 하위 단계를 펼친다', () => {
    const flat = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX);

    // compose 자체는 결과에 남지 않는다 — 실행 단위가 아니라 컨테이너다.
    expect(flat.some(({ step }) => step.kind === 'compose')).toBe(false);
    // next 레시피의 오버레이가 펼쳐져 나온다.
    expect(flat.some(({ step }) => step.label === '오버레이 복사: templates/next')).toBe(true);
  });

  it('하위 단계에는 매핑된 ctx가 붙는다', () => {
    const flat = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX);
    const nextOverlay = flat.find(({ step }) => step.label === '오버레이 복사: templates/next');

    expect(nextOverlay!.ctx.targetDir).toBe(join('/a/b/demo', 'apps', 'web'));
    expect(nextOverlay!.ctx.name).toBe('web');
    // toolkitRoot는 매핑되지 않는다 — link: 상대경로 계산의 기준점이다.
    expect(nextOverlay!.ctx.toolkitRoot).toBe('/a/b/eslint');
  });

  it('최상위 단계에는 원래 ctx가 붙는다', () => {
    const flat = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX);
    const rootOverlay = flat.find(({ step }) => step.label === '오버레이 복사: templates/monorepo');

    expect(rootOverlay!.ctx.targetDir).toBe('/a/b/demo');
  });

  it('순서를 보존한다 — monorepo 오버레이가 next 오버레이보다 앞선다', () => {
    const labels = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX).map(({ step }) => step.label);

    expect(labels.indexOf('오버레이 복사: templates/monorepo')).toBeLessThan(
      labels.indexOf('오버레이 복사: templates/next'),
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/flatten.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`packages/devkit-cli/src/update/flatten.ts` 신규:

```ts
import type { Ctx, Step } from '../types.js';

export interface FlatStep {
  step: Step;
  ctx: Ctx;
}

/**
 * compose 를 펼쳐 실제 실행 단위만 순서대로 낸다.
 *
 * 각 단계에 **자기가 적용될 ctx** 를 붙여 내보내는 것이 요점이다. monorepo 는
 * next 레시피를 apps/web 에 합성하므로, 그 안의 오버레이는 루트가 아니라
 * apps/web 을 대상으로 한다. 여기서 ctx 를 함께 들고 나오지 않으면 update 가
 * 그 사실을 잃고 앱 설정을 루트에 쏟는다.
 *
 * compose 단계 자체는 결과에 남기지 않는다 — 실행 단위가 아니라 컨테이너다.
 */
export function flattenSteps(steps: Step[], ctx: Ctx): FlatStep[] {
  const flat: FlatStep[] = [];

  for (const step of steps) {
    if (step.children === undefined) {
      flat.push({ step, ctx });
      continue;
    }
    flat.push(...flattenSteps(step.children.steps, step.children.mapCtx(ctx)));
  }

  return flat;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/flatten.test.ts
pnpm lint:es
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/devkit-cli/src/update/flatten.ts packages/devkit-cli/tests/flatten.test.ts
git commit -m "feat: compose를 재귀로 펼치는 flattenSteps 추가"
```

---

## Task 5: 패치 필터와 JSON 파일 오버레이 환원

**Files:**
- Create: `packages/devkit-cli/src/update/json-patch.ts`
- Test: `packages/devkit-cli/tests/json-patch.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `categoryOfJsonPath`·`MARKER_KEY`·`PROJECT_OWNED_KEYS`·`UnknownCategoryError`, `Category`
- Produces:
  - `filterPatchByCategory(patch: JsonObject, only: ReadonlySet<Category>, fileCategory: Category | null): JsonObject`
    - `fileCategory`가 `null`이면 **키 경로 테이블**로 판단(= `package.json`), 아니면 파일 카테고리로 전부 판단
  - `reduceJsonOverlay(relPath: string, content: string): JsonObject` — 통짜 JSON 파일 내용을 패치로 환원. `package.json`이면 `PROJECT_OWNED_KEYS` 제거
  - `isJsonOverlay(relPath: string): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/json-patch.test.ts` 신규:

```ts
import { describe, expect, it } from 'vitest';
import { UnknownCategoryError, type Category } from '../src/lib/categories.js';
import {
  filterPatchByCategory,
  isJsonOverlay,
  reduceJsonOverlay,
} from '../src/update/json-patch.js';

const only = (...cats: Category[]) => new Set(cats);

describe('filterPatchByCategory — package.json (키 경로 판단)', () => {
  const PATCH = {
    prettier: '@devbak/prettier-config',
    jest: null,
    devDependencies: { eslint: '^10.8.0', 'eslint-plugin-prettier': null },
    scripts: { lint: 'eslint .', 'test:e2e': 'jest' },
  };

  it('lint만 남긴다', () => {
    expect(filterPatchByCategory(PATCH, only('lint'), null)).toEqual({
      prettier: '@devbak/prettier-config',
      scripts: { lint: 'eslint .' },
    });
  });

  it('deps만 남긴다 — 하위 키는 prefix로 따라온다', () => {
    expect(filterPatchByCategory(PATCH, only('deps'), null)).toEqual({
      devDependencies: { eslint: '^10.8.0', 'eslint-plugin-prettier': null },
    });
  });

  it('빈 객체가 되는 중간 노드는 통째로 뺀다', () => {
    // scripts 아래가 전부 걸러졌는데 `scripts: {}` 를 남기면 applyPatch가
    // 아무 일도 안 하면서 diff에는 나타나지 않아, 실제로는 변경이 없는데
    // 있는 것처럼 보이는 잡음이 된다.
    expect(filterPatchByCategory(PATCH, only('ci'), null)).toEqual({});
  });

  it('마커 키는 필터 대상이 아니라 아예 빠진다', () => {
    const withMarker = { ...PATCH, devkit: { type: 'nest', version: '0.1.0' } };
    const result = filterPatchByCategory(withMarker, only('lint', 'deps', 'test', 'repo'), null);
    expect(result).not.toHaveProperty('devkit');
  });

  it('표에 없는 잎을 만나면 던진다 — 조용히 건너뛰지 않는다', () => {
    expect(() => filterPatchByCategory({ nonsense: 1 }, only('lint'), null)).toThrow(
      UnknownCategoryError,
    );
  });
});

describe('filterPatchByCategory — 그 외 JSON (파일 카테고리 판단)', () => {
  const TSCONFIG = { extends: '@devbak/tsconfig/nest', compilerOptions: { outDir: './dist' } };

  it('파일 카테고리가 포함되면 통째로 남는다', () => {
    expect(filterPatchByCategory(TSCONFIG, only('ts'), 'ts')).toEqual(TSCONFIG);
  });

  it('포함되지 않으면 통째로 빠진다', () => {
    expect(filterPatchByCategory(TSCONFIG, only('lint'), 'ts')).toEqual({});
  });
});

describe('reduceJsonOverlay', () => {
  it('package.json의 name·version은 뺀다 — 프로젝트 고유값이다', () => {
    const content = JSON.stringify({ name: 'demo', version: '1.2.3', private: true });
    expect(reduceJsonOverlay('package.json', content)).toEqual({ private: true });
  });

  it('그 외 파일은 그대로 패치가 된다', () => {
    const content = JSON.stringify({ extends: '@devbak/tsconfig/nest' });
    expect(reduceJsonOverlay('tsconfig.json', content)).toEqual({
      extends: '@devbak/tsconfig/nest',
    });
  });

  it('중첩 경로의 package.json도 같은 규칙이다', () => {
    const content = JSON.stringify({ name: 'web', private: true });
    expect(reduceJsonOverlay('apps/web/package.json', content)).toEqual({ private: true });
  });
});

describe('isJsonOverlay', () => {
  it.each([
    ['package.json', true],
    ['tsconfig.json', true],
    ['turbo.json', true],
    ['eslint.config.mjs', false],
    ['.github/workflows/claude-review.yml', false],
  ])('%s → %s', (relPath, expected) => {
    expect(isJsonOverlay(relPath)).toBe(expected);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/json-patch.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`packages/devkit-cli/src/update/json-patch.ts` 신규:

```ts
import {
  categoryOfJsonPath,
  MARKER_KEY,
  PROJECT_OWNED_KEYS,
  UnknownCategoryError,
  type Category,
} from '../lib/categories.js';
import type { Json, JsonObject } from '../ops/merge-json.js';

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** POSIX·Windows 구분자 모두에서 마지막 경로 조각. */
function baseName(relPath: string): string {
  const normalized = relPath.replaceAll('\\', '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function isJsonOverlay(relPath: string): boolean {
  return baseName(relPath).endsWith('.json');
}

/**
 * 통짜 JSON 파일 오버레이를 병합 패치로 바꾼다(설계 5.5절).
 *
 * update 가 이런 파일을 통째로 덮으면 사용자가 늘린 의존성·스크립트와
 * compilerOptions.paths 가 사라진다. create 는 빈 디렉토리에 놓으므로
 * 그대로 써도 되고, 그래서 이 환원은 update 전용이다.
 *
 * 대가는 **키 삭제가 전파되지 않는다**는 것이다. 템플릿에서 스크립트를
 * 없애도 기존 프로젝트에는 남는다. 남는 쪽이 사라지는 쪽보다 회복 가능하다.
 */
export function reduceJsonOverlay(relPath: string, content: string): JsonObject {
  const parsed = JSON.parse(content) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error(`${relPath}: JSON 오버레이가 객체가 아닙니다.`);
  }

  if (baseName(relPath) !== 'package.json') return parsed;

  const result: JsonObject = { ...parsed };
  for (const key of PROJECT_OWNED_KEYS) delete result[key];
  return result;
}

/**
 * 패치에서 대상 카테고리에 해당하는 부분만 남긴다.
 *
 * `fileCategory` 가 주어지면(= package.json 이 아닌 JSON 파일) 그 카테고리
 * 하나로 전부를 판단한다. `null` 이면 키 경로 테이블로 내려가며 판단한다 —
 * package.json 만 키가 여러 카테고리에 걸쳐 있기 때문이다(설계 6.1절).
 */
export function filterPatchByCategory(
  patch: JsonObject,
  only: ReadonlySet<Category>,
  fileCategory: Category | null,
): JsonObject {
  if (fileCategory !== null) {
    return only.has(fileCategory) ? patch : {};
  }
  return filterByPath(patch, only, '');
}

function filterByPath(patch: JsonObject, only: ReadonlySet<Category>, prefix: string): JsonObject {
  const result: JsonObject = {};

  for (const [key, value] of Object.entries(patch)) {
    // 마커는 카테고리를 갖지 않는다 — 전체 update 만 심는 별도 취급이라
    // 조립자가 따로 얹는다(설계 4.2절).
    if (prefix === '' && key === MARKER_KEY) continue;

    const path = prefix === '' ? key : `${prefix}.${key}`;
    const category = categoryOfJsonPath(path);

    if (category !== null) {
      if (only.has(category)) result[key] = value as Json;
      continue;
    }

    // 표에 없는 중간 노드는 자식으로 내려간다. 잎인데도 못 정하면 던진다 —
    // 조용히 건너뛰면 그 키는 어떤 --only 로도 갱신되지 않으면서 성공을
    // 보고한다(설계 6.3절).
    if (!isPlainObject(value)) {
      throw new UnknownCategoryError(
        `분류되지 않은 package.json 키 경로: '${path}'\n` +
          `src/lib/categories.ts 의 JSON_KEY_CATEGORIES 에 추가하세요.`,
      );
    }

    const nested = filterByPath(value, only, path);
    // 자식이 전부 걸러진 빈 객체는 남기지 않는다. applyPatch 가 아무 일도
    // 하지 않으면서 변경 목록에는 잡히는 잡음이 된다.
    if (Object.keys(nested).length > 0) result[key] = nested;
  }

  return result;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/json-patch.test.ts
pnpm lint:es
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/devkit-cli/src/update/json-patch.ts packages/devkit-cli/tests/json-patch.test.ts
git commit -m "feat: JSON 패치 카테고리 필터와 파일 오버레이 환원 추가"
```

---

## Task 6: 플랜 조립 (`buildPlan`)

**Files:**
- Create: `packages/devkit-cli/src/update/plan.ts`
- Test: `packages/devkit-cli/tests/update-plan.test.ts` (신규)

**Interfaces:**
- Consumes: Task 4 `flattenSteps`, Task 5 `filterPatchByCategory`·`reduceJsonOverlay`·`isJsonOverlay`, `classify.ts`의 `PlannedFile`, `categories.ts`의 `categoryOf`·`CATEGORIES`·`DEFAULT_EXCLUDED_CATEGORIES`, `merge-json.ts`의 `applyPatch`, `marker.ts`의 `markerPatch`
- Produces:
  - `effectiveCategories(only?: Category[]): Set<Category>`
  - `buildPlan(options: BuildPlanOptions): Promise<PlannedFile[]>`
    ```ts
    interface BuildPlanOptions {
      type: ProjectType;
      ctx: Ctx;               // targetDir = 대상 프로젝트, toolkitRoot = 이 저장소
      categories: ReadonlySet<Category>;
      marker: { version: string } | null;  // null이면 마커를 얹지 않는다
    }
    ```

**마커를 플랜에 넣는 이유(설계 4.2절의 구체화):** 설계는 마커를 쓰기 **뒤** 단계로 뒀지만, 그러면 사람에게 보여준 `package.json`과 실제로 쓰는 것이 달라진다. 설계 5.2절의 "보여준 것과 쓰는 것이 같은 바이트"가 더 강한 요구이므로, **마커를 플랜의 마지막 패치로 얹는다.** 전체 update일 때만 `marker`가 `null`이 아니다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/update-plan.test.ts` 신규:

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CATEGORIES, type Category } from '../src/lib/categories.js';
import type { Ctx } from '../src/types.js';
import { buildPlan, effectiveCategories } from '../src/update/plan.js';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 최소한의 대상 프로젝트를 만든다. update는 package.json만 전제한다. */
function makeTarget(pkg: Record<string, unknown> = {}): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-target-'));
  created.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'demo', ...pkg }, null, 2)}\n`);
  return { targetDir: dir, toolkitRoot: '/a/b/eslint', name: 'demo', log: () => {} };
}

const ALL = new Set<Category>(CATEGORIES.filter((c) => c !== 'scaffold'));

describe('effectiveCategories', () => {
  it('생략하면 scaffold를 뺀 전체다', () => {
    expect(effectiveCategories()).toEqual(ALL);
  });

  it('명시하면 scaffold도 포함된다', () => {
    expect(effectiveCategories(['scaffold'])).toEqual(new Set(['scaffold']));
  });
});

describe('buildPlan', () => {
  it('scaffold를 기본 제외하므로 src/main.ts가 계획에 없다', async () => {
    const plan = await buildPlan({ type: 'nest', ctx: makeTarget(), categories: ALL, marker: null });
    expect(plan.map((f) => f.relPath)).not.toContain('src/main.ts');
  });

  it('--only claude면 리뷰 자산만 낸다', async () => {
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: new Set<Category>(['claude']),
      marker: null,
    });

    expect(plan.map((f) => f.relPath).sort()).toEqual([
      '.claude/agents/devkit-reviewer.md',
      '.claude/commands/review.md',
      'CLAUDE.md',
    ]);
  });

  it('package.json은 패치가 합쳐진 한 파일로 나온다', async () => {
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: new Set<Category>(['deps']),
      marker: null,
    });

    const pkg = plan.find((f) => f.relPath === 'package.json');
    expect(pkg).toBeDefined();

    const parsed = JSON.parse(pkg!.content) as { devDependencies: Record<string, string>; name: string };
    // 기존 값은 보존된다.
    expect(parsed.name).toBe('demo');
    // 레시피의 devDependencies와 linkDeps의 link:가 함께 들어간다.
    expect(parsed.devDependencies['typescript-eslint']).toBe('^8.65.0');
    expect(parsed.devDependencies['@devbak/tsconfig']).toMatch(/^link:/);
  });

  it('마커를 주면 package.json에 얹힌다 — 쓰기 뒤가 아니라 계획 안이다', async () => {
    const plan = await buildPlan({
      type: 'nest',
      ctx: makeTarget(),
      categories: ALL,
      marker: { version: '9.9.9' },
    });

    const pkg = plan.find((f) => f.relPath === 'package.json');
    const parsed = JSON.parse(pkg!.content) as { devkit: { type: string; version: string } };
    expect(parsed.devkit).toEqual({ type: 'nest', version: '9.9.9' });
  });

  it('마커가 null이면 얹지 않는다', async () => {
    const plan = await buildPlan({ type: 'nest', ctx: makeTarget(), categories: ALL, marker: null });
    const pkg = plan.find((f) => f.relPath === 'package.json');
    expect(JSON.parse(pkg!.content)).not.toHaveProperty('devkit');
  });

  it('사용자가 추가한 tsconfig의 paths를 보존한다 — 통짜로 덮지 않는다', async () => {
    const ctx = makeTarget();
    writeFileSync(
      join(ctx.targetDir, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }, null, 2)}\n`,
    );

    const plan = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['ts']),
      marker: null,
    });

    const ts = plan.find((f) => f.relPath === 'tsconfig.json');
    const parsed = JSON.parse(ts!.content) as {
      extends: string;
      compilerOptions: { paths: unknown; outDir: string };
    };
    expect(parsed.compilerOptions.paths).toEqual({ '@/*': ['./src/*'] });
    expect(parsed.extends).toBe('@devbak/tsconfig/nest');
    expect(parsed.compilerOptions.outDir).toBe('./dist');
  });

  it('monorepo는 합성한 next가 놓은 apps/web 설정을 되살리지 않는다', async () => {
    // 레시피는 compose(next) 뒤에 removeFiles로 이것들을 지운다. update가
    // removeFiles를 무시하면 매번 되살리고, apps/web/eslint.config.mjs는
    // 저장소 전체 린트를 죽인다(설계 5.7절).
    const plan = await buildPlan({ type: 'monorepo', ctx: makeTarget(), categories: ALL, marker: null });
    const paths = plan.map((f) => f.relPath);

    expect(paths).not.toContain('apps/web/eslint.config.mjs');
    expect(paths.some((p) => p.startsWith('apps/web/.claude/'))).toBe(false);
    expect(paths.some((p) => p.startsWith('apps/web/.github/'))).toBe(false);
    // 루트 쪽은 그대로 있어야 한다 — 지운 것은 앱 하위뿐이다.
    expect(paths).toContain('eslint.config.mjs');
    expect(paths).toContain('.claude/commands/review.md');
  });

  it('next는 CLAUDE.md를 정상적으로 놓는다 — 지운 뒤 놓는 순서다', async () => {
    // removeFiles(['AGENTS.md','CLAUDE.md'])가 copyOverlay('next')보다
    // 앞이므로, 무조건 제외로 구현하면 CLAUDE.md가 영영 안 놓인다.
    const plan = await buildPlan({ type: 'next', ctx: makeTarget(), categories: ALL, marker: null });
    expect(plan.map((f) => f.relPath)).toContain('CLAUDE.md');
  });

  it('monorepo는 apps/web의 package.json도 별개 파일로 낸다', async () => {
    const ctx = makeTarget();
    mkdirSync(join(ctx.targetDir, 'apps', 'web'), { recursive: true });
    writeFileSync(
      join(ctx.targetDir, 'apps', 'web', 'package.json'),
      `${JSON.stringify({ name: 'web' }, null, 2)}\n`,
    );

    const plan = await buildPlan({
      type: 'monorepo',
      ctx,
      categories: new Set<Category>(['deps']),
      marker: null,
    });

    expect(plan.map((f) => f.relPath)).toContain('apps/web/package.json');
    expect(plan.map((f) => f.relPath)).toContain('package.json');
  });

  it('monorepo 루트 package.json은 통짜 템플릿을 덮지 않는다', async () => {
    const ctx = makeTarget({ dependencies: { 'my-lib': '^1.0.0' } });

    const plan = await buildPlan({
      type: 'monorepo',
      ctx,
      categories: new Set<Category>(['deps', 'repo', 'lint', 'test']),
      marker: null,
    });

    const pkg = plan.find((f) => f.relPath === 'package.json');
    const parsed = JSON.parse(pkg!.content) as {
      name: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    // 사용자 것이 살아남고
    expect(parsed.name).toBe('demo');
    expect(parsed.dependencies['my-lib']).toBe('^1.0.0');
    // 표준이 얹힌다
    expect(parsed.devDependencies.turbo).toBe('^2.8.0');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/update-plan.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`packages/devkit-cli/src/update/plan.ts` 신규:

```ts
import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import {
  CATEGORIES,
  categoryOf,
  DEFAULT_EXCLUDED_CATEGORIES,
  type Category,
} from '../lib/categories.js';
import type { PlannedFile } from '../lib/classify.js';
import { markerPatch, type ProjectType } from '../lib/marker.js';
import { applyPatch, type JsonObject } from '../ops/merge-json.js';
import { monorepoRecipe } from '../recipes/monorepo.js';
import { nestRecipe } from '../recipes/nest.js';
import { nextRecipe } from '../recipes/next.js';
import type { Ctx, Recipe } from '../types.js';
import { flattenSteps } from './flatten.js';
import { filterPatchByCategory, isJsonOverlay, reduceJsonOverlay } from './json-patch.js';

const RECIPES: Record<ProjectType, Recipe> = {
  nest: nestRecipe,
  next: nextRecipe,
  monorepo: monorepoRecipe,
};

/** 재적용 대상 연산. 설계 5.3절 표 그대로다. */
const PLANNABLE = new Set(['copyOverlay', 'mergeJson', 'linkDeps']);

/**
 * `--only` 를 유효 카테고리 집합으로 바꾼다.
 *
 * 생략하면 scaffold 를 뺀 전체다 — 프레임워크 뼈대는 생성 시점에 한 번
 * 놓이고 그 뒤로는 사람이 고쳐 쓰는 파일이라, 재적용이 덮으면 사용자의
 * 작업이 사라진다. 명시해야만 대상이 된다.
 */
export function effectiveCategories(only?: Category[]): Set<Category> {
  if (only !== undefined) return new Set(only);
  const excluded = new Set<Category>(DEFAULT_EXCLUDED_CATEGORIES);
  return new Set(CATEGORIES.filter((category) => !excluded.has(category)));
}

export interface BuildPlanOptions {
  type: ProjectType;
  ctx: Ctx;
  categories: ReadonlySet<Category>;
  /** 마커를 얹을 버전. `null` 이면 얹지 않는다(= `--only` 가 주어진 경우). */
  marker: { version: string } | null;
}

/**
 * 재적용할 파일의 **최종 내용**을 전부 계산한다. 아무것도 쓰지 않는다.
 *
 * 이것이 이 명령의 중심이다. 변경 목록을 보여주려면 어차피 최종 내용이
 * 필요하고, 계산해 두면 쓰기는 writeFile 뿐이라 **사람에게 보여준 것과
 * 실제로 쓰는 것이 같은 바이트**임이 구조적으로 보장된다(설계 5절).
 */
export async function buildPlan({
  type,
  ctx,
  categories,
  marker,
}: BuildPlanOptions): Promise<PlannedFile[]> {
  const files = new Map<string, string>();
  const jsonTargets = new Map<string, JsonObject>();

  const flat = flattenSteps(RECIPES[type]({ skipInstall: true }), ctx);

  for (const { step, ctx: stepCtx } of flat) {
    // removeFiles 는 실행하지 않지만 계획에는 반영한다. 순서가 의미를
    // 만든다 — next 는 지운 뒤 놓고(CLAUDE.md 는 남아야 한다), monorepo 는
    // 놓은 뒤 지운다(apps/web 설정은 빠져야 한다). 여기서 누적된 것만
    // 지우면 두 방향이 자연히 맞는다(설계 5.7절).
    if (step.removes !== undefined) {
      dropPlanned(files, jsonTargets, ctx.targetDir, stepCtx.targetDir, step.removes);
      continue;
    }
    if (!PLANNABLE.has(step.kind) || step.plan === undefined) continue;
    // oxlint-disable-next-line no-await-in-loop -- 순서가 의미를 만든다:
    // monorepo 는 package.json 을 놓은 뒤 그 파일을 패치한다.
    const changes = await step.plan(stepCtx);
    const rel = relativeToRoot(ctx.targetDir, stepCtx.targetDir);

    for (const change of changes) {
      const relPath = joinRel(rel, change.kind === 'file' ? change.relPath : change.file);
      const fileCategory = categoryOf(relPath);

      if (change.kind === 'file' && !isJsonOverlay(relPath)) {
        // 파일 오버레이는 카테고리 하나로 전부 판단한다.
        if (fileCategory !== null && categories.has(fileCategory)) {
          files.set(relPath, change.content);
        }
        continue;
      }

      // JSON 은 파일이든 패치든 전부 "기준 내용 + 패치"로 다룬다(설계 5.5절).
      const patch =
        change.kind === 'file' ? reduceJsonOverlay(relPath, change.content) : change.patch;
      const scoped = filterPatchByCategory(
        patch,
        categories,
        isPackageJson(relPath) ? null : fileCategory,
      );
      if (Object.keys(scoped).length === 0) continue;

      // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
      const base = jsonTargets.get(relPath) ?? (await readJsonOrEmpty(ctx.targetDir, relPath));
      jsonTargets.set(relPath, applyPatch(base, scoped));
    }
  }

  if (marker !== null) {
    const base = jsonTargets.get('package.json') ?? (await readJsonOrEmpty(ctx.targetDir, 'package.json'));
    jsonTargets.set('package.json', applyPatch(base, markerPatch(type, marker.version) as JsonObject));
  }

  for (const [relPath, value] of jsonTargets) {
    files.set(relPath, `${JSON.stringify(value, null, 2)}\n`);
  }

  return [...files]
    .map(([relPath, content]): PlannedFile => ({
      relPath,
      content,
      // 카테고리 필터는 이미 끝났다. 여기 값은 표시·디버깅용이며,
      // package.json 처럼 여러 카테고리가 섞인 파일은 파일 카테고리를 쓴다.
      category: categoryOf(relPath) ?? 'repo',
    }))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function isPackageJson(relPath: string): boolean {
  return relPath === 'package.json' || relPath.endsWith('/package.json');
}

/**
 * 누적된 계획에서 removeFiles 대상을 뺀다. **디스크는 건드리지 않는다.**
 *
 * 디렉토리 경로는 prefix 로 매칭한다 — `apps/web/.claude` 가
 * `apps/web/.claude/agents/devkit-reviewer.md` 를 걸러야 한다.
 * 레시피가 join() 으로 만든 경로에는 플랫폼 구분자가 섞이므로 정규화한다.
 */
function dropPlanned(
  files: Map<string, string>,
  jsonTargets: Map<string, JsonObject>,
  root: string,
  stepTarget: string,
  removes: readonly string[],
): void {
  const prefix = relativeToRoot(root, stepTarget);

  for (const path of removes) {
    const rel = joinRel(prefix, path);
    for (const map of [files, jsonTargets]) {
      for (const key of [...map.keys()]) {
        if (key === rel || key.startsWith(`${rel}/`)) map.delete(key);
      }
    }
  }
}

/** 루트 대상 디렉토리 기준의 POSIX 상대경로. compose 가 만든 하위 ctx 용이다. */
function relativeToRoot(root: string, sub: string): string {
  if (sub === root) return '';
  return sub.slice(root.length + 1).replaceAll('\\', '/');
}

function joinRel(prefix: string, relPath: string): string {
  const normalized = relPath.replaceAll('\\', '/');
  return prefix === '' ? normalized : posix.join(prefix, normalized);
}

/** 없으면 빈 객체. 신규 파일은 패치가 곧 전체 내용이 된다. */
async function readJsonOrEmpty(targetDir: string, relPath: string): Promise<JsonObject> {
  const raw = await readFile(join(targetDir, ...relPath.split('/')), 'utf8').catch(
    (error: unknown) => {
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT') {
        return null;
      }
      throw error;
    },
  );
  if (raw === null) return {};
  return JSON.parse(raw) as JsonObject;
}
```

`src/types.ts`의 `Recipe`·`RecipeOptions`를 그대로 쓴다. `markerPatch`의 반환 타입이 `JsonObject`와 호환되지 않으면 `as unknown as JsonObject` 대신 `marker.ts`의 반환 타입을 `JsonObject`로 넓히는 쪽을 택한다(구조가 이미 JSON이다).

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/update-plan.test.ts
pnpm lint:es
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/devkit-cli/src/update/plan.ts packages/devkit-cli/tests/update-plan.test.ts
git commit -m "feat: 레시피에서 재적용 계획을 조립하는 buildPlan 추가"
```

---

## Task 7: `create`가 마커를 심는다

**Files:**
- Create: `packages/devkit-cli/src/lib/version.ts`
- Modify: `packages/devkit-cli/src/recipes/nest.ts`, `next.ts`, `monorepo.ts`
- Modify: `packages/devkit-cli/tests/__snapshots__/*.snap` (스냅샷 갱신)
- Test: `packages/devkit-cli/tests/version.test.ts` (신규)

**Interfaces:**
- Consumes: `marker.ts`의 `markerPatch`
- Produces: `devkitVersion(): string` — `devkit-cli/package.json`의 `version`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/version.test.ts` 신규:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { devkitVersion } from '../src/lib/version.js';

describe('devkitVersion', () => {
  it('devkit-cli의 package.json 버전을 읽는다 — 하드코딩하지 않는다', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string };

    expect(devkitVersion()).toBe(pkg.version);
  });
});
```

`packages/devkit-cli/tests/recipe-nest.test.ts`에 추가:

```ts
import { devkitVersion } from '../src/lib/version.js';

describe('마커', () => {
  it('package.json 병합 패치에 devkit 마커가 들어간다', () => {
    const steps = nestRecipe({ skipInstall: true });
    const patches = steps
      .filter((step) => step.kind === 'mergeJson')
      .map((step) => step.describe() as { patch: Record<string, unknown> });

    const marker = patches.find((p) => 'devkit' in p.patch)?.patch.devkit;
    expect(marker).toEqual({ type: 'nest', version: devkitVersion() });
  });
});
```

`recipe-next.test.ts`·`recipe-monorepo.test.ts`에도 같은 블록을 `type`만 바꿔 추가한다(`'next'`, `'monorepo'`).

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/version.test.ts packages/devkit-cli/tests/recipe-nest.test.ts
```

Expected: FAIL — 모듈 없음 / `marker`가 `undefined`

- [ ] **Step 3: `devkitVersion`을 구현한다**

`packages/devkit-cli/src/lib/version.ts` 신규:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 마커에 심을 devkit 버전.
 *
 * 하드코딩하면 릴리스마다 갱신을 잊고, 그러면 마커가 옛 버전을 가리킨 채
 * 굳는다 — 훗날 마이그레이션 판단의 근거가 조용히 오염된다.
 *
 * dist/lib/version.js 기준으로 두 단계 위가 패키지 루트다. 소스에서 직접
 * 실행할 때(vitest)는 src/lib/version.ts 기준이며 같은 깊이다.
 */
export function devkitVersion(): string {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
  const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };

  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(`${pkgPath} 에 version 문자열이 없습니다.`);
  }
  return parsed.version;
}
```

- [ ] **Step 4: 세 레시피에 마커를 심는다**

`src/recipes/nest.ts`의 `mergeJson` 패치 객체 **맨 위**에 추가한다:

```ts
    mergeJson(
      {
        // 유형 마커. update 가 대상의 유형을 알기 위한 전제이며, 의존성으로
        // 짐작하는 휴리스틱은 조용히 틀릴 수 있어 쓰지 않는다(설계 7절).
        ...markerPatch('nest', devkitVersion()),
        devDependencies: {
```

import를 추가한다:

```ts
import { markerPatch } from '../lib/marker.js';
import { devkitVersion } from '../lib/version.js';
```

`next.ts`는 `markerPatch('next', devkitVersion())`, `monorepo.ts`는 `markerPatch('monorepo', devkitVersion())`를 각각 자기 `mergeJson` 패치 맨 위에 넣는다.

**주의:** `monorepo.ts`의 `mergeJson`은 `file: 'apps/web/package.json'`을 대상으로 한다. 루트 마커를 심으려면 **새 `mergeJson` 단계를 루트 대상으로 추가**해야 한다. `linkDeps` 바로 앞에 넣는다:

```ts
    // 루트에 유형 마커를 심는다. apps/web 에는 합성된 next 레시피가 자기
    // 마커를 심으므로, 루트는 monorepo·앱은 next 로 각각 update 할 수 있다.
    mergeJson({ ...markerPatch('monorepo', devkitVersion()) }),
```

- [ ] **Step 5: 스냅샷을 갱신하고 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests -u
git diff packages/devkit-cli/tests/__snapshots__
```

Expected: 스냅샷 diff가 **마커 키 추가뿐**이어야 한다. 다른 변화가 보이면 되돌아가 원인을 찾는다.

```bash
pnpm vitest run packages/devkit-cli/tests
pnpm lint:es
```

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src/lib/version.ts packages/devkit-cli/src/recipes \
        packages/devkit-cli/tests
git commit -m "feat: create가 package.json에 devkit 유형 마커를 심는다"
```

---

## Task 8: 유형 결정과 확인 프롬프트

**Files:**
- Create: `packages/devkit-cli/src/lib/confirm.ts`
- Create: `packages/devkit-cli/src/update/resolve-type.ts`
- Test: `packages/devkit-cli/tests/resolve-type.test.ts` (신규)

**Interfaces:**
- Consumes: `marker.ts`의 `readMarker`·`MissingMarkerError`·`ProjectType`
- Produces:
  - `resolveType(packageJson: unknown, requested?: string): { type: ProjectType; hadMarker: boolean }`
  - `confirm(question: string): Promise<boolean>` — TTY가 아니고 `--yes`도 없으면 호출자가 먼저 막는다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/resolve-type.test.ts` 신규:

```ts
import { describe, expect, it } from 'vitest';
import { MissingMarkerError } from '../src/lib/marker.js';
import { resolveType } from '../src/update/resolve-type.js';

const WITH_MARKER = { name: 'demo', devkit: { type: 'nest', version: '0.1.0' } };
const WITHOUT = { name: 'demo' };

describe('resolveType', () => {
  it('마커가 있으면 그 유형을 쓴다', () => {
    expect(resolveType(WITH_MARKER)).toEqual({ type: 'nest', hadMarker: true });
  });

  it('마커가 없고 --type이 있으면 그것을 쓴다', () => {
    expect(resolveType(WITHOUT, 'next')).toEqual({ type: 'next', hadMarker: false });
  });

  it('마커도 --type도 없으면 던진다', () => {
    expect(() => resolveType(WITHOUT)).toThrow(MissingMarkerError);
  });

  it('마커와 --type이 어긋나면 거부한다 — 조용히 한쪽을 고르지 않는다', () => {
    expect(() => resolveType(WITH_MARKER, 'next')).toThrow(/마커는 nest.*--type은 next/s);
  });

  it('마커와 --type이 같으면 통과한다', () => {
    expect(resolveType(WITH_MARKER, 'nest')).toEqual({ type: 'nest', hadMarker: true });
  });

  it('알 수 없는 --type은 거부한다', () => {
    expect(() => resolveType(WITHOUT, 'django')).toThrow(/nest, next, monorepo/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/resolve-type.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: `resolveType`을 구현한다**

`packages/devkit-cli/src/update/resolve-type.ts` 신규:

```ts
import {
  MissingMarkerError,
  PROJECT_TYPES,
  readMarker,
  type ProjectType,
} from '../lib/marker.js';

export interface ResolvedType {
  type: ProjectType;
  /** 마커에서 읽었는가. 완료 메시지에서 안내를 낼지 판단한다(설계 4.2절). */
  hadMarker: boolean;
}

function assertKnown(requested: string): asserts requested is ProjectType {
  const known: readonly string[] = PROJECT_TYPES;
  if (!known.includes(requested)) {
    throw new Error(
      `알 수 없는 --type: ${requested}\n지원 유형: ${PROJECT_TYPES.join(', ')}`,
    );
  }
}

/**
 * 대상의 유형을 정한다(설계 3.1절).
 *
 * 마커와 `--type` 이 어긋나면 거부한다. 사용자가 대상을 착각했거나 마커가
 * 오염됐다는 신호이고, 조용히 한쪽을 고르면 **엉뚱한 유형의 표준을
 * 덮어쓴다.** `--force` 로도 우회하지 못한다 — 되돌릴 수 있는 상태의
 * 문제가 아니라 입력이 틀렸다는 신호다.
 */
export function resolveType(packageJson: unknown, requested?: string): ResolvedType {
  if (requested !== undefined) assertKnown(requested);

  let marker: ProjectType | null = null;
  try {
    marker = readMarker(packageJson).type;
  } catch (error) {
    // 마커가 없는 것은 정상 경로다(외부 프로젝트). 형식이 깨진 마커는
    // 그대로 던진다 — 사람이 손볼 문제다.
    if (!(error instanceof MissingMarkerError)) throw error;
  }

  if (marker === null) {
    if (requested === undefined) {
      throw new MissingMarkerError(
        'package.json 에 devkit 마커가 없습니다. devkit 으로 생성한 프로젝트가 아니거나 마커가 지워졌습니다.\n' +
          `--type <${PROJECT_TYPES.join('|')}> 으로 유형을 명시하세요.`,
      );
    }
    return { type: requested, hadMarker: false };
  }

  if (requested !== undefined && requested !== marker) {
    throw new Error(
      `유형이 어긋납니다 — 마커는 ${marker} 인데 --type은 ${requested} 입니다.\n` +
        '대상 경로가 맞는지 확인하세요. 이 불일치는 --force 로도 우회하지 못합니다.',
    );
  }

  return { type: marker, hadMarker: true };
}
```

- [ ] **Step 4: `confirm`을 구현한다**

`packages/devkit-cli/src/lib/confirm.ts` 신규:

```ts
import { createInterface } from 'node:readline/promises';

/**
 * y/N 프롬프트. 기본값은 아니오다.
 *
 * 대문자 N 이 기본이라는 관례를 지킨다 — 파괴적일 수 있는 작업에서
 * 엔터 한 번이 진행으로 읽히면 안 된다.
 */
export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} (y/N) `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/resolve-type.test.ts
pnpm lint:es
```

Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src/update/resolve-type.ts packages/devkit-cli/src/lib/confirm.ts \
        packages/devkit-cli/tests/resolve-type.test.ts
git commit -m "feat: update의 유형 결정 규칙과 확인 프롬프트 추가"
```

---

## Task 9: `runUpdate` 흐름 조립과 `bin` 분기

**Files:**
- Create: `packages/devkit-cli/src/update/index.ts`
- Modify: `packages/devkit-cli/src/bin.ts`
- Modify: `packages/devkit-cli/src/index.ts` (공개 export)
- Test: `packages/devkit-cli/tests/update-flow.test.ts` (신규)

**Interfaces:**
- Consumes: Task 6 `buildPlan`·`effectiveCategories`, Task 8 `resolveType`·`confirm`, `git.ts` `inspectGit`, `classify.ts` `classifyFiles`·`formatChangeList`, `categories.ts` `parseOnly`
- Produces:
  ```ts
  interface UpdateOptions {
    targetDir: string;
    toolkitRoot: string;
    only?: string;
    type?: string;
    dryRun?: boolean;
    yes?: boolean;
    force?: boolean;
    /** 테스트용. CLI 는 항상 false. */
    skipInstall?: boolean;
    ask?: (question: string) => Promise<boolean>;
    log?: (message: string) => void;
  }
  export async function runUpdate(options: UpdateOptions): Promise<void>;
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/update-flow.test.ts` 신규:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runUpdate } from '../src/update/index.js';

const TOOLKIT = resolve(import.meta.dirname, '../../..');
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * 최소한의 대상 프로젝트. os.tmpdir() 를 쓰는 것이 여기서는 안전하다 —
 * 이 테스트는 대상 안에서 pnpm 이나 Node 모듈 해석을 돌리지 않는다
 * (skipInstall: true). 반대로 설정 패키지 픽스처는 워크스페이스 트리
 * 안에 둬야 한다.
 */
function makeProject(pkg: Record<string, unknown> = {}, init = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-update-'));
  created.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'demo', ...pkg }, null, 2)}\n`);
  if (init) {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], {
      cwd: dir,
    });
  }
  return dir;
}

const base = (targetDir: string) => ({
  targetDir,
  toolkitRoot: TOOLKIT,
  skipInstall: true,
  yes: true,
  log: () => {},
});

describe('runUpdate', () => {
  it('--type으로 외부 프로젝트에 리뷰 자산을 놓는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude' });

    expect(existsSync(join(dir, '.claude', 'commands', 'review.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'agents', 'devkit-reviewer.md'))).toBe(true);
  });

  it('--dry-run은 아무것도 쓰지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude', dryRun: true });

    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  it('멱등적이다 — 두 번째는 전부 동일로 잡힌다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude' });

    const lines: string[] = [];
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude', log: (m) => lines.push(m) });

    const output = lines.join('\n');
    expect(output).toContain('동일 — 건너뜀');
    expect(output).not.toContain('덮어쓰기 (');
  });

  it('dirty한 워킹트리는 거부한다', async () => {
    const dir = makeProject();
    writeFileSync(join(dir, 'dirty.txt'), 'x');

    await expect(runUpdate({ ...base(dir), type: 'nest', only: 'claude' })).rejects.toThrow(
      /커밋되지 않은 변경/,
    );
  });

  it('--force는 dirty를 우회한다', async () => {
    const dir = makeProject();
    writeFileSync(join(dir, 'dirty.txt'), 'x');

    await runUpdate({ ...base(dir), type: 'nest', only: 'claude', force: true });
    expect(existsSync(join(dir, '.claude'))).toBe(true);
  });

  it('확인에서 아니오면 아무것도 쓰지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({
      ...base(dir),
      yes: false,
      ask: async () => false,
      type: 'nest',
      only: 'claude',
    });

    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  it('전체 update는 마커를 심는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest' });

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      devkit?: { type: string };
    };
    expect(pkg.devkit?.type).toBe('nest');
  });

  it('--only는 마커를 심지 않는다 — 부분 적용을 최신으로 표시하지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude' });

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { devkit?: unknown };
    expect(pkg.devkit).toBeUndefined();
  });

  it('마커가 있으면 --type 없이 돈다', async () => {
    const dir = makeProject({ devkit: { type: 'nest', version: '0.1.0' } });
    await runUpdate({ ...base(dir), only: 'claude' });

    expect(existsSync(join(dir, '.claude'))).toBe(true);
  });

  it('package.json이 없으면 던진다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-empty-'));
    created.push(dir);

    await expect(runUpdate({ ...base(dir), type: 'nest' })).rejects.toThrow(/package\.json/);
  });

  it('툴킷 저장소 자신은 거부한다', async () => {
    await expect(runUpdate({ ...base(TOOLKIT), type: 'nest' })).rejects.toThrow(/툴킷 저장소/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests/update-flow.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: `runUpdate`를 구현한다**

`packages/devkit-cli/src/update/index.ts` 신규:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseOnly, type Category } from '../lib/categories.js';
import { classifyFiles, formatChangeList } from '../lib/classify.js';
import { confirm } from '../lib/confirm.js';
import { inspectGit } from '../lib/git.js';
import { devkitVersion } from '../lib/version.js';
import { delegate } from '../ops/delegate.js';
import type { Ctx } from '../types.js';
import { buildPlan, effectiveCategories } from './plan.js';
import { resolveType } from './resolve-type.js';

export interface UpdateOptions {
  targetDir: string;
  toolkitRoot: string;
  only?: string;
  type?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  /** 테스트용. CLI 는 넘기지 않는다. */
  skipInstall?: boolean;
  ask?: (question: string) => Promise<boolean>;
  log?: (message: string) => void;
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const log = options.log ?? ((message: string) => process.stdout.write(`${message}\n`));
  const ask = options.ask ?? confirm;
  const targetDir = resolve(options.targetDir);

  // 1. 대상 확정
  if (targetDir === resolve(options.toolkitRoot)) {
    throw new Error(
      '툴킷 저장소 자신은 update 대상이 될 수 없습니다. 대상 프로젝트 경로를 지정하세요.',
    );
  }

  const pkgPath = join(targetDir, 'package.json');
  const pkgRaw = await readFile(pkgPath, 'utf8').catch(() => null);
  if (pkgRaw === null) {
    throw new Error(`${pkgPath} 를 읽을 수 없습니다. devkit 이 다룰 수 있는 프로젝트가 아닙니다.`);
  }

  // 2. 유형 결정
  const only = options.only === undefined ? undefined : parseOnly(options.only);
  const { type, hadMarker } = resolveType(JSON.parse(pkgRaw), options.type);

  // 3. git 게이트
  await gitGate(targetDir, options, ask, log);

  // 4~5. 플랜 · 분류 · 출력
  const categories: ReadonlySet<Category> = effectiveCategories(only);
  const ctx: Ctx = { targetDir, toolkitRoot: resolve(options.toolkitRoot), name: basename(targetDir), log };
  const planned = await buildPlan({
    type,
    ctx,
    categories,
    // 부분 적용을 "최신 표준 전부 반영"으로 표시하지 않는다(설계 4.2절).
    marker: only === undefined ? { version: devkitVersion() } : null,
  });

  const classified = await classifyFiles(targetDir, planned);
  log(formatChangeList(classified, basename(targetDir), type));

  const writes = classified.filter((item) => item.kind !== 'unchanged');

  // 6. --dry-run
  if (options.dryRun === true) {
    log('\n--dry-run — 아무것도 쓰지 않았습니다.');
    return;
  }

  if (writes.length === 0) {
    log('\n변경할 것이 없습니다.');
    return;
  }

  // 7. 확인
  if (options.yes !== true && !(await ask('\n계속할까요?'))) {
    log('중단했습니다.');
    return;
  }

  // 8. 쓰기 — 계획한 바이트를 그대로 쓴다
  await writeAll(targetDir, planned, writes.map((item) => item.relPath), log);

  // 10. 설치
  const touchedDeps = categories.has('deps') && writes.some((item) => item.relPath.endsWith('package.json'));
  if (touchedDeps && options.skipInstall !== true) {
    log('\n의존성이 바뀌어 pnpm install 을 실행합니다.');
    await delegate('pnpm', ['install']).run(ctx);
  }

  // 11. 요약
  log('\n완료. git diff 로 검토하세요.');
  log('설정이 바뀌었으니 pnpm lint 를 한 번 돌려보길 권합니다.');
  if (!hadMarker && only !== undefined) {
    log('마커가 없어 다음에도 --type 이 필요합니다. 전체 update 가 마커를 심습니다.');
  }
}

/**
 * git 안전망(설계 4.1절).
 *
 * dirty 를 더 강하게 막는 이유는 되돌릴 대상이 **섞이기** 때문이다. update 의
 * 결과와 사용자의 미커밋 작업이 같은 diff 에 들어가면 git checkout 이 둘 다
 * 지운다. 저장소가 아니면 애초에 되돌릴 수단이 없으므로 경고로 족하다 —
 * 없는 안전망을 강제할 수는 없다.
 */
async function gitGate(
  targetDir: string,
  options: UpdateOptions,
  ask: (question: string) => Promise<boolean>,
  log: (message: string) => void,
): Promise<void> {
  if (options.force === true) return;

  const state = await inspectGit(targetDir);

  if (state.kind === 'dirty') {
    throw new Error(
      `커밋되지 않은 변경이 ${state.changedFiles}건 있습니다. update 의 결과와 섞이면 되돌리기 어렵습니다.\n` +
        '커밋하거나 stash 한 뒤 다시 실행하세요. 그래도 진행하려면 --force 를 쓰세요.',
    );
  }

  if (state.kind === 'not-a-repo') {
    log('경고: git 저장소가 아닙니다. 덮어쓴 내용을 되돌릴 수단이 없습니다.');
    if (options.yes === true) return;
    if (!(await ask('그래도 계속할까요?'))) {
      throw new Error('중단했습니다.');
    }
  }
}

async function writeAll(
  targetDir: string,
  planned: readonly { relPath: string; content: string }[],
  targets: readonly string[],
  log: (message: string) => void,
): Promise<void> {
  const wanted = new Set(targets);

  for (const file of planned) {
    if (!wanted.has(file.relPath)) continue;
    const full = join(targetDir, ...file.relPath.split('/'));
    // oxlint-disable-next-line no-await-in-loop -- 부분 실패 시 어디까지
    // 썼는지가 로그 순서로 드러나야 한다. 병렬로 흩어 놓으면 그 단서가 사라진다.
    await mkdir(dirname(full), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
    await writeFile(full, file.content);
    log(`  씀: ${file.relPath}`);
  }
}
```

- [ ] **Step 4: `bin.ts`를 분기한다**

`src/bin.ts`의 `main`을 교체한다:

```ts
export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      type: { type: 'string' },
      only: { type: 'string' },
      'no-verify': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });

  const [command, ...rest] = positionals;
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  assertDistFresh(pkgDir);
  const toolkitRoot = findToolkitRoot(pkgDir);

  if (command === 'create') {
    await runCreate(rest[0], values, toolkitRoot);
    return;
  }
  if (command === 'update') {
    await runUpdateCommand(rest[0], values, toolkitRoot);
    return;
  }

  throw new Error(
    '사용법:\n' +
      '  pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]\n' +
      '  pnpm devbak update [path] [--only <categories>] [--type <t>] [--dry-run] [--yes] [--force]',
  );
}
```

`runCreate`는 기존 `main` 본문(이름 검사 → 대상 계산 → 레시피 실행)을 그대로 옮긴 것이고, `runUpdateCommand`는 다음과 같다:

```ts
async function runUpdateCommand(
  path: string | undefined,
  values: Record<string, unknown>,
  toolkitRoot: string,
): Promise<void> {
  // 비대화형에서 확인 프롬프트를 만나면 영원히 멈춰 선다. CI 에서 이 명령이
  // 걸리면 원인을 찾기 어려우므로 먼저 막고 대안을 알린다.
  if (values.yes !== true && values['dry-run'] !== true && !process.stdin.isTTY) {
    throw new Error(
      '대화형 확인을 할 수 없는 환경입니다. --yes 또는 --dry-run 을 쓰세요.',
    );
  }

  await runUpdate({
    targetDir: resolve(path ?? process.cwd()),
    toolkitRoot,
    only: values.only as string | undefined,
    type: values.type as string | undefined,
    dryRun: values['dry-run'] === true,
    yes: values.yes === true,
    force: values.force === true,
  });
}
```

import를 추가한다: `import { runUpdate } from './update/index.js';`

`src/index.ts`에 공개 export를 추가한다:

```ts
export { runUpdate } from './update/index.js';
export type { UpdateOptions } from './update/index.js';
export { buildPlan, effectiveCategories } from './update/plan.js';
export { resolveType } from './update/resolve-type.js';
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
pnpm vitest run packages/devkit-cli/tests
pnpm lint:es
pnpm build
```

Expected: 전부 PASS

- [ ] **Step 6: 실제로 돌려본다**

```bash
pnpm build
pnpm devbak update --help 2>&1 | head -5   # 사용법이 나오는지
```

Expected: 사용법 문구가 출력된다(`update`에 잘못된 인자를 주면 에러 경로 확인).

- [ ] **Step 7: 커밋**

```bash
git add packages/devkit-cli/src/update/index.ts packages/devkit-cli/src/bin.ts \
        packages/devkit-cli/src/index.ts packages/devkit-cli/tests/update-flow.test.ts
git commit -m "feat: devbak update 서브커맨드 구현"
```

---

## Task 10: 드리프트 방어 — JSON 경로 커버리지 테스트

**Files:**
- Create: `packages/devkit-cli/tests/json-coverage.test.ts`

**Interfaces:**
- Consumes: Task 1 `categoryOfJsonPath`·`MARKER_KEY`, Task 4 `flattenSteps`, Task 5 `isJsonOverlay`·`reduceJsonOverlay`
- Produces: 없음 (테스트 전용)

설계 6.3절. `overlay-coverage.test.ts`가 파일에 대해 하는 일의 JSON판이다. **세 레시피의 모든 JSON 패치 경로가 분류되지 않으면 실패한다.**

- [ ] **Step 1: 테스트를 쓴다**

`packages/devkit-cli/tests/json-coverage.test.ts` 신규:

```ts
import { describe, expect, it } from 'vitest';
import { categoryOfJsonPath, MARKER_KEY } from '../src/lib/categories.js';
import type { Json, JsonObject } from '../src/ops/merge-json.js';
import { monorepoRecipe } from '../src/recipes/monorepo.js';
import { nestRecipe } from '../src/recipes/nest.js';
import { nextRecipe } from '../src/recipes/next.js';
import type { Ctx, Recipe } from '../src/types.js';
import { flattenSteps } from '../src/update/flatten.js';
import { isJsonOverlay, reduceJsonOverlay } from '../src/update/json-patch.js';

const CTX: Ctx = { targetDir: '/a/b/demo', toolkitRoot: '/a/b/eslint', name: 'demo', log: () => {} };

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 분류되지 않은 잎 경로를 모은다. */
function unclassified(patch: JsonObject, prefix = ''): string[] {
  const bad: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (prefix === '' && key === MARKER_KEY) continue;

    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (categoryOfJsonPath(path) !== null) continue;

    if (isPlainObject(value)) {
      bad.push(...unclassified(value, path));
      continue;
    }
    bad.push(path);
  }

  return bad;
}

async function packageJsonPatches(recipe: Recipe): Promise<JsonObject[]> {
  const patches: JsonObject[] = [];

  for (const { step, ctx } of flattenSteps(recipe({ skipInstall: true }), CTX)) {
    if (step.plan === undefined) continue;
    const changes = await step.plan(ctx);

    for (const change of changes) {
      if (change.kind === 'json' && change.file.endsWith('package.json')) {
        patches.push(change.patch);
      }
      if (
        change.kind === 'file' &&
        isJsonOverlay(change.relPath) &&
        change.relPath.endsWith('package.json')
      ) {
        patches.push(reduceJsonOverlay(change.relPath, change.content));
      }
    }
  }

  return patches;
}

describe('JSON 키 경로 커버리지', () => {
  it.each([
    ['nest', nestRecipe],
    ['next', nextRecipe],
    ['monorepo', monorepoRecipe],
  ])(
    '%s 레시피의 package.json 패치 경로가 전부 분류된다',
    async (_name, recipe) => {
      const patches = await packageJsonPatches(recipe as Recipe);
      const bad = patches.flatMap((patch) => unclassified(patch));

      // 미분류 경로가 있으면 그 키는 어떤 --only 로도 갱신되지 않으면서
      // 성공을 보고한다. src/lib/categories.ts 의 JSON_KEY_CATEGORIES 에
      // 추가하라는 뜻이다(설계 6.3절).
      expect(bad).toEqual([]);
    },
  );

  it('패치가 실제로 수집된다 — 빈 배열을 통과로 오인하지 않는다', async () => {
    // 위 테스트는 bad 가 비면 통과한다. 수집 자체가 망가져 patches 가 비어도
    // 통과하므로, 여기서 최소 개수를 못 박는다.
    const patches = await packageJsonPatches(nestRecipe);
    expect(patches.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 테스트를 돌린다**

```bash
pnpm vitest run packages/devkit-cli/tests/json-coverage.test.ts
```

Expected: PASS. **실패하면 Task 1의 표에 빠진 경로가 있다는 뜻이므로 표를 고친다** — 테스트를 느슨하게 만들지 않는다.

- [ ] **Step 3: 방어가 실제로 작동하는지 확인한다**

`src/recipes/nest.ts`의 `mergeJson` 패치에 임시로 `"funding": "x"`를 넣고:

```bash
pnpm vitest run packages/devkit-cli/tests/json-coverage.test.ts
```

Expected: FAIL, 메시지에 `funding`이 보인다. 확인했으면 **되돌린다.**

- [ ] **Step 4: 커밋**

```bash
git add packages/devkit-cli/tests/json-coverage.test.ts
git commit -m "test: JSON 키 경로 커버리지 드리프트 방어 추가"
```

---

## Task 11: e2e — `create` 산출물에 `update`를 돌리면 변경 0건

**Files:**
- Create: `packages/devkit-cli/tests/e2e/update.e2e.test.ts`

**Interfaces:**
- Consumes: 빌드된 `dist/bin.js`
- Produces: 없음 (테스트 전용)

설계 10절 5층. `create`와 `update`가 같은 레시피에서 갈라지는 순간을 잡는 그물이다.

- [ ] **Step 1: 테스트를 쓴다**

`packages/devkit-cli/tests/e2e/update.e2e.test.ts` 신규:

```ts
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const TOOLKIT = resolve(import.meta.dirname, '../../../..');
const PARENT = resolve(TOOLKIT, '..');
const RUN_ID = process.pid;
const created: string[] = [];

afterEach(() => {
  if (process.env.DEVKIT_E2E_KEEP === '1') return;
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function devbak(args: string[], cwd = TOOLKIT): string {
  return execFileSync('node', ['packages/devkit-cli/dist/bin.js', ...args], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function create(name: string, type: string): string {
  const dir = join(PARENT, `${name}-${RUN_ID}`);
  created.push(dir);
  devbak(['create', basename(dir), '--type', type, '--no-verify']);
  return dir;
}

describe.each(['nest', 'next', 'monorepo'])('create → update (%s)', (type) => {
  it('갓 생성한 프로젝트에 update 를 돌리면 변경이 0건이다', () => {
    const dir = create(`devkit-e2e-update-${type}`, type);
    const output = devbak(['update', dir, '--dry-run']);

    // create 와 update 가 같은 레시피에서 갈라지면 여기서 드러난다.
    expect(output).not.toContain('덮어쓰기 (');
    expect(output).not.toContain('신규 (');
    expect(output).toContain('동일 — 건너뜀');
  });

  it('마커 덕분에 --type 없이 돈다', () => {
    const dir = create(`devkit-e2e-marker-${type}`, type);
    const output = devbak(['update', dir, '--dry-run']);

    expect(output).toContain(`(${type})`);
  });
});
```

**주의:** `create`는 `--no-verify`로 돌려 시간을 줄이되 `pnpm install`은 그대로 한다(설치 없이는 산출물이 불완전하다). e2e는 원래 느리다.

- [ ] **Step 2: 빌드하고 돌린다**

```bash
pnpm build
pnpm test:e2e
```

Expected: PASS. 실패하면 **실제 갈라짐을 찾은 것**이다 — 테스트를 고치지 말고 원인을 고친다. 흔한 원인 두 가지:
1. `create`가 쓴 JSON의 키 순서와 `update`가 계산한 순서가 다르다 → `applyPatch`가 기존 키 순서를 보존하는지 확인
2. `pnpm install`이 `package.json`을 재작성했다 → 그 변화가 무엇인지 보고 표에 반영

- [ ] **Step 3: 남은 생성물을 정리한다**

```bash
ls -d ~/Documents/develop/devkit-e2e-* 2>/dev/null && rm -r ~/Documents/develop/devkit-e2e-*
```

- [ ] **Step 4: 커밋**

```bash
git add packages/devkit-cli/tests/e2e/update.e2e.test.ts
git commit -m "test: create 산출물에 update를 돌리면 변경 0건임을 e2e로 고정"
```

---

## Task 12: 문서·작업 기록

**Files:**
- Modify: `packages/devkit-cli/README.md`
- Modify: `README.md` (루트)
- Modify: `work-log.md`
- Create: `/Users/dabot/.claude/projects/-Users-dabot-Documents-develop-eslint/memory/project_devkit-update_2026-08-02.md`
- Modify: `/Users/dabot/.claude/projects/-Users-dabot-Documents-develop-eslint/memory/MEMORY.md`

- [ ] **Step 1: `packages/devkit-cli/README.md`를 고친다**

"## `devkit update` 기반 모듈" 절을 **실제 사용법**으로 교체한다:

````markdown
## `devbak update` — 기존 프로젝트에 표준 재적용

```bash
pnpm build
pnpm devbak update ../my-api                    # 마커가 있으면 유형 자동
pnpm devbak update ../legacy --type nest        # 마커가 없으면 유형 명시
pnpm devbak update ../my-api --only claude,ci   # 일부만
pnpm devbak update ../my-api --dry-run          # 목록만 보고 끝
```

| 옵션 | 의미 |
| --- | --- |
| `path` | 대상. 생략하면 현재 디렉토리 |
| `--only` | `claude`·`ci`·`lint`·`ts`·`test`·`deps`·`repo`·`scaffold`. 생략하면 `scaffold`를 뺀 전체 |
| `--type` | 마커가 없을 때 유형 지정 |
| `--dry-run` | 변경 목록만 출력 |
| `--yes` | 확인 생략 |
| `--force` | git 관련 거부만 우회 |

**`create`와 달리 공식 CLI를 다시 돌리지 않는다.** 파일 삭제·디렉토리 생성·자가검증도 하지 않는다 — 기존 프로젝트에서는 lint 실패가 update의 실패가 아니기 때문이다. 실행하는 것은 오버레이 복사와 `package.json` 병합, `link:` 재계산뿐이다.

**JSON 파일은 통째로 덮지 않는다.** `package.json`·`tsconfig.json`은 키 단위로 병합되므로 직접 추가한 의존성과 `compilerOptions.paths`가 보존된다. 대가로 **키 삭제는 전파되지 않는다.**

**워킹트리가 dirty하면 거부한다.** 되돌리는 수단이 git이기 때문이다. `--force`로 우회할 수 있지만, 그러면 update의 결과와 미커밋 작업이 같은 diff에 섞인다.
````

- [ ] **Step 2: 루트 `README.md`의 "기존 프로젝트에 붙이기" 절을 고친다**

수동 `link:` 안내 **앞에** 한 문단을 넣는다:

```markdown
가장 간단한 방법은 `devbak update`다.

```bash
pnpm build
pnpm devbak update ../my-api --type nest
```

마커가 없는 외부 프로젝트에는 `--type`이 필요하고, 전체 update가 마커를 심으면
다음부터는 생략할 수 있다. 자세한 내용은
[`packages/devkit-cli/README.md`](packages/devkit-cli/README.md).

수동으로 붙이려면 아래처럼 한다.
```

- [ ] **Step 3: `work-log.md`에 기록한다**

파일 맨 위(최신이 위)에 추가한다:

```markdown
## 2026-08-02

### devkit update 구현
- **변경 파일**: `packages/devkit-cli/src/{types,run,bin,index}.ts`, `src/ops/{copy-overlay,merge-json,link-deps}.ts`, `src/lib/{categories,version,confirm}.ts`, `src/update/{flatten,json-patch,plan,resolve-type,index}.ts`, `src/recipes/*.ts`, `tests/*`, README 2건
- **내용**: 기존 프로젝트에 devkit 표준을 재적용하는 `devbak update` 서브커맨드를 구현했다. `create`가 쓰는 레시피를 재사용하고 `kind`로 걸러 `copyOverlay`·`mergeJson`·`linkDeps`만 실행한다. 각 op에 `plan()`을 추가해 쓰기 전에 최종 내용을 전부 계산하고, `run()`을 `plan()` 기반으로 재구성해 두 경로가 갈라질 수 없게 했다. 그 결과 생성 시점 전용 가드(`required`·`expectUpstream`)가 `run`에만 남아 update가 자연히 비켜간다. JSON 파일 오버레이는 통째 복사 대신 패치로 환원해 사용자의 의존성·`paths`를 보존한다. `create`가 유형 마커를 심도록 함께 고쳤다.
- **커밋**: (해시)
```

- [ ] **Step 4: memory에 저장한다**

`memory/project_devkit-update_2026-08-02.md` 신규:

```markdown
---
name: project-devkit-update
description: devkit update 구현 — plan을 진실로 두는 구조, JSON 오버레이 환원, 설계 갭 5건
metadata:
  type: project
---

`devbak update`(기존 프로젝트에 표준 재적용)를 2026-08-02에 구현했다.

**설계 문서를 코드에 대보니 갭이 5건 있었다** — 문서가 확정 상태여도 코드와 대조하기 전에는 구현 가능성을 알 수 없다. (1) `create`가 마커를 심지 않았고, (2) `mergeJson`의 `required`와 (3) `copyOverlay`의 `expectUpstream`은 생성 시점 전용 가드라 update에서 항상 실패하며, (4) JSON 키 카테고리 테이블이 실제 패치의 절반만 덮었고, (5) 통짜 JSON 파일 오버레이(`monorepo/package.json`·`nest/tsconfig.json`)를 그대로 덮으면 사용자 작업이 사라진다.

**핵심 구조 결정**: `Step.plan()`이 쓰기 전에 최종 내용을 전부 계산하고 `run()`은 `plan()` + 가드 + 쓰기다. 처음에는 `Ctx`에 `mode: 'create' | 'update'`를 실어 분기하려 했는데, plan 중심으로 바꾸니 **update가 `run`을 아예 안 타서 분기 자체가 사라졌다.** 두 모드를 구분하려 조건을 추가하기 전에 같은 코드를 안 타게 만들 수 있는지 먼저 볼 것.

**Why**: 분기는 남아서 계속 관리 비용을 물리지만 안 타는 코드는 비용이 0이다. 그리고 "보여준 것과 쓰는 것이 같은 바이트"라는 보장이 구조에서 나온다.

**How to apply**: 설계는 `docs/superpowers/specs/2026-08-02-devkit-update-design.md`, 계획은 `docs/superpowers/plans/2026-08-02-devkit-update.md`. 관련: [[project-devkit-claude-review]], [[project-devkit-template-scope]], [[project-devkit-toolchain-facts]]
```

`MEMORY.md`에 한 줄 추가:

```markdown
- [devkit update 구현](project_devkit-update_2026-08-02.md) — plan을 진실로 두면 create/update 분기가 사라진다. 설계 갭 5건은 코드와 대조해야 보였다
```

- [ ] **Step 5: 최종 검증**

```bash
pnpm lint
pnpm test
pnpm build
```

Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add README.md packages/devkit-cli/README.md work-log.md
git commit -m "docs: devbak update 사용법과 작업 기록 추가"
```

---

## 완료 확인

설계 11절의 완료 기준을 하나씩 확인한다.

- [ ] `pnpm devbak update ../<프로젝트> --dry-run`이 목록을 내고 아무것도 쓰지 않는다 (Task 9 테스트)
- [ ] 마커 없는 외부 프로젝트에 `--type nest`가 먹고 `paths`·추가 의존성이 보존된다 (Task 6·9 테스트)
- [ ] `create` 산출물에 `update`를 돌리면 변경 0건 (Task 11)
- [ ] 같은 `update`를 두 번 돌리면 두 번째는 전부 "동일 — 건너뜀" (Task 9)
- [ ] dirty에서 거부되고 `--force`로 진행된다 (Task 9)
- [ ] `monorepo` update가 `apps/web/eslint.config.mjs`·`apps/web/.claude/**`를 되살리지 않고, `next` update는 `CLAUDE.md`를 놓는다 (Task 6)
- [ ] JSON 패치 경로를 추가하고 표를 갱신하지 않으면 테스트가 실패한다 (Task 10 Step 3에서 실증)
- [ ] `create` 산출물이 마커 한 키를 빼면 이전과 동일하다 (Task 7 Step 5의 스냅샷 diff)
- [ ] `pnpm lint`·`pnpm test`가 통과한다 (Task 12 Step 5)
