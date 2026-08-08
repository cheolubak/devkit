# devkit Claude 스킬·커맨드 템플릿 자산 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `devbak create`가 만드는 프로젝트에 유형별 Claude 스킬과 슬래시 커맨드를 놓고, 그 스킬을 리뷰 판정의 근거로 배선한다.

**Architecture:** 스킬 원본은 `templates/_skills/` 공용 풀에 한 벌만 두고, 새 원자 연산 `copySkills(names)`가 레시피가 이름으로 선언한 것만 `.claude/skills/`로 복사한다. 원본 스킬이 devkit 스택과 모순하는 지점(class-validator·`@eslint/js`·steiger)은 원본을 고치지 않고 devkit이 저작한 `devkit-stack` 스킬 하나가 우선순위를 뒤집어 봉인한다.

**Tech Stack:** TypeScript(ESM, strict) · vitest · oxlint + ESLint 10 · pnpm workspace · tsup

## Global Constraints

- 패키지 매니저는 **pnpm**이다. `npm`을 쓰지 않는다.
- 들여쓰기 2칸, TypeScript strict, `.then()` 대신 `async/await`.
- 소스의 모든 상대 import는 **`.js` 확장자**를 붙인다(ESM). `../types.js`처럼 쓴다.
- 커밋 메시지는 한글 imperative mood. 본문에 **왜**를 남긴다.
- 작업 브랜치는 `feature/devkit-claude-skills`다. `main`으로 체크아웃하지 않는다.
- 검증 명령은 저장소 루트에서 돌린다: `pnpm --filter @cheolubak/devkit-cli test`, `pnpm lint:es`, `pnpm build`.
  `pnpm lint`는 단락 평가라 ESLint 단독 결과를 보려면 `pnpm lint:es`를 쓴다.
- 스킬 원본의 출처는 `~/.claude/skills/<name>/`이며 **바이트 그대로** 옮긴다. 내용을 고치지 않는다.
- 스킬 풀 경로는 `packages/devkit-cli/templates/_skills/`다. `.claude/` 아래가 아니므로
  루트 `.gitignore`의 `.claude/` 규칙과 무관하다.

---

## File Structure

| 파일 | 책임 |
| --- | --- |
| `templates/_skills/devkit-stack/SKILL.md` | 신규. `@cheolubak/*`가 이미 결정한 것과 원본 스킬 대비 우선순위 선언 |
| `templates/_skills/<원본 42개>/` | 신규. `~/.claude/skills/`에서 바이트 그대로 복사 |
| `src/ops/copy-skills.ts` | 신규. `copySkills(names)` 원자 연산 |
| `src/ops/copy-overlay.ts` | 수정. `collectTree`·`templatesRoot`를 export |
| `src/ops/index.ts` | 수정. `copySkills` 재export |
| `src/types.ts` | 수정. `StepKind`에 `'copySkills'` 추가 |
| `src/lib/skill-sets.ts` | 신규. 유형별 스킬 이름 목록 단일 출처 |
| `src/lib/categories.ts` | 수정. `.claude/skills/`를 `claude` 카테고리에 매칭 |
| `src/recipes/{nest,next,monorepo}.ts` | 수정. `copySkills(SKILL_SETS[type])` 단계 추가 |
| `templates/_shared/.claude/commands/verify.md` | 신규 |
| `templates/nest/.claude/commands/{module,api-test}.md` | 신규 |
| `templates/next/.claude/commands/{slice,a11y}.md` | 신규 |
| `templates/monorepo/.claude/commands/{module,api-test,slice,a11y}.md` | 신규 |
| `templates/{nest,next,monorepo}/.claude/agents/devkit-reviewer.md` | 수정. `skills:` frontmatter + 판정 근거 경로 + 우선순위 한 줄 |
| `templates/_shared/.github/workflows/claude-review.yml` | 수정. 프롬프트에 스킬 문단 추가 |
| `templates/{nest,next,monorepo}/CLAUDE.md` | 수정. 스킬·커맨드 안내 절 추가 |
| `tests/copy-skills.test.ts` | 신규. op 단위 테스트 |
| `tests/skill-assets.test.ts` | 신규. 풀 무결성·선택 무결성·리뷰 배선 단언 |

---

### Task 1: `devkit-stack` 스킬 저작

풀의 첫 입주자이자 Task 2의 테스트 대상이다. 원본 복사(Task 3)보다 먼저 온다 — 이것 하나만 있으면 `copySkills`를 완전히 테스트할 수 있고, 1.7MB 복사가 op 구현을 가로막지 않는다.

**Files:**
- Create: `packages/devkit-cli/templates/_skills/devkit-stack/SKILL.md`
- Test: `packages/devkit-cli/tests/skill-assets.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 경로 `templates/_skills/devkit-stack/SKILL.md`. frontmatter `name: devkit-stack`. Task 2·4·6이 이 이름을 문자열로 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/skill-assets.test.ts`를 새로 만든다.

```ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));
const POOL_DIR = `${TEMPLATES_DIR}_skills/`;

describe('devkit-stack 스킬', () => {
  it('frontmatter의 name이 devkit-stack 이다', async () => {
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-stack\n/);
  });

  it('검증이 zod 임을 명시하고 class-validator 를 이름으로 배제한다', async () => {
    // 원본 nestjs-validation·nestjs-crud 가 class-validator 를 가르치고,
    // devkit-reviewer 는 그 지적을 금지한다. 이 봉인이 없으면 아무도 못 잡는다.
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('zod');
    expect(doc).toContain('class-validator');
    expect(doc).toContain('nestjs-validation');
  });

  it('린트 설정 출처가 @cheolubak/eslint-config-nest 임을 명시한다', async () => {
    // 원본 eslint 스킬은 @eslint/js·eslint-config-prettier 직접 설치를
    // 가르치는데, recipes/nest.ts 는 그 둘을 null 로 제거한다.
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('@cheolubak/eslint-config-nest');
    expect(doc).toContain('@eslint/js');
  });

  it('FSD 강제가 eslint-plugin-fsd 임을 명시하고 steiger 를 배제한다', async () => {
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('@cheolubak/eslint-plugin-fsd');
    expect(doc).toContain('steiger');
  });

  it('우선순위 선언을 갖는다 — 다른 스킬과 어긋나면 이 문서가 이긴다', async () => {
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('## 우선순위');
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL — `ENOENT ... templates/_skills/devkit-stack/SKILL.md`

- [ ] **Step 3: `devkit-stack/SKILL.md`를 쓴다**

`packages/devkit-cli/templates/_skills/devkit-stack/SKILL.md`:

````markdown
---
name: devkit-stack
description: "이 프로젝트가 @cheolubak/* devkit 툴킷으로 이미 결정한 것들. 린트·포맷·타입·테스트·검증 라이브러리의 출처와, 다른 스킬의 안내와 어긋날 때의 우선순위.\nAPPLIES: 의존성을 추가하거나 설정 파일(eslint.config.mjs·tsconfig.json·prettier)을 고칠 때, 입력 검증을 붙일 때, 다른 스킬이 안내한 설치 명령을 실행하기 전에. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"의존성 추가\", \"패키지 설치\", \"eslint 설정\", \"lint 에러\", \"검증 붙여줘\", \"DTO\", \"스키마\", \"tsconfig\", \"테스트 설정\", \"이 프로젝트 규칙\", devkit 툴킷이 이미 정한 영역을 건드릴 때.\nSKIP: 없다. 다른 스킬과 충돌하면 이 문서가 이긴다."
---

# devkit 스택 — 이미 결정된 것

이 프로젝트는 `@cheolubak/*` devkit 툴킷으로 생성됐다. 아래는 **이미 결정돼 있어
다시 고르지 않는 것**이다. 다른 스킬이 다른 선택지를 안내하더라도 이 프로젝트에서는
여기 적힌 것을 쓴다.

## 출처

| 영역 | 패키지 | 소비 지점 |
| --- | --- | --- |
| 린트(NestJS) | `@cheolubak/eslint-config-nest` | `eslint.config.mjs` |
| 린트(FSD 경계) | `@cheolubak/eslint-plugin-fsd` | `eslint.config.mjs` |
| 포맷 | `@cheolubak/prettier-config` | `package.json` 의 `prettier` 키 |
| 타입 | `@cheolubak/tsconfig` | `tsconfig.json` 의 `extends` |
| 테스트(NestJS) | `@cheolubak/jest-config` | `jest.config.js`·`jest-e2e.config.js` |
| 테스트(Next.js) | `@cheolubak/vitest-config` | `vitest.config.ts` |

이 패키지들은 GitHub Packages에서 설치된다. `.npmrc`가
`@cheolubak:registry=https://npm.pkg.github.com`을 가리키므로 `GITHUB_TOKEN`
환경변수가 없으면 `pnpm install`이 실패한다 — **공개 패키지도 마찬가지다.**

기계 검증은 네 겹이며 CI에서 이미 돈다: `prettier`(포맷) · `oxlint`(비타입
correctness) · ESLint(타입 인식 규칙) · `tsc --noEmit`(타입).

## 우선순위

**다른 스킬의 안내가 이 문서와 어긋나면 이 문서가 이긴다.** 어긋나는 지점은
아래 셋이며, 전부 실측으로 확인된 것이다.

### 1. 입력 검증은 zod다 — `class-validator`가 아니다

`nestjs-validation`·`nestjs-crud` 스킬은 `class-validator` 데코레이터 기반 DTO를
가르친다. **이 프로젝트에는 적용하지 않는다.** `class-validator`·
`class-transformer`를 설치하지 않고, DTO 클래스에 검증 데코레이터를 붙이지 않는다.

대신 zod 스키마를 선언하고 그 스키마에서 타입을 뽑는다.

```ts
import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

두 스킬의 나머지 내용(모듈 배치, 페이지네이션, 에러 매핑, 리포지토리 경계)은
그대로 유효하다. 검증 라이브러리 부분만 위로 바꿔 읽는다.

### 2. 린트 설정은 `@cheolubak/eslint-config-nest`를 확장한다

`eslint` 스킬은 `pnpm add -D eslint typescript-eslint @eslint/js eslint-config-prettier`
후 flat config를 직접 조립하라고 안내한다. **이 프로젝트는 그러지 않는다.**
`@eslint/js`·`eslint-config-prettier`·`eslint-plugin-prettier`는 생성 시점에
의도적으로 **제거된** 패키지다. 다시 설치하면 포맷 규칙이 ESLint로 새어들어와
Prettier와 이중으로 싸운다.

규칙을 더할 일이 있으면 `eslint.config.mjs`에서 기존 config를 확장한다.
포맷 관련 규칙은 추가하지 않는다 — 포맷은 Prettier 전담이다.

### 3. FSD 경계 강제는 `@cheolubak/eslint-plugin-fsd`다 — `steiger`가 아니다

`fsd-architecture` 스킬은 `steiger`를 전제로 쓰였다. **이 프로젝트는 `steiger`를
설치하지 않는다.** 레이어·슬라이스·Public API 개념은 그대로 쓰되, 경계 위반은
`eslint.config.mjs`의 `@cheolubak/eslint-plugin-fsd` 규칙이 잡는다.

Next.js App Router와 이름이 충돌하므로 FSD의 `pages` 레이어는 **`views`**로 쓴다
(`src/views/`). 이것도 생성 시점에 정해진 것이다.

## 새 의존성을 추가하기 전에

위 표의 영역에 이미 답이 있는지 먼저 본다. 있으면 추가하지 않는다. 없으면
추가하되, 런타임에 `import` 되는 것은 `dependencies`에 넣는다 —
`devDependencies`에 두면 `pnpm install --prod` 배포에서 빠져 `Cannot find module`로
죽는다.
````

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: PASS (5건)

- [ ] **Step 5: git이 실제로 추적하는지 확인한다**

Run: `git check-ignore -v packages/devkit-cli/templates/_skills/devkit-stack/SKILL.md`
Expected: 출력 없음, exit code 1 (= 무시하지 않음)

디스크에 있는데 git에 없으면 이 스위트는 초록불인 채 clone·CI·게시본에만 파일이
없다. 2026-08-06에 `devkit-implementer.md`가 실제로 그렇게 됐다.

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/templates/_skills/devkit-stack/SKILL.md packages/devkit-cli/tests/skill-assets.test.ts
git commit -m "feat: devkit-stack 스킬로 원본 스킬과의 스택 충돌을 봉인한다

원본 nestjs-validation·nestjs-crud 는 class-validator 를 가르치는데
devkit-reviewer 는 그 지적을 금지한다 — 구현자는 배우고 리뷰어는 못 잡는
경로가 생긴다. 원본을 각색하면 상류와 갈라지므로, 우선순위를 뒤집는 문서
하나로 봉인한다. eslint(@eslint/js 직접 설치)·fsd-architecture(steiger)도
같은 방식으로 덮는다."
```

---

### Task 2: `copySkills` 원자 연산

**Files:**
- Create: `packages/devkit-cli/src/ops/copy-skills.ts`
- Modify: `packages/devkit-cli/src/ops/copy-overlay.ts` (`collectTree`·`templatesRoot` export)
- Modify: `packages/devkit-cli/src/ops/index.ts`
- Modify: `packages/devkit-cli/src/types.ts:17`
- Modify: `packages/devkit-cli/src/lib/categories.ts:45`
- Test: `packages/devkit-cli/tests/copy-skills.test.ts`

**Interfaces:**
- Consumes: `templates/_skills/devkit-stack/` (Task 1)
- Produces:
  - `copySkills(names: readonly string[]): Step` — `kind: 'copySkills'`, `describe(): { skills: string[] }`, `plan(): Promise<PlannedChange[]>` (전부 `kind: 'file'`, `relPath`는 `.claude/skills/<name>/...`)
  - `SKILL_POOL_DIR = '_skills'`
  - `collectTree(from: string, relDir: string, vars: Record<string, string>): Promise<PlannedChange[]>` (copy-overlay.ts에서 export)
  - `templatesRoot(): string` (copy-overlay.ts에서 export)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/copy-skills.test.ts`:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copySkills } from '../src/ops/copy-skills.js';
import type { Ctx } from '../src/types.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devkit-copy-skills-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function ctx(): Ctx {
  return { targetDir: dir, toolkitRoot: null, name: 'demo', log: () => undefined };
}

describe('copySkills', () => {
  it('스킬을 .claude/skills/<name>/ 아래로 계획한다', async () => {
    const step = copySkills(['devkit-stack']);
    const changes = await step.plan!(ctx());
    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file));
    expect(paths).toContain('.claude/skills/devkit-stack/SKILL.md');
  });

  it('계획한 변경이 전부 kind: file 이다', async () => {
    // collectTree 는 .gitignore 를 만나면 kind:'ignore' 로 낸다. 스킬 안에
    // 그런 파일이 들어오면 run 이 조용히 건너뛰어 파일이 사라진다.
    const step = copySkills(['devkit-stack']);
    const changes = await step.plan!(ctx());
    expect(changes.every((c) => c.kind === 'file')).toBe(true);
  });

  it('풀에 없는 이름이면 던진다', async () => {
    // 조용히 건너뛰면 그 스킬은 어떤 유형에도 배포되지 않으면서 생성이 성공한다.
    const step = copySkills(['존재하지-않는-스킬']);
    await expect(step.plan!(ctx())).rejects.toThrow('존재하지-않는-스킬');
  });

  it('describe 가 이름 목록을 그대로 낸다', () => {
    const step = copySkills(['devkit-stack']);
    expect(step.describe()).toEqual({ skills: ['devkit-stack'] });
  });

  it('run 이 실제로 파일을 쓴다', async () => {
    await copySkills(['devkit-stack']).run(ctx());
    const written = await readFile(join(dir, '.claude', 'skills', 'devkit-stack', 'SKILL.md'), 'utf8');
    expect(written).toContain('name: devkit-stack');
  });

  it('__NAME__ 을 치환하지 않는다', async () => {
    // 스킬 본문은 프로젝트 이름과 무관하다. 우연히 그 형태의 문자열이 있으면
    // 치환이 원문을 훼손한다 — 원본 그대로 복사가 이 자산의 계약이다.
    const step = copySkills(['devkit-stack']);
    expect(step.describe()).not.toHaveProperty('vars');
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test copy-skills`
Expected: FAIL — `Cannot find module '../src/ops/copy-skills.js'`

- [ ] **Step 3: `copy-overlay.ts`의 두 함수를 export 한다**

`packages/devkit-cli/src/ops/copy-overlay.ts`에서 `function templatesRoot()`를
`export function templatesRoot()`로, `async function collectTree(`를
`export async function collectTree(`로 바꾼다. 본문은 건드리지 않는다.

- [ ] **Step 4: `copy-skills.ts`를 쓴다**

`packages/devkit-cli/src/ops/copy-skills.ts`:

```ts
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import type { Ctx, PlannedChange, Step } from '../types.js';
import { collectTree, templatesRoot } from './copy-overlay.js';

/**
 * 스킬 공용 풀의 디렉토리 이름(설계 2.2절).
 *
 * 유형별 디렉토리에 각각 복사하지 않는 이유는 monorepo 다 — nest·next 를
 * 모두 받으므로 같은 스킬이 git 에 최대 3벌 남고, 한 벌만 고치면 나머지가
 * 조용히 낡는다. 풀은 한 벌이므로 그 실패가 구조적으로 불가능하다.
 */
export const SKILL_POOL_DIR = '_skills';

/**
 * `templates/_skills/<name>/` 을 `.claude/skills/<name>/` 로 복사한다.
 *
 * `__NAME__` 치환을 하지 않는다(vars 가 빈 객체다). 스킬 본문은 프로젝트
 * 이름과 무관하고, 우연히 그 형태의 문자열이 있으면 치환이 원문을 훼손한다 —
 * 원본 그대로 복사가 이 자산의 계약이다(설계 2.1절).
 */
