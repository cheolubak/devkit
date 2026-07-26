# eslint-plugin-fsd Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FSD(Feature-Sliced Design) 격리 3원칙을 강제하는 ESLint 플러그인 `eslint-plugin-fsd`(rule 3개 + recommended flat config)를 pnpm 모노레포로 구현한다.

**Architecture:** rule은 importer 파일 경로와 import 대상 경로를 각각 `FsdLocation`으로 파싱해 rank/slice/depth를 비교하는 순수 함수로 환원된다. 경로 파싱은 `src/` 앵커 우선(없으면 top-most 레이어 세그먼트 부모)으로 FSD 루트를 결정적으로 찾아 Next.js 라우팅 폴더 오탐을 방지한다. 모든 판정은 파일시스템 접근 없이 경로 문자열만으로 수행한다.

**Tech Stack:** TypeScript(strict), ESLint v9 flat config, tsup(번들+dts), Vitest + ESLint RuleTester, pnpm workspace.

## Global Constraints

- 패키지 매니저: **pnpm** (npm 금지)
- TypeScript **strict mode**, 2-space 들여쓰기
- ESLint **v9** flat config 대상, `peerDependencies: { "eslint": ">=9" }`
- rule은 **파일시스템 접근 없이 경로 문자열만으로** 판정 (RuleTester 가상 filename 테스트 유지)
- 레이어 rank: `app`=0, `pages`=1, `widgets`=2, `features`=3, `entities`=4, `shared`=5
- `pages` 레이어 별칭: `views`, `screens` (동일 rank 1)
- sliced 레이어: `pages/views/screens`, `widgets`, `features`, `entities`. non-sliced: `app`, `shared`
- alias 기본값: `['@', '~']` (rule option `alias`로만 커스터마이즈)
- 병합은 rebase 방식 (merge commit 금지). 커밋 메시지 imperative mood
- 플러그인 네임스페이스: `fsd` (규칙 참조는 `fsd/<rule-name>`)
- **RuleTester(ESLint v9)는 `import`/`export` 구문 파싱을 위해 반드시 module 설정을 준다**: 모든 `new RuleTester(...)`는 `new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } })` 형태로 생성. (기본 sourceType가 module이 아니면 import 구문 파싱 에러가 남)

---

## File Structure

**워크스페이스 루트**
- `pnpm-workspace.yaml` — `packages/*` 등록
- `package.json` — 루트 스크립트(build/test/lint), devDeps(vitest, typescript, tsup)
- `tsconfig.base.json` — 공유 strict 설정
- `vitest.config.ts` — 테스트 루트 설정

**`packages/eslint-plugin-fsd/`**
- `package.json` — name/exports/peerDeps/scripts
- `tsconfig.json` — base 확장
- `tsup.config.ts` — ESM + dts 번들
- `src/lib/types.ts` — `FsdLocation` 인터페이스
- `src/lib/layers.ts` — `LAYERS`, `lookupLayer()`
- `src/lib/parse-path.ts` — `findFsdRoot()`, `parsePath()`
- `src/lib/resolve-import.ts` — `resolveImport()`
- `src/lib/create-rule.ts` — RuleModule 헬퍼(공통 import 순회)
- `src/rules/no-higher-level-imports.ts`
- `src/rules/no-cross-imports.ts`
- `src/rules/no-public-api-sidestep.ts`
- `src/configs/recommended.ts` — flat config 프리셋
- `src/index.ts` — 플러그인 진입점
- `tests/*.test.ts` — lib 단위 테스트 + rule RuleTester 테스트

각 파일은 단일 책임: `lib/*`는 순수 경로 로직(파일시스템 무관), `rules/*`는 AST import 노드 → lib 호출 → report.

---

