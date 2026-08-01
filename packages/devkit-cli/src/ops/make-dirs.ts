import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { assertInside } from './remove-files.js';

/**
 * 디렉토리를 만들고, 비어 있으면 .gitkeep을 넣는다.
 * 빈 디렉토리는 git에 남지 않으므로 FSD 레이어가 커밋되지 않는다.
 */
export function makeDirs(paths: string[]): Step {
  return {
    kind: 'makeDirs',
    label: `디렉토리 생성: ${paths.join(', ')}`,
    describe: () => ({ paths }),
    run: async (ctx: Ctx) => {
      for (const path of paths) {
        const full = assertInside(ctx.targetDir, path);
        await mkdir(full, { recursive: true });
        if ((await readdir(full)).length === 0) {
          await writeFile(join(full, '.gitkeep'), '');
        }
        ctx.log(`  생성: ${path}/`);
      }
    },
  };
}
