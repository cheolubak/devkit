import type { Linter } from 'eslint';

/** JSX가 등장하는 파일. React/a11y 규칙 대상. */
export const JSX_FILES = ['**/*.{jsx,tsx}'];

/**
 * 훅이 존재할 수 있는 모든 파일.
 * 커스텀 훅은 JSX가 없는 .ts 파일에도 살기 때문에 jsx/tsx로 좁히지 않는다.
 */
export const HOOK_FILES = ['**/*.{js,jsx,ts,tsx}'];

/**
 * flat config에 files 스코프를 씌운 새 객체를 반환한다.
 * 상류 플러그인이 export한 config 객체를 그대로 공유하므로 원본을 변경하지 않는다.
 */
export function scopeToFiles(config: Linter.Config, files: string[]): Linter.Config {
  return { ...config, files };
}
