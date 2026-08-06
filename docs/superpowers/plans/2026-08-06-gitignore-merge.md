# .gitignore 병합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.gitignore`를 통째 덮어쓰기에서 줄 단위 병합으로 바꾸고, devkit이 놓는 `.claude` 리뷰 자산이 항상 git 추적 대상이 되게 한다.

**Architecture:** `PlannedChange`에 `kind: 'ignore'`를 더한다. `run`이 `plan()` 결과를 써서 실행하므로 새 종류를 `plan()`이 내면 create와 update 양쪽이 덮인다. 병합 자체는 부수효과 없는 순수 함수(`mergeIgnore`)로 분리해 단위 테스트가 파일 시스템 없이 규칙 전부를 고정한다.

**Tech Stack:** TypeScript (ESM, strict), vitest, pnpm 워크스페이스, turbo

## Global Constraints

- 패키지 매니저는 **pnpm**. `npm`을 쓰지 않는다.
- TypeScript strict mode, 2-space 들여쓰기.
- **주석은 한국어이며 "왜"(결정의 근거·실측 사실)를 적는다.** 코드를 그대로 옮긴 주석은 쓰지 않는다.
- **검증은 `pnpm lint:ox`와 `pnpm lint:es`를 둘 다** 돌린다. `eslint-plugin-oxlint`가 겹치는 규칙을 ESLint 쪽에서 끄므로 `no-unused-vars` 같은 것은 oxlint에만 산다. `pnpm lint`는 단락 평가라 한쪽만 돌 수 있다.
- **기준선(이 계획 시작 시점): `pnpm test` 43파일/374개, `pnpm typecheck` 7/7, `pnpm lint:ox` 에러 0·warning 3, `pnpm lint:es` 8/8, `pnpm test:e2e` 13/13.** 테스트 개수가 달라지면 정확한 수와 산출 근거를 보고한다.
- **`docs/superpowers/**`와 `work-log.md`의 기존 줄을 수정하지 않는다** — 과거 기록이다. 추가만 한다.
- **`pnpm publish`를 어떤 형태로도 실행하지 않는다.** 이 작업은 게시를 포함하지 않는다.
- `src`를 고친 뒤 CLI를 실행하거나 e2e를 돌리기 전에 **`pnpm build`**를 해야 한다 — `dist`가 `src`보다 오래되면 CLI가 실행을 거부한다.
- 커밋 메시지는 imperative mood, 한국어. **heredoc으로 넘길 때 코드펜스(```)가 메시지에 섞이지 않게 하고, 커밋 후 `git log -1`로 확인한다.**

## 블록 상수 (모든 태스크가 이 값을 쓴다)

```
# >>> devkit >>>
# Claude 로컬 스크래치는 무시하되 devkit 이 놓는 리뷰 자산은 추적한다 —
# 팀원과 CI 가 같은 리뷰 기준을 쓰려면 커밋돼야 한다.
.claude/*
!.claude/agents/
!.claude/commands/
# <<< devkit <<<
```

구분자는 정확히 `# >>> devkit >>>`와 `# <<< devkit <<<`다.

---

## File Structure

| 파일 | 책임 | 태스크 |
| --- | --- | --- |
| `packages/devkit-cli/src/ops/merge-ignore.ts` (신설) | 순수 병합 함수. 파일 시스템을 모른다 | 1 |
| `packages/devkit-cli/src/types.ts` | `PlannedChange`에 `ignore` 추가 | 2 |
| `packages/devkit-cli/src/ops/copy-overlay.ts` | `.gitignore`를 `ignore` 변경으로 내고, `run`이 그것을 쓴다 | 2 |
| `packages/devkit-cli/src/update/json-patch.ts` | `isIgnoreOverlay` | 3 |
| `packages/devkit-cli/src/update/plan.ts` | ignore 분기 | 3 |
| `packages/devkit-cli/templates/_shared/_gitignore` (신설) | 세 유형 공통 무시 규칙 + devkit 블록 | 4 |
| `packages/devkit-cli/templates/{nest,monorepo}/_gitignore` (삭제) | `_shared`로 흡수 | 4 |
| `packages/devkit-cli/tests/e2e/create.e2e.test.ts` | 생성물의 실제 병합 결과 검증 | 5 |

---

### Task 1: 순수 병합 함수

**Files:**
- Create: `packages/devkit-cli/src/ops/merge-ignore.ts`
- Create: `packages/devkit-cli/tests/merge-ignore.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export const DEVKIT_BLOCK_START = '# >>> devkit >>>'`
  - `export const DEVKIT_BLOCK_END = '# <<< devkit <<<'`
  - `export function mergeIgnore(existing: string, lines: string[], block: string[]): string`
    - `existing`: 대상 파일의 현재 내용(없으면 빈 문자열)
    - `lines`: 대상에 없으면 더할 템플릿 줄
    - `block`: 구분자 안에 들어갈 내용(구분자 자체는 포함하지 않는다)
    - 반환: 최종 파일 내용. 항상 개행으로 끝난다.

**배경 — 왜 순수 함수로 떼는가**

병합 규칙이 셋(기존 유지 / 중복 없이 추가 / 블록 교체)인데 각각 경계 조건이 있다. 파일 시스템을 끼고 테스트하면 케이스마다 임시 디렉토리를 만들어야 해 규칙 자체가 흐려진다. 문자열 → 문자열 함수면 규칙 전부를 표로 고정할 수 있다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/merge-ignore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEVKIT_BLOCK_END, DEVKIT_BLOCK_START, mergeIgnore } from '../src/ops/merge-ignore.js';

const BLOCK = ['.claude/*', '!.claude/agents/'];

describe('mergeIgnore', () => {
  it('빈 대상에는 템플릿 줄과 블록을 쓴다', () => {
    expect(mergeIgnore('', ['node_modules/'], BLOCK)).toBe(
      `node_modules/\n\n${DEVKIT_BLOCK_START}\n.claude/*\n!.claude/agents/\n${DEVKIT_BLOCK_END}\n`,
    );
  });

  it('대상의 기존 줄을 그대로 둔다 — 사용자가 넣은 규칙이 사라지면 안 된다', () => {
    const result = mergeIgnore('내-비밀-폴더/\n', ['node_modules/'], BLOCK);
    expect(result).toContain('내-비밀-폴더/');
    expect(result).toContain('node_modules/');
  });

  it('대상에 이미 있는 템플릿 줄은 다시 넣지 않는다', () => {
    const result = mergeIgnore('node_modules/\ndist/\n', ['node_modules/', 'coverage/'], BLOCK);
    expect(result.split('\n').filter((l) => l === 'node_modules/')).toHaveLength(1);
    expect(result).toContain('coverage/');
  });

  it('두 번 돌려도 커지지 않는다 — 멱등이다', () => {
    const once = mergeIgnore('node_modules/\n', ['dist/'], BLOCK);
    expect(mergeIgnore(once, ['dist/'], BLOCK)).toBe(once);
  });

  it('블록이 이미 있으면 안쪽만 갈아끼운다', () => {
    const before = mergeIgnore('node_modules/\n', [], ['.claude/*']);
    const after = mergeIgnore(before, [], ['.claude/*', '!.claude/commands/']);
    expect(after).toContain('!.claude/commands/');
    expect(after.split(DEVKIT_BLOCK_START)).toHaveLength(2);
    expect(after).toContain('node_modules/');
  });

  it('블록 바깥에 사용자가 쓴 것은 블록을 갈아끼워도 남는다', () => {
    const before = `${mergeIgnore('a/\n', [], ['.claude/*'])}b/\n`;
    const after = mergeIgnore(before, [], ['.claude/*', 'c/']);
    expect(after).toContain('a/');
    expect(after).toContain('b/');
    expect(after).toContain('c/');
  });

  it('빈 줄과 주석은 중복 판정에서 무시한다 — 그대로 더한다', () => {
    // 빈 줄을 "이미 있다"로 보면 템플릿의 구획 빈 줄이 영영 안 들어간다.
    const result = mergeIgnore('\n# 내 주석\n', ['# devkit 구획', 'dist/'], BLOCK);
    expect(result).toContain('# 내 주석');
    expect(result).toContain('# devkit 구획');
  });

  it('닫는 구분자가 없으면 던진다 — 조용히 파일 끝까지 삼키지 않는다', () => {
    const broken = `node_modules/\n${DEVKIT_BLOCK_START}\n.claude/*\n`;
    expect(() => mergeIgnore(broken, [], BLOCK)).toThrow(/구분자/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/merge-ignore.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/ops/merge-ignore.js"`

- [ ] **Step 3: 구현한다**

`packages/devkit-cli/src/ops/merge-ignore.ts`:

```ts
/**
 * devkit 이 관리하는 구간의 구분자.
 *
 * 구분자로 감싸는 이유는 갱신 가능성이다. 없으면 "devkit 이 넣은 줄"과
 * "사용자가 넣은 줄"을 구별할 방법이 없어 규칙을 바꾸는 순간 갱신이 곧
 * 파괴가 된다.
 */
export const DEVKIT_BLOCK_START = '# >>> devkit >>>';
export const DEVKIT_BLOCK_END = '# <<< devkit <<<';

/** 중복 판정용 정규화. 빈 줄과 주석은 판정 대상이 아니다. */
function significant(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) return null;
  return trimmed;
}

