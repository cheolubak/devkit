import { rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { pathExists } from './path-exists.js';

/**
 * relativePath가 targetDir 안에 있는지 검증하고 절대경로를 반환한다.
 * 절대경로 입력·상위 탈출·targetDir 자기 자신은 전부 거부한다.
 */
export function assertInside(targetDir: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`'${relativePath}'는 절대경로입니다. 대상 디렉토리 밖은 건드릴 수 없습니다.`);
  }
  const root = resolve(targetDir);
  const full = resolve(root, relativePath);
  const rel = relative(root, full);
  if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) {
    throw new Error(`'${relativePath}'가 대상 디렉토리(${root}) 밖을 가리킵니다.`);
  }
  return full;
}

export interface RemoveFilesOptions {
  required?: boolean;
}

export function removeFiles(paths: string[], options: RemoveFilesOptions = {}): Step {
  const required = options.required ?? false;

  return {
    kind: 'removeFiles',
    label: `삭제: ${paths.join(', ')}`,
    describe: () => ({ paths, required }),
    run: async (ctx: Ctx) => {
      const logs = await Promise.all(
        paths.map(async (path): Promise<string | undefined> => {
          const full = assertInside(ctx.targetDir, path);
          const exists = await pathExists(full);
          if (!exists) {
            if (required) {
              throw new Error(
                `'${path}'가 없습니다. 위임 대상(공식 CLI)이 이 파일을 더 이상 만들지 않는 것 같습니다. ` +
                  `해당 레시피를 재검증하세요 (설계 6.2절).`,
              );
            }
            return undefined;
          }
          await rm(full, { recursive: true, force: true });
          return path;
        }),
      );

      for (const path of logs) {
        if (path !== undefined) {
          ctx.log(`  삭제: ${path}`);
        }
      }
    },
  };
}
