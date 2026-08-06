# CI 자동 버전 올림과 게시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `main`에 push되면 GitHub Actions가 검증하고, 바뀐 축의 버전을 올리고, 게시한다.

**Architecture:** 릴리스 판정을 **테스트되는 순수 함수**로 두고 워크플로는 그것을 호출만 한다. Node 24가 `.ts`를 네이티브로 실행하므로(실측 확인) 빌드도 별도 패키지도 필요 없다. 두 축(설정 6개 락스텝 / CLI 단독)을 독립으로 굴린다.

**Tech Stack:** TypeScript (ESM, strict), vitest, GitHub Actions, pnpm, Node 24 type stripping

## Global Constraints

- 패키지 매니저는 **pnpm**. `npm`을 쓰지 않는다(레지스트리 조회용 `npm view` 제외).
- TypeScript strict mode, 2-space 들여쓰기.
- **주석은 한국어이며 "왜"(결정의 근거·실측 사실)를 적는다.**
- **검증은 `pnpm lint:ox`와 `pnpm lint:es`를 둘 다** 돌린다. `eslint-plugin-oxlint`가 겹치는 규칙을 ESLint 쪽에서 끄므로 `no-unused-vars` 같은 것은 oxlint에만 산다.
- **기준선(이 계획 시작 시점): `pnpm test` 45파일/398개, `pnpm typecheck` 7/7, `pnpm lint:ox` 에러 0·warning 3, `pnpm lint:es` 8/8, `pnpm test:e2e` 13/13.**
- **`docs/superpowers/**`와 `work-log.md`의 기존 줄을 수정하지 않는다.** 추가만 한다.
- **`pnpm publish`를 어떤 형태로도 실행하지 않는다.** 이 계획은 게시 자동화를 **만들 뿐** 게시하지 않는다.
- 커밋 메시지는 imperative mood, 한국어. **heredoc으로 넘길 때 코드펜스(```)가 메시지에 섞이지 않게 하고, 커밋 후 `git log -1`로 확인한다.**
- **검증용 산출물을 저장소 안에 만들지 마라** — `$(mktemp -d)`를 쓴다. 자동 커밋 훅이 저장소 루트의 새 디렉토리를 커밋해 버린 전례가 있다.

## 핵심 제약 — 파일을 self-contained로 유지하라

Node의 타입 스트리핑은 **import 경로를 재작성하지 않는다.** 이 저장소는 `./foo.js`로 import하고 디스크에는 `foo.ts`가 있으므로, `node`로 직접 실행하는 파일이 로컬 모듈을 import하면 **런타임에 깨진다.**

따라서 **`src/release/` 아래 두 파일은 각각 로컬 import 없이 자립해야 한다.** 서로도 import하지 않는다. 워크플로가 둘을 따로 부르고 값을 인자로 넘긴다.

`node:` 내장 모듈 import는 안전하다.

---

## File Structure

| 파일 | 책임 | 태스크 |
| --- | --- | --- |
| `packages/devkit-cli/src/release/decide.ts` (신설) | 커밋 → 축별 올림 크기 판정. 순수 함수 + 직접 실행 `main` | 1 |
| `packages/devkit-cli/tests/release-decide.test.ts` (신설) | 판정 규칙 고정 | 1 |
| `packages/devkit-cli/src/release/apply.ts` (신설) | 버전 계산과 파일 갱신. 순수 함수 + 직접 실행 `main` | 2 |
| `packages/devkit-cli/tests/release-apply.test.ts` (신설) | 버전·범위 규칙 고정 | 2 |
| `packages/*/package.json` (6개) | 부트스트랩 — 설정 축을 `0.1.1`로 정렬 | 3 |
| `.github/workflows/release.yml` (신설) | 판정 → 검증 → 갱신 → 게시 → 커밋·태그 | 4 |
| `README.md`, `packages/devkit-cli/README.md`, `work-log.md` | 릴리스 절차 문서화 | 5 |

---

### Task 1: 릴리스 판정

**Files:**
- Create: `packages/devkit-cli/src/release/decide.ts`
- Create: `packages/devkit-cli/tests/release-decide.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export type Bump = 'major' | 'minor' | 'patch'`
  - `export type Axis = 'config' | 'cli'`
  - `export interface CommitInfo { subject: string; body: string; files: string[] }`
  - `export interface ReleaseDecision { config: Bump | null; cli: Bump | null }`
  - `export function isReleasePath(relPath: string): boolean`
  - `export function axisOf(relPath: string): Axis | null`
  - `export function bumpOf(commit: CommitInfo): Bump | null`
  - `export function decideRelease(commits: CommitInfo[]): ReleaseDecision`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/release-decide.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  axisOf,
  bumpOf,
  decideRelease,
  isReleasePath,
  type CommitInfo,
} from '../src/release/decide.js';

function commit(subject: string, files: string[], body = ''): CommitInfo {
  return { subject, body, files };
}

describe('isReleasePath', () => {
  it('게시되는 것에 영향을 주는 변경만 센다', () => {
    expect(isReleasePath('packages/tsconfig/base.json')).toBe(true);
    expect(isReleasePath('packages/devkit-cli/src/bin.ts')).toBe(true);
    expect(isReleasePath('packages/devkit-cli/templates/nest/CLAUDE.md')).toBe(true);
  });

  it('tarball 에 안 들어가거나 동작을 안 바꾸는 것은 세지 않는다', () => {
    // 테스트·설정은 files 화이트리스트 밖이고, README 는 실려도 동작이 같다.
    expect(isReleasePath('packages/devkit-cli/tests/bin.test.ts')).toBe(false);
    expect(isReleasePath('packages/tsconfig/README.md')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/eslint.config.mjs')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/vitest.config.ts')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/tsup.config.ts')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/tsconfig.json')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/turbo.json')).toBe(false);
  });
});

describe('axisOf', () => {
  it('devkit-cli 는 cli 축이다', () => {
    expect(axisOf('packages/devkit-cli/src/bin.ts')).toBe('cli');
  });

  it('나머지 패키지는 config 축이다', () => {
    expect(axisOf('packages/tsconfig/base.json')).toBe('config');
    expect(axisOf('packages/vitest-config/next.js')).toBe('config');
  });

  it('패키지 밖은 어느 축도 아니다 — 루트 변경으로 릴리스하지 않는다', () => {
    expect(axisOf('turbo.json')).toBe(null);
    expect(axisOf('docs/superpowers/specs/x.md')).toBe(null);
  });
});

describe('bumpOf', () => {
  it('접두로 크기를 정한다', () => {
    expect(bumpOf(commit('feat: 무엇을 더한다', []))).toBe('minor');
    expect(bumpOf(commit('fix: 무엇을 고친다', []))).toBe('patch');
    expect(bumpOf(commit('refactor: 정리한다', []))).toBe('patch');
    expect(bumpOf(commit('build: 스크립트를 바꾼다', []))).toBe('patch');
  });

  it('문서·테스트·잡무는 릴리스를 부르지 않는다', () => {
    expect(bumpOf(commit('docs: 문서를 쓴다', []))).toBe(null);
    expect(bumpOf(commit('test: 테스트를 더한다', []))).toBe(null);
    expect(bumpOf(commit('chore: 정리', []))).toBe(null);
  });

  it('BREAKING CHANGE 는 major 다 — 본문에도 제목의 ! 에도 반응한다', () => {
    expect(bumpOf(commit('feat: 바꾼다', [], 'BREAKING CHANGE: 시그니처가 바뀐다'))).toBe('major');
    expect(bumpOf(commit('feat!: 바꾼다', []))).toBe('major');
  });

  it('아는 접두가 아니면 릴리스하지 않는다 — 병합 커밋 등이 여기 걸린다', () => {
    expect(bumpOf(commit('Merge branch main', []))).toBe(null);
  });
});

describe('decideRelease', () => {
  it('축마다 가장 큰 올림을 고른다', () => {
    const decision = decideRelease([
      commit('fix: cli 를 고친다', ['packages/devkit-cli/src/bin.ts']),
      commit('feat: cli 에 더한다', ['packages/devkit-cli/templates/nest/CLAUDE.md']),
      commit('fix: 설정을 고친다', ['packages/tsconfig/base.json']),
    ]);
    expect(decision).toEqual({ config: 'patch', cli: 'minor' });
  });

  it('설정 패키지 하나만 바뀌어도 config 축 전체가 대상이다 — 락스텝', () => {
    const decision = decideRelease([
      commit('fix: vitest 설정을 고친다', ['packages/vitest-config/next.js']),
    ]);
    expect(decision).toEqual({ config: 'patch', cli: null });
  });

  it('릴리스 대상 경로가 없으면 아무 축도 안 올린다', () => {
    const decision = decideRelease([
      commit('test: 테스트를 더한다', ['packages/devkit-cli/tests/bin.test.ts']),
      commit('docs: 문서를 쓴다', ['README.md']),
    ]);
    expect(decision).toEqual({ config: null, cli: null });
  });

  it('경로는 걸렸는데 접두가 릴리스를 안 부르면 올리지 않는다', () => {
    // 이 갈래가 없으면 docs: 커밋이 소스를 건드릴 때 조용히 릴리스가 난다.
    const decision = decideRelease([
      commit('docs: 주석을 고친다', ['packages/devkit-cli/src/bin.ts']),
    ]);
    expect(decision).toEqual({ config: null, cli: null });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/release-decide.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/release/decide.js"`

- [ ] **Step 3: 구현한다**

`packages/devkit-cli/src/release/decide.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * 릴리스 판정. 이 파일은 **로컬 모듈을 import 하지 않는다** — 워크플로가
 * `node src/release/decide.ts` 로 직접 실행하는데, Node 의 타입 스트리핑은
 * import 경로를 재작성하지 않아 `./x.js`(디스크는 `x.ts`)가 런타임에 깨진다.
 * 자립을 유지할 것.
 */

export type Bump = 'major' | 'minor' | 'patch';
export type Axis = 'config' | 'cli';

export interface CommitInfo {
  subject: string;
  body: string;
  files: string[];
}

export interface ReleaseDecision {
  config: Bump | null;
  cli: Bump | null;
}

/**
 * 게시되는 것에 영향을 주지 않는 경로.
 *
 * 테스트·설정 파일은 `files` 화이트리스트 밖이라 tarball 에 안 들어가고,
 * README 는 실리지만 동작을 바꾸지 않는다. 이것들로 릴리스가 나면 버전만
 * 무의미하게 올라간다.
 */
const IRRELEVANT = [
  /(^|\/)tests\//,
  /(^|\/)README\.md$/,
  /(^|\/)eslint\.config\.mjs$/,
  /(^|\/)vitest(\.e2e)?\.config\.ts$/,
  /(^|\/)tsconfig(\.build)?\.json$/,
  /(^|\/)tsup\.config\.ts$/,
  /(^|\/)turbo\.json$/,
];

export function isReleasePath(relPath: string): boolean {
  return !IRRELEVANT.some((pattern) => pattern.test(relPath));
}

export function axisOf(relPath: string): Axis | null {
  const match = /^packages\/([^/]+)\//.exec(relPath);
  if (match === null) return null;
  return match[1] === 'devkit-cli' ? 'cli' : 'config';
}

/**
 * 접두 → 올림 크기. 아는 접두가 아니면 null 이다 — 병합 커밋처럼 형식을
 * 벗어난 것으로 릴리스가 나지 않게 한다.
 */
const BUMP_BY_TYPE: Record<string, Bump> = {
  feat: 'minor',
  fix: 'patch',
  refactor: 'patch',
  perf: 'patch',
  build: 'patch',
};

export function bumpOf(commit: CommitInfo): Bump | null {
  const match = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(commit.subject);
  if (match === null) return null;
  if (match[2] === '!' || commit.body.includes('BREAKING CHANGE:')) return 'major';
  return BUMP_BY_TYPE[match[1]] ?? null;
}

const ORDER: Record<Bump, number> = { patch: 1, minor: 2, major: 3 };

function larger(a: Bump | null, b: Bump | null): Bump | null {
  if (a === null) return b;
  if (b === null) return a;
  return ORDER[a] >= ORDER[b] ? a : b;
}

export function decideRelease(commits: CommitInfo[]): ReleaseDecision {
  const decision: ReleaseDecision = { config: null, cli: null };
  for (const commit of commits) {
    const bump = bumpOf(commit);
    if (bump === null) continue;
    for (const file of commit.files) {
      if (!isReleasePath(file)) continue;
      const axis = axisOf(file);
      if (axis === null) continue;
      decision[axis] = larger(decision[axis], bump);
    }
  }
  return decision;
}

/** `<since>..HEAD` 의 커밋을 읽는다. `since` 가 비면 전체 이력이다. */
function readCommits(since: string): CommitInfo[] {
  const range = since === '' ? 'HEAD' : `${since}..HEAD`;
  const hashes = execFileSync('git', ['log', '--format=%H', range], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0);

  return hashes.map((hash) => ({
    subject: execFileSync('git', ['log', '-1', '--format=%s', hash], { encoding: 'utf8' }).trim(),
    body: execFileSync('git', ['log', '-1', '--format=%b', hash], { encoding: 'utf8' }),
    files: execFileSync('git', ['show', '--name-only', '--format=', hash], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.length > 0),
  }));
}

// 워크플로가 `node src/release/decide.ts <since-ref>` 로 부르고 JSON 을 읽는다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const decision = decideRelease(readCommits(process.argv[2] ?? ''));
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/release-decide.test.ts
```

Expected: PASS (13 tests)

- [ ] **Step 5: 직접 실행이 되는지 확인한다**

```bash
node packages/devkit-cli/src/release/decide.ts HEAD~3
```

Expected: `{"config":...,"cli":...}` 형태의 JSON 한 줄. **에러 없이 나와야 한다** — 이것이 워크플로가 쓸 경로다.

실패하면 **고쳐서 넘어가지 말고 보고하라.** 로컬 import가 섞였거나 타입 스트리핑이 막힌 것이다.

- [ ] **Step 6: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "feat: 커밋에서 릴리스 축과 올림 크기를 판정한다"
```

Expected: 테스트 46파일/411개(398 + 13).

---

### Task 2: 버전 계산과 갱신

**Files:**
- Create: `packages/devkit-cli/src/release/apply.ts`
- Create: `packages/devkit-cli/tests/release-apply.test.ts`

**Interfaces:**
- Consumes: `Bump` 타입 개념(값은 문자열이라 import하지 않는다 — 이 파일도 자립이다)
- Produces:
  - `export function nextVersion(current: string, bump: 'major' | 'minor' | 'patch'): string`
  - `export function nextRange(currentRange: string, newVersion: string, bump: 'major' | 'minor' | 'patch'): string`

**⚠️ 이 파일도 로컬 import 없이 자립해야 한다** — 워크플로가 `node`로 직접 부른다. `Bump` 타입을 `decide.ts`에서 import하지 말고 리터럴 유니온을 다시 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/release-apply.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextRange, nextVersion } from '../src/release/apply.js';