/**
 * 무시 파일을 병합한다. 대상의 기존 내용을 유지하고, 없는 템플릿 줄만
 * 더하고, devkit 블록은 통째로 갈아끼운다.
 *
 * 통째 덮어쓰기를 하지 않는 이유는 update 가 사용자가 추가한 규칙을 지우기
 * 때문이다(설계 1.2절). JSON 오버레이가 이미 같은 이유로 병합 패치를 쓴다.
 *
 * 중복 판정은 **정확한 문자열 일치**다. `node_modules` 와 `node_modules/` 는
 * 다른 줄로 남는다 — git 의 무시 문법을 재구현하는 비용이 이득보다 크고
 * 중복 규칙 자체는 무해하다(설계 3절).
 */
export function mergeIgnore(existing: string, lines: string[], block: string[]): string {
  const existingLines = existing.length === 0 ? [] : existing.replace(/\n$/, '').split('\n');

  const startAt = existingLines.indexOf(DEVKIT_BLOCK_START);
  let head: string[];
  let tail: string[];
  if (startAt === -1) {
    head = existingLines;
    tail = [];
  } else {
    const endAt = existingLines.indexOf(DEVKIT_BLOCK_END, startAt);
    if (endAt === -1) {
      // 열린 구분자만 있으면 어디까지가 블록인지 알 수 없다. 파일 끝까지
      // 삼켜 사용자 규칙을 날리는 대신 멈춘다.
      throw new Error(
        `${DEVKIT_BLOCK_START} 는 있는데 닫는 구분자 ${DEVKIT_BLOCK_END} 가 없습니다. 손으로 고친 뒤 다시 실행하세요.`,
      );
    }
    head = existingLines.slice(0, startAt);
    tail = existingLines.slice(endAt + 1);
  }

  const present = new Set<string>();
  for (const line of [...head, ...tail]) {
    const key = significant(line);
    if (key !== null) present.add(key);
  }

  const added: string[] = [];
  for (const line of lines) {
    const key = significant(line);
    if (key !== null && present.has(key)) continue;
    if (key !== null) present.add(key);
    added.push(line);
  }

  const merged = [...head, ...added];
  // 블록 앞에 빈 줄 하나를 둔다 — 사람이 읽을 때 경계가 보인다.
  while (merged.length > 0 && merged.at(-1)?.trim() === '') merged.pop();
  if (merged.length > 0) merged.push('');
  merged.push(DEVKIT_BLOCK_START, ...block, DEVKIT_BLOCK_END, ...tail);

  return `${merged.join('\n').replace(/\n+$/, '')}\n`;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/merge-ignore.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "feat: 무시 파일을 줄 단위로 병합하는 순수 함수를 만든다"
```

Expected: 테스트 44파일/382개(374 + 8).

---

### Task 2: create 경로 — `PlannedChange`에 `ignore`를 더한다

**Files:**
- Modify: `packages/devkit-cli/src/types.ts` (`PlannedChange`)
- Modify: `packages/devkit-cli/src/ops/copy-overlay.ts` (`plan`, `run`)
- Test: `packages/devkit-cli/tests/plan-ops.test.ts`

**Interfaces:**
- Consumes: `mergeIgnore(existing, lines, block)`, `DEVKIT_BLOCK_START`, `DEVKIT_BLOCK_END` (Task 1)
- Produces:
  - `PlannedChange`에 `{ kind: 'ignore'; file: string; lines: string[]; block: string[] }`
  - `copyOverlay`의 `plan()`이 `.gitignore`에 대해 `ignore` 변경을 낸다

**⚠️ 조용한 실패 위험 — 반드시 함께 고쳐라**

`copy-overlay.ts`의 `run`은 지금 `if (change.kind !== 'file') continue;`로 **`file`이 아닌 변경을 건너뛴다.** `plan()`이 `ignore`를 내기 시작하는데 `run`을 안 고치면 **`.gitignore`가 조용히 안 써진다.** 에러도 안 난다. 두 변경은 한 커밋에 함께 들어가야 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/plan-ops.test.ts` 끝에 추가한다(파일 상단의 기존 import와 헬퍼를 쓴다. `mkdtempSync`·`tmpdir`·`join`·`writeFileSync`가 없으면 추가하라):

```ts
describe('copyOverlay 의 .gitignore 처리', () => {
  it('plan 이 ignore 변경으로 낸다 — 통짜 file 이 아니다', async () => {
    const ctx = makeCtx();
    const changes = await copyOverlay('nest').plan!(ctx);
    const gitignore = changes.find(
      (c) => (c.kind === 'ignore' ? c.file : c.kind === 'file' ? c.relPath : '') === '.gitignore',
    );
    expect(gitignore?.kind).toBe('ignore');
  });

  it('run 이 대상의 기존 내용을 보존한다', async () => {
    const ctx = makeCtx();
    writeFileSync(join(ctx.targetDir, '.gitignore'), '내-비밀-폴더/\n');

    await copyOverlay('nest').run(ctx);

    const written = readFileSync(join(ctx.targetDir, '.gitignore'), 'utf8');
    expect(written).toContain('내-비밀-폴더/');
    expect(written).toContain('# >>> devkit >>>');
    expect(written).toContain('.claude/*');
  });
});
```

`makeCtx()`가 파일에 없으면 이 헬퍼를 추가한다:

```ts
function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-overlay-'));
  created.push(dir);
  return { targetDir: dir, toolkitRoot: null, name: 'demo', log: () => {} };
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/plan-ops.test.ts
```

Expected: 첫 번째가 FAIL(`kind`가 `'file'`), 두 번째도 FAIL(기존 내용이 사라짐).

- [ ] **Step 3: `PlannedChange`를 넓힌다**

`packages/devkit-cli/src/types.ts`:

```ts
export type PlannedChange =
  | { kind: 'file'; relPath: string; content: string }
  | { kind: 'json'; file: string; patch: JsonObject }
  /**
   * 무시 파일(.gitignore). 통째로 덮으면 사용자가 추가한 규칙이 사라지므로
   * 줄 단위로 병합한다(설계 2.1절). `lines` 는 없으면 더할 템플릿 줄,
   * `block` 은 devkit 구분자 안에 들어갈 내용이다.
   */
  | { kind: 'ignore'; file: string; lines: string[]; block: string[] };
```

- [ ] **Step 4: `copyOverlay`의 `plan`이 `ignore`를 내게 한다**

`packages/devkit-cli/src/ops/copy-overlay.ts`에 import를 더한다:

```ts
import { DEVKIT_BLOCK_END, DEVKIT_BLOCK_START, mergeIgnore } from './merge-ignore.js';
```

`plan` 안에서 파일 변경을 만들 때, 대상 상대경로의 basename이 `.gitignore`면 `file` 대신 `ignore`를 낸다. 템플릿 내용을 `lines`와 `block`으로 가른다:

```ts
/**
 * 템플릿 무시 파일을 "일반 줄"과 "devkit 블록"으로 가른다.
 *
 * 블록은 통째로 갈아끼워지고 일반 줄은 대상에 없을 때만 더해진다 —
 * 다루는 방식이 다르므로 여기서 나눈다.
 */
function splitIgnoreTemplate(content: string): { lines: string[]; block: string[] } {
  const all = content.replace(/\n$/, '').split('\n');
  const startAt = all.indexOf(DEVKIT_BLOCK_START);
  if (startAt === -1) return { lines: all, block: [] };
  const endAt = all.indexOf(DEVKIT_BLOCK_END, startAt);
  if (endAt === -1) {
    throw new Error(
      `템플릿 무시 파일에 ${DEVKIT_BLOCK_START} 는 있는데 ${DEVKIT_BLOCK_END} 가 없습니다.`,
    );
  }
  return {
    lines: [...all.slice(0, startAt), ...all.slice(endAt + 1)],
    block: all.slice(startAt + 1, endAt),
  };
}
```

- [ ] **Step 5: `run`이 `ignore`를 실제로 쓰게 한다**

`copy-overlay.ts`의 `run` 루프에서 `if (change.kind !== 'file') continue;`를 **`ignore`도 처리하도록** 바꾼다:

```ts
      for (const change of changes) {
        if (change.kind === 'ignore') {
          const target = join(ctx.targetDir, ...change.file.split('/'));
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
          const existing = await readFile(target, 'utf8').catch(() => '');
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
          await mkdir(dirname(target), { recursive: true });
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
          await writeFile(target, mergeIgnore(existing, change.lines, change.block));
          ctx.log(`  병합: ${change.file.split('/').join(sep)}`);
          continue;
        }
        if (change.kind !== 'file') continue;
        // (이하 기존 코드 그대로)
```

`readFile`이 import돼 있는지 확인하고 없으면 `node:fs/promises`에서 추가한다.

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run
```

Expected: 전부 PASS. 스냅샷이 깨지면 값이 실제로 바뀐 것인지 확인하고, 맞으면 **패키지 디렉토리에서** `pnpm exec vitest run -u`로 갱신한다(루트에서 돌리면 기본 glob이 e2e까지 잡는다).

- [ ] **Step 7: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "feat: create 가 .gitignore 를 덮지 않고 병합하게 한다"
```

Expected: 테스트 44파일/384개(382 + 2).

---

### Task 3: update 경로

**Files:**
- Modify: `packages/devkit-cli/src/update/json-patch.ts` (`isIgnoreOverlay` 추가)
- Modify: `packages/devkit-cli/src/update/plan.ts` (ignore 분기)
- Test: `packages/devkit-cli/tests/update-plan.test.ts`

**Interfaces:**
- Consumes: `mergeIgnore` (Task 1), `PlannedChange`의 `ignore` (Task 2)
- Produces: `export function isIgnoreOverlay(relPath: string): boolean`

**배경**

`update/plan.ts`는 오버레이를 세 갈래로 다룬다 — JSON(기준 내용 + 패치), 그 외(통째 덮어쓰기). 여기에 ignore 갈래를 넣는다. 지금은 `.gitignore`가 "그 외"로 떨어져 **대상 내용을 읽지 않고 교체**된다(`plan.ts:113-118`).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/update-plan.test.ts` 끝에 추가한다:

```ts
describe('.gitignore 병합', () => {
  it('사용자가 추가한 규칙을 지우지 않는다', async () => {
    const ctx = makeTarget();
    writeFileSync(join(ctx.targetDir, '.gitignore'), '내-비밀-폴더/\nnode_modules/\n');

    const plan = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['repo']),
      marker: null,
    });

    const gitignore = plan.find((f) => f.relPath === '.gitignore');
    expect(gitignore).toBeDefined();
    expect(gitignore!.content).toContain('내-비밀-폴더/');
    expect(gitignore!.content).toContain('# >>> devkit >>>');
    expect(gitignore!.content).toContain('.claude/*');
  });

  it('두 번 돌려도 같은 내용이다 — 멱등이다', async () => {
    const ctx = makeTarget();
    writeFileSync(join(ctx.targetDir, '.gitignore'), 'node_modules/\n');

    const first = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['repo']),
      marker: null,
    });
    const content = first.find((f) => f.relPath === '.gitignore')!.content;

    writeFileSync(join(ctx.targetDir, '.gitignore'), content);
    const second = await buildPlan({
      type: 'nest',
      ctx,
      categories: new Set<Category>(['repo']),
      marker: null,
    });

    expect(second.find((f) => f.relPath === '.gitignore')!.content).toBe(content);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/update-plan.test.ts
