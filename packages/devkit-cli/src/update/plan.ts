import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import {
  CATEGORIES,
  categoryOf,
  DEFAULT_EXCLUDED_CATEGORIES,
  type Category,
} from '../lib/categories.js';
import type { PlannedFile } from '../lib/classify.js';
import { markerPatch, type ProjectType } from '../lib/marker.js';
import { mergeIgnore } from '../ops/merge-ignore.js';
import { applyPatch, type JsonObject } from '../ops/merge-json.js';
import { readExistingOrEmpty } from '../ops/read-existing.js';
import { monorepoRecipe } from '../recipes/monorepo.js';
import { nestRecipe } from '../recipes/nest.js';
import { nextRecipe } from '../recipes/next.js';
import type { Ctx, Recipe } from '../types.js';
import { flattenSteps } from './flatten.js';
import { filterPatchByCategory, isJsonOverlay, reduceJsonOverlay } from './json-patch.js';

const RECIPES: Record<ProjectType, Recipe> = {
  nest: nestRecipe,
  next: nextRecipe,
  monorepo: monorepoRecipe,
};

/**
 * 재적용 대상 연산은 `step.plan` 유무만으로 가른다(설계 5.3절 표와 일치 —
 * `copyOverlay`·`mergeJson`·`registryDeps`만 `plan()`을 정의한다).
 *
 * 예전엔 `PLANNABLE = new Set(['copyOverlay', 'mergeJson', 'linkDeps'])`
 * 화이트리스트를 따로 두고 `!PLANNABLE.has(step.kind) || step.plan ===
 * undefined`로 걸렀다. 그런데 이 집합에 속한 op 는 전부 예외 없이 `plan`을
 * 정의하므로 두 조건은 항상 같은 값을 낸다 — 화이트리스트가 실제로 걸러낸
 * 적이 없다는 뜻이다. 유일한 효과는 미래에 `plan()`을 얻은 op 가 이
 * 집합에 등록되지 않으면 **조용히** 계획에서 빠지는 것이었다. "조용한
 * 실패 금지" 원칙에 따라 화이트리스트를 없애고 `plan` 존재 자체를
 * 신호로 쓴다 — 새 op 가 `plan`을 정의하면 등록 없이 자동으로 대상이 된다.
 */

/**
 * `--only` 를 유효 카테고리 집합으로 바꾼다.
 *
 * 생략하면 scaffold 를 뺀 전체다 — 프레임워크 뼈대는 생성 시점에 한 번
 * 놓이고 그 뒤로는 사람이 고쳐 쓰는 파일이라, 재적용이 덮으면 사용자의
 * 작업이 사라진다. 명시해야만 대상이 된다.
 */
export function effectiveCategories(only?: Category[]): Set<Category> {
  if (only !== undefined) return new Set(only);
  const excluded = new Set<Category>(DEFAULT_EXCLUDED_CATEGORIES);
  return new Set(CATEGORIES.filter((category) => !excluded.has(category)));
}

export interface BuildPlanOptions {
  type: ProjectType;
  ctx: Ctx;
  categories: ReadonlySet<Category>;
  /** 마커를 얹을 버전. `null` 이면 얹지 않는다(= `--only` 가 주어진 경우). */
  marker: { version: string } | null;
}

/**
 * 재적용할 파일의 **최종 내용**을 전부 계산한다. 아무것도 쓰지 않는다.
 *
 * 이것이 이 명령의 중심이다. 변경 목록을 보여주려면 어차피 최종 내용이
 * 필요하고, 계산해 두면 쓰기는 writeFile 뿐이라 **사람에게 보여준 것과
 * 실제로 쓰는 것이 같은 바이트**임이 구조적으로 보장된다(설계 5절).
 */
