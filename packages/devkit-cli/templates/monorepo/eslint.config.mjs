import tseslint from 'typescript-eslint';
import fsd from '@cheolubak/eslint-plugin-fsd/next';

// @cheolubak/eslint-plugin-fsd는 파서를 제공하지 않는다(consumer 책임 —
// packages/eslint-plugin-fsd/src/react.ts 주석 참조). typescript-eslint의
// recommended(비타입체크)를 얹지 않으면 apps/web의 .ts/.tsx 타입 문법을
// 기본 espree 파서가 파싱하지 못해 죽는다(Task 10 Step 7 실측,
// templates/next/eslint.config.mjs와 동일한 이유).
export default tseslint.config(
  { ignores: ['**/.next/**', '**/out/**', '**/next-env.d.ts', '**/dist/**'] },
  ...tseslint.configs.recommended,
  ...fsd,
);
