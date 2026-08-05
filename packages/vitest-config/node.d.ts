import type { UserConfig } from 'vitest/config';

/**
 * `node.js`의 타입 선언. 존재 이유는 `next.d.ts`와 같다 — node_modules 안의
 * .js는 소비자의 `allowJs`로 구제되지 않으므로 선언을 함께 게시해야 한다.
 */
declare const config: UserConfig;
export default config;
