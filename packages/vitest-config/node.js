/** Node 라이브러리/서버용 Vitest 설정. DOM이 필요 없다. */
export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    passWithNoTests: true,
  },
};
