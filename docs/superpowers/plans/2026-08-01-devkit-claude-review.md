# Claude 리뷰 자산 및 `devkit update` 기반 모듈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생성된 프로젝트에 복사될 Claude 리뷰 자산(리뷰어 에이전트 3종·`/review` 커맨드·CI 워크플로)을 실물로 만들고, `devkit update`가 의존하는 순수 모듈 4종(카테고리·마커·변경 분류·git 상태)을 TDD로 구현한다.

**Architecture:** 새 패키지 `packages/devkit-cli`를 만들되 **CLI 실행 로직은 이 계획에 포함하지 않는다**(설계 0.1절 — 선행 조건인 템플릿 설계 구현이 아직 없다). 대신 (1) `templates/` 아래 오버레이 자산을 실물 파일로 두고, (2) `src/lib/` 아래 부수효과가 적은 모듈을 만들어 훗날 `update` 명령이 조립만 하면 되게 한다. 자산은 산문이라 단위 테스트 대상이 아니므로 **구조 단언**으로 지킨다.

**Tech Stack:** TypeScript 5.6 (ESM, `verbatimModuleSyntax`), vitest 2.1, tsup 8, Node `node:fs/promises` · `node:child_process`

## Global Constraints

- **패키지 매니저는 pnpm만 쓴다.** `npm`/`yarn` 명령을 쓰지 않는다
- **ESM 전용.** `package.json`에 `"type": "module"`. `verbatimModuleSyntax: true`이므로 타입만 쓰는 import는 반드시 `import type`으로 쓴다
- **`target: ES2022`.** `Array.prototype.toSorted` 같은 ES2023 API를 쓰지 않는다(`.oxlintrc.json`이 `unicorn/no-array-sort`를 끈 이유가 이것이다)
- **포맷은 `singleQuote: true`, `trailingComma: 'all'`, 2-space 들여쓰기** (`@devbak/prettier-config`와 동일)
- **테스트 파일 위치는 `packages/<pkg>/tests/**/*.test.ts`** — 루트 `vitest.config.ts`가 이 패턴만 수집한다. 다른 위치에 두면 실행되지 않는다
- **검증 게이트**: 각 태스크 종료 시 `pnpm test` 통과. 최종 태스크에서 `pnpm lint`(oxlint + eslint) · `pnpm build` · `tsc --noEmit`까지 통과
- **커밋 메시지는 imperative mood, 한글 허용.** 본문 끝에 다음 줄을 넣는다:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **브랜치는 `worktree-streamed-humming-papert`에서만 작업한다.** 사용자가 명시적으로 요청하기 전까지 `main`으로 체크아웃하거나 머지하지 않는다
- **선행 문서**: `docs/superpowers/specs/2026-08-01-devkit-claude-review-design.md`(이하 "설계"), `docs/superpowers/specs/2026-08-01-devkit-template-design.md`(이하 "템플릿 설계")

## 이 계획이 다루지 않는 것

설계 0.1절이 정한 순서상 아래는 **템플릿 설계 구현 계획의 몫**이다. 여기서 만들지 않는다.

- `src/bin.ts`, `src/run.ts` (CLI 진입점·레시피 실행기)
- 원자 연산 6종 (`delegate`, `removeFiles`, `copyOverlay`, `mergeJson`, `linkDeps`, `makeDirs`)
- `create`·`update` 서브커맨드의 실행 흐름
- `@devbak/{tsconfig, jest-config, vitest-config}` 패키지
- `templates/` 아래 **설정 오버레이**(`eslint.config.mjs`, `tsconfig.json`, `jest.config.ts` 등). 이 계획은 **리뷰 자산만** 실물로 만든다

이 때문에 Task 5의 오버레이 커버리지 테스트는 현재 존재하는 파일만 검사한다. 설정 오버레이가 추가되는 시점에 같은 테스트가 자동으로 그것들까지 검사한다 — 그것이 이 테스트의 값어치다.

## File Structure

```
packages/devkit-cli/
  package.json                 신규 — 빌드 있음(tsup), bin 필드는 아직 없음
  tsconfig.json                신규 — rootDir=src, outDir=dist
  tsup.config.ts               신규
  README.md                    신규
  src/
    index.ts                   lib 모듈 re-export (공개 표면)
    lib/
      categories.ts            카테고리 상수 · 경로 패턴 테이블 · --only 파싱
      marker.ts                package.json의 devkit 마커 읽기/쓰기
      classify.ts              신규/덮어쓰기/동일 분류 + 변경 목록 포맷
      git.ts                   워킹트리 상태 검사
  templates/
    _shared/
      .claude/commands/review.md
      .github/workflows/claude-review.yml
    nest/.claude/agents/devkit-reviewer.md
    next/.claude/agents/devkit-reviewer.md
    monorepo/.claude/agents/devkit-reviewer.md
  tests/
    tsconfig.json              신규 — 타입 인식 린트가 tests를 보게 함
    categories.test.ts
    marker.test.ts
    classify.test.ts
    git.test.ts
    review-assets.test.ts      리뷰어 문서 구조 단언
    overlay-coverage.test.ts   모든 오버레이 파일이 카테고리에 매칭되는지
eslint.config.mjs              수정 — ignores에 templates 추가
.oxlintrc.json                 수정 — ignorePatterns에 templates 추가
work-log.md                    수정 — 작업 기록
```

각 `lib/` 모듈은 하나의 책임만 갖고 서로를 import하지 않는다(`classify.ts`만 `categories.ts`의 타입을 쓴다). 이렇게 나눈 이유는 `update` 명령이 이들을 순서대로 호출하는 얇은 조립자가 되게 하기 위해서다 — 조립 로직에 판단이 섞이면 테스트가 어려워진다.

---

### Task 1: 패키지 스캐폴딩과 저장소 린트 제외

**Files:**
- Create: `packages/devkit-cli/package.json`
- Create: `packages/devkit-cli/tsconfig.json`
- Create: `packages/devkit-cli/tests/tsconfig.json`
- Create: `packages/devkit-cli/tsup.config.ts`
- Create: `packages/devkit-cli/src/index.ts`
- Modify: `eslint.config.mjs` (ignores 배열)
- Modify: `.oxlintrc.json` (ignorePatterns 배열)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `@devbak/devkit-cli` 워크스페이스 패키지. 이후 모든 태스크가 이 안에 파일을 추가한다

**왜 린트 제외가 이 태스크에 있는가:** `templates/` 아래에는 앞으로 소비자 프로젝트용 `.ts` 오버레이(`vitest.config.ts`, `jest.config.ts`)가 들어온다. 그 파일들은 이 저장소의 어떤 `tsconfig`에도 속하지 않으므로, 타입 인식 ESLint의 `projectService`가 그것들을 만나면 **경고가 아니라 예외를 던져 린트 전체가 죽는다.** `eslint-config-nest` 작업에서 실제로 겪었던 Critical 결함과 같은 부류다(work-log 2026-07-31). 지금은 `.md`/`.yml`뿐이라 증상이 없지만, 파일이 들어온 뒤에 대응하면 이미 늦다.

- [ ] **Step 1: 패키지 매니페스트 작성**

`packages/devkit-cli/package.json`:

```json
{
  "name": "@devbak/devkit-cli",
  "version": "0.1.0",
  "description": "devkit 표준 프로젝트 생성·갱신 CLI (리뷰 자산 템플릿 + update 기반 모듈)",
  "license": "MIT",
  "keywords": [
    "devkit",
    "scaffolding",
    "code-review",
    "claude"
  ],
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "templates"
  ],
  "engines": {
    "node": "^20.19.0 || ^22.13.0 || >=24"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup",
    "prepublishOnly": "pnpm build"
  },
  "devDependencies": {
    "@types/node": "^24.13.3"
  }
}
```

`bin` 필드는 넣지 않는다 — 실행 진입점이 아직 없다. 있지도 않은 파일을 가리키는 `bin`은 `pnpm install` 시 깨진 심볼릭 링크를 만든다.

`files`에 `templates`를 넣는 이유는 배포하지 않더라도 형식을 유지한다는 로드맵 2.1절 방침 때문이다. 템플릿은 런타임 자산이므로 `dist`만으로는 불충분하다.

- [ ] **Step 2: tsconfig 2종 작성**

`packages/devkit-cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`packages/devkit-cli/tests/tsconfig.json`:

```json
{
  // 빌드용 tsconfig(../tsconfig.json)는 rootDir=src라 tests를 포함하지 않는다.
  // 타입 인식 린팅이 테스트 파일도 볼 수 있도록 별도 프로젝트를 둔다.
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "declaration": false
  },
  "include": ["."]
}
```

- [ ] **Step 3: tsup 설정과 진입점 작성**

`packages/devkit-cli/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

`packages/devkit-cli/src/index.ts`:

```ts
/**
 * @devbak/devkit-cli 공개 표면.
 *
 * CLI 실행 로직(bin·레시피·원자 연산)은 아직 없다. 현재는 `devkit update`가
 * 조립할 순수 모듈만 노출한다 — 설계 0.1절의 구현 순서 참조.
 */
export {};
```

**아직 아무것도 export하지 않는다.** `src/lib/` 아래 모듈은 Task 2부터 생기므로, 지금 그것들을 re-export하면 존재하지 않는 파일을 가리켜 빌드가 실패한다. 빈 `export {}`는 이 파일을 ESM 모듈로 만들기 위한 것이며, Task 2가 실제 내용으로 교체한다.

- [ ] **Step 4: 저장소 린트에서 templates 제외**

`eslint.config.mjs`의 `ignores` 배열을 수정한다. 기존:

```js
    ignores: ['**/dist/**', 'coverage/**', '.superpowers/**', '**/tests/fixtures/**'],
```

변경 후:

```js
    // templates/는 소비자 프로젝트로 복사될 오버레이다. 이 저장소의 어떤
    // tsconfig에도 속하지 않으므로, 타입 인식 규칙이 걸리면 예외를 던져
    // 린트 전체가 죽는다(eslint-config-nest에서 겪은 것과 같은 부류).
    ignores: [
      '**/dist/**',
      'coverage/**',
      '.superpowers/**',
      '**/tests/fixtures/**',
      '**/templates/**',
    ],
```

`.oxlintrc.json`의 `ignorePatterns`도 같이 수정한다. 기존:

```json
  "ignorePatterns": ["**/dist/**", "**/node_modules/**", "coverage/**", "**/tests/fixtures/**"],
```

변경 후:

```json
  "ignorePatterns": [
    "**/dist/**",
    "**/node_modules/**",
    "coverage/**",
    "**/tests/fixtures/**",
    "**/templates/**"
  ],
```

**양쪽 모두 고쳐야 한다.** 한쪽만 고치면 `pnpm lint`가 여전히 실패한다(`lint` 스크립트는 `oxlint && eslint .`이다).

