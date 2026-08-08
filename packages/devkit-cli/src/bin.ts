#!/usr/bin/env node
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { packageLayout, packageRoot } from './lib/layout.js';
import { devkitVersion } from './lib/version.js';
import { pathExists } from './ops/path-exists.js';
import { monorepoRecipe } from './recipes/monorepo.js';
import { nestRecipe } from './recipes/nest.js';
import { nextRecipe } from './recipes/next.js';
import { run } from './run.js';
import type { Ctx, ProjectType, Recipe } from './types.js';
import { runUpdate } from './update/index.js';
import { collectVersionReport } from './version/collect.js';
import { formatVersionReport } from './version/format.js';

/**
 * pnpm-workspace.yaml을 상위로 탐색해 툴킷 저장소 루트를 찾는다.
 *
 * 못 찾으면 던진다. cwd로 폴백하면 잘못된 toolkitRoot로 targetDir 위치가
 * 계산돼 아무 에러 없이 엉뚱한 곳에 프로젝트가 생성된다(설계 6.1절).
 */
export function findToolkitRoot(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `툴킷 저장소 루트를 찾지 못했습니다 (${from}에서 위로 탐색하며 pnpm-workspace.yaml을 찾았습니다).`,
      );
    }
    dir = parent;
  }
}

/** 디렉토리 트리에서 가장 최근 mtime을 반환한다. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * dist가 src보다 오래됐으면 중단한다.
 *
 * 저장소에서 직접 실행하는 방식에는 어떤 라이프사이클 스크립트도 돌지
 * 않아, 빌드를 잊으면 옛 코드가 조용히 실행된다(로드맵 4.2절). CLI만은
 * 스스로 이를 막는다.
 */
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

const RECIPES: Partial<Record<ProjectType, Recipe>> = {
  nest: nestRecipe,
  next: nextRecipe,
  monorepo: monorepoRecipe,
};

const USAGE =
  '사용법:\n' +
  '  pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]\n' +
  '  pnpm devbak update [path] [--only <categories>] [--type <t>] [--dry-run] [--yes] [--force]\n' +
  '  pnpm devbak version [path]';

export interface MainOptions {
  /**
   * `create` 의 대상을 해석할 기준 디렉토리. 기본값은 `process.cwd()`.
   *
   * 인자로 받는 이유는 테스트다 — cwd 는 프로세스 전역 상태라
   * `process.chdir()` 로 바꾸면 같은 워커의 다른 테스트와 순서가 얽힌다.
   */
  cwd?: string;
}

export async function main(argv: string[], options: MainOptions = {}): Promise<void> {
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
      version: { type: 'boolean', default: false, short: 'v' },
      help: { type: 'boolean', default: false },
    },
  });

  // 도움말은 오류가 아니므로 stdout 으로 내고 종료 코드 0 으로 끝난다.
  // assertDistFresh 보다 앞에 둔다 — 낡은 dist 때문에 사용법조차 못 보면
  // 사용자는 무엇을 잘못 쳤는지 확인할 길이 없다.
  if (values.help === true) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  // --version 은 값 하나만 내는 안정된 계약이다. 리포트 형식을 스크립트가
  // 파싱하게 두면 형식을 영영 바꿀 수 없어, 사람이 읽는 출력과 기계가 읽는
  // 출력을 처음부터 갈라 둔다.
  if (values.version === true) {
    process.stdout.write(`${devkitVersion()}\n`);
    return;
  }

  const [command, ...rest] = positionals;
  // --help 와 같이 assertDistFresh 앞에 둔다. "내가 지금 뭘 쓰고 있나"를
  // 묻는 명령이 빌드 상태에 막히는 것은 정확히 거꾸로다. 버전 값 자체는
  // package.json 에서 직접 읽으므로 dist 신선도와 무관하게 정확하다.
  // 툴킷 저장소도 필요 없으므로 findToolkitRoot 도 부르지 않는다.
  if (command === 'version') {
    runVersionCommand(rest[0], options.cwd ?? process.cwd());
    return;
  }

  if (command !== 'create' && command !== 'update') {
    throw new Error(USAGE);
  }

  // 인자 검증은 assertDistFresh 보다 **먼저** 한다. 잘못된 인자는 빌드 상태와
  // 무관하게 틀린 입력이고, 순서를 뒤집으면 dist 가 낡았을 때 "pnpm build 를
  // 먼저 실행하세요"가 인자 오류를 가려 원인이 두 단계 멀어진다.
  const createArgs = command === 'create' ? validateCreate(rest[0], values.type) : null;

  const pkgDir = packageRoot(fileURLToPath(import.meta.url));
  assertDistFresh(pkgDir);
  // 게시본에는 툴킷 저장소가 없다. 여기서 findToolkitRoot 를 부르면 소비자가
  // 모노레포일 때 소비자의 pnpm-workspace.yaml 을 찾아 toolkitRoot 로 삼고,
  // 그러면 자기보호 가드가 정당한 update 를 거부한다.
  const toolkitRoot = packageLayout(pkgDir) === 'source' ? findToolkitRoot(pkgDir) : null;

  if (createArgs !== null) {
    await runCreate(createArgs, values, toolkitRoot, options.cwd ?? process.cwd());
    return;
  }
  await runUpdateCommand(rest[0], values, toolkitRoot);
}