describe('nextVersion', () => {
  it('patch 는 마지막 자리만 올린다', () => {
    expect(nextVersion('0.1.1', 'patch')).toBe('0.1.2');
  });

  it('minor 는 패치를 0 으로 되돌린다', () => {
    expect(nextVersion('0.1.5', 'minor')).toBe('0.2.0');
  });

  it('major 는 나머지를 0 으로 되돌린다', () => {
    expect(nextVersion('0.2.3', 'major')).toBe('1.0.0');
  });

  it('형식이 아니면 던진다 — 조용히 0.0.1 로 만들지 않는다', () => {
    expect(() => nextVersion('0.1', 'patch')).toThrow(/버전/);
  });
});

describe('nextRange', () => {
  it('patch 면 범위를 그대로 둔다 — 캐럿이 이미 흡수한다', () => {
    expect(nextRange('^0.1.0', '0.1.2', 'patch')).toBe('^0.1.0');
  });

  it('minor 면 새 버전으로 범위를 옮긴다', () => {
    // 이걸 안 하면 생성물이 선언한 범위가 게시본을 못 가리키고
    // registry-version.test.ts 가 다음 실행에서 막는다.
    expect(nextRange('^0.1.0', '0.2.0', 'minor')).toBe('^0.2.0');
  });

  it('major 면 새 버전으로 범위를 옮긴다', () => {
    expect(nextRange('^0.2.0', '1.0.0', 'major')).toBe('^1.0.0');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/release-apply.test.ts
```

Expected: FAIL — 모듈을 못 찾는다.

- [ ] **Step 3: 구현한다**

`packages/devkit-cli/src/release/apply.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 버전 계산과 파일 갱신. `decide.ts` 와 마찬가지로 **로컬 모듈을 import 하지
 * 않는다** — 워크플로가 `node` 로 직접 실행하고, Node 의 타입 스트리핑은
 * import 경로를 재작성하지 않는다.
 */

type Bump = 'major' | 'minor' | 'patch';

export function nextVersion(current: string, bump: Bump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (match === null) {
    throw new Error(`버전이 X.Y.Z 형식이 아닙니다: ${current}`);
  }
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * 생성물이 선언할 범위. 패치는 캐럿이 이미 흡수하므로 그대로 두고,
 * 마이너 이상일 때만 옮긴다 — 옮기지 않으면 registry-version.test.ts 가
 * 다음 실행에서 막는다.
 */
export function nextRange(currentRange: string, newVersion: string, bump: Bump): string {
  return bump === 'patch' ? currentRange : `^${newVersion}`;
}

const CONFIG_PACKAGES = [
  'eslint-config-nest',
  'eslint-plugin-fsd',
  'jest-config',
  'prettier-config',
  'tsconfig',
  'vitest-config',
];

function readVersion(pkgPath: string): string {
  const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string') {
    throw new Error(`${pkgPath} 에 version 문자열이 없습니다.`);
  }
  return parsed.version;
}

/** version 줄만 바꾼다. JSON 을 재직렬화하면 키 순서·포맷이 흔들린다. */
function writeVersion(pkgPath: string, version: string): void {
  const raw = readFileSync(pkgPath, 'utf8');
  const replaced = raw.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
  if (replaced === raw) {
    throw new Error(`${pkgPath} 의 version 줄을 찾지 못했습니다.`);
  }
  writeFileSync(pkgPath, replaced);
}

// 워크플로가 `node src/release/apply.ts <axis> <bump>` 로 부르고 새 버전을 읽는다.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const axis = process.argv[2];
  const bump = process.argv[3] as Bump;
  const root = fileURLToPath(new URL('../../../../', import.meta.url));

  if (axis === 'cli') {
    const pkgPath = join(root, 'packages/devkit-cli/package.json');
    const version = nextVersion(readVersion(pkgPath), bump);
    writeVersion(pkgPath, version);
    process.stdout.write(`${version}\n`);
  } else if (axis === 'config') {
    // 락스텝 — 6개가 같은 버전을 쓴다. 기준은 가장 높은 것이다.
    const paths = CONFIG_PACKAGES.map((name) => join(root, 'packages', name, 'package.json'));
    // 문자열 비교는 0.10.0 < 0.9.0 으로 뒤집힌다 — 자리별 숫자로 고른다.
    const rank = (v: string): number => {
      const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
      if (m === null) throw new Error(`버전이 X.Y.Z 형식이 아닙니다: ${v}`);
      return Number(m[1]) * 1e12 + Number(m[2]) * 1e6 + Number(m[3]);
    };
    const versions = paths.map(readVersion);
    const highest = versions.reduce((a, b) => (rank(a) >= rank(b) ? a : b));
    const version = nextVersion(highest, bump);
    for (const pkgPath of paths) writeVersion(pkgPath, version);

    const depsPath = join(root, 'packages/devkit-cli/src/ops/registry-deps.ts');
    const deps = readFileSync(depsPath, 'utf8');
    const current = /DEVKIT_VERSION_RANGE = '([^']+)'/.exec(deps);
    if (current === null) {
      throw new Error(`${depsPath} 에서 DEVKIT_VERSION_RANGE 를 찾지 못했습니다.`);
    }
    const range = nextRange(current[1], version, bump);
    writeFileSync(depsPath, deps.replace(/DEVKIT_VERSION_RANGE = '[^']+'/, `DEVKIT_VERSION_RANGE = '${range}'`));
    process.stdout.write(`${version}\n`);
  } else {
    throw new Error(`axis 는 'cli' 또는 'config' 여야 합니다: ${String(axis)}`);
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/release-apply.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: 직접 실행을 확인하고 되돌린다**

```bash
node packages/devkit-cli/src/release/apply.ts cli patch
git diff --stat
```

Expected: `packages/devkit-cli/package.json`의 버전이 한 단계 오르고 새 버전이 stdout에 찍힌다.

**확인 후 `git checkout -- packages/devkit-cli/package.json`으로 되돌리고 `git diff`가 비었는지 보라.**

같은 방식으로 `config patch`도 확인하라 — **6개 package.json이 모두 같은 값이 되고 `DEVKIT_VERSION_RANGE`는 그대로여야 한다**(patch이므로). 확인 후 되돌린다.

- [ ] **Step 6: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "feat: 축별 버전과 선언 범위를 갱신한다"
```

Expected: 테스트 47파일/418개(411 + 7).

---

### Task 3: 부트스트랩

**Files:**
- Modify: `packages/eslint-config-nest/package.json`, `packages/eslint-plugin-fsd/package.json`, `packages/jest-config/package.json`, `packages/prettier-config/package.json`, `packages/tsconfig/package.json` (`0.1.0` → `0.1.1`)
- Test: 기존 `packages/devkit-cli/tests/registry-version.test.ts`(통과 확인)

**Interfaces:**
- Consumes: 없음
- Produces: 태그 `config-v0.1.1`, `cli-v0.1.0`

**배경**

락스텝이 깨져 있다 — `vitest-config`만 `0.1.1`이고 나머지 5개는 `0.1.0`이다. **`vitest-config@0.1.1`은 이미 게시돼 되돌릴 수 없으므로** 위로 맞춘다.

**이 태스크는 게시하지 않는다.** 저장소의 버전 표기와 태그만 정렬한다.

- [ ] **Step 1: 5개 패키지의 버전을 올린다**

`eslint-config-nest`·`eslint-plugin-fsd`·`jest-config`·`prettier-config`·`tsconfig`의 `package.json`에서 `"version": "0.1.0"`을 `"version": "0.1.1"`로 바꾼다. **`vitest-config`는 이미 `0.1.1`이므로 건드리지 않는다.**

- [ ] **Step 2: 관문이 통과하는지 확인한다**

```bash
cd packages/devkit-cli && pnpm exec vitest run tests/registry-version.test.ts
```

Expected: PASS. `^0.1.0`은 `0.1.1`을 포함하므로 `DEVKIT_VERSION_RANGE`는 바꾸지 않는다.

- [ ] **Step 3: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "build: 설정 패키지 버전을 0.1.1 로 정렬한다"
```

Expected: 테스트 개수 변화 없음(418개).

- [ ] **Step 4: 태그를 만든다**

```bash
git tag config-v0.1.1
git tag cli-v0.1.0
git tag --list 'config-v*' 'cli-v*'
```

Expected: 두 태그가 보인다.

**`cli-v0.1.0`은 이 커밋이 아니라 `devkit-cli@0.1.0`이 게시된 커밋에 달아야 정확하다.** 그러나 그 커밋 이후 릴리스 대상 변경이 이미 쌓여 있으므로, **현재 커밋에 달면 그 변경들이 다음 릴리스에서 누락된다.** `devkit-cli@0.1.0` 게시 커밋을 찾아 거기에 달아라:

```bash
git log --oneline --all -- packages/devkit-cli/package.json | head -20
```

`private: true`를 제거한 커밋(게시 가능화 Task 4)의 **다음** 상태가 게시 시점이다. 정확히 특정하기 어려우면 **찾은 근거와 함께 보고하고 판단을 요청하라** — 잘못 달면 릴리스가 누락되거나 중복된다.

---

### Task 4: 워크플로

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `node packages/devkit-cli/src/release/decide.ts <since>` → JSON, `node packages/devkit-cli/src/release/apply.ts <axis> <bump>` → 새 버전
- Produces: 없음

- [ ] **Step 1: 워크플로를 쓴다**

`.github/workflows/release.yml`:

```yaml
name: release

on:
  push:
    branches: [main]
  workflow_dispatch:

# contents: 버전 커밋·태그 push 용, packages: 게시용.
# GitHub Actions 의 기본 GITHUB_TOKEN 에 둘 다 줄 수 있어 PAT 이 필요 없다.
permissions:
  contents: write
  packages: write

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # 지난 릴리스 태그 이후를 읽어야 한다

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24 # .ts 를 네이티브로 실행한다(빌드 없이 릴리스 스크립트 호출)
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: 릴리스 대상 판정
        id: decide
        run: |
          CONFIG_SINCE=$(git tag --list 'config-v*' --sort=-v:refname | head -1)
          CLI_SINCE=$(git tag --list 'cli-v*' --sort=-v:refname | head -1)
          CONFIG=$(node packages/devkit-cli/src/release/decide.ts "$CONFIG_SINCE" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).config??''))")
          CLI=$(node packages/devkit-cli/src/release/decide.ts "$CLI_SINCE" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).cli??''))")
          echo "config=$CONFIG" >> "$GITHUB_OUTPUT"
          echo "cli=$CLI" >> "$GITHUB_OUTPUT"
          echo "판정 — config: '${CONFIG:-없음}', cli: '${CLI:-없음}'"

      - name: 검증
        if: steps.decide.outputs.config != '' || steps.decide.outputs.cli != ''
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          pnpm build
          pnpm test
          pnpm typecheck
          pnpm lint:ox
          pnpm lint:es
          pnpm test:e2e

      - name: 버전 갱신
        if: steps.decide.outputs.config != '' || steps.decide.outputs.cli != ''
        id: bump
        run: |
          if [ -n "${{ steps.decide.outputs.config }}" ]; then
            V=$(node packages/devkit-cli/src/release/apply.ts config "${{ steps.decide.outputs.config }}")
            echo "config_version=$V" >> "$GITHUB_OUTPUT"
          fi
          if [ -n "${{ steps.decide.outputs.cli }}" ]; then
            V=$(node packages/devkit-cli/src/release/apply.ts cli "${{ steps.decide.outputs.cli }}")
            echo "cli_version=$V" >> "$GITHUB_OUTPUT"
          fi

      - name: 게시
        if: steps.decide.outputs.config != '' || steps.decide.outputs.cli != ''
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: pnpm -r publish --no-git-checks --access public

      # 게시가 성공한 뒤에만 커밋한다 — 게시가 실패하면 저장소가
      # "올렸다고 하는데 레지스트리엔 없는" 상태로 남지 않는다.
      - name: 커밋과 태그
        if: steps.decide.outputs.config != '' || steps.decide.outputs.cli != ''
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add -A
          git commit -m "build: 릴리스 버전을 올린다 [skip ci]"
          if [ -n "${{ steps.bump.outputs.config_version }}" ]; then
            git tag "config-v${{ steps.bump.outputs.config_version }}"
          fi
          if [ -n "${{ steps.bump.outputs.cli_version }}" ]; then
            git tag "cli-v${{ steps.bump.outputs.cli_version }}"
          fi
          git push --follow-tags
```

- [ ] **Step 2: 워크플로 문법을 확인한다**

```bash
node -e "const y=require('node:fs').readFileSync('.github/workflows/release.yml','utf8'); if(!y.includes('permissions:')||!y.includes('[skip ci]')) throw new Error('필수 항목 누락'); console.log('OK')"
```

이 저장소에는 YAML 파서 의존성이 없다. **`gh workflow` 나 `act` 로 실행하지 마라** — 실제 게시가 일어난다.

- [ ] **Step 3: 판정 명령을 로컬에서 확인한다**

```bash
CONFIG_SINCE=$(git tag --list 'config-v*' --sort=-v:refname | head -1); echo "since=$CONFIG_SINCE"
node packages/devkit-cli/src/release/decide.ts "$CONFIG_SINCE"
```

Expected: JSON이 나온다. 태그가 Task 3에서 만들어졌으므로 `since`가 비어 있지 않아야 한다.

- [ ] **Step 4: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "ci: main push 에 릴리스 워크플로를 붙인다"
```

Expected: 테스트 개수 변화 없음(418개). `.github/workflows/**`는 lint 대상이 아니다.

---

### Task 5: 문서

**Files:**
- Modify: `README.md` (`## 이 저장소에서 개발하기` 아래에 릴리스 절 추가)
- Modify: `packages/devkit-cli/README.md` (게시 서술이 있으면 정정)
- Modify: `work-log.md` (추가만)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

**배경**

루트 README에 **게시(생산) 절차가 없다.** 소비 쪽 문서는 충실한데 "새 버전을 어떻게 내는가"가 비어 있어, 이전 작업의 follow-up으로 남아 있던 항목이다. 이제 자동화됐으므로 그 사실을 적는다.

- [ ] **Step 1: 루트 README에 릴리스 절을 더한다**

`## 이 저장소에서 개발하기` 절 안, `### 새 패키지 체크리스트` 앞에 넣는다:

```markdown
### 릴리스는 자동이다

`main`에 push되면 `.github/workflows/release.yml`이 검증하고, 버전을 올리고,
게시한다. 손으로 `pnpm publish`를 칠 일이 없다.

**무엇이 릴리스를 부르는가** — 경로가 대상을 정하고, 커밋 접두가 크기를 정한다.

| 접두 | 올림 |
| --- | --- |
| `feat:` | minor |
| `fix:` · `refactor:` · `perf:` · `build:` | patch |
| `docs:` · `test:` · `chore:` | 없음 |
| 본문에 `BREAKING CHANGE:` 또는 제목에 `!` | major |

`tests/**`·`README.md`·설정 파일(`eslint.config.mjs`·`vitest.config.ts`·
`tsconfig.json`·`tsup.config.ts`·`turbo.json`)만 바뀌면 릴리스되지 않는다 —
tarball에 안 들어가거나 동작을 바꾸지 않기 때문이다.

**두 축이 따로 움직인다.**

- **설정 6개는 락스텝** — 하나만 바뀌어도 함께 올라간다. 생성물이 선언하는
  `DEVKIT_VERSION_RANGE`가 상수 하나라서, 6개가 다른 마이너로 흩어지면
  표현할 수 없다. 마이너 이상이면 그 상수도 자동으로 갱신된다.
- **`devkit-cli`는 단독** — `templates/`가 이 패키지 안에 있으므로 템플릿만
  바뀌어도 CLI가 새로 나간다.

**검증이 먼저다.** `test`·`typecheck`·`lint:ox`·`lint:es`·`test:e2e`가 전부
통과해야 게시한다. e2e가 일시적으로 실패하면 릴리스가 막히는데, 깨진 것을
게시하는 쪽보다 낫다고 판단했다 — 되돌릴 수 없기 때문이다(GitHub Packages는
같은 버전 재게시가 안 된다).

**게시가 중간에 실패하면 사람이 개입한다.** 일부만 올라간 상태에서 커밋·태그를
남기지 않고 워크플로가 실패한다. 자동 복구는 하지 않는다.

판정 로직은 `packages/devkit-cli/src/release/`에 있고 단위 테스트가 규칙을
고정한다 — 워크플로 YAML 안의 bash로 두면 테스트할 수 없기 때문이다.
```

- [ ] **Step 2: `packages/devkit-cli/README.md`를 확인한다**

```bash
grep -n "publish\|게시" packages/devkit-cli/README.md
```

손으로 게시하라는 서술이 있으면 자동화 사실로 고치고, 없으면 그대로 둔다. **찾은 것과 판단을 보고서에 적어라.**

- [ ] **Step 3: 사실 확인**

```bash
grep -n "publish:packages" package.json
```

루트 스크립트는 **남겨 둔다** — 워크플로가 그것을 쓰고, 비상시 손으로 실행할 수도 있다. README에 "손으로 칠 일이 없다"고 적었으므로, 그 스크립트가 여전히 존재한다는 것과 모순되지 않는지 확인하라(비상용이라는 성격이 드러나면 된다).

- [ ] **Step 4: `work-log.md`에 항목을 더한다**

`## 2026-08-06` 절에 새 `###` 항목을 **추가만** 한다. 기존 항목과 다른 날짜를 수정하지 않는다.

- [ ] **Step 5: 전체 검증과 커밋**

```bash
pnpm build && pnpm test && pnpm typecheck && pnpm lint:ox && pnpm lint:es
git add -A
git commit -m "docs: 자동 릴리스 절차를 문서에 남긴다"
```

---

## 완료 확인

설계 4절의 완료 기준과 대조한다.

1. `fix:` → 패치 올림·게시 — Task 1(판정) + Task 2(갱신) + Task 4(워크플로)
2. `feat:` → 마이너 + `DEVKIT_VERSION_RANGE` 갱신 — Task 1 Step 1, Task 2 Step 1
3. `docs:`·`test:`만 있으면 게시 없음 — Task 1 Step 1
4. `tests/**`·`README.md`만 바뀌면 릴리스 없음 — Task 1 Step 1
5. 검증 실패 시 게시·커밋 없음 — Task 4 Step 1(`if:` 조건과 단계 순서)
6. 커밋·태그가 남고 재실행되지 않음 — Task 4 Step 1(`[skip ci]`)
7. 판정 로직이 단위 테스트로 고정 — Task 1, Task 2
8. 릴리스 코드가 tarball에 안 실림 — `tsup.config.ts`의 entry가 `bin.ts`·`index.ts`뿐이라 구조적으로 보장된다. Task 1 Step 6의 `pnpm build` 후 `dist/`에 `release`가 없는지 확인하라
9. 기준선 유지 — 각 태스크 마지막 단계

최종 수치: 테스트 **47파일/418개**, typecheck 7/7, `lint:ox` 에러 0·warning 3, `lint:es` 8/8, e2e 13/13.

**이 계획은 게시하지 않는다.** 첫 실제 릴리스는 이 브랜치가 `main`에 병합된 뒤 워크플로가 스스로 판단해 실행한다.