export function copySkills(names: readonly string[]): Step {
  const plan = async (): Promise<PlannedChange[]> => {
    const root = join(templatesRoot(), SKILL_POOL_DIR);

    const nested = await Promise.all(
      names.map(async (name): Promise<PlannedChange[]> => {
        const from = join(root, name);
        if (!existsSync(from)) {
          throw new Error(
            `스킬 '${name}' 가 풀(templates/${SKILL_POOL_DIR}/)에 없습니다. ` +
              `조용히 건너뛰면 그 스킬은 어떤 유형에도 배포되지 않으면서 생성이 성공합니다.`,
          );
        }
        return await collectTree(from, posix.join('.claude', 'skills', name), {});
      }),
    );

    return nested.flat();
  };

  return {
    kind: 'copySkills',
    label: `스킬 복사: ${names.length}개`,
    describe: () => ({ skills: [...names] }),
    plan,
    run: async (ctx: Ctx) => {
      const changes = await plan();
      for (const change of changes) {
        if (change.kind !== 'file') continue;
        const target = join(ctx.targetDir, ...change.relPath.split('/'));
        // 부분 실패 시 어디까지 썼는지가 순서로 드러나야 한다.
        // oxlint-disable-next-line no-await-in-loop -- 위 이유로 병렬화하지 않는다
        await mkdir(dirname(target), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
        await writeFile(target, change.content);
      }
      ctx.log(`  스킬 ${names.length}개 복사: .claude/skills/`);
    },
  };
}
```

- [ ] **Step 5: `StepKind`에 `'copySkills'`를 더한다**

`packages/devkit-cli/src/types.ts:17`:

```ts
export type StepKind = 'delegate' | 'removeFiles' | 'copyOverlay' | 'copySkills' | 'mergeJson' | 'registryDeps' | 'makeDirs' | 'compose';
```

- [ ] **Step 6: `ops/index.ts`에 재export 를 더한다**

`packages/devkit-cli/src/ops/index.ts`의 `copyOverlay` 줄 다음에:

```ts
export { copySkills, SKILL_POOL_DIR } from './copy-skills.js';
```

- [ ] **Step 7: 카테고리 패턴을 넓힌다**

`packages/devkit-cli/src/lib/categories.ts:45`를 다음으로 바꾼다.

```ts
  [/^\.claude\/(?:agents|commands|skills)\/.+/, 'claude'],
```

주석을 그 줄 위에 더한다.

```ts
  // 에이전트·커맨드·스킬은 한 카테고리다. 셋이 서로를 경로 문자열로
  // 가리키므로(리뷰어 → 스킬, 커맨드 → 스킬) 따로 갱신되면 결합이 끊긴다.
  // `skills` 가 빠져 있으면 두 겹으로 샌다: 오버레이 커버리지 테스트가
  // 실패하고, 그것을 우회하면 `update --only claude` 가 스킬을 영원히
  // 갱신하지 않으면서 성공을 보고한다.
```

- [ ] **Step 8: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test copy-skills`
Expected: PASS (6건)

- [ ] **Step 9: 전체 테스트와 린트를 돌린다**

Run: `pnpm --filter @cheolubak/devkit-cli test`
Expected: 전부 PASS. `categories.test.ts`가 새 패턴으로 깨지면 그 테스트가
`.claude/skills/` 경로를 `null`로 단언하고 있는 것이니, 단언을 `'claude'`로 고친다.

Run: `pnpm lint:es`
Expected: 에러 0

- [ ] **Step 10: 커밋**

```bash
git add packages/devkit-cli/src packages/devkit-cli/tests/copy-skills.test.ts
git commit -m "feat: copySkills 원자 연산과 skills 카테고리를 더한다

풀에 없는 이름을 만나면 던진다 — 조용히 건너뛰면 그 스킬은 어떤 유형에도
배포되지 않으면서 생성이 성공한다.

categories 의 .claude 패턴에 skills 를 더했다. 없으면 오버레이 커버리지가
실패하고, 그것을 우회하면 update --only claude 가 스킬을 영원히 갱신하지
않으면서 성공을 보고한다."
```

---

### Task 3: 원본 스킬 42개를 풀에 채운다

**Files:**
- Create: `packages/devkit-cli/templates/_skills/<42개>/` (`~/.claude/skills/`에서 복사)
- Modify: `packages/devkit-cli/tests/skill-assets.test.ts`

**Interfaces:**
- Consumes: Task 1의 `POOL_DIR` 상수
- Produces: 풀에 43개 디렉토리(원본 42 + `devkit-stack`). Task 4의 `SKILL_SETS`가 이 이름들을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/skill-assets.test.ts`에 다음 `describe`를 더한다(파일 상단 import에
`readdir`을 추가한다: `import { readdir, readFile } from 'node:fs/promises';`).

```ts
describe('스킬 풀 무결성', () => {
  it('풀에 43개 스킬이 있다', async () => {
    // 개수를 박는다. 원본이 하나 빠지면 유형별 목록(SKILL_SETS)과
    // 어긋나기 전에 여기서 먼저 드러난다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    expect(dirs).toHaveLength(43);
  });

  it('모든 스킬이 SKILL.md 를 갖고 frontmatter name 이 디렉토리명과 같다', async () => {
    // 이름이 어긋나면 Claude 가 스킬을 로드하지 못한다. 파일은 있으므로
    // 복사 자체는 성공하고, 소비자만 조용히 스킬 없이 일하게 된다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const broken: string[] = [];
    for (const name of dirs) {
      // oxlint-disable-next-line no-await-in-loop -- 실패 시 어느 스킬인지 순서대로 드러나는 편이 낫다
      const doc = await readFile(`${POOL_DIR}${name}/SKILL.md`, 'utf8').catch(() => null);
      if (doc === null) {
        broken.push(`${name} — SKILL.md 가 없다`);
        continue;
      }
      if (!new RegExp(`^---\\n(?:.*\\n)*?name: ${name}\\n`).test(doc)) {
        broken.push(`${name} — frontmatter 의 name 이 디렉토리명과 다르다`);
      }
    }

    expect(broken).toEqual([]);
  });

  it('풀의 모든 파일이 git 에 추적된다', async () => {
    // 디스크는 초록불인데 clone·CI·게시본에는 없는 상태를 막는다
    // (2026-08-06 devkit-implementer.md 전례).
    const { stdout } = await execFileAsync('git', ['ls-files', '-z', '--', 'templates/_skills'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
    });
    const tracked = stdout.split('\0').filter((p) => p.length > 0);
    expect(tracked.length).toBeGreaterThan(43);
  });
});
```

파일 상단에 다음 import를 추가한다.

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL — `expected [ 'devkit-stack' ] to have a length of 43 but got 1`

- [ ] **Step 3: 원본 42개를 복사한다**

저장소 루트에서 한 번에 복사한다. `cp -R`은 여러 소스를 마지막 인자 디렉토리
아래로 각각 복사한다.

```bash
cp -R ~/.claude/skills/eslint ~/.claude/skills/prettier ~/.claude/skills/oxlint-eslint-hybrid ~/.claude/skills/typescript-patterns ~/.claude/skills/tdd ~/.claude/skills/clean-code ~/.claude/skills/verify-implementation ~/.claude/skills/nestjs-auth ~/.claude/skills/nestjs-caching ~/.claude/skills/nestjs-config ~/.claude/skills/nestjs-crud ~/.claude/skills/nestjs-database ~/.claude/skills/nestjs-deployment ~/.claude/skills/nestjs-error-handling ~/.claude/skills/nestjs-queue ~/.claude/skills/nestjs-security ~/.claude/skills/nestjs-semantic-search ~/.claude/skills/nestjs-swagger ~/.claude/skills/nestjs-testing ~/.claude/skills/nestjs-validation ~/.claude/skills/clean-architecture ~/.claude/skills/backend-verify-loop packages/devkit-cli/templates/_skills/
```

```bash
cp -R ~/.claude/skills/fsd-architecture ~/.claude/skills/react-best-practices ~/.claude/skills/nextjs-a11y ~/.claude/skills/nextjs-auth ~/.claude/skills/nextjs-deployment ~/.claude/skills/nextjs-i18n ~/.claude/skills/nextjs-seo ~/.claude/skills/nextjs-shadcn ~/.claude/skills/nextjs-testing ~/.claude/skills/cache-components ~/.claude/skills/server-actions ~/.claude/skills/tanstack-query ~/.claude/skills/zustand-patterns ~/.claude/skills/react-hook-form ~/.claude/skills/tailwind-patterns ~/.claude/skills/framer-motion ~/.claude/skills/e2e-mcp ~/.claude/skills/frontend-verify-loop ~/.claude/skills/nestjs-monorepo ~/.claude/skills/nextjs-monorepo packages/devkit-cli/templates/_skills/
```

- [ ] **Step 4: 언더스코어 접두 파일이 없는지 확인한다**

`collectTree`의 `templateFileName`이 `_foo`를 `.foo`로 바꾼다. 스킬 안에 그런
파일이 있으면 이름이 조용히 바뀐다.

Run: `find packages/devkit-cli/templates/_skills -name "_*" -not -name "_skills"`
Expected: 출력 없음

출력이 있으면 그 파일만 `copySkills`가 원문 이름으로 쓰도록 예외를 넣어야 한다 —
계획에 없는 상황이므로 발견 시 멈추고 보고한다.

- [ ] **Step 5: `.gitignore` 이름을 가진 파일이 없는지 확인한다**

Run: `find packages/devkit-cli/templates/_skills -name ".gitignore" -o -name "_gitignore"`
Expected: 출력 없음

있으면 `collectTree`가 `kind: 'ignore'`로 내고 `copySkills.run`이 건너뛴다
(Task 2 Step 1의 두 번째 테스트가 이것을 잡는다).

- [ ] **Step 6: git에 추가하고 무시되지 않는지 확인한다**

```bash
git add packages/devkit-cli/templates/_skills
git status --short packages/devkit-cli/templates/_skills | head -5
```

Expected: `A  packages/devkit-cli/templates/_skills/...` 형태의 줄이 보인다.
아무것도 안 보이면 `.gitignore`가 삼킨 것이다 — `git check-ignore -v <경로>`로
어느 규칙인지 찾는다.

- [ ] **Step 7: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: PASS (8건)

- [ ] **Step 8: 커밋**

```bash
git add packages/devkit-cli/templates/_skills packages/devkit-cli/tests/skill-assets.test.ts
git commit -m "feat: 스킬 공용 풀에 원본 42개를 채운다

~/.claude/skills 에서 바이트 그대로 옮겼다. 각색하면 상류가 갱신될 때
각색본과 갈라지고, 무엇이 원본이고 무엇이 우리 판단인지 구별할 수 없게 된다.
스택과 어긋나는 지점은 devkit-stack 이 우선순위로 덮는다.

gstack 소유 스킬은 제외했다 — ~/.gstack/sessions·bin/gstack-config 같은
로컬 설치 상태에 의존하는 preamble 을 갖고 있어 소비자 환경에서 조용히
실패한다."
```

---

### Task 4: 유형별 목록과 레시피 배선

**Files:**
- Create: `packages/devkit-cli/src/lib/skill-sets.ts`
- Modify: `packages/devkit-cli/src/recipes/nest.ts`
- Modify: `packages/devkit-cli/src/recipes/next.ts`
- Modify: `packages/devkit-cli/src/recipes/monorepo.ts`
- Modify: `packages/devkit-cli/tests/skill-assets.test.ts`

**Interfaces:**
- Consumes: `copySkills` (Task 2), 풀의 43개 이름 (Task 1·3)
- Produces: `SKILL_SETS: Readonly<Record<ProjectType, readonly string[]>>` — `nest` 23개, `next` 26개, `monorepo` 43개

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/skill-assets.test.ts`에 더한다.

```ts
import { SKILL_SETS } from '../src/lib/skill-sets.js';

describe('유형별 스킬 선택', () => {
  it('유형별 개수가 설계와 일치한다', () => {
    expect(SKILL_SETS.nest).toHaveLength(23);
    expect(SKILL_SETS.next).toHaveLength(26);
    expect(SKILL_SETS.monorepo).toHaveLength(43);
  });

  it('선택된 이름이 전부 풀에 실재한다', async () => {
    // 오타 하나로 스킬이 조용히 빠지는 것을 막는다. copySkills 는 실행 시
    // 던지지만, 그때는 이미 사용자가 create 를 돌린 뒤다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const pool = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));

    const missing: string[] = [];
    for (const [type, names] of Object.entries(SKILL_SETS)) {
      for (const name of names) {
        if (!pool.has(name)) missing.push(`${type}/${name}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('풀의 모든 스킬이 최소 한 유형에 선택된다', async () => {
    // 아무 유형도 쓰지 않는 스킬은 게시 패키지 용량만 먹는다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const pool = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const selected = new Set(Object.values(SKILL_SETS).flat());

    expect(pool.filter((name) => !selected.has(name))).toEqual([]);
  });

  it('유형별 목록에 중복이 없다', () => {
    // 공통 목록과 유형별 목록이 겹치면 copySkills 가 같은 파일을 두 번 쓴다.
    for (const [type, names] of Object.entries(SKILL_SETS)) {
      expect(new Set(names).size, `${type} 에 중복이 있다`).toBe(names.length);
    }
  });

  it('devkit-stack 이 세 유형 모두에 있다', () => {
    // 스택 충돌 봉인은 유형과 무관하다.
    expect(SKILL_SETS.nest).toContain('devkit-stack');
    expect(SKILL_SETS.next).toContain('devkit-stack');
    expect(SKILL_SETS.monorepo).toContain('devkit-stack');
  });
});