```

Expected: 첫 번째가 FAIL — `내-비밀-폴더/`가 없다(통째 교체됐다).

- [ ] **Step 3: `isIgnoreOverlay`를 더한다**

`packages/devkit-cli/src/update/json-patch.ts`의 `isJsonOverlay` 바로 아래:

```ts
/**
 * 줄 단위로 병합해야 하는 무시 파일인가.
 *
 * 통째로 덮으면 사용자가 추가한 규칙이 사라진다(설계 1.2절). JSON 이
 * `isJsonOverlay` 로 같은 문제를 피하는 것과 같은 자리다.
 */
export function isIgnoreOverlay(relPath: string): boolean {
  return baseName(relPath) === '.gitignore';
}
```

- [ ] **Step 4: `update/plan.ts`에 분기를 넣는다**

import를 더한다:

```ts
import { filterPatchByCategory, isIgnoreOverlay, isJsonOverlay, reduceJsonOverlay } from './json-patch.js';
import { mergeIgnore } from '../ops/merge-ignore.js';
```

파일 오버레이 분기(`if (change.kind === 'file' && !isJsonOverlay(stepRelPath))`) **앞에** ignore 처리를 넣는다:

```ts
      if (change.kind === 'ignore') {
        // 대상 내용을 읽어 병합한다. 통째로 덮으면 사용자가 추가한 규칙이
        // 사라진다 — JSON 오버레이가 reduceJsonOverlay 로 피하는 것과 같은
        // 문제다(설계 1.2절).
        if (fileCategory !== null && categories.has(fileCategory)) {
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
          const existing = await readFile(join(ctx.targetDir, relPath), 'utf8').catch(() => '');
          files.set(relPath, mergeIgnore(existing, change.lines, change.block));
          fileCategories.set(relPath, fileCategory);
        }
        continue;
      }
