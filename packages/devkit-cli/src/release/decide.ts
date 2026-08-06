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
