import type { UserConfig } from 'vitest/config';

/**
 * `next.js`의 타입 선언.
 *
 * 이 파일이 없으면 소비자의 `vitest.config.ts`가 TS7016으로 죽는다. 소비자
 * tsconfig에 `allowJs: true`가 있어도 소용없다 — TypeScript는 node_modules
 * 안의 .js를 타입 추론 대상에서 제외하기 때문이다(maxNodeModuleJsDepth 기본 0).
 *
 * `link:` 상대경로로 소비하던 시절에는 심볼릭 링크의 realpath가 node_modules
 * 밖(툴킷 저장소 안)이라 allowJs가 실제로 먹혀서 이 결함이 드러나지 않았다.
 * 레지스트리 설치로 바꾸자 파일이 진짜 node_modules 안에 놓이면서 next·monorepo
 * 생성물의 `next build`가 깨졌다(2026-08-05, e2e 2건). 선언을 지우지 말 것.
 */
declare const config: UserConfig;
export default config;
