import { describe, expect, it } from 'vitest';
import { devkitVersion } from '../src/lib/version.js';
import { nextRecipe } from '../src/recipes/next.js';

// 라벨 부분일치(includes)는 쓰지 않는다 — registryDeps가 선언하는
// '@cheolubak/eslint-plugin-fsd'라는 문자열 자체가 'lint'를 부분 문자열로
// 포함해(esLINT) skipInstall이어도 거짓양성이 난다. recipe-nest.test.ts와
// 같은 이유로 정확 일치를 쓴다.
const isInstallStep = (s: { label: string }): boolean => s.label === 'pnpm install';
const isVerifyStep = (s: { label: string }): boolean => s.label === 'pnpm lint' || s.label === 'pnpm build';

describe('next 레시피', () => {
  it('단계 목록이 스냅샷과 일치한다', () => {
    const steps = nextRecipe().map((s) => ({ kind: s.kind, detail: s.describe() }));
    expect(steps).toMatchSnapshot();
  });

  it('--no-eslint로 스캐폴딩한다 — 우리 설정을 깨끗하게 얹기 위해서다', () => {
    const scaffoldStep = nextRecipe()[0];
    const detail = scaffoldStep?.describe() as { argsAfter: string[] };
    expect(detail.argsAfter).toContain('--no-eslint');
    expect(detail.argsAfter).toContain('--skip-install');
    expect(detail.argsAfter).toContain('--disable-git');
  });

  it('AGENTS.md와 CLAUDE.md를 제거한다', () => {
    const remove = nextRecipe().find((s) => s.kind === 'removeFiles');
    const detail = remove?.describe() as { paths: string[]; required: boolean };
    expect(detail.paths).toEqual(expect.arrayContaining(['AGENTS.md', 'CLAUDE.md']));
    expect(detail.required).toBe(true);
  });

  it('pnpm-workspace.yaml은 지우지 않는다 — 단일 앱에서는 sharp 빌드 승인에 필요하다', () => {
    const removes = nextRecipe().filter((s) => s.kind === 'removeFiles');
    const allPaths = removes.flatMap((s) => (s.describe() as { paths: string[] }).paths);
    expect(allPaths).not.toContain('pnpm-workspace.yaml');
  });

  it('FSD 레이어를 만들고 pages 대신 views를 쓴다', () => {
    const dirs = nextRecipe().find((s) => s.kind === 'makeDirs');
    const detail = dirs?.describe() as { paths: string[] };
    expect(detail.paths).toEqual(
      expect.arrayContaining([
        'src/views',
        'src/widgets',
        'src/features',
        'src/entities',
        'src/shared',
      ]),
    );
    expect(detail.paths).not.toContain('src/pages');
  });

  it('skipInstall이면 install도 자가검증도 빠진다 — 모노레포 합성용', () => {
    const steps = nextRecipe({ skipInstall: true });
    expect(steps.some(isInstallStep)).toBe(false);
    expect(steps.some(isVerifyStep)).toBe(false);
  });

  it('skipVerify면 자가검증 단계만 빠지고 install은 남는다', () => {
    const steps = nextRecipe({ skipVerify: true });
    expect(steps.some(isInstallStep)).toBe(true);
    expect(steps.some(isVerifyStep)).toBe(false);
  });

  it('package.json에 "type": "module"을 심는다', () => {
    // create-next-app 산출물은 "type"이 없어 CJS로 취급된다. Vite가
    // vitest.config.ts를 CJS로 번들링하면 externalize-deps가 ESM 전용인
    // @cheolubak/vitest-config를 require()로 로드하려다 실패한다(2026-08-01 실측,
    // "@cheolubak/vitest-config/next" resolved to an ESM file). create-next-app
    // 산출물엔 .js 파일이 없어(전부 .ts/.tsx/.mjs) 안전하다.
    const merge = nextRecipe().find((s) => s.kind === 'mergeJson');
    const detail = merge?.describe() as { patch: { type?: string } };
    expect(detail.patch.type).toBe('module');
  });
});

describe('마커', () => {
  it('package.json 병합 패치에 devkit 마커가 들어간다', () => {
    const steps = nextRecipe({ skipInstall: true });
    const patches = steps
      .filter((step) => step.kind === 'mergeJson')
      .map((step) => step.describe() as { patch: Record<string, unknown> });

    const marker = patches.find((p) => 'devkit' in p.patch)?.patch.devkit;
    expect(marker).toEqual({ type: 'next', version: devkitVersion() });
  });
});
