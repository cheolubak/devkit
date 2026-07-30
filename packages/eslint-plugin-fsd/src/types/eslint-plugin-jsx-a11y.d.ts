// eslint-plugin-jsx-a11y 6.10.2는 타입 정의를 제공하지 않는다.
// 우리가 실제로 쓰는 표면(flatConfigs)만 최소한으로 선언한다.
declare module 'eslint-plugin-jsx-a11y' {
  import type { Linter } from 'eslint';

  const plugin: {
    flatConfigs: {
      recommended: Linter.Config;
      strict: Linter.Config;
    };
  };

  export default plugin;
}
