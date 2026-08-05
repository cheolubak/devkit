import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { applyPatch, type JsonObject } from './merge-json.js';

/**
 * 플랫폼별 경로 구분자를 POSIX `/`로 정규화한다.
 * Windows에서 path.relative는 `\`를 쓰므로 이를 `/`로 변환해야 한다.
 */
export function normalizeToPosix(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}

/**
 * targetDir에서 toolkitRoot/packages/<pkg>까지의 상대경로를 link: 스펙으로 만든다.
 *
 * 하드코딩하지 않는 이유는 모노레포 때문이다. 루트와 apps/web은 툴킷까지의
 * 깊이가 다르고, pnpm catalog:가 link:를 거부해(설계 2.3절) 각자 선언해야 한다.
 */
export function linkSpec(targetDir: string, toolkitRoot: string, pkg: string): string {
  const from = resolve(targetDir);
  const to = resolve(toolkitRoot, 'packages', pkg);
  const posix = normalizeToPosix(relative(from, to));
  return `link:${posix}`;
}

export interface LinkDepsOptions {
  /** targetDir 기준 상대 경로. 기본값 'package.json' */
  file?: string;
}

export function linkDeps(packages: string[], options: LinkDepsOptions = {}): Step {
  const file = options.file ?? 'package.json';

  const buildPatch = (ctx: Ctx): JsonObject => {
    const devDependencies: JsonObject = {};
    for (const pkg of packages) {
      devDependencies[`@cheolubak/${pkg}`] = linkSpec(ctx.targetDir, ctx.toolkitRoot, pkg);
    }
    return { devDependencies };
  };

  return {
    kind: 'linkDeps',
    label: `link: 배선 — ${packages.map((p) => `@cheolubak/${p}`).join(', ')}`,
    describe: () => ({ file, packages }),
    plan: (ctx: Ctx) => Promise.resolve([{ kind: 'json', file, patch: buildPatch(ctx) }]),
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonObject;
      const merged = applyPatch(parsed, buildPatch(ctx));
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      for (const pkg of packages) ctx.log(`  링크: @cheolubak/${pkg}`);
    },
  };
}
