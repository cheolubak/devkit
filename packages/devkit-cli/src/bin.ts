#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { pathExists } from './ops/path-exists.js';
import { monorepoRecipe } from './recipes/monorepo.js';
import { nestRecipe } from './recipes/nest.js';
import { nextRecipe } from './recipes/next.js';
import { run } from './run.js';
import type { Ctx, ProjectType, Recipe } from './types.js';
import { runUpdate } from './update/index.js';

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
 * link: 소비에서는 어떤 라이프사이클 스크립트도 돌지 않아, 빌드를 잊으면
 * 옛 코드가 조용히 실행된다(로드맵 4.2절). CLI만은 스스로 이를 막는다.
 */
export function assertDistFresh(pkgDir: string): void {
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
  '  pnpm devbak update [path] [--only <categories>] [--type <t>] [--dry-run] [--yes] [--force]';

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

  const [command, ...rest] = positionals;
  if (command !== 'create' && command !== 'update') {
    throw new Error(USAGE);
  }

  // 인자 검증은 assertDistFresh 보다 **먼저** 한다. 잘못된 인자는 빌드 상태와
  // 무관하게 틀린 입력이고, 순서를 뒤집으면 dist 가 낡았을 때 "pnpm build 를
  // 먼저 실행하세요"가 인자 오류를 가려 원인이 두 단계 멀어진다.
  const createArgs = command === 'create' ? validateCreate(rest[0], values.type) : null;

  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  assertDistFresh(pkgDir);
  const toolkitRoot = findToolkitRoot(pkgDir);

  if (createArgs !== null) {
    await runCreate(createArgs, values, toolkitRoot);
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
  toolkitRoot: string,
): Promise<void> {
  const targetDir = resolve(dirname(toolkitRoot), name);

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
  toolkitRoot: string,
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

const isDirectRun = process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]));
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