- [ ] **Step 5: 워크스페이스에 설치하고 빌드 확인**

Run:
```bash
pnpm install
pnpm --filter @devbak/devkit-cli build
```
Expected: `dist/index.js`와 `dist/index.d.ts`가 생성되고 종료 코드 0

- [ ] **Step 6: 저장소 린트가 여전히 통과하는지 확인**

Run: `pnpm lint`
Expected: 종료 코드 0

- [ ] **Step 7: 커밋**

```bash
git add packages/devkit-cli eslint.config.mjs .oxlintrc.json pnpm-lock.yaml
git commit -F - <<'EOF'
chore: devkit-cli 패키지 스캐폴딩

리뷰 자산 템플릿과 update 기반 모듈을 담을 패키지를 만든다.
CLI 실행 진입점은 아직 없으므로 bin 필드를 두지 않는다.

templates/를 ESLint ignores와 oxlint ignorePatterns 양쪽에서
제외한다. 소비자용 .ts 오버레이는 이 저장소의 어떤 tsconfig에도
속하지 않아, 타입 인식 규칙이 걸리면 예외를 던져 린트 전체를
죽인다. 증상이 나타난 뒤에 대응하면 늦다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: 카테고리 테이블 모듈

**Files:**
- Create: `packages/devkit-cli/src/lib/categories.ts`
- Create: `packages/devkit-cli/tests/categories.test.ts`
- Modify: `packages/devkit-cli/src/index.ts`

**Interfaces:**
- Consumes: Task 1의 패키지 스캐폴딩
- Produces:
  - `CATEGORIES: readonly Category[]` — `['claude','ci','lint','ts','test','deps','repo']`
  - `type Category = 'claude' | 'ci' | 'lint' | 'ts' | 'test' | 'deps' | 'repo'`
  - `categoryOf(relPath: string): Category | null`
  - `parseOnly(value: string): Category[]` — 알 수 없는 값이면 `UnknownCategoryError` throw
  - `class UnknownCategoryError extends Error`

설계 5.4절의 표가 그대로 이 모듈이다. `deps`는 파일이 아니라 `package.json` 패치와 `linkDeps`를 가리키므로 **경로 패턴을 갖지 않는다** — `categoryOf`가 `deps`를 반환하는 경로는 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/categories.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  categoryOf,
  parseOnly,
  UnknownCategoryError,
} from '../src/lib/categories.js';

describe('categoryOf', () => {
  it.each([
    ['.claude/agents/devkit-reviewer.md', 'claude'],
    ['.claude/commands/review.md', 'claude'],
    ['CLAUDE.md', 'claude'],
    ['.github/workflows/claude-review.yml', 'ci'],
    ['eslint.config.mjs', 'lint'],
    ['tsconfig.json', 'ts'],
    ['jest.config.ts', 'test'],
    ['test/jest-e2e.config.ts', 'test'],
    ['vitest.config.ts', 'test'],
    ['.gitignore', 'repo'],
  ])('%s → %s', (relPath, expected) => {
    expect(categoryOf(relPath)).toBe(expected);
  });

  it('devkit이 소유하지 않는 경로는 null을 반환한다', () => {
    expect(categoryOf('src/main.ts')).toBeNull();
    expect(categoryOf('README.md')).toBeNull();
  });

  it('.claude 하위라도 사용자 로컬 설정은 분류하지 않는다', () => {
    // settings.local.json은 사람이 만드는 파일이고 devkit 오버레이가 아니다.
    // 이것을 claude로 분류하면 update가 사용자 설정을 덮어쓴다.
    expect(categoryOf('.claude/settings.local.json')).toBeNull();
  });

  it('Windows 구분자를 정규화한다', () => {
    expect(categoryOf('.github\\workflows\\claude-review.yml')).toBe('ci');
  });

  it('deps 카테고리는 어떤 경로로도 매칭되지 않는다', () => {
    // deps는 package.json 패치와 linkDeps를 가리키는 논리 카테고리다.
    const everyPath = [
      '.claude/agents/devkit-reviewer.md',
      'CLAUDE.md',
      '.github/workflows/claude-review.yml',
      'eslint.config.mjs',
      'tsconfig.json',
      'jest.config.ts',
      '.gitignore',
      'package.json',
    ];
    for (const path of everyPath) {
      expect(categoryOf(path)).not.toBe('deps');
    }
  });
});

describe('parseOnly', () => {
  it('단일 카테고리를 파싱한다', () => {
    expect(parseOnly('claude')).toEqual(['claude']);
  });

  it('쉼표로 구분된 복수 카테고리를 파싱한다', () => {
    expect(parseOnly('claude,ci')).toEqual(['claude', 'ci']);
  });

  it('공백을 무시한다', () => {
    expect(parseOnly(' claude , ci ')).toEqual(['claude', 'ci']);
  });

  it('중복을 제거한다', () => {
    expect(parseOnly('claude,claude')).toEqual(['claude']);
  });

  it('알 수 없는 카테고리는 오타 하나라도 전체를 거부한다', () => {
    // 부분 실행하면 --only clade 가 아무것도 갱신하지 않고 성공을 보고한다.
    expect(() => parseOnly('claude,clade')).toThrow(UnknownCategoryError);
  });

  it('오류 메시지에 유효한 카테고리 목록을 담는다', () => {
    expect(() => parseOnly('clade')).toThrow(/claude/);
    expect(() => parseOnly('clade')).toThrow(/repo/);
  });

  it('빈 값을 거부한다', () => {
    expect(() => parseOnly('')).toThrow(UnknownCategoryError);
    expect(() => parseOnly('   ')).toThrow(UnknownCategoryError);
  });
});

describe('CATEGORIES', () => {
  it('설계 5.4절의 7종을 갖는다', () => {
    expect([...CATEGORIES]).toEqual(['claude', 'ci', 'lint', 'ts', 'test', 'deps', 'repo']);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/categories.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/categories.js"`

- [ ] **Step 3: 모듈 구현**

`packages/devkit-cli/src/lib/categories.ts`:

```ts
/**
 * `devkit update --only <categories>` 의 카테고리 정의.
 *
 * 설계 5.4절: 카테고리는 레시피 태그가 아니라 **경로 패턴**이다.
 * copyOverlay 한 번이 여러 카테고리의 파일을 함께 복사하므로,
 * 디렉토리 단위 태그로는 파일별 필터가 불가능하다.
 */

export const CATEGORIES = ['claude', 'ci', 'lint', 'ts', 'test', 'deps', 'repo'] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * 프로젝트 상대 경로 → 카테고리.
 *
 * `deps`는 여기에 없다 — package.json 패치와 linkDeps를 가리키는
 * 논리 카테고리라 대응하는 파일이 없다.
 */
const FILE_PATTERNS: ReadonlyArray<readonly [RegExp, Category]> = [
  [/^\.claude\/(?:agents|commands)\/.+/, 'claude'],
  [/^CLAUDE\.md$/, 'claude'],
  [/^\.github\/workflows\/.+/, 'ci'],
  [/^eslint\.config\.mjs$/, 'lint'],
  [/^tsconfig\.json$/, 'ts'],
  [/^(?:jest\.config\.ts|test\/jest-e2e\.config\.ts|vitest\.config\.ts)$/, 'test'],
  [/^\.gitignore$/, 'repo'],
];

export function categoryOf(relPath: string): Category | null {
  const normalized = relPath.replaceAll('\\', '/');
  for (const [pattern, category] of FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      return category;
    }
  }
  return null;
}

export class UnknownCategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownCategoryError';
  }
}

/**
 * `--only` 값을 파싱한다.
 *
 * 알 수 없는 값이 하나라도 있으면 전체를 거부한다. 부분 실행하면
 * `--only clade` 가 아무것도 갱신하지 않은 채 성공을 보고하게 되고,
 * 그것이 이 저장소가 반복해서 경계해 온 조용한 실패다(설계 6절).
 */
export function parseOnly(value: string): Category[] {
  const requested = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (requested.length === 0) {
    throw new UnknownCategoryError(
      `--only 에 카테고리를 지정하세요. 유효한 값: ${CATEGORIES.join(', ')}`,
    );
  }

  const known: readonly string[] = CATEGORIES;
  const unknown = requested.filter((part) => !known.includes(part));
  if (unknown.length > 0) {
    throw new UnknownCategoryError(
      `알 수 없는 카테고리: ${unknown.join(', ')}\n유효한 값: ${CATEGORIES.join(', ')}`,
    );
  }

  return [...new Set(requested)] as Category[];
}
```

- [ ] **Step 4: 진입점에서 re-export**

`packages/devkit-cli/src/index.ts` 전체를 다음으로 교체:

```ts
/**
 * @devbak/devkit-cli 공개 표면.
 *
 * CLI 실행 로직(bin·레시피·원자 연산)은 아직 없다. 현재는 `devkit update`가
 * 조립할 순수 모듈만 노출한다 — 설계 0.1절의 구현 순서 참조.
 */
export {
  CATEGORIES,
  categoryOf,
  parseOnly,
  UnknownCategoryError,
  type Category,
} from './lib/categories.js';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/categories.test.ts`
Expected: PASS (22 tests — `categoryOf` 14, `parseOnly` 7, `CATEGORIES` 1)

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src packages/devkit-cli/tests
git commit -F - <<'EOF'
feat: update 카테고리 경로 패턴 테이블 추가

--only 필터의 기반이 되는 카테고리 7종과 경로 패턴을 정의한다.

카테고리를 레시피 태그가 아니라 경로 패턴으로 둔 이유는
copyOverlay 한 번이 lint·ts·claude 파일을 함께 복사하기 때문이다.
태그 방식으로는 --only lint 가 tsconfig.json 까지 덮는다.

parseOnly 는 오타가 하나라도 있으면 전체를 거부한다. 부분 실행하면
--only clade 가 아무것도 갱신하지 않고 성공을 보고한다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: NestJS 리뷰어 에이전트와 구조 단언

**Files:**
- Create: `packages/devkit-cli/templates/nest/.claude/agents/devkit-reviewer.md`
- Create: `packages/devkit-cli/tests/review-assets.test.ts`

**Interfaces:**
- Consumes: Task 1의 패키지 구조
- Produces: `templates/nest/.claude/agents/devkit-reviewer.md`. Task 4가 같은 구조의 next·monorepo판을 추가하고, Task 5가 같은 테스트 파일을 확장한다

**이 문서가 하는 일:** 설계 3절의 관심사 경계를 실물로 만든다. **"지적하지 않는 것"이 먼저 오는 순서가 중요하다** — 리뷰어가 문서를 위에서부터 읽으므로, 금지 목록을 뒤에 두면 이미 지적을 만들어낸 뒤에 읽게 된다.

