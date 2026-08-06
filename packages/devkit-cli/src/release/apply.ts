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

/**
 * 락스텝 기준 버전 선정용 정렬 키. 문자열 비교는 `0.10.0 < 0.9.0` 으로
 * 뒤집힌다 — 자리별 숫자로 고른다. 바깥 스코프를 캡처하지 않으므로
 * 모듈 스코프에 둔다(호출부 안에 두면 호출마다 새로 만들어진다).
 */
function rank(v: string): number {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (m === null) throw new Error(`버전이 X.Y.Z 형식이 아닙니다: ${v}`);
  return Number(m[1]) * 1e12 + Number(m[2]) * 1e6 + Number(m[3]);
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