```

`readFile`과 `join`이 import돼 있는지 확인하고 없으면 각각 `node:fs/promises`·`node:path`에서 추가한다.

**`isIgnoreOverlay`를 쓰는 곳**: `change.kind === 'ignore'`로 이미 갈리므로 분기 자체에는 필요 없다. `isJsonOverlay`가 `.gitignore`를 JSON으로 오인하지 않는지 확인만 하고(확장자가 `.json`이 아니라 오인하지 않는다), **`isIgnoreOverlay`를 아무도 쓰지 않으면 export하지 마라** — 소비처 없는 심볼은 남기지 않는다. Step 5에서 판단한다.

- [ ] **Step 5: `isIgnoreOverlay`의 소비처를 확인한다**

```bash
grep -rn "isIgnoreOverlay" packages/devkit-cli/src packages/devkit-cli/tests
```

소비처가 없으면 Step 3에서 더한 함수를 **지운다**. 이 저장소는 소비처 없는 심볼을 남기지 않는다(`linkSpec` 제거 때 같은 규율을 적용했다).

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run
```

Expected: 전부 PASS.

- [ ] **Step 7: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "feat: update 가 .gitignore 를 병합하게 한다"
```

Expected: 테스트 44파일/386개(384 + 2).

---

### Task 4: 템플릿 재배치

**Files:**
- Create: `packages/devkit-cli/templates/_shared/_gitignore`
- Delete: `packages/devkit-cli/templates/nest/_gitignore`
- Delete: `packages/devkit-cli/templates/monorepo/_gitignore`
- Test: `packages/devkit-cli/tests/overlay-coverage.test.ts`(기존, 통과 확인)

**Interfaces:**
- Consumes: Task 1의 구분자 상수(문자열로만 쓴다)
- Produces: 없음

**배경**

`_gitignore`가 `nest`·`monorepo`에만 있고 `next`에는 없어 유형별로 동작이 갈렸다. `_shared`로 옮기면 세 유형이 같은 처리를 받고, `next`도 처음으로 오버레이를 받지만 **병합이라 `create-next-app`의 규칙이 보존된다.**

- [ ] **Step 1: `_shared/_gitignore`를 만든다**

`packages/devkit-cli/templates/_shared/_gitignore`:

```
node_modules/
dist/
coverage/
.turbo/
.next/
out/
*.log
.DS_Store
.env
.env.*
!.env.example