describe('레시피의 copySkills 배선', () => {
  it('세 레시피가 각각 자기 유형의 목록으로 copySkills 를 부른다', () => {
    const cases = [
      ['nest', nestRecipe] as const,
      ['next', nextRecipe] as const,
      ['monorepo', monorepoRecipe] as const,
    ];

    for (const [type, recipe] of cases) {
      const step = recipe({ skipInstall: true }).find((s) => s.kind === 'copySkills');
      expect(step, `${type} 레시피에 copySkills 단계가 없다`).toBeDefined();
      expect(step?.describe()).toEqual({ skills: [...SKILL_SETS[type]] });
    }
  });
});
```

파일 상단에 레시피 import를 추가한다.

```ts
import { monorepoRecipe } from '../src/recipes/monorepo.js';
import { nestRecipe } from '../src/recipes/nest.js';
import { nextRecipe } from '../src/recipes/next.js';
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL — `Cannot find module '../src/lib/skill-sets.js'`

- [ ] **Step 3: `skill-sets.ts`를 쓴다**

`packages/devkit-cli/src/lib/skill-sets.ts`:

```ts
import type { ProjectType } from '../types.js';

/**
 * 유형별로 `.claude/skills/` 에 놓을 스킬 이름. 단일 출처다(설계 2.3절).
 *
 * 레시피가 이 목록을 이름으로 선언하므로 유형별 구성이 코드에 드러난다 —
 * `registryDeps(['eslint-config-nest', ...])` 와 같은 모양이다.
 */

/** 세 유형이 함께 받는 툴체인·규율 스킬. devkit-stack 만 devkit 저작이다. */
const COMMON = [
  'devkit-stack',
  'eslint',
  'prettier',
  'oxlint-eslint-hybrid',
  'typescript-patterns',
  'tdd',
  'clean-code',
  'verify-implementation',
] as const;

const NEST = [
  'nestjs-auth',
  'nestjs-caching',
  'nestjs-config',
  'nestjs-crud',
  'nestjs-database',
  'nestjs-deployment',
  'nestjs-error-handling',
  'nestjs-queue',
  'nestjs-security',
  'nestjs-semantic-search',
  'nestjs-swagger',
  'nestjs-testing',
  'nestjs-validation',
  'clean-architecture',
  'backend-verify-loop',
] as const;

const NEXT = [
  'fsd-architecture',
  'react-best-practices',
  'nextjs-a11y',
  'nextjs-auth',
  'nextjs-deployment',
  'nextjs-i18n',
  'nextjs-seo',
  'nextjs-shadcn',
  'nextjs-testing',
  'cache-components',
  'server-actions',
  'tanstack-query',
  'zustand-patterns',
  'react-hook-form',
  'tailwind-patterns',
  'framer-motion',
  'e2e-mcp',
  'frontend-verify-loop',
] as const;

/**
 * 모노레포 전용. 워크스페이스가 실제로 존재할 때만 의미가 있어서
 * 단일 앱 유형에는 넣지 않는다 — 없는 구조를 가정한 코드를 유도한다.
 */
const MONOREPO_ONLY = ['nestjs-monorepo', 'nextjs-monorepo'] as const;

export const SKILL_SETS: Readonly<Record<ProjectType, readonly string[]>> = {
  nest: [...COMMON, ...NEST],
  next: [...COMMON, ...NEXT],
  monorepo: [...COMMON, ...NEST, ...NEXT, ...MONOREPO_ONLY],
};
```

- [ ] **Step 4: `nest` 레시피를 배선한다**

`packages/devkit-cli/src/recipes/nest.ts`의 import 줄을 고친다.

```ts
import { copyOverlay, copySkills, delegate, registryDeps, makeDirs, mergeJson, removeFiles, scaffold } from '../ops/index.js';
import { SKILL_SETS } from '../lib/skill-sets.js';
```

`copyOverlay('_shared')` 다음 줄에 단계를 더한다.

```ts
    // 유형별 Claude 스킬. 리뷰어·구현자 에이전트와 커맨드가 판정 근거로
    // 가리키는 문서들이다(설계 3.4절). 풀에 없는 이름을 만나면 던진다.
    copySkills(SKILL_SETS.nest),
```