## Task 1: 모노레포 스캐폴딩 + 패키지 뼈대

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/eslint-plugin-fsd/package.json`, `packages/eslint-plugin-fsd/tsconfig.json`, `packages/eslint-plugin-fsd/tsup.config.ts`
- Create: `packages/eslint-plugin-fsd/src/index.ts` (임시 stub)

**Interfaces:**
- Produces: 동작하는 pnpm 워크스페이스. `pnpm install`·`pnpm test`(0 테스트)·`pnpm -r build` 성공.

- [ ] **Step 1: 워크스페이스 파일 작성**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

루트 `package.json`:
```json
{
  "name": "eslint-workspace",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsup": "^8.3.0",
    "vitest": "^2.1.0",
    "eslint": "^9.13.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: 패키지 뼈대 작성**

`packages/eslint-plugin-fsd/package.json`:
```json
{
  "name": "eslint-plugin-fsd",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup"
  },
  "peerDependencies": {
    "eslint": ">=9"
  }
}
```

`packages/eslint-plugin-fsd/tsconfig.json`:
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

`packages/eslint-plugin-fsd/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

`packages/eslint-plugin-fsd/src/index.ts` (임시 stub):
```ts
export default { meta: { name: 'eslint-plugin-fsd', version: '0.1.0' }, rules: {}, configs: {} };
```

- [ ] **Step 3: 설치 및 검증**

Run: `pnpm install && pnpm build && pnpm test`
Expected: install 성공, build 성공(dist 생성), test는 "no test files" 로 통과(exit 0). vitest가 0개 테스트로 실패하면 `--passWithNoTests`를 `test` 스크립트에 추가: `"test": "vitest run --passWithNoTests"`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: pnpm 모노레포 및 eslint-plugin-fsd 패키지 뼈대 구성"
```

---

## Task 2: 레이어 모델 (`lib/types.ts`, `lib/layers.ts`)

**Files:**
- Create: `packages/eslint-plugin-fsd/src/lib/types.ts`
- Create: `packages/eslint-plugin-fsd/src/lib/layers.ts`
- Test: `packages/eslint-plugin-fsd/tests/layers.test.ts`

**Interfaces:**
- Produces:
  - `interface FsdLocation { layer: string; rank: number; sliced: boolean; slice: string | null; segment: string | null; depth: number; folderName: string; }`
  - `interface LayerDef { name: string; aliases: string[]; rank: number; sliced: boolean; }`
  - `const LAYERS: LayerDef[]`
  - `function lookupLayer(folderName: string): LayerDef | null` — 정규명/별칭으로 조회, 없으면 null

- [ ] **Step 1: Write the failing test**

`tests/layers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { lookupLayer, LAYERS } from '../src/lib/layers';

describe('lookupLayer', () => {
  it('정규 레이어명을 조회한다', () => {
    expect(lookupLayer('features')?.name).toBe('features');
    expect(lookupLayer('features')?.rank).toBe(3);
    expect(lookupLayer('shared')?.sliced).toBe(false);
    expect(lookupLayer('widgets')?.sliced).toBe(true);
  });

  it('pages 별칭 views/screens를 pages로 조회한다', () => {
    expect(lookupLayer('views')?.name).toBe('pages');
    expect(lookupLayer('screens')?.name).toBe('pages');
    expect(lookupLayer('views')?.rank).toBe(1);
  });

  it('알 수 없는 폴더명은 null', () => {
    expect(lookupLayer('utils')).toBeNull();
    expect(lookupLayer('src')).toBeNull();
  });

  it('LAYERS는 rank 오름차순', () => {
    const ranks = LAYERS.map((l) => l.rank);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/layers.test.ts`
Expected: FAIL (`layers` 모듈 없음)

- [ ] **Step 3: Write minimal implementation**

`src/lib/types.ts`:
```ts
export interface FsdLocation {
  layer: string;
  rank: number;
  sliced: boolean;
  slice: string | null;
  segment: string | null;
  depth: number;
  folderName: string;
}
```

`src/lib/layers.ts`:
```ts
export interface LayerDef {
  name: string;
  aliases: string[];
  rank: number;
  sliced: boolean;
}

export const LAYERS: LayerDef[] = [
  { name: 'app', aliases: [], rank: 0, sliced: false },
  { name: 'pages', aliases: ['views', 'screens'], rank: 1, sliced: true },
  { name: 'widgets', aliases: [], rank: 2, sliced: true },
  { name: 'features', aliases: [], rank: 3, sliced: true },
  { name: 'entities', aliases: [], rank: 4, sliced: true },
  { name: 'shared', aliases: [], rank: 5, sliced: false },
];

const BY_FOLDER = new Map<string, LayerDef>();
for (const layer of LAYERS) {
  BY_FOLDER.set(layer.name, layer);
  for (const alias of layer.aliases) BY_FOLDER.set(alias, layer);
}

export function lookupLayer(folderName: string): LayerDef | null {
  return BY_FOLDER.get(folderName) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/layers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/lib/types.ts packages/eslint-plugin-fsd/src/lib/layers.ts packages/eslint-plugin-fsd/tests/layers.test.ts
git commit -m "feat: FSD 레이어 모델과 lookupLayer 구현"
```

---

## Task 3: 경로 파싱 (`lib/parse-path.ts`)

**Files:**
- Create: `packages/eslint-plugin-fsd/src/lib/parse-path.ts`
- Test: `packages/eslint-plugin-fsd/tests/parse-path.test.ts`

**Interfaces:**
- Consumes: `lookupLayer`, `LayerDef` (Task 2), `FsdLocation` (Task 2)
- Produces:
  - `function findFsdRoot(absPath: string): string | null` — FSD 루트 절대경로, 없으면 null
  - `function parsePath(absPath: string): FsdLocation | null` — FSD 좌표, FSD 밖이면 null

동작 규칙(스펙 §4.1/§4.2):
- `findFsdRoot`: 경로 세그먼트에 `src`가 있으면 **마지막** `src`까지가 루트. 없으면 **top-most** 레이어명(정규/별칭) 세그먼트의 부모가 루트. 둘 다 없으면 null.
- `parsePath`: 루트 다음 첫 세그먼트가 레이어(정규/별칭)여야 FSD. sliced면 `slice=rel[1]`, `segment=rel[2]`; non-sliced(app/shared)면 `slice=null`, `segment=rel[1]`. `depth=rel.length`.
- POSIX/Windows 구분자 모두 처리: 내부에서 `/`로 정규화 후 분해.

- [ ] **Step 1: Write the failing test**

`tests/parse-path.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findFsdRoot, parsePath } from '../src/lib/parse-path';

describe('findFsdRoot', () => {
  it('src 세그먼트가 있으면 마지막 src까지가 루트', () => {
    expect(findFsdRoot('/proj/src/features/auth/ui/x.ts')).toBe('/proj/src');
  });
  it('중첩 src는 마지막 src 기준', () => {
    expect(findFsdRoot('/proj/packages/web/src/entities/user/index.ts')).toBe(
      '/proj/packages/web/src',
    );
  });
  it('src가 없으면 top-most 레이어의 부모가 루트', () => {
    expect(findFsdRoot('/proj/features/auth/ui/x.ts')).toBe('/proj');
  });
  it('레이어도 src도 없으면 null', () => {
    expect(findFsdRoot('/proj/lib/helpers/x.ts')).toBeNull();
  });
});

describe('parsePath', () => {
  it('sliced 레이어를 layer/slice/segment로 파싱', () => {
    expect(parsePath('/proj/src/features/auth/ui/Form.tsx')).toMatchObject({
      layer: 'features', rank: 3, sliced: true, slice: 'auth', segment: 'ui', depth: 4,
    });
  });
  it('shared는 slice=null, segment=첫 단계', () => {
    expect(parsePath('/proj/src/shared/ui/Button.tsx')).toMatchObject({
      layer: 'shared', sliced: false, slice: null, segment: 'ui', depth: 3,
    });
  });
  it('별칭 views/screens를 pages로 인식', () => {
    expect(parsePath('/proj/src/views/home/index.ts')?.layer).toBe('pages');
    expect(parsePath('/proj/src/screens/home/index.ts')?.layer).toBe('pages');
    expect(parsePath('/proj/src/views/home/index.ts')?.folderName).toBe('views');
  });
  it('슬라이스명이 shared여도 features로 결정적 파싱', () => {
    expect(parsePath('/proj/src/features/shared/ui/x.ts')).toMatchObject({
      layer: 'features', slice: 'shared', segment: 'ui',
    });
  });
  it('src 밖 라우팅 폴더(루트 app/pages)는 파싱하되 src 앵커로 걸러짐', () => {
    // src가 있는 프로젝트의 루트 라우팅 파일: 이 경로 자체엔 src가 없으므로 no-src 폴백으로 app 레이어가 됨.
    // 오탐 방지는 rule 레벨(대상이 src 기준으로 해석됨)에서 검증하지만, 여기서는 파싱 결과만 확인.
    expect(parsePath('/proj/app/products/page.tsx')?.layer).toBe('app');
  });
  it('레이어 아닌 첫 세그먼트는 null', () => {
    expect(parsePath('/proj/src/utils/x.ts')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/parse-path.test.ts`
Expected: FAIL (`parse-path` 모듈 없음)

- [ ] **Step 3: Write minimal implementation**

`src/lib/parse-path.ts`:
```ts
import type { FsdLocation } from './types';
import { lookupLayer } from './layers';

function toSegments(absPath: string): string[] {
  return absPath.replace(/\\/g, '/').split('/').filter(Boolean);
}

export function findFsdRoot(absPath: string): string | null {
  const segments = toSegments(absPath);
  const lastSrc = segments.lastIndexOf('src');
  if (lastSrc !== -1) {
    return '/' + segments.slice(0, lastSrc + 1).join('/');
  }
  const layerIdx = segments.findIndex((seg) => lookupLayer(seg) !== null);
  if (layerIdx > 0) {
    return '/' + segments.slice(0, layerIdx).join('/');
  }
  if (layerIdx === 0) {
    return ''; // 레이어가 최상위(루트)인 경우
  }
  return null;
}

export function parsePath(absPath: string): FsdLocation | null {
  const root = findFsdRoot(absPath);
  if (root === null) return null;
  const rootSegs = toSegments(root);
  const allSegs = toSegments(absPath);
  const rel = allSegs.slice(rootSegs.length);
  if (rel.length === 0) return null;

  const folderName = rel[0]!;
  const layer = lookupLayer(folderName);
  if (layer === null) return null;

  const slice = layer.sliced ? (rel[1] ?? null) : null;
  const segment = layer.sliced ? (rel[2] ?? null) : (rel[1] ?? null);

  return {
    layer: layer.name,
    rank: layer.rank,
    sliced: layer.sliced,
    slice,
    segment,
    depth: rel.length,
    folderName,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/parse-path.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/lib/parse-path.ts packages/eslint-plugin-fsd/tests/parse-path.test.ts
git commit -m "feat: FSD 경로 파싱(findFsdRoot/parsePath) 구현"
```

---

## Task 4: import 해석 (`lib/resolve-import.ts`)

**Files:**
- Create: `packages/eslint-plugin-fsd/src/lib/resolve-import.ts`
- Test: `packages/eslint-plugin-fsd/tests/resolve-import.test.ts`

**Interfaces:**
- Consumes: `findFsdRoot` (Task 3)
- Produces:
  - `function resolveImport(source: string, importerAbsPath: string, aliases: string[]): string | null`
  - 상대경로는 importer 디렉토리 기준 정규화. alias(프리픽스 일치)는 importer의 FSD 루트에 이어붙임. 그 외(외부 패키지)는 null.

동작 규칙(스펙 §4.3):
- `./`, `../` → importer dir 기준 POSIX 정규화(`..` 처리 포함).
- alias 매칭: source가 `<alias>` 또는 `<alias>/...` 형태(예: `@`, `@/x`, `~/x`). 프리픽스 제거 후 나머지를 FSD 루트에 join.
- alias base = `findFsdRoot(importerAbsPath)`; null이면 null 반환.
- 매칭 안 되는 bare import(`react`, `lodash`)는 null.

- [ ] **Step 1: Write the failing test**

`tests/resolve-import.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveImport } from '../src/lib/resolve-import';

const importer = '/proj/src/features/auth/ui/Form.tsx';
const aliases = ['@', '~'];

describe('resolveImport', () => {
  it('상대경로를 importer 기준으로 해석', () => {
    expect(resolveImport('./Button', importer, aliases)).toBe(
      '/proj/src/features/auth/ui/Button',
    );
    expect(resolveImport('../model/store', importer, aliases)).toBe(
      '/proj/src/features/auth/model/store',
    );
  });
  it('@ alias를 FSD 루트(src) 기준으로 해석', () => {
    expect(resolveImport('@/entities/user', importer, aliases)).toBe(
      '/proj/src/entities/user',
    );
    expect(resolveImport('~/shared/ui', importer, aliases)).toBe(
      '/proj/src/shared/ui',
    );
  });
  it('외부 패키지는 null', () => {
    expect(resolveImport('react', importer, aliases)).toBeNull();
    expect(resolveImport('@scope/pkg', importer, aliases)).toBeNull();
  });
});
```

> 참고: `@scope/pkg`는 alias `@` 뒤에 `/`가 아니라 `scope`가 바로 붙으므로 alias로 오인하면 안 된다. 매칭은 `source === alias || source.startsWith(alias + '/')`로 한정한다. `@` alias의 경우 `@/...`만 매칭되고 `@scope/...`는 매칭되지 않는다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/resolve-import.test.ts`
Expected: FAIL (`resolve-import` 모듈 없음)

- [ ] **Step 3: Write minimal implementation**

`src/lib/resolve-import.ts`:
```ts
import { findFsdRoot } from './parse-path';

function dirname(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx <= 0 ? '/' : norm.slice(0, idx);
}

function normalize(p: string): string {
  const segs = p.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

export function resolveImport(
  source: string,
  importerAbsPath: string,
  aliases: string[],
): string | null {
  if (source.startsWith('./') || source.startsWith('../')) {
    return normalize(dirname(importerAbsPath) + '/' + source);
  }
  for (const alias of aliases) {
    if (source === alias || source.startsWith(alias + '/')) {
      const base = findFsdRoot(importerAbsPath);
      if (base === null) return null;
      const rest = source.slice(alias.length).replace(/^\//, '');
      return normalize(base + '/' + rest);
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/resolve-import.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/lib/resolve-import.ts packages/eslint-plugin-fsd/tests/resolve-import.test.ts
git commit -m "feat: import 소스 해석(resolveImport) 구현"
```

---

## Task 5: rule 공통 헬퍼 (`lib/create-rule.ts`)

**Files:**
- Create: `packages/eslint-plugin-fsd/src/lib/create-rule.ts`
- Test: `packages/eslint-plugin-fsd/tests/create-rule.test.ts`

**Interfaces:**
- Consumes: `parsePath` (Task 3), `resolveImport` (Task 4), `FsdLocation` (Task 2)
- Produces:
  - `interface ImportCheckContext { from: FsdLocation; to: FsdLocation; source: string; }`
  - `function createImportRule(opts: { messages: Record<string,string>; meta: { docs: string }; check: (ctx: ImportCheckContext) => { messageId: string; data?: Record<string,string> } | null; }): Rule.RuleModule`
  - 헬퍼가 `ImportDeclaration`/`ImportExpression`/re-export(`ExportNamedDeclaration`,`ExportAllDeclaration`)의 `source`를 순회하며, importer/target을 파싱해 둘 다 FSD면 `check` 호출, 반환된 messageId로 `context.report`.

동작 규칙:
- importer 절대경로 = `context.filename` (ESLint v9). 
- rule option[0].alias(기본 `['@','~']`) 읽어 `resolveImport`에 전달.
- importer parse가 null이면 즉시 skip(파일 전체 FSD 밖). target 해석/parse가 null이면 해당 import skip.

- [ ] **Step 1: Write the failing test**

`tests/create-rule.test.ts`:
```ts
import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { createImportRule } from '../src/lib/create-rule';

RuleTester.it = it as unknown as typeof RuleTester.it;

// 테스트용 rule: from.rank > to.rank 이면(하위→상위) 리포트
const testRule = createImportRule({
  meta: { docs: '테스트' },
  messages: { hit: 'hit {{ fromLayer }}->{{ toLayer }}' },
  check: ({ from, to }) =>
    to.rank < from.rank ? { messageId: 'hit', data: { fromLayer: from.layer, toLayer: to.layer } } : null,
});

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('test-rule', testRule, {
  valid: [
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import { u } from '@/entities/user';",
      options: [{ alias: ['@'] }],
    },
    {
      // importer가 FSD 밖 → skip
      filename: '/proj/config/x.ts',
      code: "import { a } from '@/features/auth';",
      options: [{ alias: ['@'] }],
    },
  ],
  invalid: [
    {
      filename: '/proj/src/entities/user/ui/x.ts',
      code: "import { a } from '@/features/auth';",
      options: [{ alias: ['@'] }],
      errors: [{ messageId: 'hit' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/create-rule.test.ts`
Expected: FAIL (`create-rule` 모듈 없음)

- [ ] **Step 3: Write minimal implementation**

`src/lib/create-rule.ts`:
```ts
import type { Rule } from 'eslint';
import type { FsdLocation } from './types';
import { parsePath } from './parse-path';
import { resolveImport } from './resolve-import';

export interface ImportCheckContext {
  from: FsdLocation;
  to: FsdLocation;
  source: string;
}

interface CreateImportRuleOptions {
  meta: { docs: string };
  messages: Record<string, string>;
  check: (
    ctx: ImportCheckContext,
  ) => { messageId: string; data?: Record<string, string> } | null;
}

const DEFAULT_ALIASES = ['@', '~'];

export function createImportRule(opts: CreateImportRuleOptions): Rule.RuleModule {
  return {
    meta: {
      type: 'problem',
      docs: { description: opts.meta.docs },
      schema: [
        {
          type: 'object',
          properties: { alias: { type: 'array', items: { type: 'string' } } },
          additionalProperties: false,
        },
      ],
      messages: opts.messages,
    },
    create(context) {
      const importer = context.filename;
      const from = parsePath(importer);
      if (from === null) return {};

      const option = (context.options[0] ?? {}) as { alias?: string[] };
      const aliases = option.alias ?? DEFAULT_ALIASES;

      function handle(node: { source?: { value?: unknown } | null }): void {
        const src = node.source?.value;
        if (typeof src !== 'string') return;
        const targetPath = resolveImport(src, importer, aliases);
        if (targetPath === null) return;
        const to = parsePath(targetPath);
        if (to === null) return;
        const result = opts.check({ from: from!, to, source: src });
        if (result) {
          context.report({
            node: node as never,
            messageId: result.messageId,
            data: result.data,
          });
        }
      }

      return {
        ImportDeclaration: handle,
        ImportExpression: (node) =>
          handle({ source: (node as { source?: { value?: unknown } }).source }),
        ExportNamedDeclaration: handle,
        ExportAllDeclaration: handle,
      };
    },
  };
}
```

> 참고: `ImportExpression`(동적 import)의 source는 리터럴일 때만 처리된다. `context.filename`은 ESLint v9 표준. 구버전 호환이 필요하면 `context.getFilename()` 폴백을 추가할 수 있으나 v0.1은 v9 전용.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/create-rule.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/lib/create-rule.ts packages/eslint-plugin-fsd/tests/create-rule.test.ts
git commit -m "feat: rule 공통 헬퍼 createImportRule 구현"
```

---

## Task 6: `no-higher-level-imports` rule

**Files:**
- Create: `packages/eslint-plugin-fsd/src/rules/no-higher-level-imports.ts`
- Test: `packages/eslint-plugin-fsd/tests/no-higher-level-imports.test.ts`

**Interfaces:**
- Consumes: `createImportRule`, `ImportCheckContext` (Task 5)
- Produces: `default` export = `Rule.RuleModule`. messageId `higherLevel`.

판정(스펙 §5.1): `to.rank < from.rank` 이면 위반.

- [ ] **Step 1: Write the failing test**

`tests/no-higher-level-imports.test.ts`:
```ts
import { it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-higher-level-imports';

RuleTester.it = it as unknown as typeof RuleTester.it;
const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('no-higher-level-imports', rule, {
  valid: [
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user';" },
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/shared/ui';" },
    { filename: '/proj/src/app/providers/x.ts', code: "import '@/pages/home';" },
    // 외부 패키지 무시
    { filename: '/proj/src/entities/user/ui/x.ts', code: "import 'react';" },
  ],
  invalid: [
    {
      filename: '/proj/src/entities/user/ui/x.ts',
      code: "import '@/features/auth';",
      errors: [{ messageId: 'higherLevel' }],
    },
    {
      filename: '/proj/src/shared/ui/x.ts',
      code: "import '@/entities/user';",
      errors: [{ messageId: 'higherLevel' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/no-higher-level-imports.test.ts`
Expected: FAIL (rule 모듈 없음)

- [ ] **Step 3: Write minimal implementation**

`src/rules/no-higher-level-imports.ts`:
```ts
import { createImportRule } from '../lib/create-rule';

export default createImportRule({
  meta: { docs: '자신보다 상위 레이어를 import하지 못하게 한다' },
  messages: {
    higherLevel:
      '"{{ fromLayer }}" 레이어는 상위 레이어 "{{ toLayer }}"을(를) import할 수 없습니다.',
  },
  check: ({ from, to }) =>
    to.rank < from.rank
      ? { messageId: 'higherLevel', data: { fromLayer: from.folderName, toLayer: to.folderName } }
      : null,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/no-higher-level-imports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/rules/no-higher-level-imports.ts packages/eslint-plugin-fsd/tests/no-higher-level-imports.test.ts
git commit -m "feat: no-higher-level-imports rule 구현"
```

---

## Task 7: `no-cross-imports` rule

**Files:**
- Create: `packages/eslint-plugin-fsd/src/rules/no-cross-imports.ts`
- Test: `packages/eslint-plugin-fsd/tests/no-cross-imports.test.ts`

**Interfaces:**
- Consumes: `createImportRule` (Task 5)
- Produces: `default` export = `Rule.RuleModule`. messageId `crossImport`.

판정(스펙 §5.2): `from.layer === to.layer && from.sliced && from.slice != null && to.slice != null && from.slice !== to.slice`.

- [ ] **Step 1: Write the failing test**

`tests/no-cross-imports.test.ts`:
```ts
import { it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-cross-imports';

RuleTester.it = it as unknown as typeof RuleTester.it;
const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('no-cross-imports', rule, {
  valid: [
    // 같은 슬라이스 내부 상대 import
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '../model/store';" },
    // 다른 레이어는 대상 아님
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user';" },
    // shared는 슬라이스 없음
    { filename: '/proj/src/shared/ui/x.ts', code: "import '@/shared/lib';" },
  ],
  invalid: [
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/features/cart';",
      errors: [{ messageId: 'crossImport' }],
    },
    {
      filename: '/proj/src/entities/user/ui/x.ts',
      code: "import '@/entities/product';",
      errors: [{ messageId: 'crossImport' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/no-cross-imports.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`src/rules/no-cross-imports.ts`:
```ts
import { createImportRule } from '../lib/create-rule';

export default createImportRule({
  meta: { docs: '같은 레이어의 형제 슬라이스 간 직접 import를 금지한다' },
  messages: {
    crossImport:
      '"{{ layer }}" 레이어의 슬라이스 "{{ fromSlice }}"는 형제 슬라이스 "{{ toSlice }}"를 직접 import할 수 없습니다.',
  },
  // 확장 지점: @x cross-import 예외는 여기서 to.slice가 허용 목록이면 통과시키도록 확장.
  check: ({ from, to }) => {
    if (
      from.layer === to.layer &&
      from.sliced &&
      from.slice != null &&
      to.slice != null &&
      from.slice !== to.slice
    ) {
      return {
        messageId: 'crossImport',
        data: { layer: from.layer, fromSlice: from.slice, toSlice: to.slice },
      };
    }
    return null;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/no-cross-imports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/rules/no-cross-imports.ts packages/eslint-plugin-fsd/tests/no-cross-imports.test.ts
git commit -m "feat: no-cross-imports rule 구현"
```

---

## Task 8: `no-public-api-sidestep` rule

**Files:**
- Create: `packages/eslint-plugin-fsd/src/rules/no-public-api-sidestep.ts`
- Test: `packages/eslint-plugin-fsd/tests/no-public-api-sidestep.test.ts`

**Interfaces:**
- Consumes: `createImportRule` (Task 5)
- Produces: `default` export = `Rule.RuleModule`. messageId `sidestep`.

판정(스펙 §5.3):
- 같은 슬라이스 내부(`from.layer===to.layer && from.slice!=null && from.slice===to.slice`)면 통과.
- 그 외: 대상이 진입점보다 깊으면 위반. 진입점 depth는 sliced/shared 공통으로 2(`layer/slice` 또는 `shared/segment`). 즉 `to.depth > 2` 이면 위반.
- app 대상은 §5.1에서 이미 걸러지므로 여기선 자연히 통과(app import는 상위참조).

- [ ] **Step 1: Write the failing test**

`tests/no-public-api-sidestep.test.ts`:
```ts
import { it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-public-api-sidestep';

RuleTester.it = it as unknown as typeof RuleTester.it;
const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('no-public-api-sidestep', rule, {
  valid: [
    // 슬라이스 진입점
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user';" },
    // shared 세그먼트 진입점
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/shared/ui';" },
    // 같은 슬라이스 내부 깊은 상대 import
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '../model/store';" },
  ],
  invalid: [
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/entities/user/model/store';",
      errors: [{ messageId: 'sidestep' }],
    },
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/shared/ui/Button';",
      errors: [{ messageId: 'sidestep' }],
    },
  ],
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/no-public-api-sidestep.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`src/rules/no-public-api-sidestep.ts`:
```ts
import { createImportRule } from '../lib/create-rule';

export default createImportRule({
  meta: { docs: '다른 슬라이스/세그먼트의 내부 경로 직접 import를 금지한다(Public API 강제)' },
  messages: {
    sidestep:
      '"{{ target }}"의 내부 경로를 직접 import했습니다. Public API(진입점)를 통해 접근하세요.',
  },
  check: ({ from, to }) => {
    const sameSlice =
      from.layer === to.layer && from.slice != null && from.slice === to.slice;
    if (sameSlice) return null;
    if (to.depth > 2) {
      const target = to.slice ?? to.segment ?? to.layer;
      return { messageId: 'sidestep', data: { target: `${to.folderName}/${target}` } };
    }
    return null;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/no-public-api-sidestep.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/rules/no-public-api-sidestep.ts packages/eslint-plugin-fsd/tests/no-public-api-sidestep.test.ts
git commit -m "feat: no-public-api-sidestep rule 구현"
```

---

## Task 9: 플러그인 진입점 + recommended 프리셋

**Files:**
- Create: `packages/eslint-plugin-fsd/src/configs/recommended.ts`
- Modify: `packages/eslint-plugin-fsd/src/index.ts` (stub 대체)
- Test: `packages/eslint-plugin-fsd/tests/index.test.ts`

**Interfaces:**
- Consumes: 3개 rule (Task 6-8)
- Produces: `default` export plugin 객체. `plugin.rules['no-higher-level-imports' | 'no-cross-imports' | 'no-public-api-sidestep']`, `plugin.configs.recommended` (flat config).

- [ ] **Step 1: Write the failing test**

`tests/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import plugin from '../src/index';

describe('plugin 진입점', () => {
  it('3개 rule을 노출한다', () => {
    expect(Object.keys(plugin.rules).sort()).toEqual([
      'no-cross-imports',
      'no-higher-level-imports',
      'no-public-api-sidestep',
    ]);
  });
  it('recommended 프리셋이 fsd/ 규칙을 error로 켠다', () => {
    const rec = plugin.configs.recommended;
    expect(rec.plugins.fsd).toBe(plugin);
    expect(rec.rules['fsd/no-higher-level-imports']).toBe('error');
    expect(rec.rules['fsd/no-cross-imports']).toBe('error');
    expect(rec.rules['fsd/no-public-api-sidestep']).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/index.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`src/index.ts`:
```ts
import type { Rule } from 'eslint';
import noHigherLevelImports from './rules/no-higher-level-imports';
import noCrossImports from './rules/no-cross-imports';
import noPublicApiSidestep from './rules/no-public-api-sidestep';

interface FsdPlugin {
  meta: { name: string; version: string };
  rules: Record<string, Rule.RuleModule>;
  configs: {
    recommended: {
      plugins: { fsd: FsdPlugin };
      rules: Record<string, 'error' | 'warn' | 'off'>;
    };
  };
}

const plugin = {
  meta: { name: 'eslint-plugin-fsd', version: '0.1.0' },
  rules: {
    'no-higher-level-imports': noHigherLevelImports,
    'no-cross-imports': noCrossImports,
    'no-public-api-sidestep': noPublicApiSidestep,
  },
  configs: {} as FsdPlugin['configs'],
} as FsdPlugin;

plugin.configs.recommended = {
  plugins: { fsd: plugin },
  rules: {
    'fsd/no-higher-level-imports': 'error',
    'fsd/no-cross-imports': 'error',
    'fsd/no-public-api-sidestep': 'error',
  },
};

export default plugin;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/eslint-plugin-fsd/tests/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/eslint-plugin-fsd/src/index.ts packages/eslint-plugin-fsd/src/configs/recommended.ts packages/eslint-plugin-fsd/tests/index.test.ts
git commit -m "feat: 플러그인 진입점과 recommended 프리셋 구성"
```

> `configs/recommended.ts`는 순환 참조(플러그인 self-reference)를 피하기 위해 v0.1에서는 `index.ts`에 인라인한다. 파일은 생성하되 향후 확장용 주석 stub(`export {};`)만 두거나, 원하면 이 파일 생성을 생략하고 index.ts만 커밋한다.

---

## Task 10: README + 전체 통합 검증

**Files:**
- Create: `packages/eslint-plugin-fsd/README.md`
- Test: 전체 `pnpm test`, `pnpm build`

**Interfaces:**
- Consumes: 전체 패키지
- Produces: 사용 문서 + green 빌드/테스트.

- [ ] **Step 1: README 작성**

`packages/eslint-plugin-fsd/README.md` (핵심 사용법):
````markdown
# eslint-plugin-fsd

Feature-Sliced Design 구조를 강제하는 ESLint 플러그인 (ESLint v9 flat config).

## 설치

```bash
pnpm add -D eslint-plugin-fsd
```

## 사용

```js
// eslint.config.js
import fsd from 'eslint-plugin-fsd';

export default [
  fsd.configs.recommended,
];
```

개별 규칙 + alias 커스터마이즈:

```js
import fsd from 'eslint-plugin-fsd';

export default [
  {
    plugins: { fsd },
    rules: {
      'fsd/no-higher-level-imports': 'error',
      'fsd/no-cross-imports': 'error',
      'fsd/no-public-api-sidestep': ['error', { alias: ['@', '~'] }],
    },
  },
];
```

## 규칙

| 규칙 | 강제 내용 |
|------|-----------|
| `no-higher-level-imports` | 상위 레이어 import 금지 (레이어 방향) |
| `no-cross-imports` | 같은 레이어 형제 슬라이스 import 금지 |
| `no-public-api-sidestep` | 다른 슬라이스/세그먼트 내부 경로 직접 import 금지 |

## 규약

- 레이어: `app > pages > widgets > features > entities > shared`
- `pages` 레이어 별칭: `views`, `screens` (Next.js 라우팅 폴더 충돌 회피)
- FSD 루트는 `src/`로 자동 인식. **Next.js 프로젝트는 `src/` 레이아웃 사용 권장** (루트 라우팅 `app/`·`pages/` 오탐 방지)
- alias 기본값 `@`, `~` → FSD 루트(src) 기준 해석
````

- [ ] **Step 2: 전체 테스트 실행**

Run: `pnpm test`
Expected: 모든 테스트 PASS (layers, parse-path, resolve-import, create-rule, 3 rules, index)

- [ ] **Step 3: 빌드 검증**

Run: `pnpm build`
Expected: `packages/eslint-plugin-fsd/dist/index.js` + `index.d.ts` 생성, 에러 없음

- [ ] **Step 4: Commit**

```bash
git add packages/eslint-plugin-fsd/README.md
git commit -m "docs: eslint-plugin-fsd README 추가"
```

---

## Self-Review 결과

**Spec coverage:**
- §3 레이어 모델 → Task 2 ✓
- §4.1 findFsdRoot / §4.2 parsePath → Task 3 ✓
- §4.3 resolveImport → Task 4 ✓
- §5.1/5.2/5.3 rule 3개 → Task 6/7/8 ✓
- §6 index+recommended → Task 9 ✓
- §7 빌드/테스트/README → Task 1(빌드셋업)/Task 10 ✓
- 필수 회귀 케이스(§7): Next.js 오탐(parse-path.test + rule valid 케이스), 별칭, 결정적 파싱 모두 테스트에 포함 ✓

**Type consistency:** `FsdLocation`(layer/rank/sliced/slice/segment/depth/folderName), `LayerDef`, `lookupLayer`, `findFsdRoot`, `parsePath`, `resolveImport(source, importer, aliases)`, `createImportRule`, `ImportCheckContext(from,to,source)` — Task 간 시그니처 일관 ✓

**알려진 한계(스펙 §4.1 명시):** `src/` 없이 루트 레이어 + Pages Router 루트 `pages/` 병용 시 오탐 가능 → README에서 `src/` 레이아웃 권장으로 대응.
