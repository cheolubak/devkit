import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { applyPatch, type JsonObject } from './merge-json.js';

/**
 * targetDir에서 toolkitRoot/packages/<pkg>까지의 상대경로를 link: 스펙으로 만든다.
 *
 * 하드코딩하지 않는 이유는 모노레포 때문이다. 루트와 apps/web은 툴킷까지의
 * 깊이가 다르고, pnpm catalog:가 link:를 거부해(설계 2.3절) 각자 선언해야 한다.
 */
export function linkSpec(targetDir: string, toolkitRoot: string, pkg: string): string {
  const from = resolve(targetDir);
  const to = resolve(toolkitRoot, 'packages', pkg);
  const posix = relative(from, to).split(sep).join('/');
  return `link:${posix}`;
}

export interface LinkDepsOptions {
  /** targetDir 기준 상대 경로. 기본값 'package.json' */
  file?: string;
}

export function linkDeps(packages: string[], options: LinkDepsOptions = {}): Step {
  const file = options.file ?? 'package.json';

  return {
    kind: 'linkDeps',
    label: `link: 배선 — ${packages.map((p) => `@devbak/${p}`).join(', ')}`,
    describe: () => ({ file, packages }),
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonObject;

      const devDependencies: JsonObject = {};
      for (const pkg of packages) {
        devDependencies[`@devbak/${pkg}`] = linkSpec(ctx.targetDir, ctx.toolkitRoot, pkg);
      }

      const merged = applyPatch(parsed, { devDependencies });
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      for (const pkg of packages) ctx.log(`  링크: @devbak/${pkg}`);
    },
  };
}
