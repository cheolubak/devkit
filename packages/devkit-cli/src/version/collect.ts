import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { InvalidMarkerError, MissingMarkerError, readMarker } from '../lib/marker.js';
import { devkitVersion } from '../lib/version.js';
import type { BrokenMarker, DevkitPackage, VersionReport, WorkspaceReport } from './types.js';

const SCOPE = '@cheolubak/';

/**
 * 스캔 최대 깊이. 대상 디렉토리 자신이 0 이므로 `apps` 가 1, `apps/web` 이 2 다.
 *
 * pnpm-workspace.yaml 의 packages: glob 을 해석하지 않는 이유는 의존성이다 —
 * 이 패키지는 런타임 의존성이 0개라 YAML 파서를 넣으면 그 성질이 깨지고,
 * 직접 파싱하면 glob 엔진까지 만들어야 한다. fs.glob 은 engines 에 있는
 * Node 20 에 없다. 마커 스캔은 의존성 0으로 같은 답을 내고, 덤으로
 * 워크스페이스에 등록되지 않았지만 devkit 이 관리하는 디렉토리도 잡는다.
 */
const MAX_DEPTH = 3;

export function collectVersionReport(targetDir: string): VersionReport {
  // 대상 자체가 없거나 디렉토리가 아닌 것은 진단 결과가 아니라 입력
  // 오류다 — 조용히 빈 리포트를 내면 오타와 "devkit 프로젝트가 아님"을
  // 구분할 수 없다. 스캔 도중 만나는 하위 항목의 오류와는 다르게 다룬다.
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    throw new Error(`${targetDir}를 읽을 수 없습니다 — 경로가 없거나 디렉토리가 아닙니다.`);
  }

  const workspaces: WorkspaceReport[] = [];
  scan(targetDir, targetDir, 0, workspaces);

  return { cli: devkitVersion(), workspaces: sortWorkspaces(workspaces) };
}

/**
 * 워크스페이스를 출력 순서로 낸다 — 루트('.')가 항상 맨 앞, 나머지는
 * 상대경로 오름차순.
 *
 * 순수 함수로 뽑아 export 하는 이유는 테스트 가능성이다. 파일시스템 순회
 * 결과로 이것을 검증하려 하면 readdir 이 우연히 알파벳순을 내주는
 * 환경(실측: macOS APFS)에서 정렬을 통째로 지워도 테스트가 통과해 버린다.
 * 입력 배열을 직접 역순으로 넣을 수 있어야 정렬이 실제로 고정된다.
 */
export function sortWorkspaces(workspaces: WorkspaceReport[]): WorkspaceReport[] {
  return [...workspaces].sort((a, b) => {
    if (a.relPath === '.') return -1;
    if (b.relPath === '.') return 1;
    return a.relPath.localeCompare(b.relPath);
  });
}

function scan(root: string, dir: string, depth: number, out: WorkspaceReport[]): void {
  const workspace = readWorkspace(root, dir);
  if (workspace !== null) out.push(workspace);

  if (depth >= MAX_DEPTH) return;

  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // 대상 자체는 collectVersionReport 진입부에서 이미 검증했다. 여기서
    // 나는 에러는 스캔 도중 만난 하위 디렉토리의 것(EACCES 등)이라, 남의
    // 디렉토리 하나 때문에 진단 명령이 죽으면 안 되므로 그 가지만 접는다.
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // node_modules 안에는 마커를 가진 남의 package.json 이 있을 수 있고,
    // 숨김 디렉토리는 캐시·도구 상태라 프로젝트가 아니다.
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    scan(root, join(dir, entry.name), depth + 1, out);
  }
}

function readWorkspace(root: string, dir: string): WorkspaceReport | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    // 읽을 수 없는 package.json 은 마커 유무를 판단할 근거가 없다. 스캔
    // 도중 만난 남의 파일 하나 때문에 진단 명령이 죽으면 안 되므로 건너뛴다.
    return null;
  }

  let marker: WorkspaceReport['marker'];
  try {
    marker = readMarker(parsed);
  } catch (error) {
    // 마커가 아예 없는 것은 정상이다 — 모노레포의 도구 패키지 등.
    if (error instanceof MissingMarkerError) return null;
    if (!(error instanceof InvalidMarkerError)) throw error;
    marker = { broken: error.message } satisfies BrokenMarker;
  }

  return { relPath: toRelPath(root, dir), marker, packages: collectPackages(root, dir, parsed) };
}

function toRelPath(root: string, dir: string): string {
  const rel = relative(root, dir);
  // 구분자를 '/' 로 고정한다. 윈도우에서 'apps\web' 이 나오면 출력과
  // 테스트가 플랫폼마다 갈린다.
  return rel === '' ? '.' : rel.split(sep).join('/');
}

function collectPackages(root: string, dir: string, parsed: unknown): DevkitPackage[] {
  const declared = new Map<string, string>();

  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = (parsed as Record<string, unknown>)[field];
    if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) continue;
    for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
      if (name.startsWith(SCOPE) && typeof range === 'string') declared.set(name, range);
    }
  }

  return [...declared.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, range]) => ({
      name,
      declared: range,
      // pnpm 워크스페이스는 공용 의존을 루트에 두므로 앱 디렉토리에는
      // 심링크조차 없을 수 있다. 자기 자리를 먼저 보고 루트로 폴백한다.
      installed: readInstalled(dir, name) ?? readInstalled(root, name),
    }));
}

function readInstalled(base: string, name: string): string | null {
  const pkgPath = join(base, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}
