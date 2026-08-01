import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ctx, Step } from '../types.js';
import { pathExists } from './path-exists.js';

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
 * 오버레이가 덮어쓸 파일이 기대한 상류(upstream) 내용과 일치하는지 확인한다.
 *
 * removeFiles·mergeJson의 required와 같은 목적이다: copyOverlay는 그냥 덮어쓰기만
 * 해서 드리프트 감지가 없었다 — 공식 CLI가 그 파일 내용을 바꿔도(예: main.ts에
 * shutdown hooks·CORS 부트스트랩 추가) 아무 에러 없이 그 변화를 버리고 오늘의
 * 스냅샷을 계속 찍어낸다. 대상 파일이 아직 없으면(오버레이가 새 파일을 만드는
 * 정상 경우) 통과시킨다 — 있을 때만 비교한다.
 */
export async function assertNoDrift(targetDir: string, expectUpstream: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(expectUpstream).map(async ([relPath, expectedHash]) => {
      const full = join(targetDir, relPath);
      if (!(await pathExists(full))) return;

      const actual = createHash('sha256').update(await readFile(full, 'utf8')).digest('hex');
      if (actual !== expectedHash) {
        throw new Error(
          `'${relPath}'가 예상한 상류 내용과 다릅니다 (기대 sha256 ${expectedHash}, 실제 ${actual}). ` +
            `공식 CLI 산출물이 바뀌었을 수 있습니다. 이 오버레이가 상류 변경을 조용히 버리고 있지 않은지 ` +
            `확인하고, 확인 후 expectUpstream 값을 갱신하세요.`,
        );
      }
    }),
  );
}

export interface CopyOverlayOptions {
  /**
   * 덮어쓸 대상의 드리프트 감지. 키는 targetDir 기준 상대경로,
   * 값은 덮어쓰기 전 그 파일이 가질 것으로 기대하는 내용의 sha256.
   * 실제와 다르면 던진다 — 공식 CLI가 그 파일을 바꿨다는 뜻이고,
   * 우리 오버레이가 그 변화를 조용히 버리게 되기 때문이다.
   */
  expectUpstream?: Record<string, string>;
}

/**
 * templates/<template>/ 을 targetDir에 복사한다. 기존 파일은 덮어쓴다.
 * 파일 내용의 __KEY__ 를 vars[KEY]로 치환한다. 파일명은 치환하지 않는다.
 */
export function copyOverlay(
  template: string,
  vars: Record<string, string> = {},
  options: CopyOverlayOptions = {},
): Step {
  const expectUpstream = options.expectUpstream ?? {};

  return {
    kind: 'copyOverlay',
    label: `오버레이 복사: templates/${template}`,
    describe: () => ({ template, vars: Object.keys(vars), expectUpstream: Object.keys(expectUpstream) }),
    run: async (ctx: Ctx) => {
      await assertNoDrift(ctx.targetDir, expectUpstream);
      const from = join(templatesRoot(), template);
      const allVars = { NAME: ctx.name, ...vars };
      const written = await copyTree(from, ctx.targetDir, allVars);
      for (const file of written) ctx.log(`  복사: ${file.slice(ctx.targetDir.length + 1)}`);
    },
  };
}
