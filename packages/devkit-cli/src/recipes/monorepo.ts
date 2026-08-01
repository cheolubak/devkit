import { join } from 'node:path';
import type { Recipe, Step } from '../types.js';
import { copyOverlay, delegate, linkDeps, makeDirs, mergeJson, removeFiles } from '../ops/index.js';
import { compose } from '../run.js';
import { nextRecipe } from './next.js';

/**
 * Turborepo 모노레포 레시피. 설계 5.3절.
 *
 * next 레시피를 그대로 합성한다 — 이것이 레시피 파이프라인을 택한 이유의
 * 실현이다(설계 4.1절). Next 로직을 복제하지 않는다.
 */
export const monorepoRecipe: Recipe = (options = {}) => {
  const install = options.skipInstall !== true;
  const verify = install && options.skipVerify !== true;

  const steps: Step[] = [
    copyOverlay('monorepo'),

    makeDirs(['apps', 'packages']),

    compose(
      'apps/web에 next 레시피 실행',
      // install·자가검증은 루트에서 한 번만 한다. apps/web에서 따로 설치하면
      // 중첩 node_modules가 생긴다.
      nextRecipe({ skipInstall: true }),
      (ctx) => ({ ...ctx, targetDir: join(ctx.targetDir, 'apps', 'web'), name: 'web' }),
    ),

    // 🚨 create-next-app이 만든 pnpm-workspace.yaml을 지운다. 남으면 pnpm이
    // apps/web을 독립 워크스페이스 루트로 인식한다(설계 2.2절 실측).
    // required: true 없이는 이 방어가 조용히 죽어도 알 수 없다(설계 6.1절).
    removeFiles([join('apps', 'web', 'pnpm-workspace.yaml')], { required: true }),

    // 🚨 next 레시피가 얹은 apps/web/eslint.config.mjs도 지운다. 루트가
    // eslint . 한 번으로 워크스페이스 전체를 훑는 설계이므로 apps/web에
    // 별도 설정이 남으면 안 된다. 실측: ESLint가 이 파일도 중첩 설정으로
    // 로드해 typescript-eslint의 tsconfigRootDir 자동추론이 루트·apps/web
    // 두 후보를 동시에 등록하면서 "multiple candidate TSConfigRootDirs"
    // 에러로 전체 린트가 죽는다. required: true로 next 템플릿이 이 파일을
    // 더는 만들지 않게 되는 변화도 놓치지 않는다.
    removeFiles([join('apps', 'web', 'eslint.config.mjs')], { required: true }),

    // apps/web이 catalog를 참조하게 한다. 버전 문자열이 중복되지 않는다.
    mergeJson(
      {
        dependencies: {
          next: 'catalog:',
          react: 'catalog:',
          'react-dom': 'catalog:',
        },
        devDependencies: {
          typescript: 'catalog:',
          tailwindcss: 'catalog:',
          '@tailwindcss/postcss': 'catalog:',
          vitest: 'catalog:',
          jsdom: 'catalog:',
          '@next/eslint-plugin-next': 'catalog:',
          'eslint-plugin-jsx-a11y': 'catalog:',
          'eslint-plugin-react-hooks': 'catalog:',
          // 루트가 담당한다. 앱에서 중복 선언하지 않는다.
          eslint: null,
          prettier: null,
        },
        scripts: {
          lint: null,
          format: null,
          'format:check': null,
        },
      },
      { file: join('apps', 'web', 'package.json'), required: ['dependencies.next'] },
    ),

    // 루트도 @devbak/* 를 직접 선언해야 한다 — catalog:가 link:를 거부한다.
    linkDeps(['eslint-plugin-fsd', 'prettier-config', 'tsconfig']),
  ];

  if (install) steps.push(delegate('pnpm', ['install']));
  if (verify) {
    steps.push(delegate('pnpm', ['lint']));
    steps.push(delegate('pnpm', ['build']));
  }

  return steps;
};
