import type { Recipe, Step } from '../types.js';
import { copyOverlay, delegate, linkDeps, makeDirs, mergeJson, removeFiles, scaffold } from '../ops/index.js';

/**
 * Next.js App Router 레시피. 설계 5.2절.
 *
 * pnpm-workspace.yaml은 지우지 않는다 — 단일 앱에서는 sharp 빌드 승인에
 * 필요하다. 모노레포에서만 제거하며 그것은 monorepo 레시피의 일이다.
 */
export const nextRecipe: Recipe = (options = {}) => {
  const install = options.skipInstall !== true;
  const verify = install && options.skipVerify !== true;

  const steps: Step[] = [
    scaffold(
      'pnpm',
      ['dlx', 'create-next-app@latest'],
      [
        '--ts',
        '--app',
        '--src-dir',
        '--tailwind',
        '--no-eslint',
        '--use-pnpm',
        '--skip-install',
        '--disable-git',
        '--import-alias',
        '@/*',
      ],
    ),

    // create-next-app이 만든 에이전트 문서를 devkit 판으로 교체한다.
    removeFiles(['AGENTS.md', 'CLAUDE.md'], { required: true }),

    copyOverlay('next'),

    // typescript-eslint는 templates/next/eslint.config.mjs가 파서로 쓴다.
    // @devbak/eslint-plugin-fsd는 파서를 제공하지 않아(consumer 책임) 이게
    // 없으면 .ts/.tsx의 타입 문법을 espree가 파싱하지 못해 eslint가 죽는다
    // (Task 10 Step 7 실측).
    mergeJson({
      // create-next-app은 "type"을 넣지 않아 프로젝트가 CJS로 취급된다.
      // 그러면 Vite의 config 로더가 vitest.config.ts를 CJS로 번들링하고,
      // externalize-deps가 ESM 전용 @devbak/vitest-config를 require()로
      // 로드하려다 실패한다("resolved to an ESM file", 2026-08-01 실측).
      // create-next-app 산출물에 .js 파일이 없으므로(전부 .ts/.tsx/.mjs) 안전하다.
      type: 'module',
      prettier: '@devbak/prettier-config',
      scripts: {
        lint: 'eslint .',
        format: 'prettier --write .',
        'format:check': 'prettier --check .',
        typecheck: 'tsc --noEmit',
        test: 'vitest run',
        'test:watch': 'vitest',
      },
      devDependencies: {
        eslint: '^10.8.0',
        'typescript-eslint': '^8.65.0',
        vitest: '^2.1.0',
        jsdom: '^25.0.0',
        prettier: '^3.4.2',
        '@next/eslint-plugin-next': '^16.0.0',
        'eslint-plugin-jsx-a11y': '^6.10.0',
        'eslint-plugin-react-hooks': '^7.1.0',
      },
    }),

    linkDeps(['eslint-plugin-fsd', 'prettier-config', 'tsconfig', 'vitest-config']),

    // FSD 레이어. app은 create-next-app이 이미 만들었다.
    // pages 레이어는 Next의 Pages Router와 이름이 충돌하므로 views를 쓴다.
    makeDirs(['src/views', 'src/widgets', 'src/features', 'src/entities', 'src/shared']),
  ];

  if (install) steps.push(delegate('pnpm', ['install']));
  if (verify) {
    steps.push(delegate('pnpm', ['lint']));
    steps.push(delegate('pnpm', ['build']));
  }

  return steps;
};
