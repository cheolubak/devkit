import type { Linter } from 'eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import plugin from './index';
import { scopeToFiles, HOOK_FILES } from './lib/preset';

// eslint-plugin-react-hooks의 flat config 타입은 부정확하다. plugins를
// { react: any }로 선언하지만 실제로는 react-hooks 키로 등록한다.
// 경계에서 Linter.Config로 고정해 아래 조립 코드가 정확한 타입 위에서 돌게 한다.
const hooksRecommended = reactHooks.configs.flat.recommended as unknown as Linter.Config;

/**
 * FSD + React 프리셋.
 *
 * 단일 객체가 아니라 배열인 이유: ignores는 그것을 가진 config 객체의 모든
 * 규칙에 걸린다. FSD 규칙만 Next.js 라우팅 폴더에서 제외해야 하므로
 * config를 나눈다. 설계 문서 3.2 참조.
 *
 * eslint-plugin-react는 의도적으로 제외한다. ESLint 10에서 제거된
 * context.getFilename()을 호출해 크래시한다. 설계 문서 2.1 참조.
 * 그 결과 JSX 파싱 설정도 프리셋이 제공하지 않는다 — consumer 책임(3.3).
 */
const config: Linter.Config[] = [
  plugin.configs.recommended,
  scopeToFiles(hooksRecommended, HOOK_FILES),
];

export default config;