- [ ] **Step 1: 실패하는 구조 단언 테스트 작성**

`packages/devkit-cli/tests/review-assets.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

async function readReviewer(type: string): Promise<string> {
  return readFile(`${TEMPLATES_DIR}${type}/.claude/agents/devkit-reviewer.md`, 'utf8');
}

describe('nest 리뷰어 에이전트', () => {
  it('frontmatter의 name이 devkit-reviewer 다', async () => {
    const doc = await readReviewer('nest');
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-reviewer\n/);
  });

  it('"지적하지 않는 것" 절을 갖는다', async () => {
    const doc = await readReviewer('nest');
    expect(doc).toContain('## 지적하지 않는 것');
  });

  it('금지 목록이 보는 것보다 먼저 온다', async () => {
    // 리뷰어는 문서를 위에서부터 읽는다. 금지 목록이 뒤에 있으면
    // 이미 지적을 만든 뒤에 읽게 된다.
    const doc = await readReviewer('nest');
    expect(doc.indexOf('## 지적하지 않는 것')).toBeLessThan(doc.indexOf('## 보는 것'));
  });

  it('린터가 담당하는 항목을 금지 목록에 명시한다', async () => {
    const doc = await readReviewer('nest');
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('prettier');
    expect(forbidden).toContain('import 순서');
    expect(forbidden).toContain('tsc');
  });

  it('class-validator 지적을 금지한다', async () => {
    // 세 소비자 프로젝트는 zod를 쓴다(로드맵 1.3절). 기존 코드-리뷰
    // 스킬을 계승했다면 모든 PR에서 잘못된 지적이 나왔을 것이다.
    const doc = await readReviewer('nest');
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('class-validator');
  });

  it('설계 3.2절의 4개 관점을 모두 갖는다', async () => {
    // 반드시 `## 보는 것` 이후로 스코프한다. 문서 전체를 검사하면
    // 금지 목록에 우연히 같은 단어가 있을 때 관점 절을 지워도 통과하는
    // 항상-통과 단언이 된다.
    const doc = await readReviewer('nest');
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('크로스 파일 아키텍처');
    expect(observed).toContain('조용한 실패');
    expect(observed).toContain('테스트 공백');
    expect(observed).toContain('의도와 구현의 불일치');
  });

  it('설계 3.4절의 NestJS 고유 관점을 갖는다', async () => {
    // 4관점 골격만으로는 next판과 구별되지 않는다. 설계 3.4절이
    // nest 리뷰어에 배정한 고유 관점이 실제 문서에 있어야 한다.
    const doc = await readReviewer('nest');
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('zod');
    expect(observed).toContain('트랜잭션');
    expect(observed).toContain('e2e');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/review-assets.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... nest/.claude/agents/devkit-reviewer.md`

- [ ] **Step 3: 리뷰어 문서 작성**

`packages/devkit-cli/templates/nest/.claude/agents/devkit-reviewer.md`:

```markdown
---
name: devkit-reviewer
description: devkit 표준(NestJS) 기준으로 변경분을 리뷰한다. 린터가 담당하는 항목은 다루지 않는다.
---

당신은 이 프로젝트의 코드 리뷰어다. 아래 경계를 지킨다.

## 지적하지 않는 것

이 프로젝트는 네 겹의 기계 검증을 CI에서 이미 통과시킨다.

| 검증 | 담당 |
| --- | --- |
| `prettier` | 포맷 |
| `oxlint` | 비타입 correctness |
| `@devbak/eslint-config-nest` | 타입 인식 규칙 |
| `tsc --noEmit` | 타입 |

따라서 다음은 **코멘트하지 않는다.**

- 코드 포맷, 따옴표, 세미콜론, 줄바꿈, 들여쓰기
- import 순서·그룹핑, 멤버·프로퍼티·데코레이터의 알파벳순 정렬
- `any` 사용, 미사용 변수, 안 기다린 Promise(`no-floating-promises` 계열)
- 타입 오류, 불필요한 타입 단언
- **`class-validator` 데코레이터 요구 — 이 스택은 zod를 쓴다. 이 지적은 그 자체가 오류다**

위 항목을 발견하더라도 코멘트하지 않는다. 발견했다는 것은 CI가 이미 실패했다는 뜻이고, 그것은 리뷰가 아니라 CI가 보고할 일이다.

## 보는 것

### 1. 크로스 파일 아키텍처

린터는 단일 파일만 본다. 파일을 가로지르는 것은 전부 리뷰의 몫이다.

- 새 클래스가 `@Module`의 `providers`/`controllers`에 등록됐는가. 다른 모듈이 쓰는데 `exports`에 없지 않은가
- 의존 방향이 Controller → Service → 데이터 접근으로 흐르는가. Controller가 `PrismaService`/Repository를 직접 주입받지 않는가
- 모듈 간 순환 의존이 생기지 않았는가. `forwardRef`가 새로 등장했다면 왜 필요한지 묻는다
- 한 모듈의 내부 구현이 다른 모듈로 새어나가지 않는가
- **zod 스키마와 실제 사용처가 정합하는가.** 스키마를 고쳤는데 그것을 소비하는 컨트롤러·서비스의 타입이나 분기가 따라오지 않았는가. 스키마가 선언된 파일과 쓰이는 파일이 다르므로 린터는 이 어긋남을 보지 못한다
- **트랜잭션 경계가 맞는가.** 한 단위로 성공하거나 실패해야 할 쓰기들이 트랜잭션 밖으로 흩어지지 않았는가. 트랜잭션 안에서 외부 호출(HTTP·큐 발행)을 하지 않는가

### 2. 조용한 실패

코드가 문법적·타입적으로 완전히 옳으면서 문제를 감추는 경우다. 규칙으로 판정할 표면이 없다.

- `catch`가 에러를 삼키고 계속 진행하는가. 로그만 남기고 정상 흐름으로 돌아가는가
- 폴백 값(`?? []`, `|| {}`)이 "데이터 없음"과 "가져오기 실패"를 구분 불가능하게 만드는가
- `try` 블록이 너무 넓어 의도하지 않은 에러까지 잡는가
- 실패가 사용자에게 성공으로 보고되는 경로가 있는가

### 3. 테스트 공백

- 새로 생긴 분기·에러 경로에 대응하는 테스트가 있는가
- 버그 수정이라면 그 버그를 재현하는 테스트가 함께 왔는가
- 테스트가 검증 대상을 통째로 모킹해 항상 통과하지 않는가
- **HTTP 경로가 새로 생기거나 바뀌었는데 e2e 스펙(`*.e2e-spec.ts`)이 따라오지 않았는가**

### 4. 의도와 구현의 불일치

- PR 설명이 말하는 것과 diff가 하는 일이 같은가. 설명에 없는 변경이 섞여 있는가
- 함수·변수 이름이 실제 동작과 맞는가
- 주석이 코드보다 오래됐는가

## 출력

- 구체적인 문제는 **인라인 코멘트**로 남긴다. 파일과 라인을 특정할 수 없는 지적은 남기지 않는다
- 심각도를 붙인다: **심각**(머지 전 수정 필요) / **권장**(고치면 좋음) / **관찰**(정보 공유)
- 확신이 없으면 단정하지 말고 질문한다
- 심각한 문제가 없으면 승인한다
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/review-assets.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add packages/devkit-cli/templates packages/devkit-cli/tests/review-assets.test.ts
git commit -F - <<'EOF'
feat: NestJS 리뷰어 에이전트 추가

린터가 원리적으로 못 잡는 4개 관점만 보는 리뷰어를 만든다.
크로스 파일 아키텍처, 조용한 실패, 테스트 공백, 의도와 구현의
불일치가 그것이다.

"지적하지 않는 것"을 문서 앞에 둔다. 리뷰어는 위에서부터 읽으므로
금지 목록이 뒤에 있으면 이미 지적을 만든 뒤에 읽게 된다.
구조 단언 테스트가 이 순서를 지킨다.

class-validator 지적을 명시적으로 금지한다. 세 소비자 프로젝트는
zod를 쓰며, 기존 코드-리뷰 스킬을 계승했다면 모든 PR에서 잘못된
지적이 나왔을 것이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Next.js·모노레포 리뷰어 에이전트

**Files:**
- Create: `packages/devkit-cli/templates/next/.claude/agents/devkit-reviewer.md`
- Create: `packages/devkit-cli/templates/monorepo/.claude/agents/devkit-reviewer.md`
- Modify: `packages/devkit-cli/tests/review-assets.test.ts`

**Interfaces:**
- Consumes: Task 3의 `readReviewer` 헬퍼와 nest판 문서 구조
- Produces: 유형 3종의 리뷰어 문서 전부

**중복에 대해:** 세 문서는 "지적하지 않는 것" 골격과 관점 2~4를 거의 그대로 복제한다. 설계 9절이 정한 대로 **지금 추출하지 않는다** — 성급한 추상화 회피(로드맵 5.5절의 태도)이고, 유형별로 문장을 손볼 여지를 남긴다.

- [ ] **Step 1: 실패하는 테스트로 확장**

`packages/devkit-cli/tests/review-assets.test.ts`의 맨 아래에 다음을 추가한다:

```ts
const ALL_TYPES = ['nest', 'next', 'monorepo'] as const;

describe.each(ALL_TYPES)('%s 리뷰어 공통 구조', (type) => {
  it('frontmatter의 name이 devkit-reviewer 다', async () => {
    const doc = await readReviewer(type);
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-reviewer\n/);
  });

  it('금지 목록이 보는 것보다 먼저 온다', async () => {
    const doc = await readReviewer(type);
    expect(doc.indexOf('## 지적하지 않는 것')).toBeLessThan(doc.indexOf('## 보는 것'));
  });

  it('린터가 담당하는 항목을 금지 목록에 명시한다', async () => {
    const doc = await readReviewer(type);
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('prettier');
    expect(forbidden).toContain('import 순서');
    expect(forbidden).toContain('tsc');
  });

  it('설계 3.2절의 4개 관점을 모두 갖는다', async () => {
    const doc = await readReviewer(type);
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('조용한 실패');
    expect(observed).toContain('테스트 공백');
    expect(observed).toContain('의도와 구현의 불일치');
  });
});

describe.each(['next', 'monorepo'] as const)('%s 리뷰어 프론트엔드 관점', (type) => {
  it('FSD 레이어 배치를 관점으로 갖는다', async () => {
    // 스코프가 필수다. 금지 목록에도 'FSD'가 나오므로(eslint-plugin-fsd가
    // 방향을 검사한다는 명시), 문서 전체를 검사하면 관점 절을 통째로
    // 지워도 통과한다 — 이름과 달리 아무것도 지키지 못하는 단언이 된다.
    const doc = await readReviewer(type);
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('FSD');
  });

  it('FSD import 방향 위반은 린터 담당임을 명시한다', async () => {
    // eslint-plugin-fsd 가 방향을 검사한다. 리뷰는 "이 코드가 애초에
    // 이 레이어에 있어야 하는가"를 본다.
    const doc = await readReviewer(type);
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('eslint-plugin-fsd');
  });

  it('설계 3.4절의 프론트엔드 고유 관점을 갖는다', async () => {
    const doc = await readReviewer(type);
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain("'use client'");
    expect(observed).toContain('Server Action');
    expect(observed).toContain('views');
  });
});

describe('monorepo 리뷰어 워크스페이스 관점', () => {
  it('워크스페이스 경계를 관점으로 갖는다', async () => {
    // 의존 선언 누락·앱 간 직접 import·catalog 이탈은 모노레포에서만
    // 생기는 문제이며 전부 린터 밖이다.
    const doc = await readReviewer('monorepo');
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('워크스페이스');
    expect(observed).toContain('catalog:');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/review-assets.test.ts`
Expected: FAIL — next·monorepo 파일이 없어 `ENOENT`

- [ ] **Step 3: Next.js 리뷰어 작성**

`packages/devkit-cli/templates/next/.claude/agents/devkit-reviewer.md`:

```markdown
---
name: devkit-reviewer
description: devkit 표준(Next.js + FSD) 기준으로 변경분을 리뷰한다. 린터가 담당하는 항목은 다루지 않는다.
---

당신은 이 프로젝트의 코드 리뷰어다. 아래 경계를 지킨다.

## 지적하지 않는 것

이 프로젝트는 네 겹의 기계 검증을 CI에서 이미 통과시킨다.

| 검증 | 담당 |
| --- | --- |
| `prettier` | 포맷 |
| `oxlint` | 비타입 correctness |
| `@devbak/eslint-plugin-fsd` | FSD 레이어 간 import 방향 |
| `tsc --noEmit` | 타입 |

따라서 다음은 **코멘트하지 않는다.**

- 코드 포맷, 따옴표, 세미콜론, 줄바꿈, 들여쓰기
- import 순서·그룹핑, 멤버·프로퍼티의 알파벳순 정렬
- **FSD 레이어 간 import 방향 위반 — `eslint-plugin-fsd`가 검사한다**
- `any` 사용, 미사용 변수, 안 기다린 Promise
- 타입 오류, 불필요한 타입 단언

위 항목을 발견하더라도 코멘트하지 않는다. 발견했다는 것은 CI가 이미 실패했다는 뜻이고, 그것은 리뷰가 아니라 CI가 보고할 일이다.

## 보는 것

### 1. FSD 레이어 배치의 의미 (크로스 파일 아키텍처)

`eslint-plugin-fsd`는 레이어 **간 import 방향**만 검사한다. **이 코드가 애초에 이 레이어에 있어야 하는지**는 판정하지 못한다. 그것이 리뷰의 몫이다.

- 새 코드가 놓인 레이어가 그 코드의 성격과 맞는가. 재사용되지 않는 것이 `shared/`에 있지 않은가
- 비즈니스 규칙이 `widgets/`나 `views/`에 흘러들지 않았는가
- `entities/`가 특정 화면에만 쓰이는 형태로 좁아지지 않았는가
- 슬라이스의 public API(`index.ts`)를 우회해 내부 파일을 직접 import하지 않는가
- 라우팅은 `src/app/`, FSD의 페이지 레이어는 `src/views/`다. 둘이 섞이지 않았는가

### 2. Server/Client 경계

- `'use client'`가 꼭 필요한 곳에만 있는가. 트리 위쪽에 붙어 하위 전체를 클라이언트로 끌어내리지 않는가
- 서버에서만 있어야 할 비밀(토큰·키)이 클라이언트 컴포넌트의 props로 넘어가지 않는가
- Server Action이 입력을 검증하는가. 클라이언트에서 온 값을 그대로 신뢰하지 않는가

### 3. 조용한 실패

코드가 문법적·타입적으로 완전히 옳으면서 문제를 감추는 경우다.

- `catch`가 에러를 삼키고 계속 진행하는가. 로그만 남기고 정상 흐름으로 돌아가는가
- 폴백 값(`?? []`, `|| {}`)이 "데이터 없음"과 "가져오기 실패"를 구분 불가능하게 만드는가
- 로딩·에러 상태가 성공 UI로 뭉개지지 않는가

### 4. 테스트 공백

- 새로 생긴 분기·에러 경로에 대응하는 테스트가 있는가
- 버그 수정이라면 그 버그를 재현하는 테스트가 함께 왔는가
- 테스트가 검증 대상을 통째로 모킹해 항상 통과하지 않는가

### 5. 의도와 구현의 불일치

- PR 설명이 말하는 것과 diff가 하는 일이 같은가. 설명에 없는 변경이 섞여 있는가
- 컴포넌트·훅 이름이 실제 동작과 맞는가
- 주석이 코드보다 오래됐는가

## 출력

- 구체적인 문제는 **인라인 코멘트**로 남긴다. 파일과 라인을 특정할 수 없는 지적은 남기지 않는다
- 심각도를 붙인다: **심각**(머지 전 수정 필요) / **권장**(고치면 좋음) / **관찰**(정보 공유)
- 확신이 없으면 단정하지 말고 질문한다
- 심각한 문제가 없으면 승인한다
```

- [ ] **Step 4: 모노레포 리뷰어 작성**

`packages/devkit-cli/templates/monorepo/.claude/agents/devkit-reviewer.md`:

```markdown
---
name: devkit-reviewer
description: devkit 표준(Turborepo 모노레포 + Next.js + FSD) 기준으로 변경분을 리뷰한다. 린터가 담당하는 항목은 다루지 않는다.
---

당신은 이 모노레포의 코드 리뷰어다. 아래 경계를 지킨다.

## 지적하지 않는 것

이 저장소는 네 겹의 기계 검증을 CI에서 이미 통과시킨다.

| 검증 | 담당 |
| --- | --- |
| `prettier` | 포맷 |
| `oxlint` | 비타입 correctness |
| `@devbak/eslint-plugin-fsd` | FSD 레이어 간 import 방향 |
| `tsc --noEmit` | 타입 |

따라서 다음은 **코멘트하지 않는다.**

- 코드 포맷, 따옴표, 세미콜론, 줄바꿈, 들여쓰기
- import 순서·그룹핑, 멤버·프로퍼티의 알파벳순 정렬
- **FSD 레이어 간 import 방향 위반 — `eslint-plugin-fsd`가 검사한다**
- `any` 사용, 미사용 변수, 안 기다린 Promise
- 타입 오류, 불필요한 타입 단언

위 항목을 발견하더라도 코멘트하지 않는다. 발견했다는 것은 CI가 이미 실패했다는 뜻이고, 그것은 리뷰가 아니라 CI가 보고할 일이다.

## 보는 것

### 1. 워크스페이스 경계

모노레포에서만 생기는 문제이며 린터가 보지 못한다.

- 새 의존이 그것을 쓰는 워크스페이스의 `package.json`에 선언됐는가. 다른 패키지의 `node_modules`에 우연히 얹혀 동작하지 않는가
- `apps/`가 `packages/`를 쓰는 방향인가. 반대 방향 의존이 생기지 않았는가
- 앱 간 직접 import가 생기지 않았는가. 공유가 필요하면 `packages/`로 올린다
- 버전이 `catalog:`로 모이는 대상인데 개별 선언으로 갈라지지 않았는가
- `turbo.json`의 태스크 의존이 실제 빌드 순서와 맞는가

### 2. FSD 레이어 배치의 의미

`eslint-plugin-fsd`는 레이어 **간 import 방향**만 검사한다. **이 코드가 애초에 이 레이어에 있어야 하는지**는 판정하지 못한다.

- 새 코드가 놓인 레이어가 그 코드의 성격과 맞는가. 재사용되지 않는 것이 `shared/`에 있지 않은가
- 비즈니스 규칙이 `widgets/`나 `views/`에 흘러들지 않았는가
- 앱 안 `shared/`에 있어야 할 것과 워크스페이스 `packages/`로 올려야 할 것이 뒤바뀌지 않았는가
- 라우팅은 `src/app/`, FSD의 페이지 레이어는 `src/views/`다. 둘이 섞이지 않았는가

### 3. Server/Client 경계

- `'use client'`가 꼭 필요한 곳에만 있는가. 트리 위쪽에 붙어 하위 전체를 클라이언트로 끌어내리지 않는가
- 서버에서만 있어야 할 비밀(토큰·키)이 클라이언트 컴포넌트의 props로 넘어가지 않는가
- Server Action이 입력을 검증하는가

### 4. 조용한 실패

- `catch`가 에러를 삼키고 계속 진행하는가. 로그만 남기고 정상 흐름으로 돌아가는가
- 폴백 값(`?? []`, `|| {}`)이 "데이터 없음"과 "가져오기 실패"를 구분 불가능하게 만드는가
- 로딩·에러 상태가 성공 UI로 뭉개지지 않는가

### 5. 테스트 공백

- 새로 생긴 분기·에러 경로에 대응하는 테스트가 있는가
- 버그 수정이라면 그 버그를 재현하는 테스트가 함께 왔는가
- 공유 패키지를 고쳤다면 그것을 쓰는 앱 쪽 테스트가 여전히 유효한가

### 6. 의도와 구현의 불일치

- PR 설명이 말하는 것과 diff가 하는 일이 같은가. 설명에 없는 변경이 섞여 있는가
- 컴포넌트·훅·패키지 이름이 실제 동작과 맞는가
- 주석이 코드보다 오래됐는가

## 출력

- 구체적인 문제는 **인라인 코멘트**로 남긴다. 파일과 라인을 특정할 수 없는 지적은 남기지 않는다
- 심각도를 붙인다: **심각**(머지 전 수정 필요) / **권장**(고치면 좋음) / **관찰**(정보 공유)
- 확신이 없으면 단정하지 말고 질문한다
- 심각한 문제가 없으면 승인한다
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/review-assets.test.ts`
Expected: PASS (26 tests — nest 전용 7, 공통 구조 3유형×4=12, 프론트엔드 2유형×3=6, 모노레포 워크스페이스 1)

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/templates packages/devkit-cli/tests/review-assets.test.ts
git commit -F - <<'EOF'
feat: Next.js·모노레포 리뷰어 에이전트 추가

FSD import 방향은 eslint-plugin-fsd가 검사하므로 금지 목록에 넣고,
리뷰는 "이 코드가 애초에 이 레이어에 있어야 하는가"를 본다.
린터가 판정할 수 없는 바로 그 지점이다.

모노레포판은 워크스페이스 경계 관점을 추가로 갖는다. 의존 선언
누락, 앱 간 직접 import, catalog 이탈은 전부 린터 밖이다.

세 문서의 공통 골격은 중복이지만 지금 추출하지 않는다.
설계 9절과 로드맵 5.5절의 성급한 추상화 회피를 따른다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: `/review` 커맨드, CI 워크플로, 오버레이 커버리지 방어

**Files:**
- Create: `packages/devkit-cli/templates/_shared/.claude/commands/review.md`
- Create: `packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml`
- Create: `packages/devkit-cli/tests/overlay-coverage.test.ts`

**Interfaces:**
- Consumes: Task 2의 `categoryOf`, Task 3~4의 템플릿 디렉토리 구조
- Produces: `templates/` 전체가 카테고리 커버리지 단언 아래 놓인다. 이후 오버레이가 추가될 때마다 이 테스트가 자동으로 검사한다

**커버리지 테스트가 이 태스크에 있는 이유:** 설계 5.4절의 드리프트 방어다. 새 오버레이 파일을 추가하고 카테고리 패턴에 넣지 않으면 그 파일은 **어떤 `--only`로도 갱신되지 않으면서 조용히 성공을 보고한다.** 자산이 전부 모인 지금이 테스트를 넣을 자리다.

**GitHub Actions에 대한 주의:** `packages/devkit-cli/templates/_shared/.github/workflows/`는 저장소 루트의 `.github/workflows/`가 아니므로 **이 저장소에서 실행되지 않는다.** 생성된 프로젝트로 복사됐을 때 비로소 워크플로가 된다.

- [ ] **Step 1: `/review` 커맨드 작성**

`packages/devkit-cli/templates/_shared/.claude/commands/review.md`:

```markdown
---
description: devkit 표준 기준으로 변경분을 리뷰한다
---

`git diff`와 `git diff --cached` 범위를 `.claude/agents/devkit-reviewer.md`의 기준으로 리뷰한다.

시작 전에 그 문서의 **"지적하지 않는 것"** 절을 먼저 읽는다. 포맷·import 정렬·타입 오류는 `pnpm lint`와 `tsc`가 담당하므로 리뷰에서 다루지 않는다.

변경이 없으면 그 사실만 알리고 끝낸다.
```

**얇게 유지하는 것이 목적이다.** 리뷰 지식을 여기에 복제하면 `update`가 에이전트 문서만 갱신했을 때 두 문서가 어긋난다.

- [ ] **Step 2: CI 워크플로 작성**

`packages/devkit-cli/templates/_shared/.github/workflows/claude-review.yml`:

```yaml
name: 'Claude Code Review'
on:
  pull_request:
    types: [opened, reopened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run Claude Code Review
        uses: anthropics/claude-code-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          track_progress: true
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}

            이 PR을 리뷰해주세요.

            리뷰 가이드라인:
            - .claude/agents/devkit-reviewer.md 를 읽고 그 기준으로만 리뷰합니다
            - 그 문서의 "지적하지 않는 것" 절을 반드시 지킵니다.
              포맷·import 정렬·타입 오류는 이미 lint 와 tsc 가 CI에서 검사합니다

            구체적인 문제에 대해서는 인라인 주석을 사용하여 자세한 피드백을 제공해주세요.

            리뷰 완료 후 심각한 문제가 없으면 `gh pr review ${{ github.event.pull_request.number }} --approve -b "LGTM"` 명령으로 승인해주세요.
          claude_args: |
            --allowedTools "Read,Glob,Grep,mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*),Bash(gh pr review:*)"
```

설계 1.1절의 실물(`devlog-api`)에서 **두 군데만 바뀌었다** — `claude-skills` 체크아웃 단계 제거, 참조 대상을 프로젝트 내부 자산으로 변경. 나머지(액션 버전, OAuth 토큰, `track_progress`, `allowedTools`, 자동 승인)는 동작 중인 조합이므로 건드리지 않는다.

- [ ] **Step 3: 실패하는 커버리지 테스트 작성**

`packages/devkit-cli/tests/overlay-coverage.test.ts`:

```ts
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { categoryOf } from '../src/lib/categories.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates', import.meta.url));

/** templates/<type>/ 아래의 모든 파일을 프로젝트 상대 경로로 수집한다. */
async function collectOverlayFiles(): Promise<{ type: string; relPath: string }[]> {
  const collected: { type: string; relPath: string }[] = [];
  const types = await readdir(TEMPLATES_DIR, { withFileTypes: true });

  for (const type of types) {
    if (!type.isDirectory()) continue;
    const root = `${TEMPLATES_DIR}/${type.name}`;
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absDir = entry.parentPath ?? entry.path;
      const relPath = `${absDir}/${entry.name}`.slice(root.length + 1);
      collected.push({ type: type.name, relPath });
    }
  }

  return collected;
}

describe('오버레이 카테고리 커버리지', () => {
  it('templates 아래에 파일이 실제로 존재한다', async () => {
    // 수집이 0건이면 아래 단언이 공허하게 통과한다.
    const files = await collectOverlayFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  it('모든 오버레이 파일이 카테고리에 매칭된다', async () => {
    // 매칭되지 않는 파일은 어떤 --only 로도 갱신되지 않으면서
    // update 가 성공을 보고한다. 설계 5.4절의 드리프트 방어.
    const files = await collectOverlayFiles();
    const unmatched = files
      .filter(({ relPath }) => categoryOf(relPath) === null)
      .map(({ type, relPath }) => `${type}/${relPath}`);

    expect(unmatched).toEqual([]);
  });
});
```

`readdir`의 `recursive: true`와 `parentPath`는 Node 20.12+/22+ API다. `package.json`의 `engines`가 `^20.19.0 || ^22.13.0 || >=24`이므로 안전하다. `entry.path`는 구버전 이름이라 폴백으로 둔다.

- [ ] **Step 4: 테스트 실행 — 통과해야 한다**

Run: `pnpm vitest run packages/devkit-cli/tests/overlay-coverage.test.ts`
Expected: PASS (2 tests)

현재 오버레이는 `.claude/agents/devkit-reviewer.md`(claude), `.claude/commands/review.md`(claude), `.github/workflows/claude-review.yml`(ci) 셋뿐이고 전부 패턴에 매칭된다.

- [ ] **Step 5: 방어가 실제로 작동하는지 손으로 확인**

Run:
```bash
touch packages/devkit-cli/templates/nest/UNCATEGORIZED.txt
pnpm vitest run packages/devkit-cli/tests/overlay-coverage.test.ts
```
Expected: FAIL — `unmatched`에 `nest/UNCATEGORIZED.txt`가 담겨 실패

**초록인 테스트는 아무것도 증명하지 않는다.** 이 저장소는 구조 단언 9개가 전부 통과한 상태에서 런타임 크래시를 놓친 전례가 있다(`fsd-react-preset` 설계 2.1절). 방어 장치는 실제로 실패시켜 봐야 한다.

Run:
```bash
rm packages/devkit-cli/templates/nest/UNCATEGORIZED.txt
pnpm vitest run packages/devkit-cli/tests/overlay-coverage.test.ts
```
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/templates packages/devkit-cli/tests/overlay-coverage.test.ts
git commit -F - <<'EOF'
feat: /review 커맨드와 CI 워크플로 템플릿 추가

CI 워크플로는 devlog-api 의 동작 중인 실물을 기준선으로 삼고 두
군데만 바꾼다 — claude-skills 체크아웃 제거, 참조 대상을 프로젝트
내부 자산으로 변경. 액션 버전·OAuth 토큰·allowedTools·자동 승인은
검증된 조합이므로 건드리지 않는다.

/review 커맨드는 얇게 유지한다. 리뷰 지식을 복제하면 update 가
에이전트 문서만 갱신했을 때 두 문서가 어긋난다.

오버레이 커버리지 테스트로 드리프트를 막는다. 카테고리에 매칭되지
않는 파일은 어떤 --only 로도 갱신되지 않으면서 성공을 보고한다.
방어가 실제로 실패시키는지 미분류 파일로 확인했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: 마커 모듈

**Files:**
- Create: `packages/devkit-cli/src/lib/marker.ts`
- Create: `packages/devkit-cli/tests/marker.test.ts`
- Modify: `packages/devkit-cli/src/index.ts`

**Interfaces:**
- Consumes: Task 1의 패키지 구조
- Produces:
  - `PROJECT_TYPES: readonly ProjectType[]` — `['nest','next','monorepo']`
  - `type ProjectType = 'nest' | 'next' | 'monorepo'`
  - `interface DevkitMarker { type: ProjectType; version: string }`
  - `readMarker(packageJson: unknown): DevkitMarker` — 없거나 잘못됐으면 throw
  - `markerPatch(type: ProjectType, version: string): { devkit: DevkitMarker }`
  - `class MissingMarkerError extends Error`, `class InvalidMarkerError extends Error`

**파일 IO를 분리하는 이유:** `readMarker`가 파싱된 객체를 받으면 테스트에 임시 파일이 필요 없고, 훗날 `update`가 이미 읽어 둔 `package.json`을 재사용할 수 있다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/marker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  InvalidMarkerError,
  markerPatch,
  MissingMarkerError,
  PROJECT_TYPES,
  readMarker,
} from '../src/lib/marker.js';

describe('readMarker', () => {
  it('유효한 마커를 읽는다', () => {
    const pkg = { name: 'my-api', devkit: { type: 'nest', version: '0.1.0' } };
    expect(readMarker(pkg)).toEqual({ type: 'nest', version: '0.1.0' });
  });

  it('마커가 없으면 MissingMarkerError 를 던진다', () => {
    expect(() => readMarker({ name: 'my-api' })).toThrow(MissingMarkerError);
  });

  it('마커 부재 오류 메시지가 --type 을 안내한다', () => {
    // 의존성으로 유형을 짐작하는 휴리스틱은 조용히 틀릴 수 있다(설계 5.1절).
    expect(() => readMarker({ name: 'my-api' })).toThrow(/--type/);
  });

  it('알 수 없는 type 은 InvalidMarkerError 를 던진다', () => {
    const pkg = { devkit: { type: 'django', version: '0.1.0' } };
    expect(() => readMarker(pkg)).toThrow(InvalidMarkerError);
  });

  it('알 수 없는 type 오류 메시지가 지원 목록을 담는다', () => {
    const pkg = { devkit: { type: 'django', version: '0.1.0' } };
    expect(() => readMarker(pkg)).toThrow(/nest/);
    expect(() => readMarker(pkg)).toThrow(/monorepo/);
  });

  it('version 이 없으면 InvalidMarkerError 를 던진다', () => {
    expect(() => readMarker({ devkit: { type: 'nest' } })).toThrow(InvalidMarkerError);
  });

  it('devkit 이 객체가 아니면 InvalidMarkerError 를 던진다', () => {
    expect(() => readMarker({ devkit: 'nest' })).toThrow(InvalidMarkerError);
    expect(() => readMarker({ devkit: null })).toThrow(MissingMarkerError);
  });

  it('package.json 자체가 객체가 아니면 MissingMarkerError 를 던진다', () => {
    expect(() => readMarker(null)).toThrow(MissingMarkerError);
    expect(() => readMarker('{}')).toThrow(MissingMarkerError);
  });
});

describe('markerPatch', () => {
  it('mergeJson 에 넘길 패치 형태를 만든다', () => {
    expect(markerPatch('next', '0.2.0')).toEqual({
      devkit: { type: 'next', version: '0.2.0' },
    });
  });
});

describe('PROJECT_TYPES', () => {
  it('템플릿 설계의 3종을 갖는다', () => {
    expect([...PROJECT_TYPES]).toEqual(['nest', 'next', 'monorepo']);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/marker.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/marker.js"`

- [ ] **Step 3: 모듈 구현**

`packages/devkit-cli/src/lib/marker.ts`:

```ts
/**
 * package.json 의 devkit 마커.
 *
 * `devkit update` 는 대상이 어떤 유형인지 알아야 한다. 의존성으로
 * 짐작하는 휴리스틱(@nestjs/core 유무 등)은 조용히 틀릴 수 있으므로
 * create 가 심어 둔 마커만 신뢰한다(설계 5.1절).
 */

export const PROJECT_TYPES = ['nest', 'next', 'monorepo'] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface DevkitMarker {
  type: ProjectType;
  version: string;
}

export class MissingMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingMarkerError';
  }
}

export class InvalidMarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMarkerError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readMarker(packageJson: unknown): DevkitMarker {
  if (!isRecord(packageJson) || packageJson.devkit == null) {
    throw new MissingMarkerError(
      'package.json 에 devkit 마커가 없습니다. devkit 으로 생성한 프로젝트가 아니거나 마커가 지워졌습니다.\n' +
        `--type <${PROJECT_TYPES.join('|')}> 으로 유형을 명시하세요.`,
    );
  }

  const marker = packageJson.devkit;
  if (!isRecord(marker)) {
    throw new InvalidMarkerError('package.json 의 devkit 마커가 객체가 아닙니다.');
  }

  const { type, version } = marker;
  const knownTypes: readonly string[] = PROJECT_TYPES;
  if (typeof type !== 'string' || !knownTypes.includes(type)) {
    throw new InvalidMarkerError(
      `알 수 없는 프로젝트 유형: ${String(type)}\n지원 유형: ${PROJECT_TYPES.join(', ')}`,
    );
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new InvalidMarkerError('devkit 마커에 version 문자열이 없습니다.');
  }

  return { type: type as ProjectType, version };
}

/** create 와 전체 update 가 mergeJson 에 넘길 패치. */
export function markerPatch(type: ProjectType, version: string): { devkit: DevkitMarker } {
  return { devkit: { type, version } };
}
```

- [ ] **Step 4: 진입점에서 re-export**

`packages/devkit-cli/src/index.ts`에 다음 블록을 추가한다(기존 categories export 아래):

```ts
export {
  InvalidMarkerError,
  markerPatch,
  MissingMarkerError,
  PROJECT_TYPES,
  readMarker,
  type DevkitMarker,
  type ProjectType,
} from './lib/marker.js';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/marker.test.ts`
Expected: PASS (10 tests — `readMarker` 8, `markerPatch` 1, `PROJECT_TYPES` 1)

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src packages/devkit-cli/tests/marker.test.ts
git commit -F - <<'EOF'
feat: devkit 마커 읽기/쓰기 모듈 추가

update 가 대상 프로젝트의 유형을 아는 유일한 경로다. 의존성으로
짐작하는 휴리스틱은 조용히 틀릴 수 있으므로 마커만 신뢰하고,
없으면 명확한 에러와 함께 --type 을 요구한다.

파일 IO 를 분리해 파싱된 객체를 받는다. 테스트에 임시 파일이
필요 없고, update 가 이미 읽어 둔 package.json 을 재사용할 수 있다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: 변경 분류와 목록 포맷

**Files:**
- Create: `packages/devkit-cli/src/lib/classify.ts`
- Create: `packages/devkit-cli/tests/classify.test.ts`
- Modify: `packages/devkit-cli/src/index.ts`

**Interfaces:**
- Consumes: Task 2의 `type Category`
- Produces:
  - `type ChangeKind = 'created' | 'overwritten' | 'unchanged'`
  - `interface PlannedFile { relPath: string; content: string; category: Category }`
  - `interface ClassifiedFile { kind: ChangeKind; relPath: string; category: Category }`
  - `classifyFiles(targetDir: string, planned: PlannedFile[]): Promise<ClassifiedFile[]>`
  - `formatChangeList(items: ClassifiedFile[], projectName: string, type: string): string`

**"동일 — 건너뜀"을 반드시 출력한다**(설계 5.5절). 여기 있어야 할 파일이 목록 어디에도 없으면 곧바로 눈에 띈다. 침묵하면 그 사실이 숨는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/classify.test.ts`:

```ts
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyFiles, formatChangeList } from '../src/lib/classify.js';
import type { ClassifiedFile, PlannedFile } from '../src/lib/classify.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devkit-classify-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const planned = (relPath: string, content: string): PlannedFile => ({
  relPath,
  content,
  category: 'claude',
});

describe('classifyFiles', () => {
  it('대상에 없는 파일은 created 로 분류한다', async () => {
    const result = await classifyFiles(dir, [planned('CLAUDE.md', 'hello')]);
    expect(result).toEqual([{ kind: 'created', relPath: 'CLAUDE.md', category: 'claude' }]);
  });

  it('내용이 다르면 overwritten 으로 분류한다', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'old', 'utf8');
    const result = await classifyFiles(dir, [planned('CLAUDE.md', 'new')]);
    expect(result[0]?.kind).toBe('overwritten');
  });

  it('내용이 같으면 unchanged 로 분류한다', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'same', 'utf8');
    const result = await classifyFiles(dir, [planned('CLAUDE.md', 'same')]);
    expect(result[0]?.kind).toBe('unchanged');
  });

  it('중첩 경로를 다룬다', async () => {
    await mkdir(join(dir, '.claude', 'agents'), { recursive: true });
    await writeFile(join(dir, '.claude', 'agents', 'devkit-reviewer.md'), 'old', 'utf8');
    const result = await classifyFiles(dir, [
      planned('.claude/agents/devkit-reviewer.md', 'new'),
    ]);
    expect(result[0]?.kind).toBe('overwritten');
  });

  it('입력 순서를 보존한다', async () => {
    const result = await classifyFiles(dir, [
      planned('b.md', 'x'),
      planned('a.md', 'y'),
    ]);
    expect(result.map((r) => r.relPath)).toEqual(['b.md', 'a.md']);
  });

  it('파일 부재가 아닌 오류는 삼키지 않고 던진다', async () => {
    // 대상 경로가 디렉토리면 readFile 이 EISDIR 을 던진다. 이것을
    // created 로 뭉개면 "새로 만듭니다"라고 고지한 뒤 쓰기 단계에서야
    // 실패가 드러난다 — 사전 고지가 목적인 모듈이 거짓을 보고하는 셈이다.
    await mkdir(join(dir, 'CLAUDE.md'));
    await expect(classifyFiles(dir, [planned('CLAUDE.md', 'x')])).rejects.toThrow();
  });
});

