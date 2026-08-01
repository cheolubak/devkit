import type { Recipe, Step } from '../types.js';
import { copyOverlay, delegate, linkDeps, makeDirs, mergeJson, removeFiles, scaffold } from '../ops/index.js';

/**
 * NestJS API 레시피. 설계 5.1절.
 *
 * 삭제·수정 대상은 전부 nest new를 실제로 돌려 관측한 것이다(설계 2.1절).
 * 추측으로 쓰면 최소 세 군데가 틀린다.
 */
export const nestRecipe: Recipe = (options = {}) => {
  const install = options.skipInstall !== true;
  const verify = install && options.skipVerify !== true;

  const steps: Step[] = [
    scaffold(
      'pnpm',
      ['dlx', '@nestjs/cli@latest', 'new'],
      ['--skip-git', '--skip-install', '-p', 'pnpm', '--strict'],
    ),

    // .prettierrc는 package.json의 "prettier" 키로 대체한다. 파일이 하나 준다.
    removeFiles(['.prettierrc'], { required: true }),

    // eslint.config.mjs를 덮어쓴다. nest new는 flat config를 만들지만
    // eslint-plugin-prettier가 얹힌 상태다(설계 2.1절).
    copyOverlay('nest'),

    mergeJson(
      {
        devDependencies: {
          'eslint-plugin-prettier': null,
          'eslint-config-prettier': null,
          '@eslint/eslintrc': null,
          '@eslint/js': null,
          globals: null,
          eslint: '^10.8.0',
          'typescript-eslint': '^8.65.0',
          'eslint-plugin-zod': '^4.9.0',
          zod: '^4.4.3',
        },
        jest: null,
        prettier: '@devbak/prettier-config',
        scripts: {
          lint: 'eslint .',
          format: 'prettier --write .',
          'format:check': 'prettier --check .',
          'test:e2e': 'jest --config ./jest-e2e.config.js',
        },
      },
      { required: ['jest', 'devDependencies.eslint-plugin-prettier'] },
    ),

    linkDeps(['eslint-config-nest', 'prettier-config', 'tsconfig', 'jest-config']),

    // 소비자 3개 프로젝트에서 실측된 관용 구조(로드맵 1.3절)
    makeDirs(['src/modules', 'src/common']),
  ];

  if (install) steps.push(delegate('pnpm', ['install']));
  if (verify) {
    steps.push(delegate('pnpm', ['lint']));
    steps.push(delegate('pnpm', ['build']));
  }

  return steps;
};
