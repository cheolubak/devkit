import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import zod from 'eslint-plugin-zod';

/**
 * NestJS 백엔드용 ESLint 공유 설정.
 *
 * 타입 인식을 켜므로 consumer 프로젝트에 tsconfig가 있어야 한다.
 * tsconfigRootDir는 typescript-eslint v8에서 기본값이 process.cwd()라,
 * 프로젝트 루트에서 `eslint .`를 돌리는 통상적 사용에서 그대로 동작한다.
 */
const config: Linter.Config[] = [
  {
    name: 'nest/language-options',
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },

  ...(tseslint.configs.recommendedTypeChecked as unknown as Linter.Config[]),

  // eslint-plugin-zod의 recommended는 단일 flat config 객체이며 files에
  // .ts가 이미 포함돼 있다. 스코프를 다시 씌우지 않는다.
  // (zod의 CompatibleConfig 타입은 이미 Linter.Config에 구조적으로
  // 호환되어 캐스팅이 필요 없다 — tseslint와 달리 이중 캐스팅하면
  // @typescript-eslint/no-unnecessary-type-assertion에 걸린다.)
  zod.configs.recommended,

  {
    // Nest에서 가장 값어치 있는 세 규칙. recommendedTypeChecked에 이미
    // 들어 있지만, 상류가 recommended 구성을 바꿔도 이 셋만은 유지된다는
    // 의도를 코드로 고정한다. 설계 4.3 참조.
    name: 'nest/critical',
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },
];

export default config;
