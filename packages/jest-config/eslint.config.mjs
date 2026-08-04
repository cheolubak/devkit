import { baseConfig } from '../../eslint.base.mjs';

export default baseConfig(import.meta.dirname, [
  {
    // @devbak/jest-config가 소비자에게 재노출하는 CJS 설정 객체.
    // "type" 필드 없는 package.json 아래에서 동작해야 하므로 CJS(.js)로 남아야
    // 한다(README 참고). sourceType: 'commonjs'로 module/require를 알려진
    // 전역으로 인식시켜 no-undef를 피한다.
    //
    // 루트 시절의 `packages/jest-config/*.js`가 `*.js`로 바뀐 것에 주의하라 —
    // 설정이 이제 이 패키지 안에 있으므로 glob의 기준이 패키지 디렉토리다.
    files: ['*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
]);
