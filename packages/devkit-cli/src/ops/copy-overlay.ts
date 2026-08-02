import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ctx, PlannedChange, Step } from '../types.js';
import { pathExists } from './path-exists.js';

/** '_' 접두어를 '.'으로 바꾼다. _gitignore → .gitignore */
export function templateFileName(name: string): string {
  return name.startsWith('_') ? `.${name.slice(1)}` : name;
}

/**
 * templates/ 디렉토리를 찾는다. 이 모듈이 두 레이아웃으로 로드될 수 있다는
 * 실측 사실 때문에 한 단계가 아니다:
 *
 * - 배포판(tsup 번들): dist/ 아래가 flat 하다(dist/bin.js, dist/chunk-*.js —
 *   서브폴더 없음). 이 파일의 위치가 dist/이므로 한 단계(..)만 올라가면
 *   templates/에 닿는다.
 * - vitest(소스 직접 실행): 이 파일이 src/ops/에 있으므로 devkit-cli
 *   루트까지 두 단계(../..)를 올라가야 한다.
 *
 * 조용히 잘못된 경로를 고르면 호출부가 `scandir ENOENT`라는 엉뚱한 에러로
 * 죽는다 — 둘 다 없으면 원인을 바로 알 수 있도록 명시적으로 던진다.
 */
function templatesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const bundledLayout = join(here, '..', 'templates');
  const sourceLayout = join(here, '..', '..', 'templates');
  if (existsSync(bundledLayout)) return bundledLayout;
  if (existsSync(sourceLayout)) return sourceLayout;
  throw new Error(`templates 디렉토리를 찾지 못했습니다 (확인한 경로: ${bundledLayout}, ${sourceLayout}).`);
}

/**
 * 템플릿 트리를 읽어 (상대경로, 최종 내용) 목록으로 만든다. **쓰지 않는다.**
 *
 * 상대경로는 POSIX `/` 로 고정한다 — 카테고리 패턴 테이블이 `/` 를 기준으로
 * 쓰였고(categoryOf 가 스스로 정규화하긴 하지만), 변경 목록 출력도 플랫폼과
 * 무관해야 스냅샷이 안정적이다.
 */
async function collectTree(
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
