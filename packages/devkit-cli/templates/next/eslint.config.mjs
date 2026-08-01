import tseslint from 'typescript-eslint';
import fsd from '@devbak/eslint-plugin-fsd/next';

// @devbak/eslint-plugin-fsd는 파서를 제공하지 않는다(consumer 책임 —
// packages/eslint-plugin-fsd/src/react.ts 주석 참조). typescript-eslint의
// recommended(비타입체크)를 얹지 않으면 next.config.ts·src/app/layout.tsx의
// 타입 주석 문법을 기본 espree 파서가 파싱하지 못해 "Unexpected token {"로
// 죽는다(Task 10 Step 7 실측). recommendedTypeChecked를 쓰지 않는 이유는
// next.config.ts·postcss.config.mjs 등 tsconfig.json의 include에 들지 않는
// 파일이 있어 프로젝트 서비스 설정이 더 복잡해지기 때문이다.
export default tseslint.config(
  { ignores: ['.next/**', 'out/**', 'next-env.d.ts'] },
  ...tseslint.configs.recommended,
  ...fsd,
);
