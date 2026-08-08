import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageRoot } from '../lib/layout.js';
import type { Ctx, PlannedChange, Step } from '../types.js';
import { DEVKIT_BLOCK_END, DEVKIT_BLOCK_START, mergeIgnore } from './merge-ignore.js';
import { pathExists } from './path-exists.js';
import { readExistingOrEmpty } from './read-existing.js';

/** '_' 접두어를 '.'으로 바꾼다. _gitignore → .gitignore */
export function templateFileName(name: string): string {
  return name.startsWith('_') ? `.${name.slice(1)}` : name;
}

/**
 * 템플릿 트리의 루트.
 *
 * 두 레이아웃 모두 템플릿은 패키지 루트 바로 아래에 있다(게시본은 files 로
 * `templates` 를 함께 싣는다). 그래서 파일 기준 상대 깊이를 세지 않고 패키지
 * 루트를 찾아 거기서 잡는다 — 번들되면 이 파일이 dist/chunk-*.js 가 되어
 * 깊이가 달라지므로, 깊이를 세는 방식은 레이아웃마다 후보를 늘려야 한다.
 */
export function templatesRoot(): string {
  const root = join(packageRoot(fileURLToPath(import.meta.url)), 'templates');
  if (!existsSync(root)) {
    throw new Error(`templates 디렉토리를 찾지 못했습니다 (확인한 경로: ${root}).`);
  }
  return root;
}

/**
 * 템플릿 무시 파일을 "일반 줄"과 "devkit 블록"으로 가른다.
 *
 * 블록은 통째로 갈아끼워지고 일반 줄은 대상에 없을 때만 더해진다 —
 * 다루는 방식이 다르므로 여기서 나눈다.
 */
function splitIgnoreTemplate(content: string): { lines: string[]; block: string[] } {
  const all = content.replace(/\n$/, '').split('\n');
  const startAt = all.indexOf(DEVKIT_BLOCK_START);
  if (startAt === -1) return { lines: all, block: [] };
  const endAt = all.indexOf(DEVKIT_BLOCK_END, startAt);
  if (endAt === -1) {
    throw new Error(
      `템플릿 무시 파일에 ${DEVKIT_BLOCK_START} 는 있는데 ${DEVKIT_BLOCK_END} 가 없습니다.`,
    );
  }
  return {
    lines: [...all.slice(0, startAt), ...all.slice(endAt + 1)],
    block: all.slice(startAt + 1, endAt),
  };
}

/**
 * 템플릿 트리를 읽어 (상대경로, 최종 내용) 목록으로 만든다. **쓰지 않는다.**
 *
 * 상대경로는 POSIX `/` 로 고정한다 — 카테고리 패턴 테이블이 `/` 를 기준으로
 * 쓰였고(categoryOf 가 스스로 정규화하긴 하지만), 변경 목록 출력도 플랫폼과
 * 무관해야 스냅샷이 안정적이다.
 */
export async function collectTree(
  from: string,
  relDir: string,
  vars: Record<string, string>,
): Promise<PlannedChange[]> {
  const entries = await readdir(from, { withFileTypes: true });

  const nested = await Promise.all(
    entries.map(async (entry): Promise<PlannedChange[]> => {
      const name = templateFileName(entry.name);
      const rel = relDir === '' ? name : posix.join(relDir, name);

      if (entry.isDirectory()) {
        return await collectTree(join(from, entry.name), rel, vars);
      }

      let content = await readFile(join(from, entry.name), 'utf8');
      for (const [key, value] of Object.entries(vars)) {
        content = content.replaceAll(`__${key}__`, value);
      }

      // .gitignore 는 통째로 덮으면 사용자가 추가한 규칙이 사라진다(설계
      // 2.1절). 다른 파일과 다르게 병합 대상으로 낸다 — run 이 mergeIgnore 로
      // 처리한다.
      if (name === '.gitignore') {
        return [{ kind: 'ignore', file: rel, ...splitIgnoreTemplate(content) }];
      }
      return [{ kind: 'file', relPath: rel, content }];
    }),
  );

  return nested.flat();
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

  const plan = async (ctx: Ctx): Promise<PlannedChange[]> =>
    await collectTree(join(templatesRoot(), template), '', { NAME: ctx.name, ...vars });

  return {
    kind: 'copyOverlay',
    label: `오버레이 복사: templates/${template}`,
    describe: () => ({ template, vars: Object.keys(vars), expectUpstream: Object.keys(expectUpstream) }),
    plan,
    run: async (ctx: Ctx) => {
      // 드리프트 감지는 생성 시점 전용 가드다 — 공식 CLI 산출물이 바뀌었는지
      // 본다. plan 에 두지 않는 것이 요구다: update 는 plan 만 호출하므로
      // 사람이 고친 기존 파일을 상류 변경으로 오인하지 않는다(설계 1.3절).
      await assertNoDrift(ctx.targetDir, expectUpstream);

      const changes = await plan(ctx);
      for (const change of changes) {
        if (change.kind === 'ignore') {
          const target = join(ctx.targetDir, ...change.file.split('/'));
          // 기존 내용을 읽어야 병합할 수 있다. readExistingOrEmpty 는 ENOENT
          // (신규 프로젝트)만 빈 문자열로 취급하고 EACCES 같은 진짜 읽기
          // 실패는 다시 던진다 — `.catch(() => '')`는 그것까지 "없음"으로
          // 오인해 기존 .gitignore 를 조용히 덮어쓴다(리뷰 지적).
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유로 병렬화할 수 없다
          const existing = await readExistingOrEmpty(target);
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
          await mkdir(dirname(target), { recursive: true });
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
          await writeFile(target, mergeIgnore(existing, change.lines, change.block));
          ctx.log(`  병합: ${change.file.split('/').join(sep)}`);
          continue;
        }
        if (change.kind !== 'file') continue;
        const target = join(ctx.targetDir, ...change.relPath.split('/'));
        // 부분 실패 시 어디까지 썼는지가 로그 순서로 드러나야 한다 — 파일마다
        // 순차 실행이 요구사항이다.
        // oxlint-disable-next-line no-await-in-loop -- 위 이유로 병렬화할 수 없다
        await mkdir(dirname(target), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
        await writeFile(target, change.content);
        ctx.log(`  복사: ${change.relPath.split('/').join(sep)}`);
      }
    },
  };
}
