import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseOnly, type Category } from '../lib/categories.js';
import { classifyFiles, formatChangeList } from '../lib/classify.js';
import { confirm } from '../lib/confirm.js';
import { inspectGit } from '../lib/git.js';
import { devkitVersion } from '../lib/version.js';
import { delegate } from '../ops/delegate.js';
import { pathExists } from '../ops/path-exists.js';
import type { Ctx } from '../types.js';
import { findCommonJsFiles } from './cjs-scan.js';
import { buildPlan, effectiveCategories } from './plan.js';
import { retiredTargets, type RetiredFile } from './retired.js';
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
  warnClobbered(classified, planned, hadMarker, log);
  await warnTypeModule(targetDir, packageJson, planned, log);

  // 은퇴 파일은 계획(PlannedFile)이 아니라 삭제라 변경 목록과 따로 낸다.
  // 조용히 지우면 update 가 사용자 파일을 없앴다는 사실이 어디에도 남지 않는다.
  const retired = await retiredTargets(targetDir, categories);
  if (retired.length > 0) {
    log(`\n  지움 (${retired.length})`);
    for (const file of retired) log(`    ${file.relPath} — ${file.reason}`);
  }

  const writes = classified.filter((item) => item.kind !== 'unchanged');

  // 6. --dry-run 은 확인 프롬프트조차 거치지 않는다. 보여주는 것이 전부다.
  if (options.dryRun === true) {
    log('\n--dry-run — 아무것도 쓰지 않았습니다.');
    return;
  }

  if (writes.length === 0 && retired.length === 0) {
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

  await removeRetired(targetDir, retired, log);

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
 * 사용자가 직접 쓴 파일이 통째로 교체되는 것을 이름 붙여 알린다.
 *
 * 변경 목록의 "덮어쓰기"는 두 가지를 한 단어로 뭉뚱그린다 — `package.json`
 * 처럼 기존 위에 패치가 얹히는 것과, `eslint.config.mjs` 처럼 통째로
 * 교체되는 것. 뒤쪽은 사용자가 써 둔 내용이 사라지는데도 목록에서는 똑같이
 * 보인다. 실제로 기존 프로젝트에 devkit 을 처음 붙였을 때 `eslint.config.mjs`
 * 의 `ignores` 가 이렇게 증발했고, 저장소 안의 라이브 worktree 를 린트하다
 * 린트가 결과가 아니라 크래시로 끝났다(2026-08-07 소비자 실측).
 *
 * `.gitignore` 처럼 병합기를 만들 수 있는 파일은 이미 병합한다. JS 설정은
 * 파싱해서 합칠 수 없으므로 devkit 이 할 수 있는 최선은 무엇이 사라지는지
 * 미리 말하는 것이다 — 조용히 지우지 않는 것이 요점이다.
 *
 * **마커가 있으면 알리지 않는다.** 그때 "덮어쓰기"는 devkit 자신의 이전
 * 산출물을 갱신하는 것이고, 그건 update 가 하기로 한 바로 그 일이라
 * 경고하면 매번 뜨는 노이즈가 된다. 마커가 없다는 것은 devkit 이 이
 * 프로젝트를 관리한 적이 없다는 뜻이고, 그러면 덮이는 것은 전부 사람의 것이다.
 */
function warnClobbered(
  classified: readonly { kind: string; relPath: string }[],
  planned: readonly { relPath: string; preservesExisting: boolean }[],
  hadMarker: boolean,
  log: (message: string) => void,
): void {
  if (hadMarker) return;

  const preserved = new Set(
    planned.filter((file) => file.preservesExisting).map((file) => file.relPath),
  );
  const clobbered = classified
    .filter((item) => item.kind === 'overwritten' && !preserved.has(item.relPath))
    .map((item) => item.relPath);

  if (clobbered.length === 0) return;

  log(
    `\n경고: devkit 이 관리한 적 없는 프로젝트입니다(마커 없음). 아래 ${clobbered.length}개 파일은 ` +
      '기존 내용을 반영하지 않고 통째로 교체됩니다:',
  );
  for (const relPath of clobbered) log(`    ${relPath}`);
  log(
    'devkit 이 알 수 없는 설정(예: eslint.config.mjs 의 ignores)은 복원되지 않습니다. ' +
      '필요하면 지금 따로 보관하세요.',
  );
}

/** 파싱된 package.json 에서 `type` 값을 안전하게 꺼낸다. */
function readType(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
}

/**
 * `"type": "module"` 이 새로 얹히면서 기존 CommonJS `.js` 가 깨지는 것을 알린다.
 *
 * 실측 회귀(2026-08-07 소비자): update 가 `type: module` 을 심자
 * `cache-handlers/logging-handler.js` 의 `require`/`module.exports` 가 ESM 으로
 * 재해석돼 죽었고, 그 파일을 `require.resolve` 로 가리키던 `next.config.ts` 도
 * 함께 무너졌다. 해법은 `.cjs` 로 개명하는 것인데, devkit 이 남의 파일을
 * 개명해 줄 수는 없으므로 **무엇이 깨질지 이름 붙여 알리는 데까지** 한다.
 *
 * 이미 `"type": "module"` 인 프로젝트에서는 바뀌는 것이 없으므로 조용하다.
 */
async function warnTypeModule(
  targetDir: string,
  currentPackageJson: unknown,
  planned: readonly { relPath: string; content: string }[],
  log: (message: string) => void,
): Promise<void> {
  if (readType(currentPackageJson) === 'module') return;

  const plannedPkg = planned.find((file) => file.relPath === 'package.json');
  if (plannedPkg === undefined) return;
  const parsed: unknown = JSON.parse(plannedPkg.content);
  if (readType(parsed) !== 'module') return;

  const cjsFiles = await findCommonJsFiles(targetDir);
  if (cjsFiles.length === 0) return;

  log(
    `\n경고: package.json 에 "type": "module" 이 새로 얹힙니다. 아래 CommonJS ` +
      `.js 파일이 ESM 으로 재해석되어 깨집니다(${cjsFiles.length}건):`,
  );
  for (const relPath of cjsFiles) log(`    ${relPath}`);
  log('확장자를 .cjs 로 바꾸고, 그 파일을 가리키는 참조도 함께 고치세요.');
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

async function removeRetired(
  targetDir: string,
  retired: readonly RetiredFile[],
  log: (message: string) => void,
): Promise<void> {
  for (const file of retired) {
    const full = join(targetDir, ...file.relPath.split('/'));
    // oxlint-disable-next-line no-await-in-loop -- 부분 실패 시 어디까지 지웠는지가 로그 순서로 드러나야 한다
    await rm(full, { force: true });
    log(`  지움: ${file.relPath}`);
  }
}
