import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 한 단계로 한정한다(`tests/*.test.ts`, `tests/**`가 아님). devkit-cli의
    // 3층 e2e 테스트는 `tests/e2e/*.e2e.test.ts`에 있고 수 분~수십 분이 걸린다
    // (pnpm dlx + pnpm install + next build). `**`로 재귀 매칭하면 기본
    // `pnpm test`가 이를 물어 개발 루프가 죽는다 — 반드시 `vitest.e2e.config.ts`
    // + `pnpm test:e2e`로만 실행한다.
    include: ['packages/*/tests/*.test.ts'],
  },
});
