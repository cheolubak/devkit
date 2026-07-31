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
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },

  ...(tseslint.configs.recommendedTypeChecked as unknown as Linter.Config[]),

  {
    // typescript-eslint의 타입 인식 config는 files 제한이 없어 .js/.mjs/.cjs
    // 에도 적용되는데, projectService는 .ts에만 켜져 있어 타입 정보가 없다.
    // 그대로 두면 consumer의 eslint.config.mjs·jest.config.js에서 ESLint가
    // 크래시한다. 타입 정보가 없는 파일에서는 타입 인식 규칙을 끈다.
    ...tseslint.configs.disableTypeChecked,
    name: 'nest/untyped-files',
    files: ['**/*.{js,mjs,cjs}'],
  },

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
    files: ['**/*.{ts,mts,cts}'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },

  {
    // 테스트 파일 완화. 픽스처(idioms.ts) 실측 결과, 베이스라인이 실제로
    // 켜는 규칙 중에서는 프로덕션 관용구와 충돌하는 것이 없었다 — 끌
    // 규칙이 없었다. 단 이 검증 범위는 recommendedTypeChecked가 켜는
    // 규칙으로 한정된다: no-extraneous-class·parameter-properties·
    // no-empty-function은 애초에 recommendedTypeChecked에 포함돼 있지
    // 않아 시험 대상이 아니었고(발화하지 않은 게 아니라 켜져 있지 않았을
    // 뿐), no-unsafe-* 계열은 켜져 있지만 픽스처가 any나 느슨한 요청
    // 바디 타입을 노출하지 않아 미시험이다 — 실제 프로젝트의 @Body()
    // DTO 경로 등에서는 발화할 수 있다.
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
