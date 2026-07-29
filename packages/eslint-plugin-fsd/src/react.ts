import type { Linter } from 'eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import plugin from './index';
import { scopeToFiles, JSX_FILES, HOOK_FILES } from './lib/preset';

// 상류 플러그인의 flat config 타입은 부정확하다. eslint-plugin-react-hooks는
// plugins를 { react: any }로 선언하지만 실제로는 react-hooks 키로 등록한다.
// 경계에서 Linter.Config로 고정해 아래 조립 코드가 정확한 타입 위에서 돌게 한다.
const reactRecommended = react.configs.flat.recommended as unknown as Linter.Config;
const jsxRuntime = react.configs.flat['jsx-runtime'] as unknown as Linter.Config;
const hooksRecommended = reactHooks.configs.flat.recommended as unknown as Linter.Config;

/**
 * FSD + React 프리셋.
 *
 * 단일 객체가 아니라 배열인 이유: ignores는 그것을 가진 config 객체의 모든
 * 규칙에 걸린다. FSD 규칙만 Next.js 라우팅 폴더에서 제외해야 하므로
 * config를 나눈다. 설계 문서 3.2 참조.
 */
const config: Linter.Config[] = [
  plugin.configs.recommended,
  scopeToFiles(
    {
      ...reactRecommended,
      settings: { react: { version: 'detect' } },
      // React 17+ 자동 런타임 가정. 클래식 런타임 consumer는 뒤에서 다시 켜면 된다.
      rules: { ...reactRecommended.rules, ...jsxRuntime.rules },
    },
    JSX_FILES,
  ),
  scopeToFiles(hooksRecommended, HOOK_FILES),
];

export default config;
