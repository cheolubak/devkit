import { describe, expect, it } from 'vitest';
import { devkitVersion } from '../src/lib/version.js';
import { nestRecipe } from '../src/recipes/nest.js';

// 라벨 부분일치(includes)는 쓰지 않는다 — registryDeps가 선언하는
// '@cheolubak/eslint-config-nest'라는 문자열 자체가 'lint'를 부분
// 문자열로 포함해(e-s-LINT) skipVerify여도 거짓양성이 난다.
const isVerifyStep = (s: { label: string }): boolean => s.label === 'pnpm lint' || s.label === 'pnpm build';

/**
 * 마커의 version 은 devkit-cli 자신의 버전이라 릴리스마다 바뀐다. 스냅샷에
 * 그대로 박으면 버전을 올릴 때마다 이 테스트가 깨지고, 그러면 **다음** 릴리스의
 * 검증 스텝이 거기서 막힌다(0.1.0 → 0.2.0 에서 실제로 일어났다 — 릴리스는
 * 검증을 마친 뒤에 버전을 올리므로 그 실행은 통과하고 main 만 빨개진다).
 * 값 자체는 아래 마커 테스트가 devkitVersion() 과 직접 대조하므로, 스냅샷은
 * 구조만 고정한다.
 */
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

describe('nest 레시피', () => {
  it('단계 목록이 스냅샷과 일치한다', () => {
    const steps = nestRecipe().map((s) => ({ kind: s.kind, detail: s.describe() }));
    expect(withStableVersion(steps)).toMatchSnapshot();
  });

  it('eslint-plugin-prettier와 eslint-config-prettier를 제거한다', () => {
    // 설계 4.5절(로드맵)이 제거하기로 한 조합. nest new가 기본 포함한다.
    const merge = nestRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: { devDependencies: Record<string, unknown> } };
    expect(detail.patch.devDependencies['eslint-plugin-prettier']).toBeNull();
    expect(detail.patch.devDependencies['eslint-config-prettier']).toBeNull();
  });

  it('eslint를 ^10으로 올린다 — eslint-config-nest가 ^10 전용이다', () => {
    const merge = nestRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: { devDependencies: Record<string, string> } };
    expect(detail.patch.devDependencies.eslint).toMatch(/^\^10\./);
  });

  it('zod는 dependencies에 둔다 — devDependencies면 pnpm install --prod에서 빠져 배포가 깨진다', () => {
    const merge = nestRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as {
      patch: { dependencies?: Record<string, unknown>; devDependencies: Record<string, unknown> };
    };
    expect(detail.patch.dependencies?.zod).toBe('^4.4.3');
    expect(detail.patch.devDependencies.zod).toBeUndefined();
  });

  it('test/jest-e2e.json을 지운다 — jest-e2e.config.js로 대체되어 잔여물이 된다', () => {
    const remove = nestRecipe().find((s) => s.kind === 'removeFiles');
    const detail = remove?.describe() as { paths: string[]; required: boolean };
    expect(detail.paths).toContain('test/jest-e2e.json');
    expect(detail.required).toBe(true);
  });

  it('src/main.ts에 드리프트 감지를 건다 — nest new의 산출물이 바뀌면 조용히 버리지 않는다', () => {
    const overlay = nestRecipe().find((s) => s.kind === 'copyOverlay');
    const detail = overlay?.describe() as { expectUpstream: string[] };
    expect(detail.expectUpstream).toContain('src/main.ts');
  });

  it('인라인 jest 블록을 제거하고 그 존재를 required로 요구한다', () => {
    const merge = nestRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: Record<string, unknown>; required: string[] };
    expect(detail.patch.jest).toBeNull();
    expect(detail.required).toContain('jest');
  });

  it('skipVerify면 자가검증 단계를 빼고, 기본값이면 넣는다', () => {
    const withVerify = nestRecipe().filter(isVerifyStep);
    const without = nestRecipe({ skipVerify: true }).filter(isVerifyStep);
    expect(withVerify.length).toBeGreaterThan(0);
    expect(without).toHaveLength(0);
  });

  it('skipInstall이면 pnpm install도 자가검증도 빼진다', () => {
    // 자가검증은 설치된 의존에 기대므로 install 없이는 의미가 없다.
    // 부분일치(includes)는 쓰지 않는다 — scaffold 단계의 '--skip-install'
    // CLI 플래그 문자열 자체가 'install'을 부분 문자열로 포함해 skipInstall과
    // 무관하게 거짓양성이 난다.
    const steps = nestRecipe({ skipInstall: true });
    expect(steps.some((s) => s.label === 'pnpm install')).toBe(false);
    expect(steps.some((s) => s.label === 'pnpm lint')).toBe(false);
  });
});

describe('마커', () => {
  it('package.json 병합 패치에 devkit 마커가 들어간다', () => {
    const steps = nestRecipe({ skipInstall: true });
    const patches = steps
      .filter((step) => step.kind === 'mergeJson')
      .map((step) => step.describe() as { patch: Record<string, unknown> });

    const marker = patches.find((p) => 'devkit' in p.patch)?.patch.devkit;
    expect(marker).toEqual({ type: 'nest', version: devkitVersion() });
  });
});