export async function buildPlan({
  type,
  ctx,
  categories,
  marker,
}: BuildPlanOptions): Promise<PlannedFile[]> {
  const files = new Map<string, string>();
  const jsonTargets = new Map<string, JsonObject>();
  // 대상의 기존 내용을 반영해 만든 경로. PlannedFile.preservesExisting 의 출처다.
  const preserving = new Set<string>();
  // 카테고리는 필터를 통과한 시점의 값을 기억한다. 합성된 하위 프로젝트의
  // 파일은 루트 기준 경로로 다시 분류하면 어떤 패턴에도 걸리지 않는다.
  const fileCategories = new Map<string, Category>();

  const flat = flattenSteps(RECIPES[type]({ skipInstall: true }), ctx);

  for (const { step, ctx: stepCtx } of flat) {
    // removeFiles 는 실행하지 않지만 계획에는 반영한다. 순서가 의미를
    // 만든다 — next 는 지운 뒤 놓고(CLAUDE.md 는 남아야 한다), monorepo 는
    // 놓은 뒤 지운다(apps/web 설정은 빠져야 한다). 여기서 누적된 것만
    // 지우면 두 방향이 자연히 맞는다(설계 5.7절).
    if (step.removes !== undefined) {
      dropPlanned(
        [files, jsonTargets, fileCategories, preserving],
        ctx.targetDir,
        stepCtx.targetDir,
        step.removes,
      );
      continue;
    }
    if (step.plan === undefined) continue;
    // 순서가 의미를 만든다: monorepo 는 package.json 을 놓은 뒤 그 파일을 패치한다.
    // oxlint-disable-next-line no-await-in-loop -- 위 이유로 병렬화할 수 없다
    const changes = await step.plan(stepCtx);
    const rel = relativeToRoot(ctx.targetDir, stepCtx.targetDir);

    for (const change of changes) {
      // 카테고리 판정은 **단계 기준 경로**로 한다. 카테고리 패턴은 프로젝트
      // 루트에 앵커돼 있고(`^tsconfig\.json$`), apps/web 은 그 자체로 하나의
      // 프로젝트다. 루트 기준 'apps/web/CLAUDE.md' 로 분류하면 어떤 패턴에도
      // 걸리지 않아 합성된 하위 오버레이가 통째로 계획에서 사라진다.
      const stepRelPath = (change.kind === 'file' ? change.relPath : change.file).replaceAll(
        '\\',
        '/',
      );
      const relPath = joinRel(rel, stepRelPath);
      const fileCategory = categoryOf(stepRelPath);

      if (change.kind === 'ignore') {
        // 대상 내용을 읽어 병합한다. 통째로 덮으면 사용자가 추가한 규칙이
        // 사라진다 — JSON 오버레이가 reduceJsonOverlay 로 피하는 것과 같은
        // 문제다(설계 1.2절).
        if (fileCategory !== null && categories.has(fileCategory)) {
          // readExistingOrEmpty 는 ENOENT(대상에 아직 없음)만 빈 문자열로
          // 취급하고 EACCES 같은 진짜 읽기 실패는 다시 던진다 —
          // `.catch(() => '')`는 그것까지 "없음"으로 오인해 기존
          // .gitignore 를 조용히 덮어쓴다(리뷰 지적).
          // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
          const existing = await readExistingOrEmpty(join(ctx.targetDir, relPath));
          files.set(relPath, mergeIgnore(existing, change.lines, change.block));
          fileCategories.set(relPath, fileCategory);
          preserving.add(relPath);
        }
        continue;
      }

      if (change.kind === 'file' && !isJsonOverlay(stepRelPath)) {
        // 파일 오버레이는 카테고리 하나로 전부 판단한다.
        if (fileCategory !== null && categories.has(fileCategory)) {
          files.set(relPath, change.content);
          fileCategories.set(relPath, fileCategory);
        }
        continue;
      }

      // JSON 은 파일이든 패치든 전부 "기준 내용 + 패치"로 다룬다(설계 5.5절).
      // isJsonOverlay 는 위에서 단계 기준(stepRelPath)으로 판단했지만
      // reduceJsonOverlay 는 루트 기준(relPath)을 쓴다 — 둘 다 basename만
      // 보므로 결과는 같지만(증명적으로 동치), 파싱 실패 시 에러 메시지에
      // 'apps/web/tsconfig.json'처럼 하위 경로까지 나와야 어느 파일인지
      // 바로 알 수 있기 때문이다('tsconfig.json'만으로는 모호하다).
      const patch =
        change.kind === 'file' ? reduceJsonOverlay(relPath, change.content) : change.patch;
      const scoped = filterPatchByCategory(
        patch,
        categories,
        isPackageJson(stepRelPath) ? null : fileCategory,
      );
      if (Object.keys(scoped).length === 0) continue;

      // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
      const base = jsonTargets.get(relPath) ?? (await readJsonOrEmpty(ctx.targetDir, relPath));
      jsonTargets.set(relPath, applyPatch(base, scoped));
      // package.json 은 키마다 카테고리가 다르다. 표시용 한 값으로는
      // 파일 카테고리(repo)를 쓴다.
      fileCategories.set(relPath, fileCategory ?? 'repo');
    }
  }

  if (marker !== null) {
    const base =
      jsonTargets.get('package.json') ?? (await readJsonOrEmpty(ctx.targetDir, 'package.json'));
    jsonTargets.set('package.json', applyPatch(base, markerPatch(type, marker.version)));
    fileCategories.set('package.json', 'repo');
  }

  // JSON 은 전부 "대상 내용 + 패치"로 만들어진다(readJsonOrEmpty 로 기존을
  // 읽어 applyPatch 한다). 마커만 얹힌 package.json 도 같은 경로라 여기서
  // 한 번에 표시하면 분기마다 add 하는 것보다 빠뜨릴 여지가 없다.
  for (const [relPath, value] of jsonTargets) {
    files.set(relPath, `${JSON.stringify(value, null, 2)}\n`);
    preserving.add(relPath);
  }

  return [...files]
    .map(
      ([relPath, content]): PlannedFile => ({
        relPath,
        content,
        // 카테고리 필터는 이미 끝났다. 여기 값은 표시·디버깅용이며,
        // package.json 처럼 여러 카테고리가 섞인 파일은 파일 카테고리를 쓴다.
        category: fileCategories.get(relPath) ?? 'repo',
        preservesExisting: preserving.has(relPath),
      }),
    )
    // localeCompare 는 ICU 로케일에 따라 순서가 달라질 수 있다. 표시
    // 순서일 뿐이라 동작에 영향은 없지만, 결정적 비교로 고정해 둔다.
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
}

