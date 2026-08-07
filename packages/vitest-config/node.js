import { configDefaults } from 'vitest/config';

/**
 * Node 라이브러리/서버용 Vitest 설정. DOM이 필요 없다.
 *
 * `include`·`exclude`의 근거는 `next.js`와 같다 — 좁은 include와
 * `passWithNoTests`가 만나면 수집 누락이 실패가 아니라 침묵으로 나타난다.
 */
export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.{test,spec}.ts'],
    exclude: [...configDefaults.exclude, '**/coverage/**'],
    passWithNoTests: true,
  },
};
