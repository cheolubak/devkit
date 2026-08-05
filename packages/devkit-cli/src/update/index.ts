import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseOnly, type Category } from '../lib/categories.js';
import { classifyFiles, formatChangeList } from '../lib/classify.js';
import { confirm } from '../lib/confirm.js';
import { inspectGit } from '../lib/git.js';
import { devkitVersion } from '../lib/version.js';
import { delegate } from '../ops/delegate.js';
import { pathExists } from '../ops/path-exists.js';
import type { Ctx } from '../types.js';
import { buildPlan, effectiveCategories } from './plan.js';
import { resolveType } from './resolve-type.js';

export interface UpdateOptions {
  targetDir: string;
  /** 게시본 실행에서는 null 이다. types.ts 의 Ctx.toolkitRoot 와 같은 계약이다. */
  toolkitRoot: string | null;
  only?: string;
  type?: string;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
  /** 테스트용. CLI 는 넘기지 않는다. */
  skipInstall?: boolean;
  ask?: (question: string) => Promise<boolean>;
  log?: (message: string) => void;
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const log = options.log ?? ((message: string) => process.stdout.write(`${message}\n`));
  const ask = options.ask ?? confirm;
  const targetDir = resolve(options.targetDir);
  const toolkitRoot = options.toolkitRoot === null ? null : resolve(options.toolkitRoot);

  // 1. 대상 확정. 툴킷 저장소 자신을 대상으로 삼으면 `pnpm devbak update` 한 번에
  // 이 저장소가 프로젝트 템플릿으로 덮인다 — 무심코 칠 수 있는 명령이라 막는다.
  // 게시본(toolkitRoot === null)에는 막을 저장소가 없다.
  if (toolkitRoot !== null && targetDir === toolkitRoot) {
    throw new Error(
      '툴킷 저장소 자신은 update 대상이 될 수 없습니다. 대상 프로젝트 경로를 지정하세요.',
    );
  }

  const pkgPath = join(targetDir, 'package.json');
  const pkgRaw = await readFile(pkgPath, 'utf8').catch(() => null);
  if (pkgRaw === null) {
    throw new Error(`${pkgPath} 를 읽을 수 없습니다. devkit 이 다룰 수 있는 프로젝트가 아닙니다.`);
  }

  // 2. 유형 결정
  const only = options.only === undefined ? undefined : parseOnly(options.only);
  const packageJson: unknown = JSON.parse(pkgRaw);
  const { type, hadMarker } = resolveType(packageJson, options.type);

  // 3. git 게이트
  await gitGate(targetDir, options, ask, log);

  // monorepo인데 대상에 apps/web이 없으면 apps/web/** 전체가 "신규"로
  // 계획에 들어온다(사용자가 apps/site로 개명한 경우 등). 데이터 손실은
  // 아니고 변경 목록에도 뜨지만, 사람이 놓치기 쉬워 경고를 한 줄 더 남긴다.
  if (type === 'monorepo' && !(await pathExists(join(targetDir, 'apps', 'web', 'package.json')))) {
    log('경고: apps/web/package.json이 없습니다. apps/web 트리 전체가 신규로 생성됩니다.');
  }

  // 4~5. 플랜 · 분류 · 출력
  const categories: ReadonlySet<Category> = effectiveCategories(only);
  const ctx: Ctx = { targetDir, toolkitRoot, name: basename(targetDir), log };
  const planned = await buildPlan({
    type,
    ctx,
    categories,
    // 부분 적용을 "최신 표준 전부 반영"으로 표시하지 않는다(설계 4.2절).
    marker: only === undefined ? { version: devkitVersion() } : null,
  });

  const classified = await classifyFiles(targetDir, planned);
  log(formatChangeList(classified, basename(targetDir), type));

  const writes = classified.filter((item) => item.kind !== 'unchanged');

  // 6. --dry-run 은 확인 프롬프트조차 거치지 않는다. 보여주는 것이 전부다.
  if (options.dryRun === true) {
    log('\n--dry-run — 아무것도 쓰지 않았습니다.');
    return;
  }

  if (writes.length === 0) {
    log('\n변경할 것이 없습니다.');
    return;
  }

  // 7. 확인
  if (options.yes !== true && !(await ask('\n계속할까요?'))) {
    log('중단했습니다.');
    return;
  }

  // 8. 쓰기 — 보여준 것과 같은 바이트를 쓴다. 여기서 다시 계산하거나 파일을
  // 다시 읽지 않는다(설계 5절).
  await writeAll(
    targetDir,
    planned,
    writes.map((item) => item.relPath),
    log,
  );

