import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monorepoRecipe } from '../src/recipes/monorepo.js';
import { flattenSteps } from '../src/update/flatten.js';
import type { Ctx } from '../src/types.js';

const CTX: Ctx = {
  targetDir: '/a/b/demo',
  toolkitRoot: '/a/b/eslint',
  name: 'demo',
  log: () => {},
};

describe('flattenSteps', () => {
  it('compose 안으로 들어가 하위 단계를 펼친다', () => {
    const flat = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX);

    // compose 자체는 결과에 남지 않는다 — 실행 단위가 아니라 컨테이너다.
    expect(flat.some(({ step }) => step.kind === 'compose')).toBe(false);
    // next 레시피의 오버레이가 펼쳐져 나온다.
    expect(flat.some(({ step }) => step.label === '오버레이 복사: templates/next')).toBe(true);
  });

  it('하위 단계에는 매핑된 ctx가 붙는다', () => {
    const flat = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX);
    const nextOverlay = flat.find(({ step }) => step.label === '오버레이 복사: templates/next');

    expect(nextOverlay!.ctx.targetDir).toBe(join('/a/b/demo', 'apps', 'web'));
    expect(nextOverlay!.ctx.name).toBe('web');
    // toolkitRoot는 매핑되지 않는다 — link: 상대경로 계산의 기준점이다.
    expect(nextOverlay!.ctx.toolkitRoot).toBe('/a/b/eslint');
  });

  it('최상위 단계에는 원래 ctx가 붙는다', () => {
    const flat = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX);
    const rootOverlay = flat.find(({ step }) => step.label === '오버레이 복사: templates/monorepo');

    expect(rootOverlay!.ctx.targetDir).toBe('/a/b/demo');
  });

  it('순서를 보존한다 — monorepo 오버레이가 next 오버레이보다 앞선다', () => {
    const labels = flattenSteps(monorepoRecipe({ skipInstall: true }), CTX).map(({ step }) => step.label);

    expect(labels.indexOf('오버레이 복사: templates/monorepo')).toBeLessThan(
      labels.indexOf('오버레이 복사: templates/next'),
    );
  });
});