describe('formatChangeList', () => {
  const items: ClassifiedFile[] = [
    { kind: 'overwritten', relPath: 'eslint.config.mjs', category: 'lint' },
    { kind: 'overwritten', relPath: '.claude/agents/devkit-reviewer.md', category: 'claude' },
    { kind: 'created', relPath: '.claude/commands/review.md', category: 'claude' },
    { kind: 'unchanged', relPath: 'tsconfig.json', category: 'ts' },
  ];

  it('세 분류를 모두 표시한다', () => {
    const output = formatChangeList(items, 'my-api', 'nest');
    expect(output).toContain('덮어쓰기 (2)');
    expect(output).toContain('신규 (1)');
    expect(output).toContain('동일 — 건너뜀 (1)');
  });

  it('프로젝트명과 유형을 머리말에 담는다', () => {
    const output = formatChangeList(items, 'my-api', 'nest');
    expect(output).toContain('my-api');
    expect(output).toContain('nest');
  });

  it('변경이 없어도 동일 목록을 출력한다', () => {
    // 있어야 할 파일이 목록 어디에도 없으면 곧바로 눈에 띄어야 한다.
    const output = formatChangeList(
      [{ kind: 'unchanged', relPath: 'tsconfig.json', category: 'ts' }],
      'my-api',
      'nest',
    );
    expect(output).toContain('동일 — 건너뜀 (1)');
    expect(output).toContain('tsconfig.json');
  });

  it('해당 항목이 없는 분류는 표시하지 않는다', () => {
    const output = formatChangeList(
      [{ kind: 'created', relPath: 'a.md', category: 'claude' }],
      'my-api',
      'nest',
    );
    expect(output).not.toContain('덮어쓰기');
    expect(output).not.toContain('동일');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/classify.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/classify.js"`

- [ ] **Step 3: 모듈 구현**

`packages/devkit-cli/src/lib/classify.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Category } from './categories.js';

export type ChangeKind = 'created' | 'overwritten' | 'unchanged';

export interface PlannedFile {
  relPath: string;
  content: string;
  category: Category;
}

export interface ClassifiedFile {
  kind: ChangeKind;
  relPath: string;
  category: Category;
}

/**
 * 쓰기 전에 각 파일이 신규인지·덮어쓰기인지·동일한지 판정한다.
 *
 * update 는 이 결과를 사람에게 보여주고 확인을 받은 뒤에야 쓴다(설계 5.2절).
 */
/** 파일이 없어서 읽기가 실패한 것인가. 그 외의 오류와 구분해야 한다. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}

export async function classifyFiles(
  targetDir: string,
  planned: PlannedFile[],
): Promise<ClassifiedFile[]> {
  return Promise.all(
    planned.map(async ({ relPath, content, category }): Promise<ClassifiedFile> => {
      const existing = await readFile(join(targetDir, relPath), 'utf8').catch(
        (error: unknown) => {
          // ENOENT 만 "신규"로 본다. 나머지를 삼키면 사전 고지가 거짓이 된다 —
          // EISDIR(경로가 디렉토리)은 쓰기 단계에서야 드러나고, EACCES(읽기만
          // 막힌 파일)는 "새로 만듭니다"라고 고지한 뒤 쓰기가 성공해 기존 파일을
          // 조용히 덮어쓴다.
          if (isNotFound(error)) {
            return null;
          }
          throw error;
        },
      );
      if (existing === null) {
        return { kind: 'created', relPath, category };
      }
      return { kind: existing === content ? 'unchanged' : 'overwritten', relPath, category };
    }),
  );
}

const SECTIONS: ReadonlyArray<readonly [ChangeKind, string]> = [
  ['overwritten', '덮어쓰기'],
  ['created', '신규'],
  ['unchanged', '동일 — 건너뜀'],
];

/**
 * 설계 5.5절의 변경 목록.
 *
 * "동일 — 건너뜀"을 반드시 출력한다. 여기 있어야 할 파일이 목록
 * 어디에도 없으면 곧바로 눈에 띄지만, 침묵하면 그 사실이 숨는다.
 */
export function formatChangeList(
  items: ClassifiedFile[],
  projectName: string,
  type: string,
): string {
  const lines = [`devkit update — ${projectName} (${type})`, ''];

  for (const [kind, label] of SECTIONS) {
    const matching = items.filter((item) => item.kind === kind);
    if (matching.length === 0) continue;
    lines.push(`  ${label} (${matching.length})`);
    for (const item of matching) {
      lines.push(`    ${item.relPath}`);
    }
  }

  return lines.join('\n');
}
```

**`ENOENT`만 "신규"로 좁히는 것이 중요하다.** 초판은 모든 읽기 오류를 `created`로 삼키며 *"실제 쓰기 단계에서 같은 오류가 다시 난다"* 고 정당화했으나, Task 7 리뷰가 그 전제를 반증했다 — `EACCES`(읽기만 막힌 파일)에서는 쓰기가 **성공**하므로, "새로 만듭니다"라고 고지한 뒤 기존 파일을 조용히 덮어쓴다. `EISDIR`(경로가 이미 디렉토리)도 프리뷰를 거짓으로 만든다. 사전 고지가 존재 이유인 모듈이 거짓을 보고하면 모듈 자체가 무의미해진다(설계 6절).

- [ ] **Step 4: 진입점에서 re-export**

`packages/devkit-cli/src/index.ts`에 추가:

```ts
export {
  classifyFiles,
  formatChangeList,
  type ChangeKind,
  type ClassifiedFile,
  type PlannedFile,
} from './lib/classify.js';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/classify.test.ts`
Expected: PASS (10 tests — `classifyFiles` 6, `formatChangeList` 4)

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src packages/devkit-cli/tests/classify.test.ts
git commit -F - <<'EOF'
feat: 변경 분류와 목록 포맷 모듈 추가

update 가 쓰기 전에 사람에게 보여줄 신규/덮어쓰기/동일 분류를
만든다. "동일 — 건너뜀"을 항상 출력하는 것이 핵심이다. 있어야 할
파일이 목록 어디에도 없으면 눈에 띄지만 침묵하면 숨는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: git 상태 검사

**Files:**
- Create: `packages/devkit-cli/src/lib/git.ts`
- Create: `packages/devkit-cli/tests/git.test.ts`
- Modify: `packages/devkit-cli/src/index.ts`

**Interfaces:**
- Consumes: Task 1의 패키지 구조
- Produces:
  - `type GitState = { kind: 'clean' } | { kind: 'dirty'; changedFiles: number } | { kind: 'not-a-repo' }`
  - `inspectGit(dir: string): Promise<GitState>`

**왜 git이 안전망인가:** update가 자체 백업·3-way 머지 로직을 갖는 대신, 워킹트리가 깨끗할 것을 요구한다. 그러면 덮어쓴 결과가 전부 `git diff`로 검토되고 `git checkout`으로 되돌아간다. CLI가 만들 수 있는 어떤 백업 메커니즘보다 싸고 정직하다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/devkit-cli/tests/git.test.ts`:

```ts
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectGit } from '../src/lib/git.js';

const run = promisify(execFile);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devkit-git-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('inspectGit', () => {
  it('git 저장소가 아니면 not-a-repo 를 반환한다', async () => {
    expect(await inspectGit(dir)).toEqual({ kind: 'not-a-repo' });
  });

  it('갓 init 한 빈 저장소는 clean 이다', async () => {
    await run('git', ['init', '-q'], { cwd: dir });
    expect(await inspectGit(dir)).toEqual({ kind: 'clean' });
  });

  it('추적되지 않는 파일이 있으면 dirty 다', async () => {
    // untracked 도 dirty 로 본다. update 가 덮어쓴 결과와 사용자의
    // 미커밋 작업이 같은 diff 에 섞이면 되돌리기가 어려워진다.
    await run('git', ['init', '-q'], { cwd: dir });
    await writeFile(join(dir, 'a.txt'), 'x', 'utf8');
    expect(await inspectGit(dir)).toEqual({ kind: 'dirty', changedFiles: 1 });
  });

  it('변경 파일 수를 센다', async () => {
    await run('git', ['init', '-q'], { cwd: dir });
    await writeFile(join(dir, 'a.txt'), 'x', 'utf8');
    await writeFile(join(dir, 'b.txt'), 'y', 'utf8');
    const state = await inspectGit(dir);
    expect(state).toEqual({ kind: 'dirty', changedFiles: 2 });
  });

  it('존재하지 않는 디렉토리도 not-a-repo 로 다룬다', async () => {
    expect(await inspectGit(join(dir, 'nope'))).toEqual({ kind: 'not-a-repo' });
  });

  it('새로 생긴 미추적 디렉토리 안의 파일을 개별로 센다', async () => {
    // git status --porcelain 은 기본값(-unormal)에서 미추적 디렉토리를
    // "?? nested/" 한 줄로 접는다. devkit 이 .claude/agents/ 를 통째로
    // 만드는 상황이 정확히 이 경우라, 접힌 채로 세면 이 모듈이 보호하려는
    // 바로 그 시나리오에서 위험을 과소 보고한다.
    await run('git', ['init', '-q'], { cwd: dir });
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'nested', 'a.txt'), 'a', 'utf8');
    await writeFile(join(dir, 'nested', 'b.txt'), 'b', 'utf8');
    await writeFile(join(dir, 'nested', 'c.txt'), 'c', 'utf8');
    expect(await inspectGit(dir)).toEqual({ kind: 'dirty', changedFiles: 3 });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/git.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/git.js"`

- [ ] **Step 3: 모듈 구현**

`packages/devkit-cli/src/lib/git.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type GitState =
  | { kind: 'clean' }
  | { kind: 'dirty'; changedFiles: number }
  | { kind: 'not-a-repo' };

/**
 * 워킹트리 상태를 본다.
 *
 * update 는 깨끗한 트리를 요구한다. 그러면 덮어쓴 결과가 전부
 * git diff 로 검토되고 checkout 으로 되돌아가므로, CLI 가 자체
 * 백업·머지 로직을 가질 필요가 없다(설계 2.1절).
 *
 * untracked 파일도 dirty 로 본다 — update 의 결과와 사용자의
 * 미커밋 작업이 같은 diff 에 섞이면 되돌리기가 어려워진다.
 */
/**
 * "여긴 git 저장소가 아니다"로 접어도 되는 실패인가.
 *
 * 저장소가 있는데 다른 이유로 못 읽은 것까지 not-a-repo 로 보고하면,
 * 실제로는 지켜야 할 미커밋 변경이 있는데 안전망이 없다고 잘못 알리게 된다.
 */
function isMissingRepo(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, stderr } = error as { code?: unknown; stderr?: unknown };
  // git 미설치이거나 dir 자체가 없으면 spawn 이 ENOENT 로 실패한다
  if (code === 'ENOENT') {
    return true;
  }
  // 저장소가 아니면 git 이 비정상 종료하며 stderr 에 명시한다.
  // 이 매칭이 성립하려면 메시지가 영어여야 하므로 아래 run 이 로케일을 고정한다.
  return typeof stderr === 'string' && stderr.includes('not a git repository');
}

export async function inspectGit(dir: string): Promise<GitState> {
  const stdout = await run('git', ['status', '--porcelain', '-uall'], {
    cwd: dir,
    // git 메시지를 영어로 고정한다. 번역된 메시지를 만나면 isMissingRepo 가
    // 정상적인 "저장소 아님"을 못 알아보고, 그 케이스가 예외로 새어 나간다.
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    maxBuffer: 64 * 1024 * 1024,
  })
    .then((result) => result.stdout)
    .catch((error: unknown) => {
      if (isMissingRepo(error)) {
        return null;
      }
      throw error;
    });

  if (stdout === null) {
    return { kind: 'not-a-repo' };
  }

  const changedFiles = stdout.split('\n').filter((line) => line.trim().length > 0).length;
  return changedFiles === 0 ? { kind: 'clean' } : { kind: 'dirty', changedFiles };
}
```

**세 가지가 의도적이다.**

- **`-uall`**: 기본값(`-unormal`)은 새 미추적 디렉토리를 `?? nested/` 한 줄로 접는다. devkit 이 `.claude/agents/` 를 통째로 만드는 상황이 정확히 이 경우라, 접힌 채로 세면 이 모듈이 보호하려는 시나리오에서 위험을 과소 보고한다.
- **`isMissingRepo` 로 좁힌 catch**: 초판은 모든 실패를 `not-a-repo` 로 접으며 *"저장소 아님과 git 미설치는 같은 처리로 이어진다"* 고 정당화했으나, 그 catch 는 권한 오류·손상된 저장소·`maxBuffer` 초과까지 흡수한다. 그 경우들은 **저장소가 실제로 존재하고 미커밋 변경을 가질 수 있으므로** 같은 처리로 이어져서는 안 된다. Task 7 의 `ENOENT` 좁히기를 그대로 옮길 수는 없다 — 여기서 가장 흔한 실패인 "저장소 아님"은 `ENOENT` 가 아니라 비정상 종료라서, `ENOENT` 만 접으면 그 케이스가 예외로 터진다.
- **`maxBuffer` 상향**: `execFile` 기본값은 1MB다. 변경이 매우 많은 저장소에서 출력이 이를 넘으면 에러가 나는데, 좁힌 catch 아래에서는 그것이 조용한 `not-a-repo` 가 아니라 예외로 드러난다. 그래도 애초에 터지지 않는 편이 낫다.
- **`LC_ALL=C` · `LANG=C`**: catch 를 stderr 문자열로 좁힌 순간 **메시지가 번역되면 매칭이 깨진다.** 그러면 정상적인 "저장소 아님"이 `not-a-repo` 가 아니라 예외로 새어 나가 호출자를 크래시시킨다 — 좁히기가 만든 새 실패 모드이며, 로케일을 고정해 원천 차단한다. 이것이 없으면 좁히기의 대가로 더 나쁜 회귀를 얻는다.

- [ ] **Step 4: 진입점에서 re-export**

`packages/devkit-cli/src/index.ts`에 추가:

```ts
export { inspectGit, type GitState } from './lib/git.js';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run packages/devkit-cli/tests/git.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src packages/devkit-cli/tests/git.test.ts
git commit -F - <<'EOF'
feat: git 워킹트리 상태 검사 모듈 추가

update 가 깨끗한 트리를 요구하기 위한 검사다. 깨끗하면 덮어쓴
결과가 전부 git diff 로 검토되고 checkout 으로 되돌아가므로,
CLI 가 자체 백업·머지 로직을 가질 필요가 없다.

untracked 도 dirty 로 센다. update 결과와 사용자의 미커밋 작업이
같은 diff 에 섞이면 되돌리기가 어려워진다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: README, 전체 검증, 작업 기록

**Files:**
- Create: `packages/devkit-cli/README.md`
- Modify: `work-log.md`

**Interfaces:**
- Consumes: Task 1~8 전부
- Produces: 없음 (마무리 태스크)

- [ ] **Step 1: README 작성**

`packages/devkit-cli/README.md`:

```markdown
# @devbak/devkit-cli

devkit 표준 프로젝트의 생성·갱신을 담당하는 CLI. **현재는 리뷰 자산 템플릿과 `devkit update` 기반 모듈만 구현돼 있고, 실행 진입점(`bin`)은 없다.**

설계: `docs/superpowers/specs/2026-08-01-devkit-claude-review-design.md`, `docs/superpowers/specs/2026-08-01-devkit-template-design.md`

## 현재 담고 있는 것

### `templates/` — 생성된 프로젝트로 복사될 오버레이

| 경로 | 내용 |
| --- | --- |
| `_shared/.claude/commands/review.md` | 로컬 `/review` 슬래시 커맨드 |
| `_shared/.github/workflows/claude-review.yml` | PR 자동 리뷰 워크플로 |
| `nest/.claude/agents/devkit-reviewer.md` | NestJS 리뷰어 |
| `next/.claude/agents/devkit-reviewer.md` | Next.js + FSD 리뷰어 |
| `monorepo/.claude/agents/devkit-reviewer.md` | Turborepo 모노레포 리뷰어 |

리뷰어는 **린터가 원리적으로 못 잡는 것만** 본다 — 크로스 파일 아키텍처, 조용한 실패, 테스트 공백, 의도와 구현의 불일치. 포맷·import 정렬·타입 오류는 `prettier`·`oxlint`·ESLint·`tsc`가 담당하며, 리뷰어 문서의 "지적하지 않는 것" 절이 이를 명시한다.

### `src/lib/` — `devkit update` 가 조립할 모듈

| 모듈 | 책임 |
| --- | --- |
| `categories.ts` | `--only` 카테고리 7종과 경로 패턴 테이블 |
| `marker.ts` | `package.json` 의 `devkit` 마커 읽기/쓰기 |
| `classify.ts` | 신규/덮어쓰기/동일 분류 + 변경 목록 포맷 |
| `git.ts` | 워킹트리 상태 검사 |

## CI 워크플로를 쓰려면

생성된 저장소에 시크릿 `CLAUDE_CODE_OAUTH_TOKEN` 을 등록해야 한다. 없으면 워크플로가 실행되지 않는다. 파일이 놓였다는 사실이 리뷰가 동작한다는 뜻은 아니다.

## 아직 없는 것

`bin.ts`, 레시피 실행기, 원자 연산 6종, `create`·`update` 서브커맨드. 템플릿 설계 구현에서 만든다.

## 개발

```bash
pnpm --filter @devbak/devkit-cli build
pnpm vitest run packages/devkit-cli
```
```

- [ ] **Step 2: 전체 회귀 게이트 실행**

Run:
```bash
pnpm lint
pnpm test
pnpm build
pnpm exec tsc --noEmit -p packages/devkit-cli/tsconfig.json
pnpm exec tsc --noEmit -p packages/devkit-cli/tests/tsconfig.json
```
Expected: 다섯 명령 모두 종료 코드 0. `pnpm test`는 기존 테스트 전부 + 이번 추가분 76개(categories 22 · review-assets 26 · marker 10 · classify 10 · git 6 · overlay-coverage 2)가 통과. 기존 개수는 실행해서 확인한다 — 다른 작업이 병행됐을 수 있으므로 계획에 박아 둔 숫자를 믿지 않는다

기존 77개가 하나라도 깨지면 멈추고 원인을 찾는다. 이 계획은 기존 패키지의 소스를 건드리지 않으므로, 깨진다면 린트 설정 변경(Task 1)이 원인일 가능성이 높다.

- [ ] **Step 3: work-log 기록**

`work-log.md`의 `## 2026-08-01` 섹션(없으면 파일 상단에 새로 만든다)에 다음을 추가한다. 실제 수치는 실행 결과로 채운다.

```markdown
### Claude 리뷰 자산 및 devkit update 기반 모듈 구현
- **변경 파일**: `packages/devkit-cli/**`(신규 패키지), `eslint.config.mjs`, `.oxlintrc.json`, `docs/superpowers/specs/2026-08-01-devkit-claude-review-design.md`, `docs/superpowers/plans/2026-08-01-devkit-claude-review.md`
- **내용**: 생성된 프로젝트가 Claude 기반 코드 리뷰를 갖추게 하는 자산과, 그것을 갱신하는 `devkit update`의 기반 모듈을 구현.
  - **설계의 중심은 리뷰의 관심사 경계**: `devlog-api`의 기존 `코드-리뷰` 스킬 체크리스트를 항목별로 분류한 결과 대부분이 린터 영역(import 정렬·알파벳순·데코레이터 순서)이었고, `class-validator` 전제는 zod를 쓰는 실제 스택과 이미 어긋나 있었다. 그대로 계승했다면 모든 PR에서 잘못된 지적이 나왔을 것이다. 리뷰어는 린터가 원리적으로 못 잡는 4관점만 본다.
  - **CI 워크플로는 `devlog-api`의 동작 중인 실물이 기준선**. 두 군데만 변경 — `claude-skills` 체크아웃 제거, 참조 대상을 프로젝트 내부 자산으로. 기존 `nestjs-reviewer`/`nextjs-reviewer`가 FSD를 전혀 언급하지 않고(grep 0건) 자체 폴더구조를 제안해 devkit 표준과 충돌하기 때문이다.
  - **드리프트 방어**: 카테고리에 매칭되지 않는 오버레이 파일이 있으면 테스트가 실패한다. 계획 작성 중 이 방어가 `.gitignore` 미분류를 즉시 드러내 `repo` 카테고리를 추가했다. 방어가 실제로 실패시키는지 미분류 파일로 확인했다.
  - **`templates/`를 ESLint·oxlint 양쪽 ignore에 추가**. 소비자용 `.ts` 오버레이는 이 저장소의 어떤 tsconfig에도 속하지 않아 타입 인식 규칙이 예외를 던진다 — `eslint-config-nest`에서 겪은 Critical과 같은 부류이며, 증상이 나기 전에 막았다.
- **검증**: `pnpm lint` exit 0, `pnpm test` NN개 통과, `pnpm build` 성공, `tsc --noEmit` 2개 프로젝트 통과
- **커밋**: `83dcc95`(설계) 외 구현 커밋 8건. 브랜치 `worktree-streamed-humming-papert`
- **남은 것**: CLI 실행 로직(`bin`·레시피·원자 연산 6종)과 `create`·`update` 서브커맨드는 템플릿 설계 구현의 몫이다(설계 0.1절)
```

- [ ] **Step 4: 커밋**

```bash
git add packages/devkit-cli/README.md work-log.md
git commit -F - <<'EOF'
docs: devkit-cli README 와 작업 기록 추가

현재 구현 범위(리뷰 자산 + update 기반 모듈)와 아직 없는 것
(CLI 실행 진입점)을 명시한다. 워크플로 파일이 놓였다는 사실이
리뷰가 동작한다는 뜻은 아니므로 시크릿 등록 안내를 함께 적는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: memory 갱신**

`CLAUDE.md` 규칙에 따라 `/Users/dabot/.claude/projects/-Users-dabot-Documents-develop-eslint/memory/` 에 `project` 타입 메모리를 작성하고 `MEMORY.md` 에 한 줄 포인터를 추가한다. 담을 내용은 다음 두 가지에 한정한다(코드나 문서에서 읽을 수 있는 것은 넣지 않는다).

- 리뷰 자산의 관심사 경계를 정한 **근거** — 기존 스킬 체크리스트가 린터 영역이었고 class-validator 전제가 틀렸다는 실측
- CI 워크플로의 기준선이 `devlog-api`의 실물이라는 사실과, `claude-skills`의 기존 리뷰어를 쓰지 않기로 한 이유

---

## 자체 점검

**설계 커버리지**

| 설계 절 | 대응 |
| --- | --- |
| 3.2 리뷰 4관점 | Task 3·4 (문서 본문 + 구조 단언) |
| 3.3 명시적 비범위 | Task 3·4 ("지적하지 않는 것" 절 + 순서 단언) |
| 3.4 리뷰어 2종 | Task 3·4 (monorepo까지 3종) |
| 4.1 자산 배치 | Task 3·4·5 |
| 4.2 `/review` 커맨드 | Task 5 |
| 4.3 CI 워크플로 | Task 5 |
| 5.1 유형 마커 | Task 6 |
| 5.4 카테고리 + 드리프트 방어 | Task 2·5 |
| 5.5 변경 목록 출력 | Task 7 |
| 2.1 git 안전장치 | Task 8 |
| 5.2 실행 모델 6단계 | **미구현** — CLI 진입점이 없다(계획 서두의 "다루지 않는 것") |
| 5.3 create와의 차이 | **미구현** — 같은 이유 |
| 6절 실패 목록 | 부분 — 각 모듈이 던지는 에러는 구현됐고, 그것을 사용자에게 보여주는 흐름은 미구현 |

미구현 3건은 전부 CLI 실행 로직에 속하며, 설계 0.1절이 선행 조건으로 명시한 템플릿 설계 구현 이후에 다룬다.

**타입 일관성**: `Category`(Task 2)를 `PlannedFile`·`ClassifiedFile`(Task 7)이 쓰고, `ProjectType`(Task 6)은 `formatChangeList`의 `type: string` 파라미터로 넘어간다. 후자를 `ProjectType`으로 좁히지 않은 이유는 `classify.ts`가 `marker.ts`에 의존하지 않게 하기 위해서다 — 두 모듈은 서로를 모른 채 `update`가 조립한다.
