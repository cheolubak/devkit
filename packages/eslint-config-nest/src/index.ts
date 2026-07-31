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

  {
    // 테스트 파일 완화. 픽스처(idioms.ts) 실측 결과 프로덕션 관용구
    // (생성자 파라미터 프로퍼티, 데코레이터만 있는 빈 모듈 클래스 등)는
    // 베이스라인과 충돌하지 않았다 — 끌 규칙이 없었다.
    //
    // 유일하게 발화한 것은 테스트 파일(user.service.spec.ts)의
    // unbound-method다. jest의 `expect(service.method)`와 같은 형태로
    // 메서드 참조를 단언 함수에 넘기는 것은 정당한 테스트 관용구이지만,
    // unbound-method는 이를 실제 this 바인딩 오류로 오판한다. 설계 4.4 참조.
    name: 'nest/test-idioms',
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];

export default config;
