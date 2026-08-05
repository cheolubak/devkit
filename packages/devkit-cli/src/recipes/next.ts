import type { Recipe, Step } from '../types.js';
import { markerPatch } from '../lib/marker.js';
import { devkitVersion } from '../lib/version.js';
import { copyOverlay, delegate, registryDeps, makeDirs, mergeJson, removeFiles, scaffold } from '../ops/index.js';

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

    // 유형과 무관한 Claude 리뷰 자산 — /review 슬래시 커맨드와 PR 자동 리뷰
    // 워크플로. 유형별 리뷰어 에이전트(.claude/agents/)는 위 오버레이가 이미
    // 넣었고, 이 둘만 세 유형이 공유한다.
    //
    // monorepo 레시피는 이 레시피를 apps/web 에 합성하므로 여기서 놓인 것이
    // 앱 하위로 들어간다 — 리뷰 자산은 저장소 루트에 있어야 하므로 그쪽에서
    // 지우고 루트에 다시 놓는다(monorepo.ts).
    copyOverlay('_shared'),

    // typescript-eslint는 templates/next/eslint.config.mjs가 파서로 쓴다.
    // @cheolubak/eslint-plugin-fsd는 파서를 제공하지 않아(consumer 책임) 이게
    // 없으면 .ts/.tsx의 타입 문법을 espree가 파싱하지 못해 eslint가 죽는다
    // (Task 10 Step 7 실측).
    mergeJson(
      {
        // 유형 마커. update 가 대상의 유형을 알기 위한 전제이며, 의존성으로
        // 짐작하는 휴리스틱은 조용히 틀릴 수 있어 쓰지 않는다(설계 7절).
        ...markerPatch('next', devkitVersion()),
        // create-next-app은 "type"을 넣지 않아 프로젝트가 CJS로 취급된다.
        // 그러면 Vite의 config 로더가 vitest.config.ts를 CJS로 번들링하고,
        // externalize-deps가 ESM 전용 @cheolubak/vitest-config를 require()로
        // 로드하려다 실패한다("resolved to an ESM file", 2026-08-01 실측).
        // create-next-app 산출물에 .js 파일이 없으므로(전부 .ts/.tsx/.mjs) 안전하다.
        type: 'module',
        prettier: '@cheolubak/prettier-config',
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
      },
      // create-next-app이 devDependencies.next 없이 dependencies.next만 심으므로
      // scripts.build와 함께 여기서 확인한다 — next.ts는 이 파일을 처음 쓰는
      // 레시피이고, monorepo 레시피만 dependencies.next를 확인해왔다(설계 6.2절
      // 이 레시피별로 고르지 않게 적용된 사례).
      { required: ['dependencies.next', 'scripts.build'] },
    ),

    // 'tsconfig'는 링크하지 않는다 — create-next-app의 tsconfig.json을
    // 덮어쓰지 않기로 했으므로(Next가 관리하는 .next/types/** 항목이 있어서)
    // @cheolubak/tsconfig를 extends로 소비할 곳이 없다(Task 13 Step 4 확인).
    registryDeps(['eslint-plugin-fsd', 'prettier-config', 'vitest-config']),

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
