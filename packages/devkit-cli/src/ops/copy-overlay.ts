import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ctx, Step } from '../types.js';

/** '_' 접두어를 '.'으로 바꾼다. _gitignore → .gitignore */
export function templateFileName(name: string): string {
  return name.startsWith('_') ? `.${name.slice(1)}` : name;
}

/** dist/ 기준으로 templates/ 디렉토리를 찾는다. */
function templatesRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
}

async function copyTree(from: string, to: string, vars: Record<string, string>): Promise<string[]> {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });

  const results = await Promise.all(
    entries.map(async (entry) => {
      const target = join(to, templateFileName(entry.name));
      const source = join(from, entry.name);

      if (entry.isDirectory()) {
        return await copyTree(source, target, vars);
      }

      let content = await readFile(source, 'utf8');
      for (const [key, value] of Object.entries(vars)) {
        content = content.replaceAll(`__${key}__`, value);
      }
      await writeFile(target, content);
      return [target];
    }),
  );

  const written: string[] = [];
  for (const result of results) {
    written.push(...result);
  }
  return written;
}

/**
 * templates/<template>/ 을 targetDir에 복사한다. 기존 파일은 덮어쓴다.
 * 파일 내용의 __KEY__ 를 vars[KEY]로 치환한다. 파일명은 치환하지 않는다.
 */
export function copyOverlay(template: string, vars: Record<string, string> = {}): Step {
  return {
    kind: 'copyOverlay',
    label: `오버레이 복사: templates/${template}`,
    describe: () => ({ template, vars: Object.keys(vars) }),
    run: async (ctx: Ctx) => {
      const from = join(templatesRoot(), template);
      const allVars = { NAME: ctx.name, ...vars };
      const written = await copyTree(from, ctx.targetDir, allVars);
      for (const file of written) ctx.log(`  복사: ${file.slice(ctx.targetDir.length + 1)}`);
    },
  };
}
