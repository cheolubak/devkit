import { baseConfig } from './eslint.base.mjs';

/**
 * 루트 파일 전용 ESLint 설정.
 *
 * `packages/**`를 무시하는 것이 이 파일의 핵심이다. 각 패키지가 자기
 * eslint.config.mjs를 갖게 되면서, 스코프가 겹치면 typescript-eslint의
 * tsconfigRootDir 자동추론이 후보를 여럿 등록해
 * `multiple candidate TSConfigRootDirs`로 저장소 전체 lint가 죽는다
 * (monorepo 레시피가 apps/web/eslint.config.mjs를 지우는 이유와 같은
 * 기전이다). 겹치지 않게 하는 것이 유일한 방어다.
 */
export default [
  { ignores: ['packages/**'] },
  ...baseConfig(import.meta.dirname),
];
