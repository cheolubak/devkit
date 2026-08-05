import tseslint from 'typescript-eslint';
import { baseConfig } from '../../eslint.base.mjs';

// next.js/node.js는 tsconfig의 프로그램에 넣을 수 없다 — 같은 이름의
// next.d.ts/node.d.ts가 있으면 TypeScript가 선언 파일을 우선해 .js를
// 프로그램에서 밀어내기 때문이다(shadowing). 둘 다 include하면 .js가
// "not found by the project service"로 파싱 에러를 낸다(실측).
//
// 그래서 게시되는 선언(.d.ts)을 tsconfig에 넣어 타입 검사를 받게 하고,
// 설정 객체일 뿐인 .js는 타입 인식 린트에서 뺀다. tsconfig가 checkJs: false라
// .js는 원래도 타입 검사를 받지 않았으므로 잃는 것이 없다. eslint.base.mjs가
// 어떤 tsconfig에도 속하지 않는 설정 파일을 다루는 방식과 같은 관용이다.
export default baseConfig(import.meta.dirname, [
  {
    files: ['*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: false,
      },
    },
  },
]);
