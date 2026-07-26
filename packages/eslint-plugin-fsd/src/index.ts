import type { Rule } from 'eslint';
import noHigherLevelImports from './rules/no-higher-level-imports';
import noCrossImports from './rules/no-cross-imports';
import noPublicApiSidestep from './rules/no-public-api-sidestep';

interface FsdPlugin {
  meta: { name: string; version: string };
  rules: Record<string, Rule.RuleModule>;
  configs: {
    recommended: {
      plugins: { fsd: FsdPlugin };
      ignores: string[];
      rules: Record<string, 'error' | 'warn' | 'off'>;
    };
  };
}

const plugin = {
  meta: { name: 'eslint-plugin-fsd', version: '0.1.0' },
  rules: {
    'no-higher-level-imports': noHigherLevelImports,
    'no-cross-imports': noCrossImports,
    'no-public-api-sidestep': noPublicApiSidestep,
  },
  configs: {} as FsdPlugin['configs'],
} as FsdPlugin;

plugin.configs.recommended = {
  plugins: { fsd: plugin },
  // 프로젝트 루트의 Next.js 라우팅 폴더는 FSD 대상이 아니므로 제외
  ignores: ['app/**', 'pages/**'],
  rules: {
    'fsd/no-higher-level-imports': 'error',
    'fsd/no-cross-imports': 'error',
    'fsd/no-public-api-sidestep': 'error',
  },
};

export default plugin;
