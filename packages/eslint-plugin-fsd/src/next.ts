import type { Linter } from 'eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import nextPlugin from '@next/eslint-plugin-next';
import reactPreset from './react';
import { scopeToFiles, JSX_FILES } from './lib/preset';

/**
 * FSD + React + a11y + Next.js 프리셋.
 *
 * @next/next config에는 files를 걸지 않는다. Next.js 규칙은 프로젝트 루트의
 * app/·pages/ 라우팅 폴더에서 돌아야 하며, 거기가 바로 이 규칙들이 가장
 * 필요한 위치다. FSD config만 그 폴더를 ignores로 제외한다.
 */
const config: Linter.Config[] = [
  ...reactPreset,
  scopeToFiles(jsxA11y.flatConfigs.recommended, JSX_FILES),
  nextPlugin.configs['core-web-vitals'],
];

export default config;