- [ ] **Step 5: `next` 레시피를 배선한다**

`packages/devkit-cli/src/recipes/next.ts`의 import를 같은 방식으로 고치고,
`copyOverlay('_shared')` 다음에 더한다.

```ts
    // 유형별 Claude 스킬. monorepo 는 이 레시피를 apps/web 에 합성한 뒤
    // apps/web/.claude 를 통째로 지우므로(monorepo.ts), 여기서 놓인 것은
    // 모노레포에서는 남지 않고 루트 쪽이 대신 놓인다.
    copySkills(SKILL_SETS.next),
```

- [ ] **Step 6: `monorepo` 레시피를 배선한다**

`packages/devkit-cli/src/recipes/monorepo.ts`의 import를 고치고,
`copyOverlay('_shared')` 다음에 더한다.

```ts
    // 스킬도 저장소 단위다. 루트에만 놓는다 — 아래 next 합성이 apps/web 에
    // 놓는 것은 removeFiles(apps/web/.claude) 가 함께 지운다.
    // monorepo 목록은 nest·next 를 모두 포함한다(워크스페이스에 양쪽이 산다).
    copySkills(SKILL_SETS.monorepo),
```

- [ ] **Step 7: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: PASS

- [ ] **Step 8: 레시피 스냅샷을 갱신한다**

단계가 하나씩 늘었으므로 `recipe-{nest,next,monorepo}.test.ts`의 스냅샷이 깨진다.

Run: `pnpm --filter @cheolubak/devkit-cli test recipe`
Expected: FAIL — 스냅샷 불일치 3건

**diff를 눈으로 읽는다.** `copySkills` 단계 하나가 추가된 것 외에 다른 변화가
있으면 멈추고 원인을 찾는다.

Run: `pnpm --filter @cheolubak/devkit-cli test recipe -u`
Expected: 스냅샷 갱신 후 PASS

- [ ] **Step 9: 전체 테스트와 린트를 돌린다**

Run: `pnpm --filter @cheolubak/devkit-cli test`
Expected: 전부 PASS

Run: `pnpm lint:es`
Expected: 에러 0

Run: `pnpm build`
Expected: 성공

- [ ] **Step 10: 커밋**

```bash
git add packages/devkit-cli/src packages/devkit-cli/tests packages/devkit-cli/tests/__snapshots__
git commit -m "feat: 유형별 스킬 목록을 단일 출처로 두고 레시피에 배선한다

monorepo 는 루트에 자기 copySkills 를 갖는다 — 합성된 next 가 apps/web 에
놓은 것은 removeFiles(apps/web/.claude) 가 prefix 매칭으로 함께 지우므로,
루트에 따로 놓지 않으면 모노레포에는 스킬이 하나도 남지 않는다.

풀의 모든 스킬이 최소 한 유형에 선택되는지도 단언한다. 아무도 안 쓰는
스킬은 게시 패키지 용량만 먹는다."
```

---

### Task 5: 유형별 슬래시 커맨드

**Files:**
- Create: `packages/devkit-cli/templates/_shared/.claude/commands/verify.md`
- Create: `packages/devkit-cli/templates/nest/.claude/commands/module.md`
- Create: `packages/devkit-cli/templates/nest/.claude/commands/api-test.md`
- Create: `packages/devkit-cli/templates/next/.claude/commands/slice.md`
- Create: `packages/devkit-cli/templates/next/.claude/commands/a11y.md`
- Create: `packages/devkit-cli/templates/monorepo/.claude/commands/{module,api-test,slice,a11y}.md`
- Modify: `packages/devkit-cli/tests/skill-assets.test.ts`

**Interfaces:**
- Consumes: `SKILL_SETS` (Task 4)
- Produces: 유형별 커맨드 파일. 본문이 `.claude/skills/<name>` 경로를 문자열로 가리킨다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/skill-assets.test.ts`에 더한다.

```ts
const COMMANDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  nest: ['module', 'api-test'],
  next: ['slice', 'a11y'],
  monorepo: ['module', 'api-test', 'slice', 'a11y'],
};

