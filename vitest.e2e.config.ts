import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/tests/e2e/**/*.e2e.test.ts'],
    // pnpm dlx 다운로드 + pnpm install + next build가 들어간다
    testTimeout: 900_000,
    hookTimeout: 900_000,
    // 같은 부모 디렉토리에 생성하므로 병렬 실행하면 서로 간섭한다
    fileParallelism: false,
  },
});
