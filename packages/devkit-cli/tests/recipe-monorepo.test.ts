import { describe, expect, it } from 'vitest';
import { devkitVersion } from '../src/lib/version.js';
import { monorepoRecipe } from '../src/recipes/monorepo.js';

/** 릴리스마다 바뀌는 마커 version 을 자리표시자로 바꾼다 — 이유는 recipe-nest.test.ts 참고. */
function withStableVersion<T>(node: T): T {
  // 트리 전체를 걷는다 — monorepo 는 루트와 apps/web 두 곳에 마커를 심어서,
  // 고정 경로로 찾으면 깊은 쪽을 조용히 놓친다(실제로 놓쳤다).
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    for (const item of node) withStableVersion(item);
    return node;
  }
  const record = node as Record<string, unknown>;
  const marker = record.devkit;
  if (marker !== null && typeof marker === 'object' && 'version' in marker) {
    (marker as { version: string }).version = '<devkitVersion>';
  }
  for (const value of Object.values(record)) withStableVersion(value);
  return node;
}

describe('monorepo 레시피', () => {
  it('단계 목록이 스냅샷과 일치한다', () => {
    const steps = monorepoRecipe().map((s) => ({ kind: s.kind, detail: s.describe() }));
    expect(withStableVersion(steps)).toMatchSnapshot();
  });

  it('next 레시피를 합성한다 — 로직을 복제하지 않는다', () => {
    const composed = monorepoRecipe().find((s) => s.kind === 'compose');
    expect(composed).toBeDefined();
    const detail = composed?.describe() as { steps: unknown[] };
    expect(detail.steps.length).toBeGreaterThan(3);
  });

  it('합성된 next 레시피에는 install과 자가검증이 없다', () => {
    // 설치는 루트에서 한 번만 해야 한다. apps/web에서 따로 하면
    // 중첩 node_modules가 생긴다.
    const composed = monorepoRecipe().find((s) => s.kind === 'compose');
    const detail = composed?.describe() as { steps: { command?: string; args?: string[] }[] };
    const hasInstall = detail.steps.some(
      (s) => s.command === 'pnpm' && s.args?.includes('install') === true,
    );
    expect(hasInstall).toBe(false);
  });

  it('apps/web/pnpm-workspace.yaml을 required로 제거한다', () => {
    // 이 방어가 조용히 무력화되면 중첩 워크스페이스를 못 잡는다(설계 6.1절).
    const removes = monorepoRecipe().filter((s) => s.kind === 'removeFiles');
    const target = removes.find((s) =>
      (s.describe() as { paths: string[] }).paths.some((p) => p.includes('pnpm-workspace.yaml')),
    );
    expect(target).toBeDefined();
    const detail = target?.describe() as { required: boolean };
    expect(detail.required).toBe(true);
  });

  it('apps/web/eslint.config.mjs를 required로 제거한다', () => {
    // 실측(Step 7): 이 파일이 남으면 ESLint가 중첩 설정으로 로드해
    // typescript-eslint의 tsconfigRootDir 자동추론이 루트·apps/web 두
    // 후보를 동시에 등록하면서 "multiple candidate TSConfigRootDirs"
    // 에러로 전체 린트가 죽는다. required:true 없이는 next 템플릿이
    // 이 파일을 더 이상 만들지 않게 되는 변화도 조용히 넘어간다.
    const removes = monorepoRecipe().filter((s) => s.kind === 'removeFiles');
    const target = removes.find((s) =>
      (s.describe() as { paths: string[] }).paths.some((p) => p.includes('eslint.config.mjs')),
    );
    expect(target).toBeDefined();
    const detail = target?.describe() as { required: boolean };
    expect(detail.required).toBe(true);
  });

  it('apps/web/eslint.config.mjs를 지우므로 eslint·prettier·typescript-eslint를 전부 devDependencies에서 뺀다', () => {
    // 루트가 담당한다. 앱에서 중복 선언하지 않는다 — 셋 다 같은 이유다.
    // typescript-eslint는 apps/web/eslint.config.mjs가 파서로 쓰던 것인데
    // 그 파일 자체를 지웠으니 앱에는 쓸 곳이 없다(리뷰 Finding 1).
    const merge = monorepoRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: { devDependencies: Record<string, unknown> } };
    expect(detail.patch.devDependencies.eslint).toBeNull();
    expect(detail.patch.devDependencies.prettier).toBeNull();
    expect(detail.patch.devDependencies['typescript-eslint']).toBeNull();
  });

  it('루트와 apps/web에 각각 의존 선언을 한다', () => {
    // package.json이 둘로 나뉘므로(루트·apps/web) 레지스트리 선언도 각자 필요하다.
    const links = monorepoRecipe().filter((s) => s.kind === 'registryDeps');
    const composed = monorepoRecipe().find((s) => s.kind === 'compose');
    const composedDetail = composed?.describe() as { steps: { packages?: string[] }[] };
    const nested = composedDetail.steps.filter((s) => s.packages !== undefined);
    expect(links.length).toBeGreaterThan(0);
    expect(nested.length).toBeGreaterThan(0);
  });
});

describe('마커', () => {
  it('package.json 병합 패치에 devkit 마커가 들어간다', () => {
    const steps = monorepoRecipe({ skipInstall: true });
    const patches = steps
      .filter((step) => step.kind === 'mergeJson')
      .map((step) => step.describe() as { patch: Record<string, unknown> });

    const marker = patches.find((p) => 'devkit' in p.patch)?.patch.devkit;
    expect(marker).toEqual({ type: 'monorepo', version: devkitVersion() });
  });
});