  // 10. 설치
  const touchedDeps =
    categories.has('deps') && writes.some((item) => item.relPath.endsWith('package.json'));
  if (touchedDeps && options.skipInstall !== true) {
    log('\n의존성이 바뀌어 pnpm install 을 실행합니다.');
    await delegate('pnpm', ['install']).run(ctx);
  }

  // 11. 요약
  log('\n완료. git diff 로 검토하세요.');
  log('설정이 바뀌었으니 pnpm lint 를 한 번 돌려보길 권합니다.');
  if (!hadMarker && only !== undefined) {
    log('마커가 없어 다음에도 --type 이 필요합니다. 전체 update 가 마커를 심습니다.');
  }
}

/**
 * git 안전망(설계 4.1절).
 *
 * dirty 를 더 강하게 막는 이유는 되돌릴 대상이 **섞이기** 때문이다. update 의
 * 결과와 사용자의 미커밋 작업이 같은 diff 에 들어가면 git checkout 이 둘 다
 * 지운다. 저장소가 아니면 애초에 되돌릴 수단이 없으므로 경고로 족하다 —
 * 없는 안전망을 강제할 수는 없다.
 */
const NOT_A_REPO_WARNING = '경고: git 저장소가 아닙니다. 덮어쓴 내용을 되돌릴 수단이 없습니다.';

async function gitGate(
  targetDir: string,
  options: UpdateOptions,
  ask: (question: string) => Promise<boolean>,
  log: (message: string) => void,
): Promise<void> {
  const state = await inspectGit(targetDir);

  // --dry-run 은 게이트를 통과시킨다. 게이트는 **쓰기**를 지키는 장치이고
  // dry-run 은 아무것도 쓰지 않는다. 더 중요한 건 여기서 프롬프트가 뜨면
  // 비대화형 환경의 `--dry-run` 이 응답을 기다리며 영원히 멈춰 선다는
  // 것이다(실측: 저장소가 아닌 대상에 --dry-run 을 돌리면 "그래도
  // 계속할까요?"에서 정지했다). 대신 실제 실행에서 무엇이 기다리는지
  // 미리 알린다 — 침묵하면 dry-run 성공을 보고 실행했다가 영문 모를
  // 거부를 만난다.
  if (options.dryRun === true) {
    if (state.kind === 'dirty') {
      log(
        `알림: 커밋되지 않은 변경이 ${state.changedFiles}건 있습니다. 실제 실행은 --force 없이는 거부됩니다.`,
      );
    }
    if (state.kind === 'not-a-repo') {
      log('알림: git 저장소가 아닙니다. 실제 실행은 진행 여부를 한 번 더 묻습니다.');
    }
    return;
  }

  // --force 는 거부(dirty → throw)와 확인 프롬프트(not-a-repo → ask)만
  // 건너뛴다. "되돌릴 수단이 없다"는 사실 자체는 --force 로도 숨기지
  // 않는다 — 그건 승인받아야 할 관문이 아니라 알아야 할 정보이기
  // 때문이다(README의 "--force는 git 관련 거부만 우회" 서술과 일치).
  if (options.force === true) {
    if (state.kind === 'not-a-repo') log(NOT_A_REPO_WARNING);
    return;
  }

  if (state.kind === 'dirty') {
    throw new Error(
      `커밋되지 않은 변경이 ${state.changedFiles}건 있습니다. update 의 결과와 섞이면 되돌리기 어렵습니다.\n` +
        '커밋하거나 stash 한 뒤 다시 실행하세요. 그래도 진행하려면 --force 를 쓰세요.',
    );
  }

  if (state.kind === 'not-a-repo') {
    log(NOT_A_REPO_WARNING);
    if (options.yes === true) return;
    if (!(await ask('그래도 계속할까요?'))) {
      throw new Error('중단했습니다.');
    }
  }
}

async function writeAll(
  targetDir: string,
  planned: readonly { relPath: string; content: string }[],
  targets: readonly string[],
  log: (message: string) => void,
): Promise<void> {
  const wanted = new Set(targets);

  for (const file of planned) {
    if (!wanted.has(file.relPath)) continue;
    const full = join(targetDir, ...file.relPath.split('/'));
    // oxlint-disable-next-line no-await-in-loop -- 부분 실패 시 어디까지 썼는지가 로그 순서로 드러나야 한다
    await mkdir(dirname(full), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
    await writeFile(full, file.content);
    log(`  씀: ${file.relPath}`);
  }
}