describe('유형별 커맨드', () => {
  it('_shared 가 verify 커맨드를 갖는다', async () => {
    const doc = await readFile(`${TEMPLATES_DIR}_shared/.claude/commands/verify.md`, 'utf8');
    expect(doc).toContain('---');
    expect(doc).toContain('pnpm lint');
  });

  it('유형별 커맨드 파일이 전부 존재한다', async () => {
    const missing: string[] = [];
    for (const [type, names] of Object.entries(COMMANDS_BY_TYPE)) {
      for (const name of names) {
        // oxlint-disable-next-line no-await-in-loop -- 실패 시 순서대로 드러나는 편이 낫다
        const doc = await readFile(
          `${TEMPLATES_DIR}${type}/.claude/commands/${name}.md`,
          'utf8',
        ).catch(() => null);
        if (doc === null) missing.push(`${type}/${name}.md`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('커맨드가 가리키는 스킬 경로가 그 유형에 실재한다', async () => {
    // 끊긴 경로를 가리키면 커맨드는 실패하지 않는다 — 근거 없이 기본
    // 판단으로 일한 뒤 성공을 보고한다. review-assets 가 REVIEWER_PATH 를
    // 고정하는 것과 같은 이유다.
    const dangling: string[] = [];
    for (const [type, names] of Object.entries(COMMANDS_BY_TYPE)) {
      const available = new Set(SKILL_SETS[type as keyof typeof SKILL_SETS]);
      for (const name of names) {
        // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
        const doc = await readFile(`${TEMPLATES_DIR}${type}/.claude/commands/${name}.md`, 'utf8');
        for (const [, skill] of doc.matchAll(/\.claude\/skills\/([a-z0-9-]+)/g)) {
          if (!available.has(skill)) dangling.push(`${type}/${name}.md → ${skill}`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('커맨드가 최소 하나의 스킬 경로를 가리킨다', async () => {
    // 위 단언은 경로가 0개면 공허하게 통과한다. 커맨드는 판정 기준을
    // 자기 안에 복제하지 않고 스킬을 가리키는 얇은 래퍼여야 한다.
    for (const [type, names] of Object.entries(COMMANDS_BY_TYPE)) {
      for (const name of names) {
        // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
        const doc = await readFile(`${TEMPLATES_DIR}${type}/.claude/commands/${name}.md`, 'utf8');
        expect([...doc.matchAll(/\.claude\/skills\/[a-z0-9-]+/g)].length,
          `${type}/${name}.md 가 스킬을 가리키지 않는다`).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL — `ENOENT ... _shared/.claude/commands/verify.md`

- [ ] **Step 3: `_shared/.claude/commands/verify.md`를 쓴다**

```markdown
---
description: 린트·타입·테스트 게이트를 순서대로 돌리고 실패 지점에서 멈춘다
---

다음을 **순서대로** 실행하고, 실패하면 그 지점에서 멈춰 원인을 보고한다.
뒤 단계로 넘어가지 않는다 — 앞 단계가 깨진 상태의 테스트 결과는 신뢰할 수 없다.

1. `pnpm lint`
2. `pnpm build`
3. `pnpm test`

각 단계의 **실제 출력**을 근거로 판정한다. 명령이 종료 코드 0을 냈다는 것만으로
통과를 보고하지 않는다 — 테스트가 0건 수집돼도 러너는 0을 낸다.

실패를 고칠 때는 `.claude/skills/verify-implementation`의 절차를 따른다.
의존성·설정을 건드려야 한다면 먼저 `.claude/skills/devkit-stack`을 읽는다.
그 영역은 이미 결정돼 있고, 되돌리면 다른 곳이 깨진다.
```

- [ ] **Step 4: `nest/.claude/commands/module.md`를 쓴다**

```markdown
---
description: src/modules/ 아래에 NestJS 모듈 한 벌을 배치한다
---

`$ARGUMENTS`가 가리키는 이름으로 `src/modules/<이름>/`에 모듈 한 벌을 만든다.

배치와 계층 방향은 `.claude/skills/clean-architecture`와
`.claude/agents/devkit-implementer.md`를 따른다. CRUD 형태와 페이지네이션·
에러 매핑 관용은 `.claude/skills/nestjs-crud`를 본다.

**입력 검증은 zod다.** `.claude/skills/nestjs-validation`은 `class-validator`
기반으로 쓰여 있으므로 검증 부분만 `.claude/skills/devkit-stack`의 zod 형태로
바꿔 읽는다. `class-validator`·`class-transformer`를 설치하지 않는다.

만든 클래스는 반드시 해당 `@Module`의 `providers`/`controllers`에 등록하고,
다른 모듈이 쓸 것이면 `exports`에도 넣는다. 등록을 빠뜨리면 린터가 잡지 못하고
런타임에야 드러난다.

새로 생긴 분기와 에러 경로에는 테스트를 함께 만든다 —
`.claude/skills/nestjs-testing`을 따른다.
```

- [ ] **Step 5: `nest/.claude/commands/api-test.md`를 쓴다**

```markdown
---
description: HTTP 경로의 e2e 스펙을 만든다
---

`$ARGUMENTS`가 가리키는 HTTP 경로(예: `POST /users`)의 e2e 스펙을 만든다.

스펙 작성 규약은 `.claude/skills/nestjs-testing`을 따른다. 파일은
`*.e2e-spec.ts`이며 `pnpm test:e2e`(`jest-e2e.config.js`)가 수집한다.

**검증 대상을 통째로 모킹하지 않는다.** 서비스 전체를 모킹한 e2e는 라우팅과
파이프가 깨져도 통과한다. 외부 경계(외부 HTTP·큐)만 대역으로 바꾼다.

성공 경로 하나로 끝내지 않는다. 최소한 다음을 덮는다.

- 검증 실패(zod 스키마가 거부하는 입력) → 기대하는 상태 코드
- 인증·권한이 걸린 경로라면 미인증 요청
- 존재하지 않는 리소스

테스트를 먼저 쓰고 실패를 확인한 뒤 구현으로 넘어가려면
`.claude/skills/tdd`의 절차를 따른다.
```

- [ ] **Step 6: `next/.claude/commands/slice.md`를 쓴다**

```markdown
---
description: FSD 슬라이스와 Public API 배럴을 만든다
---

`$ARGUMENTS`가 가리키는 `<레이어>/<이름>`으로 FSD 슬라이스를 만든다.

레이어·슬라이스·세그먼트 구조와 Public API 규약은
`.claude/skills/fsd-architecture`를 따른다. 다만 두 가지가 다르다 —
`.claude/skills/devkit-stack`을 함께 읽는다.

- FSD의 `pages` 레이어는 이 프로젝트에서 **`views`**다 (`src/views/`).
  Next.js App Router의 `app/`과 이름이 충돌하지 않게 하기 위한 것이다.
- 경계 위반은 `steiger`가 아니라 `eslint.config.mjs`의
  `@cheolubak/eslint-plugin-fsd`가 잡는다. `steiger`를 설치하지 않는다.

슬라이스를 만들면 **Public API 배럴(`index.ts`)을 함께 만든다.** 배럴 없이
내부 파일을 직접 import 하면 플러그인이 막고, 막히지 않더라도 그 슬라이스의
내부 구조를 바꿀 수 없게 된다.

만든 뒤 `pnpm lint`를 돌려 경계 규칙을 실제로 통과하는지 확인한다.
```

- [ ] **Step 7: `next/.claude/commands/a11y.md`를 쓴다**

```markdown
---
description: 변경된 컴포넌트의 접근성을 점검한다
---

`git diff`와 `git diff --cached` 범위의 컴포넌트를 대상으로 접근성을 점검한다.
변경이 없으면 그 사실만 알리고 끝낸다.

판정 기준은 `.claude/skills/nextjs-a11y`를 따른다.

**`eslint-plugin-jsx-a11y`가 이미 잡는 것은 다루지 않는다** — 이 프로젝트는
그 플러그인을 켜 두었고 `pnpm lint`가 CI에서 돈다. alt 속성 누락, 잘못된 ARIA
role, 클릭 핸들러만 있는 non-interactive 요소 같은 단일 요소 규칙이 여기 속한다.
그것을 발견했다면 CI가 이미 실패했다는 뜻이고, 보고할 곳은 이 커맨드가 아니다.

린터 밖에 있는 것을 본다.

- 키보드만으로 흐름을 끝까지 완주할 수 있는가. 포커스가 갇히거나 사라지는 지점
- 모달·드로어가 열릴 때 포커스가 안으로 들어가고 닫힐 때 원래 자리로 돌아오는가
- 동적으로 바뀌는 영역(로딩·에러·토스트)이 스크린 리더에 알려지는가
- 색만으로 상태를 구분하는 곳이 있는가
- 폼 에러가 해당 입력과 프로그램적으로 연결돼 있는가

구체적인 문제는 파일과 라인을 특정해 보고한다. 특정할 수 없으면 남기지 않는다.
```

- [ ] **Step 8: monorepo에 네 커맨드를 복사한다**

모노레포는 워크스페이스에 nest·next 양쪽이 산다.

```bash
cp packages/devkit-cli/templates/nest/.claude/commands/module.md packages/devkit-cli/templates/nest/.claude/commands/api-test.md packages/devkit-cli/templates/monorepo/.claude/commands/
```

```bash
cp packages/devkit-cli/templates/next/.claude/commands/slice.md packages/devkit-cli/templates/next/.claude/commands/a11y.md packages/devkit-cli/templates/monorepo/.claude/commands/
```

디렉토리가 없으면 먼저 만든다.

```bash
mkdir -p packages/devkit-cli/templates/monorepo/.claude/commands
```

- [ ] **Step 9: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: PASS

Run: `pnpm --filter @cheolubak/devkit-cli test overlay-coverage`
Expected: PASS — Task 2 Step 7의 카테고리 확장 덕에 새 커맨드가 `claude`에 걸린다

- [ ] **Step 10: git 추적을 확인하고 커밋**

```bash
git add packages/devkit-cli/templates packages/devkit-cli/tests/skill-assets.test.ts
git status --short packages/devkit-cli/templates | head -20
```

`monorepo/.claude/commands/` 네 파일이 `A`로 보이는지 확인한 뒤 커밋한다.

```bash
git commit -m "feat: 유형별 슬래시 커맨드를 더한다

커맨드는 판정 기준을 자기 안에 복제하지 않고 .claude/skills/<name> 경로를
가리키는 얇은 래퍼다. 복제하면 스킬이 갱신돼도 커맨드가 옛 기준을 계속 말한다.

/module 과 /slice 는 원본 스킬이 스택과 어긋나는 지점(class-validator,
steiger)을 본문에서 직접 뒤집는다 — 그 두 커맨드가 정확히 그 영역의
진입점이라 devkit-stack 을 읽기 전에 손이 먼저 움직일 수 있다."
```

---

### Task 6: 리뷰 배선

**Files:**
- Modify: `packages/devkit-cli/templates/nest/.claude/agents/devkit-reviewer.md`
- Modify: `packages/devkit-cli/templates/next/.claude/agents/devkit-reviewer.md`
- Modify: `packages/devkit-cli/templates/monorepo/.claude/agents/devkit-reviewer.md`
- Modify: `packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml`
- Modify: `packages/devkit-cli/tests/skill-assets.test.ts`

**Interfaces:**
- Consumes: `SKILL_SETS` (Task 4)
- Produces: 리뷰어 문서의 frontmatter `skills:` 목록과 본문 `.claude/skills/<name>` 경로

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/skill-assets.test.ts`에 더한다.

```ts
const ALL_TYPES = ['nest', 'next', 'monorepo'] as const;

describe.each(ALL_TYPES)('%s 리뷰어의 스킬 배선', (type) => {
  const reviewerPath = `${TEMPLATES_DIR}${type}/.claude/agents/devkit-reviewer.md`;

  it('frontmatter 에 skills 목록을 갖는다', async () => {
    const doc = await readFile(reviewerPath, 'utf8');
    const frontmatter = doc.slice(0, doc.indexOf('\n---', 4));
    expect(frontmatter).toContain('skills:');
  });

  it('frontmatter 의 name 이 devkit-reviewer 로 유지된다', async () => {
    // skills: 를 더하면서 name 줄이 밀리면 review-assets.test.ts 의
    // 정규식이 깨진다. 여기서 함께 고정한다.
    const doc = await readFile(reviewerPath, 'utf8');
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-reviewer\n/);
  });

  it('가리키는 스킬이 전부 그 유형에 실제로 배포된다', async () => {
    // 없는 스킬을 가리키면 리뷰어는 실패하지 않는다 — 근거 없이 기본
    // 판단으로 리뷰하고 승인까지 찍는다. 자동 머지가 그 승인을 게이트로 읽는다.
    const doc = await readFile(reviewerPath, 'utf8');
    const available = new Set(SKILL_SETS[type]);
    const referenced = [...doc.matchAll(/\.claude\/skills\/([a-z0-9-]+)/g)].map((m) => m[1]);

    expect(referenced.length, '스킬 경로를 하나도 가리키지 않는다').toBeGreaterThan(0);
    expect(referenced.filter((name) => !available.has(name))).toEqual([]);
  });

  it('판정 근거 경로가 "보는 것" 절 안에 있다', async () => {
    // 금지 목록에만 있으면 리뷰어는 근거 문서를 읽을 이유를 못 찾는다.
    const doc = await readFile(reviewerPath, 'utf8');
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('.claude/skills/');
  });

  it('devkit-stack 우선순위를 금지 목록에 명시한다', async () => {
    // 원본 스킬과 스택이 어긋나는 지점을 리뷰어가 지적 근거로 삼으면
    // 모든 PR 에서 잘못된 지적이 나온다.
    const doc = await readFile(reviewerPath, 'utf8');
    const forbidden = doc.slice(doc.indexOf('## 지적하지 않는 것'), doc.indexOf('## 보는 것'));
    expect(forbidden).toContain('devkit-stack');
  });
});

describe('CI 워크플로의 스킬 배선', () => {
  it('프롬프트가 .claude/skills/ 와 devkit-stack 우선순위를 안내한다', async () => {
    // 워크플로는 리뷰어를 서브에이전트로 호출하지 않고 문서로 읽게 한다.
    // frontmatter 의 skills: 는 그 경로에서 해석되지 않으므로, 프롬프트가
    // 직접 말하지 않으면 CI 리뷰에는 스킬이 붙지 않는다.
    const doc = await readFile(
      `${TEMPLATES_DIR}_shared/.github/workflows/claude-review.yml`,
      'utf8',
    );
    expect(doc).toContain('.claude/skills/');
    expect(doc).toContain('devkit-stack');
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL — frontmatter에 `skills:`가 없다

- [ ] **Step 3: `nest` 리뷰어의 frontmatter를 고친다**

`templates/nest/.claude/agents/devkit-reviewer.md`의 frontmatter를 다음으로 바꾼다.
`name`을 첫 줄로 유지한다 — `review-assets.test.ts`의 정규식이 그것을 본다.

```yaml
---
name: devkit-reviewer
description: devkit 표준(NestJS) 기준으로 변경분을 리뷰한다. 린터가 담당하는 항목은 다루지 않는다.
skills:
  - devkit-stack
  - nestjs-database
  - nestjs-error-handling
  - nestjs-testing
  - nestjs-security
  - clean-architecture
---
```

- [ ] **Step 4: `nest` 리뷰어의 금지 목록에 우선순위 한 줄을 더한다**

`- **`class-validator` 데코레이터 요구 — ...**` 항목 **다음 줄**에 더한다.

```markdown
- **스킬과 이 프로젝트가 어긋나는 지점 자체** — `.claude/skills/` 의 원본 스킬 중
  일부는 이 스택과 다른 선택지를 가르친다(`nestjs-validation`·`nestjs-crud` 의
  `class-validator`, `eslint` 의 `@eslint/js` 직접 설치). 그 경우
  `.claude/skills/devkit-stack` 이 이긴다. 코드가 `devkit-stack` 을 따르고 있으면
  다른 스킬과 다르다는 이유로 지적하지 않는다
```

- [ ] **Step 5: `nest` 리뷰어의 "보는 것"에 판정 근거 경로를 단다**

각 관점 절의 제목 아래에 근거 줄을 한 줄씩 더한다.

`### 1. 크로스 파일 아키텍처` 제목 다음 줄:

```markdown
> 판정 근거: `.claude/skills/clean-architecture` (계층·의존 방향), `.claude/skills/nestjs-database` (트랜잭션 경계)
```

`### 2. 조용한 실패` 제목 다음 줄:

```markdown
> 판정 근거: `.claude/skills/nestjs-error-handling` (예외 필터·에러 매핑의 기대 형태)
```

`### 3. 테스트 공백` 제목 다음 줄:

```markdown
> 판정 근거: `.claude/skills/nestjs-testing` (유닛·e2e 의 경계와 모킹 범위)
```

- [ ] **Step 6: `next` 리뷰어에 같은 것을 한다**

frontmatter:

```yaml
---
name: devkit-reviewer
description: devkit 표준(Next.js) 기준으로 변경분을 리뷰한다. 린터가 담당하는 항목은 다루지 않는다.
skills:
  - devkit-stack
  - fsd-architecture
  - react-best-practices
  - server-actions
  - nextjs-testing
  - cache-components
---
```

금지 목록에 더할 줄 (`eslint-plugin-fsd` 항목 다음):

```markdown
- **스킬과 이 프로젝트가 어긋나는 지점 자체** — `.claude/skills/` 의 원본 스킬 중
  일부는 이 스택과 다른 선택지를 가르친다(`fsd-architecture` 의 `steiger`,
  `eslint` 의 `@eslint/js` 직접 설치). 그 경우 `.claude/skills/devkit-stack` 이
  이긴다. 코드가 `devkit-stack` 을 따르고 있으면 다른 스킬과 다르다는 이유로
  지적하지 않는다
```

`## 보는 것` 아래 관점 절에 근거 줄을 단다. FSD 레이어 배치 관점에는:

```markdown
> 판정 근거: `.claude/skills/fsd-architecture` (레이어·슬라이스의 책임), `.claude/skills/devkit-stack` (`pages` 대신 `views`)
```

`'use client'`·Server Action 관점에는:

```markdown
> 판정 근거: `.claude/skills/react-best-practices` (경계 최소화), `.claude/skills/server-actions` (mutation 규약), `.claude/skills/cache-components` (캐시 무효화)
```

조용한 실패·테스트 공백 관점에는:

```markdown
> 판정 근거: `.claude/skills/nextjs-testing` (유닛·컴포넌트 테스트의 경계)
```

- [ ] **Step 7: `monorepo` 리뷰어에 같은 것을 한다**

frontmatter — 워크스페이스가 nest·next를 모두 담으므로 양쪽을 넣는다:

```yaml
---
name: devkit-reviewer
description: devkit 표준(Turborepo 모노레포) 기준으로 변경분을 리뷰한다. 린터가 담당하는 항목은 다루지 않는다.
skills:
  - devkit-stack
  - fsd-architecture
  - react-best-practices
  - nextjs-testing
  - nestjs-monorepo
  - nextjs-monorepo
  - clean-architecture
---
```

금지 목록과 "보는 것"의 근거 줄은 `next` 판과 같은 형태로 단다. 워크스페이스
경계 관점에는 추가로:

```markdown
> 판정 근거: `.claude/skills/nextjs-monorepo` (워크스페이스 의존 선언·catalog 규약)
```

- [ ] **Step 8: `claude-review.yml` 프롬프트에 스킬 문단을 더한다**

`리뷰 가이드라인:` 블록의 마지막 항목 다음에 더한다. **프롬프트 인젝션 방어
문단은 건드리지 않는다.**

```yaml
            - 판정 근거가 필요하면 .claude/skills/ 아래 문서를 직접 읽습니다.
              devkit-reviewer.md 의 각 관점에 근거 스킬 경로가 적혀 있습니다
            - .claude/skills/ 의 원본 스킬 중 일부는 이 프로젝트의 스택과 다른
              선택지를 가르칩니다(class-validator, @eslint/js 직접 설치, steiger).
              그 경우 .claude/skills/devkit-stack 이 이깁니다. 코드가 devkit-stack 을
              따르고 있으면 다른 스킬과 다르다는 이유로 변경을 요청하지 않습니다
```

- [ ] **Step 9: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: PASS

Run: `pnpm --filter @cheolubak/devkit-cli test review-assets`
Expected: PASS — frontmatter가 늘었지만 `name`이 첫 줄이라 정규식이 유지된다

- [ ] **Step 10: 전체 테스트를 돌리고 커밋**

Run: `pnpm --filter @cheolubak/devkit-cli test`
Expected: 전부 PASS

```bash
git add packages/devkit-cli/templates packages/devkit-cli/tests/skill-assets.test.ts
git commit -m "feat: 리뷰가 스킬을 판정 근거로 읽게 배선한다

frontmatter 의 skills: 만으로는 CI 에서 안 붙는다 — claude-review.yml 은
리뷰어를 서브에이전트로 호출하지 않고 문서로 읽게 하므로 frontmatter 가
해석되지 않는다. 그래서 본문의 각 관점에도 근거 스킬 경로를 문자열로 박고,
워크플로 프롬프트에도 같은 안내를 넣었다.

금지 목록에 devkit-stack 우선순위를 더했다. 없으면 원본 스킬과 스택이
어긋나는 지점(class-validator, steiger)을 리뷰어가 지적 근거로 삼아
모든 PR 에서 잘못된 변경 요청이 나온다."
```

---

### Task 7: 소비자 문서와 e2e 확인

**Files:**
- Modify: `packages/devkit-cli/templates/nest/CLAUDE.md`
- Modify: `packages/devkit-cli/templates/next/CLAUDE.md`
- Modify: `packages/devkit-cli/templates/monorepo/CLAUDE.md`
- Modify: `packages/devkit-cli/tests/e2e/create.e2e.test.ts`

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces: 없음 (최종 확인)

- [ ] **Step 1: 실패하는 e2e 단언을 쓴다**

`tests/e2e/create.e2e.test.ts`에서 기존 nest 생성 케이스를 찾아, 생성된
디렉토리를 검사하는 곳에 다음 단언을 더한다. (파일의 기존 관용을 따른다 —
`readFile`·`pathExists` 중 그 파일이 이미 쓰는 것을 쓴다.)

```ts
  it('nest 프로젝트에 유형별 스킬과 커맨드가 놓인다', async () => {
    // 스킬은 디스크 검사만으로는 부족하다 — create 가 실제로 복사했는지,
    // 그리고 유형에 맞는 것만 갔는지를 함께 본다.
    const stack = await readFile(join(projectDir, '.claude/skills/devkit-stack/SKILL.md'), 'utf8');
    expect(stack).toContain('name: devkit-stack');

    const validation = await readFile(
      join(projectDir, '.claude/skills/nestjs-validation/SKILL.md'),
      'utf8',
    );
    expect(validation).toContain('name: nestjs-validation');

    // next 전용 스킬은 오면 안 된다.
    await expect(
      readFile(join(projectDir, '.claude/skills/fsd-architecture/SKILL.md'), 'utf8'),
    ).rejects.toThrow();

    const command = await readFile(join(projectDir, '.claude/commands/module.md'), 'utf8');
    expect(command).toContain('.claude/skills/');
  });
```

- [ ] **Step 2: e2e 를 돌려 실패 혹은 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test:e2e`
Expected: 이 단언이 PASS — Task 4가 이미 배선을 끝냈으므로 여기서는 확인이다.
FAIL 이면 레시피 배선이 실제 생성 경로에서 동작하지 않는 것이니 멈추고 원인을 찾는다.

e2e 는 네트워크로 `nest new`·`create-next-app` 을 받으므로 몇 분 걸린다.

- [ ] **Step 3: `nest/CLAUDE.md`에 스킬·커맨드 절을 더한다**

`## 코드를 쓰기 전에` 절의 마지막 문단 다음에 더한다.

```markdown
## 스킬과 커맨드

`.claude/skills/` 에 이 스택에 해당하는 스킬이 놓여 있다. 판단이 필요할 때
그 문서를 읽는다.

**`.claude/skills/devkit-stack` 을 먼저 읽는다.** 나머지 스킬은 외부에서 그대로
가져온 것이라 이 프로젝트가 이미 정한 것과 어긋나는 지점이 있다 —
`nestjs-validation`·`nestjs-crud` 는 `class-validator` 를 가르치지만 이 프로젝트는
zod 를 쓴다. `devkit-stack` 이 그 우선순위를 정의한다.

슬래시 커맨드:

- `/review` — 변경분을 devkit 기준으로 리뷰
- `/verify` — 린트·빌드·테스트 게이트
- `/module <이름>` — 모듈 한 벌 배치
- `/api-test <경로>` — e2e 스펙 작성
```

- [ ] **Step 4: `next/CLAUDE.md`에 같은 절을 더한다**

```markdown
## 스킬과 커맨드

`.claude/skills/` 에 이 스택에 해당하는 스킬이 놓여 있다. 판단이 필요할 때
그 문서를 읽는다.

**`.claude/skills/devkit-stack` 을 먼저 읽는다.** 나머지 스킬은 외부에서 그대로
가져온 것이라 이 프로젝트가 이미 정한 것과 어긋나는 지점이 있다 —
`fsd-architecture` 는 `steiger` 를 전제로 쓰였지만 이 프로젝트는
`@cheolubak/eslint-plugin-fsd` 로 경계를 강제하고, FSD 의 `pages` 레이어를
`views` 로 쓴다. `devkit-stack` 이 그 우선순위를 정의한다.

슬래시 커맨드:

- `/review` — 변경분을 devkit 기준으로 리뷰
- `/verify` — 린트·빌드·테스트 게이트
- `/slice <레이어>/<이름>` — FSD 슬라이스와 Public API 배럴
- `/a11y` — 변경된 컴포넌트의 접근성 점검
```

- [ ] **Step 5: `monorepo/CLAUDE.md`에 같은 절을 더한다**

`next` 판과 같되 커맨드 목록에 `/module`·`/api-test`를 함께 넣고, 다음 문단을
더한다.

```markdown
스킬은 **저장소 루트에만** 놓인다. `apps/web/.claude/` 는 생성 과정에서 지워진다 —
리뷰와 스킬은 저장소 단위이고, 앱 하위에 같은 것이 또 있으면 어느 쪽이 진실인지
알 수 없게 된다.
```

- [ ] **Step 6: 전체 검증을 돌린다**

Run: `pnpm --filter @cheolubak/devkit-cli test`
Expected: 전부 PASS

Run: `pnpm lint:es`
Expected: 에러 0

Run: `pnpm format:check`
Expected: 통과. 실패하면 `pnpm format`을 돌린다 — 단, `templates/_skills/` 는
원본 그대로여야 하므로 Prettier가 그 안의 마크다운을 고쳤다면
`.prettierignore` 에 `packages/devkit-cli/templates/_skills/` 를 더하고 원본을
되돌린다.

Run: `pnpm build`
Expected: 성공

- [ ] **Step 7: 게시본에 스킬이 실리는지 확인한다**

`package.json` 의 `files` 는 `["dist", "templates"]` 이므로 포함돼야 한다.
실물로 확인한다.

```bash
cd packages/devkit-cli && pnpm pack --pack-destination /tmp/devkit-pack
```

```bash
tar -tzf /tmp/devkit-pack/*.tgz | grep "_skills/devkit-stack" | head -3
```

Expected: `package/templates/_skills/devkit-stack/SKILL.md` 가 보인다
보이지 않으면 `.npmignore` 나 `files` 를 확인한다. 저장소 루트로 돌아온다.

- [ ] **Step 8: 커밋**

```bash
git add packages/devkit-cli
git commit -m "docs: 소비자 CLAUDE.md 에 스킬·커맨드 안내를 더하고 e2e 로 배포를 확인한다

CLAUDE.md 가 devkit-stack 을 먼저 읽으라고 말하는 것이 핵심이다 — 나머지
스킬은 외부 원본이라 스택과 어긋나는 지점이 있고, 그 사실을 소비자가
스킬을 열기 전에 알아야 한다.

e2e 는 유형에 맞는 스킬만 갔는지도 단언한다. nest 프로젝트에
fsd-architecture 가 오면 없는 구조를 가정한 코드를 유도한다."
```

---

## Self-Review

**1. Spec coverage**

| 설계 절 | 담당 태스크 |
| --- | --- |
| 1.1 gstack 제외 | Task 3 Step 3 (목록 자체가 제외를 구현) |
| 1.2 스택 충돌 | Task 1 (devkit-stack), Task 5 Step 4·6, Task 6 Step 4·6 |
| 1.3 카테고리 미매칭 | Task 2 Step 7 |
| 1.4 git 추적 | Task 1 Step 5, Task 3 Step 1·6 |
| 2.1 원본 그대로 | Task 2 Step 1(마지막 테스트), Task 3 Step 3 |
| 2.2 공용 풀 | Task 2 Step 4 |
| 2.3 유형별 구성 | Task 4 Step 3 |
| 2.4 제외 12개 | Task 4 Step 3 (목록에 없음) + Step 1의 "최소 한 유형" 단언 |
| 2.5 커맨드 | Task 5 |
| 3.1 copySkills | Task 2 |
| 3.2 카테고리 | Task 2 Step 7 |
| 3.3 devkit-stack | Task 1 |
| 3.4 리뷰 배선 | Task 6 |
| 3.5 테스트 | Task 1·3·4·5·6의 Step 1들 |
| 3.6 레시피 | Task 4 Step 4~6 |

**2. Placeholder scan** — "TBD"·"적절히"·"비슷하게" 없음. 모든 코드 스텝에 실제 코드가 있다.

**3. Type consistency**

- `copySkills(names: readonly string[])` — Task 2에서 정의, Task 4에서 `SKILL_SETS[type]`(`readonly string[]`)을 넘긴다. 일치.
- `describe(): { skills: string[] }` — Task 2 Step 1의 `toEqual({ skills: ['devkit-stack'] })`와 Task 4 Step 1의 `toEqual({ skills: [...SKILL_SETS[type]] })`가 같은 형태.
- `SKILL_POOL_DIR = '_skills'` — Task 2에서 정의, 에러 메시지에서만 쓰인다.
- `POOL_DIR` 테스트 상수 — Task 1에서 정의, Task 3·4가 재사용.
- `TEMPLATES_DIR` — Task 1에서 정의(`templates/` 뒤에 슬래시 포함), Task 5·6이 `${TEMPLATES_DIR}nest/...` 형태로 이어 붙인다. 일치.
- `collectTree(from, relDir, vars)` — `copy-overlay.ts`의 실제 시그니처와 일치(3인자, `vars: Record<string, string>`).
- `ProjectType` — `src/types.ts:60`에서 export. `skill-sets.ts`가 `../types.js`에서 가져온다. `update/plan.ts`는 `lib/marker.js`판을 쓰지만 두 곳은 서로를 참조하지 않으므로 충돌 없음.

**발견해 고친 것:** Task 6 Step 3의 frontmatter에서 `name`을 첫 줄로 유지하도록
명시했다. `review-assets.test.ts:17`의 정규식은 `^---\n(?:.*\n)*?name: devkit-reviewer\n`
이라 `name`이 어디 있어도 통과하지만, `description`에 줄바꿈이 들어가면 깨진다 —
Step 9에서 그 테스트를 함께 돌려 확인한다.