function isPackageJson(relPath: string): boolean {
  return relPath === 'package.json' || relPath.endsWith('/package.json');
}

/**
 * 누적된 계획에서 removeFiles 대상을 뺀다. **디스크는 건드리지 않는다.**
 *
 * 디렉토리 경로는 prefix 로 매칭한다 — `apps/web/.claude` 가
 * `apps/web/.claude/agents/devkit-reviewer.md` 를 걸러야 한다.
 * 레시피가 join() 으로 만든 경로에는 플랫폼 구분자가 섞이므로 정규화한다.
 */
/** Map 과 Set 을 함께 받기 위한 최소 계약. 여기서 쓰는 건 이 둘뿐이다. */
interface Droppable {
  keys(): Iterable<string>;
  delete(key: string): unknown;
}

function dropPlanned(
  maps: ReadonlyArray<Droppable>,
  root: string,
  stepTarget: string,
  removes: readonly string[],
): void {
  const prefix = relativeToRoot(root, stepTarget);

  for (const path of removes) {
    const rel = joinRel(prefix, path);
    for (const map of maps) {
      // 순회 중 delete 는 Map 이터레이터가 보장하는 동작이다 — 아직 방문하지
      // 않은 항목을 지우면 건너뛰고, 이미 지나간 항목에는 영향이 없다.
      for (const key of map.keys()) {
        if (key === rel || key.startsWith(`${rel}/`)) map.delete(key);
      }
    }
  }
}

/** 루트 대상 디렉토리 기준의 POSIX 상대경로. compose 가 만든 하위 ctx 용이다. */
function relativeToRoot(root: string, sub: string): string {
  if (sub === root) return '';
  return sub.slice(root.length + 1).replaceAll('\\', '/');
}

function joinRel(prefix: string, relPath: string): string {
  const normalized = relPath.replaceAll('\\', '/');
  return prefix === '' ? normalized : posix.join(prefix, normalized);
}

/** 없으면 빈 객체. 신규 파일은 패치가 곧 전체 내용이 된다. */
async function readJsonOrEmpty(targetDir: string, relPath: string): Promise<JsonObject> {
  const full = join(targetDir, ...relPath.split('/'));
  const raw = await readFile(full, 'utf8').catch((error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  });
  if (raw === null) return {};
  try {
    return JSON.parse(raw) as JsonObject;
  } catch (error) {
    // 대상은 임의의 기존 프로젝트다 — 주석이 섞인 tsconfig.json처럼 흔한
    // 변형을 만나면 경로 없는 SyntaxError만 던져서는 어느 파일인지 알 수
    // 없다. json-patch.ts의 reduceJsonOverlay와 같은 관용으로 경로를 얹는다.
    throw new Error(`${full}: JSON 파싱 실패`, { cause: error });
  }
}
