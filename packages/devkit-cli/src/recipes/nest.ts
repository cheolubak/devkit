import type { Recipe, Step } from '../types.js';
import { markerPatch } from '../lib/marker.js';
import { devkitVersion } from '../lib/version.js';
import { copyOverlay, delegate, registryDeps, makeDirs, mergeJson, removeFiles, scaffold } from '../ops/index.js';

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
    // test/jest-e2e.json은 jest-e2e.config.js로 대체되어 더는 참조되지 않는다 —
    // 지우지 않으면 IDE가 이 옛 설정을 자동 탐지해 진짜와 헷갈릴 수 있다.
    removeFiles(['.prettierrc', 'test/jest-e2e.json'], { required: true }),

    // eslint.config.mjs를 덮어쓴다. nest new는 flat config를 만들지만
    // eslint-plugin-prettier가 얹힌 상태다(설계 2.1절).
    //
    // src/main.ts도 덮어쓴다(bootstrap()을 no-floating-promises에 맞게
    // void bootstrap()으로 고친 버전). expectUpstream은 실제 `nest new`가
    // 만드는 main.ts의 sha256이다 — 공식 CLI가 이 파일에 shutdown hooks·
    // CORS·Swagger 부트스트랩 등을 추가하면 해시가 달라져 여기서 던진다.
    // 조용히 그 변화를 버리는 대신 레시피 재검증을 요구한다(설계 6.2절과 같은 취지).
    copyOverlay(
      'nest',
      {},
      {
        expectUpstream: {
          'src/main.ts': '68099ac650f55e87770bbd9af48916c09fe7d7609717e4a6b73bb4557dc32d37',
        },
      },
    ),

    // 유형과 무관한 Claude 리뷰 자산 — /review 슬래시 커맨드와 PR 자동 리뷰
    // 워크플로. 유형별 리뷰어 에이전트(.claude/agents/)는 위 오버레이가 이미
    // 넣었고, 이 둘만 세 유형이 공유한다.
    copyOverlay('_shared'),

    mergeJson(
      {
        // 유형 마커. update 가 대상의 유형을 알기 위한 전제이며, 의존성으로
        // 짐작하는 휴리스틱은 조용히 틀릴 수 있어 쓰지 않는다(설계 7절).
        ...markerPatch('nest', devkitVersion()),
        devDependencies: {
          'eslint-plugin-prettier': null,
          'eslint-config-prettier': null,
          '@eslint/eslintrc': null,
          '@eslint/js': null,
          globals: null,
          eslint: '^10.8.0',
          'typescript-eslint': '^8.65.0',
          'eslint-plugin-zod': '^4.9.0',
        },
        // zod는 서비스·컨트롤러가 import하는 런타임 의존이다. devDependencies에
        // 두면 `pnpm install --prod`(표준 배포 빌드)에서 빠져 배포 시
        // `Cannot find module 'zod'`로 죽는다.
        dependencies: {
          zod: '^4.4.3',
        },
        jest: null,
        prettier: '@cheolubak/prettier-config',
        scripts: {
          lint: 'eslint .',
          format: 'prettier --write .',
          'format:check': 'prettier --check .',
          'test:e2e': 'jest --config ./jest-e2e.config.js',
        },
      },
      { required: ['jest', 'devDependencies.eslint-plugin-prettier'] },
    ),

    registryDeps(['eslint-config-nest', 'prettier-config', 'tsconfig', 'jest-config']),

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
