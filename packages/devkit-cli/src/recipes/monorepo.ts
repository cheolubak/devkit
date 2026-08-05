import { join } from 'node:path';
import type { Recipe, Step } from '../types.js';
import { markerPatch } from '../lib/marker.js';
import { devkitVersion } from '../lib/version.js';
import { copyOverlay, delegate, registryDeps, makeDirs, mergeJson, removeFiles } from '../ops/index.js';
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

    // 유형과 무관한 Claude 리뷰 자산. 리뷰는 저장소 단위이므로 **루트에만**
    // 놓는다 — CI 워크플로는 저장소 루트의 .github/workflows/ 만 인식하고,
    // /review 커맨드도 저장소를 열었을 때 보여야 한다. 아래 next 합성이
    // apps/web 에 같은 것을 또 놓으므로 그쪽은 제거한다.
    copyOverlay('_shared'),

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

    // 🚨 next 레시피가 apps/web 에 놓은 리뷰 자산을 지운다. 리뷰는 저장소
    // 단위이고 루트에 이미 놓았다(위). 앱 하위의 .github/workflows/ 는
    // GitHub 이 아예 인식하지 않으므로 그대로 두면 "워크플로가 있는데 왜
    // 안 도는가"라는 침묵하는 오해를 남긴다. 모노레포판 리뷰어 에이전트도
    // 루트에 있으므로 앱 쪽 next 판은 중복이다.
    // required: true — next 레시피가 _shared 를 더는 놓지 않게 바뀌면
    // 이 제거가 조용히 무의미해지는 대신 여기서 드러난다(설계 6.1절).
    removeFiles([join('apps', 'web', '.claude'), join('apps', 'web', '.github')], {
      required: true,
    }),

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
          // apps/web/eslint.config.mjs를 제거하므로 앱에는 쓸 곳이 없다. 루트가 담당한다.
          'typescript-eslint': null,
        },
        scripts: {
          lint: null,
          format: null,
          'format:check': null,
        },
      },
      { file: join('apps', 'web', 'package.json'), required: ['dependencies.next'] },
    ),

    // 루트에 유형 마커를 심는다. apps/web 에는 합성된 next 레시피가 자기
    // 마커를 심으므로, 루트는 monorepo·앱은 next 로 각각 update 할 수 있다.
    mergeJson({ ...markerPatch('monorepo', devkitVersion()) }),

    // 루트도 @cheolubak/* 를 직접 선언해야 한다 — catalog:가 link:를 거부한다.
    // 'tsconfig'는 넣지 않는다 — 루트에는 tsconfig.json이 없고(각 앱이
    // 자기 tsconfig를 관리), apps/web도 next 레시피와 동일하게 링크하지
    // 않는다(Task 13 Step 4 확인). 소비처 없는 선언은 완료 기준 6번 위반이다.
    registryDeps(['eslint-plugin-fsd', 'prettier-config']),
  ];

  if (install) steps.push(delegate('pnpm', ['install']));
  if (verify) {
    steps.push(delegate('pnpm', ['lint']));
    steps.push(delegate('pnpm', ['build']));
  }

  return steps;
};