# >>> devkit >>>
# Claude 로컬 스크래치는 무시하되 devkit 이 놓는 리뷰 자산은 추적한다 —
# 팀원과 CI 가 같은 리뷰 기준을 쓰려면 커밋돼야 한다.
.claude/*
!.claude/agents/
!.claude/commands/
# <<< devkit <<<
```

기존 두 파일의 줄을 합집합으로 담았다. 한 유형에만 필요한 줄(`.turbo/`, `.next/`, `out/`, `coverage/`)이 남아도 무해하다 — 병합 규칙이 대상에 이미 있는 줄을 걸러내고, 대상이 나중에 그 도구를 쓰게 돼도 규칙이 이미 있다.

- [ ] **Step 2: 기존 두 파일을 지운다**

```bash
git rm packages/devkit-cli/templates/nest/_gitignore packages/devkit-cli/templates/monorepo/_gitignore
```

- [ ] **Step 3: Task 2가 쓴 테스트의 대상을 바꾼다**

`packages/devkit-cli/tests/plan-ops.test.ts`의 `describe('copyOverlay 의 .gitignore 처리', ...)` 안에서 **`copyOverlay('nest')`를 `copyOverlay('_shared')`로 바꾼다.** Task 2 시점에는 `_gitignore`가 `nest` 템플릿에 있었지만 Step 2가 그것을 지웠다 — 안 바꾸면 그 테스트가 `.gitignore`를 못 찾아 실패한다.

두 곳(`plan`을 부르는 테스트와 `run`을 부르는 테스트) 모두 바꾼다.

- [ ] **Step 4: 드리프트 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/overlay-coverage.test.ts tests/categories.test.ts
```

Expected: PASS. `overlay-coverage.test.ts`는 모든 템플릿 파일이 카테고리를 갖는지 보는데 `_gitignore`는 `repo`로 이미 분류된다(`categories.ts:60`).

**실패하면 고쳐서 넘어가지 말고 보고하라** — 카테고리 매핑이 `_shared` 경로를 다르게 다룰 수 있다.

- [ ] **Step 5: 세 유형의 계획에 `.gitignore`가 나오는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/recipe-nest.test.ts tests/recipe-next.test.ts tests/recipe-monorepo.test.ts tests/plan-ops.test.ts
```

스냅샷이 깨지면 값이 실제로 바뀐 것인지 확인하고(`nest`·`monorepo`는 경로가 바뀌었고 `next`는 새로 생겼다), 맞으면 `pnpm exec vitest run -u`로 갱신한다.

- [ ] **Step 6: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "feat: _gitignore 를 _shared 로 옮겨 세 유형이 같게 만든다"
```

Expected: 테스트 개수는 386개 그대로(테스트를 더하지 않았다).

---

### Task 5: e2e 검증과 문서

**Files:**
- Modify: `packages/devkit-cli/tests/e2e/create.e2e.test.ts`
- Modify: `packages/devkit-cli/README.md` (`--only` 카테고리 표의 `repo` 행 근처)
- Modify: `work-log.md` (추가만)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

**배경**

단위 테스트는 병합 규칙을 고정하지만 **실제 스캐폴딩 CLI가 쓴 `.gitignore` 위에 얹히는 것**은 e2e만 밟는다. `@nestjs/cli new`와 `create-next-app`이 각자 `.gitignore`를 쓰고 그 위에 오버레이가 온다.

- [ ] **Step 1: e2e 단언을 더한다**

`packages/devkit-cli/tests/e2e/create.e2e.test.ts`의 `nest` 케이스에서 `.gitignore` 존재를 단언하는 곳(137-138행 근처) 바로 아래에 추가한다:

```ts
    // 스캐폴딩 CLI 가 쓴 규칙 위에 얹혔는지 — 통째로 덮었다면 nest CLI 의
    // 줄이 사라진다. 병합이 실제 파일에서 동작하는지는 e2e 만 밟는다.
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# >>> devkit >>>');
    expect(gitignore).toContain('.claude/*');
    expect(gitignore).toContain('!.claude/agents/');
    expect(gitignore).toContain('node_modules');
```

`next` 케이스(157행 근처)에도 같은 네 줄을 넣는다. `next`는 이번에 처음 오버레이를 받으므로 **`create-next-app`의 줄이 보존되는지**가 핵심이다:

```ts
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# >>> devkit >>>');
    expect(gitignore).toContain('.claude/*');
    // create-next-app 이 쓴 줄이 남아 있어야 한다 — 병합이지 교체가 아니다.
    expect(gitignore).toContain('.next');
```

`readFileSync`가 import돼 있는지 확인하고 없으면 `node:fs`에서 추가한다.

- [ ] **Step 2: e2e를 돌린다**

```bash
GITHUB_TOKEN=$(gh auth token) pnpm test:e2e
```

Expected: **13/13**(테스트 개수는 그대로 — 기존 `it` 안에 `expect`만 더했다). 수 분 걸린다.

**실패하면 단언을 느슨하게 고치지 말고 원인을 보고하라** — 병합이 실제로 안 되고 있을 수 있다.

- [ ] **Step 3: 잔재를 확인한다**

```bash
git status --porcelain
ls -d /Users/dabot/Documents/develop/devkit-e2e-* 2>/dev/null || echo "잔재 없음"
```

- [ ] **Step 4: `--only` 카테고리 표를 갱신한다**

`packages/devkit-cli/README.md`의 카테고리 표에서 `repo` 행에 `.gitignore`가 **병합**된다는 사실을 적는다. 현재 행은 `.gitignore`를 다른 파일들과 함께 나열하는데, 그 파일만 다루는 방식이 다르다는 것이 드러나야 한다.

표 아래에 한 문단을 더한다:

```markdown
`.gitignore`는 이 표에서 유일하게 **통째로 덮이지 않고 병합된다.** 대상의
기존 규칙을 유지한 채 devkit 규칙 중 없는 것만 더하고, `# >>> devkit >>>`
블록만 통째로 갱신한다. 그 블록은 `.claude/` 안에서 devkit이 놓는 리뷰
자산(`agents/`·`commands/`)만 추적하고 나머지 개인 스크래치는 무시한다.
```

- [ ] **Step 5: `work-log.md`에 항목을 더한다**

`## 2026-08-06` 절을 만들고(없으면) 새 `###` 항목을 **추가만** 한다. 기존 항목과 다른 날짜를 수정하지 않는다. 형식:

```markdown
## 2026-08-06

### .gitignore 병합과 .claude 리뷰 자산 추적
- **변경 파일**: (실제 목록)
- **내용**: (통째 덮어쓰기 → 줄 단위 병합, PlannedChange의 ignore 종류, _shared 재배치)
- **커밋**: (범위)
```

- [ ] **Step 6: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "test: 실제 생성물에서 .gitignore 병합을 검증한다"
```

---

## 완료 확인

설계 4절의 완료 기준과 대조한다.

1. 세 유형 전부 `.gitignore`에 devkit 블록이 있고 스캐폴딩 규칙이 보존된다 — Task 5 Step 1·2
2. `.claude` 자산 둘이 추적 대상, `settings.local.json`은 무시 — Task 4 Step 1의 블록
3. `.claude/`를 무시하던 기존 프로젝트에 update를 돌리면 자산이 추적된다 — Task 3 Step 1
4. update가 사용자 규칙을 지우지 않는다 — Task 3 Step 1
5. update를 두 번 돌려도 `.gitignore`가 커지지 않는다 — Task 1 Step 1, Task 3 Step 1
6. 블록만 갱신되고 바깥은 그대로다 — Task 1 Step 1
7. `--dry-run`이 병합 결과를 정확히 보여준다 — Task 3(`buildPlan`이 곧 dry-run의 출처다)
8. 기준선 유지 — 각 태스크 마지막 단계

최종 수치: 테스트 **44파일/386개**, typecheck 7/7, `lint:ox` 에러 0·warning 3, `lint:es` 8/8, e2e **13/13**.