interface CreateArgs {
  name: string;
  recipe: Recipe;
}

function validateCreate(name: string | undefined, requested: string | undefined): CreateArgs {
  if (name === undefined) throw new Error(USAGE);

  const type = requested as ProjectType | undefined;
  if (type === undefined || !Object.hasOwn(RECIPES, type)) {
    throw new Error(`--type은 nest · next · monorepo 중 하나여야 합니다 (받은 값: ${String(type)}).`);
  }

  const recipe = RECIPES[type];
  if (recipe === undefined) throw new Error(`레시피가 아직 구현되지 않았습니다: ${type}`);

  return { name, recipe };
}

async function runCreate(
  { name, recipe }: CreateArgs,
  values: Record<string, unknown>,
  toolkitRoot: string | null,
  baseDir: string,
): Promise<void> {
  // 기준 디렉토리(기본값 process.cwd()) 아래에 만든다. link: 시절에는
  // 생성물이 툴킷의 형제여야 상대경로가 성립해 부모 디렉토리로
  // 강제했지만, 레지스트리 설치에는 그 이유가 없다(설계 5.4절).
  // nest new·create-next-app 과 같은 관습이다.
  const targetDir = resolve(baseDir, name);

  const exists = await pathExists(targetDir);
  if (exists) {
    throw new Error(`${targetDir}가 이미 존재합니다. 덮어쓰지 않습니다.`);
  }
  await mkdir(dirname(targetDir), { recursive: true });

  const ctx: Ctx = {
    targetDir,
    toolkitRoot,
    name,
    log: (message) => {
      process.stdout.write(`${message}\n`);
    },
  };

  await run(recipe({ skipVerify: values['no-verify'] === true }), ctx);
  ctx.log(`\n완료. cd ${targetDir}`);
}

async function runUpdateCommand(
  path: string | undefined,
  values: Record<string, unknown>,
  toolkitRoot: string | null,
): Promise<void> {
  // 비대화형에서 확인 프롬프트를 만나면 영원히 멈춰 선다. CI 에서 이 명령이
  // 걸리면 원인을 찾기 어려우므로 먼저 막고 대안을 알린다.
  if (values.yes !== true && values['dry-run'] !== true && process.stdin.isTTY !== true) {
    throw new Error('대화형 확인을 할 수 없는 환경입니다. --yes 또는 --dry-run 을 쓰세요.');
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

/**
 * 진단 명령이므로 종료 코드는 항상 0 이다 — devkit 프로젝트가 아닌 것도,
 * 마커가 깨진 것도 정당한 답이지 실패가 아니다.
 */
function runVersionCommand(path: string | undefined, baseDir: string): void {
  const targetDir = resolve(baseDir, path ?? '.');
  process.stdout.write(formatVersionReport(collectVersionReport(targetDir)));
}

/**
 * 이 모듈이 CLI 진입점으로 실행됐는가 — tests/bin.test.ts 가 main 을 import
 * 하므로, 모듈을 싣기만 해도 CLI 가 도는 것을 막아야 한다.
 *
 * 반드시 **실경로끼리** 비교한다. 사용자가 치는 이름은 npm 이 설치 때 만든
 * 심볼릭 링크(node_modules/.bin/devbak)이고, 그 링크를 지나면 Node 는
 * process.argv[1] 에 링크 경로를, import.meta.url 에 해석된 실제 경로를
 * 준다. 이름을 문자열로 비교하면(예: endsWith(basename(argv[1]))) 전역
 * 설치에서 'dist/bin.js' 와 'devbak' 을 견주는 꼴이 되어 항상 거짓이 되고,
 * CLI 가 아무 출력 없이 종료 코드 0 으로 끝난다.
 */
const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
