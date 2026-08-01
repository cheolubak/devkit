import { describe, expect, it } from 'vitest';
import { nestRecipe } from '../src/recipes/nest.js';

// 라벨 부분일치(includes)는 쓰지 않는다 — linkDeps가 링크하는
// '@devbak/eslint-config-nest'라는 문자열 자체가 'lint'를 부분
// 문자열로 포함해(e-s-LINT) skipVerify여도 거짓양성이 난다.
const isVerifyStep = (s: { label: string }): boolean => s.label === 'pnpm lint' || s.label === 'pnpm build';

describe('nest 레시피', () => {
  it('단계 목록이 스냅샷과 일치한다', () => {
    const steps = nestRecipe().map((s) => ({ kind: s.kind, detail: s.describe() }));
    expect(steps).toMatchSnapshot();
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
