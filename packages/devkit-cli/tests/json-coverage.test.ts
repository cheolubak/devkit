import { describe, expect, it } from 'vitest';
import { categoryOfJsonPath, MARKER_KEY } from '../src/lib/categories.js';
import type { JsonObject } from '../src/ops/merge-json.js';
import { monorepoRecipe } from '../src/recipes/monorepo.js';
import { nestRecipe } from '../src/recipes/nest.js';
import { nextRecipe } from '../src/recipes/next.js';
import type { Ctx, Recipe } from '../src/types.js';
import { flattenSteps } from '../src/update/flatten.js';
import { isJsonOverlay, reduceJsonOverlay } from '../src/update/json-patch.js';

const CTX: Ctx = { targetDir: '/a/b/demo', toolkitRoot: '/a/b/eslint', name: 'demo', log: () => {} };

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 분류되지 않은 잎 경로를 모은다. */
function unclassified(patch: JsonObject, prefix = ''): string[] {
  const bad: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (prefix === '' && key === MARKER_KEY) continue;

    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (categoryOfJsonPath(path) !== null) continue;

    if (isPlainObject(value)) {
      bad.push(...unclassified(value, path));
      continue;
    }
    bad.push(path);
  }

  return bad;
}

async function packageJsonPatches(recipe: Recipe): Promise<JsonObject[]> {
  const patches: JsonObject[] = [];

  for (const { step, ctx } of flattenSteps(recipe({ skipInstall: true }), CTX)) {
    if (step.plan === undefined) continue;
    const changes = await step.plan(ctx);

    for (const change of changes) {
      if (change.kind === 'json' && change.file.endsWith('package.json')) {
        patches.push(change.patch);
      }
      if (
        change.kind === 'file' &&
        isJsonOverlay(change.relPath) &&
        change.relPath.endsWith('package.json')
      ) {
        patches.push(reduceJsonOverlay(change.relPath, change.content));
      }
    }
  }

  return patches;
}

describe('JSON 키 경로 커버리지', () => {
  it.each([
    ['nest', nestRecipe],
    ['next', nextRecipe],
    ['monorepo', monorepoRecipe],
  ])(
    '%s 레시피의 package.json 패치 경로가 전부 분류된다',
    async (_name, recipe) => {
      const patches = await packageJsonPatches(recipe);
      const bad = patches.flatMap((patch) => unclassified(patch));

      // 미분류 경로가 있으면 그 키는 어떤 --only 로도 갱신되지 않으면서
      // 성공을 보고한다. src/lib/categories.ts 의 JSON_KEY_CATEGORIES 에
      // 추가하라는 뜻이다(설계 6.3절).
      expect(bad).toEqual([]);
    },
  );

  it('패치가 실제로 수집된다 — 빈 배열을 통과로 오인하지 않는다', async () => {
    // 위 테스트는 bad 가 비면 통과한다. 수집 자체가 망가져 patches 가 비어도
    // 통과하므로, 여기서 최소 개수를 못 박는다.
    const patches = await packageJsonPatches(nestRecipe);
    expect(patches.length).toBeGreaterThanOrEqual(2);
  });
});
