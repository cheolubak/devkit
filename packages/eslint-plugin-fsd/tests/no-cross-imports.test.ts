import { it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-cross-imports';

RuleTester.it = it;
const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('no-cross-imports', rule, {
  valid: [
    // 같은 슬라이스 내부 상대 import
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '../model/store';" },
    // 다른 레이어는 대상 아님
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user';" },
    // shared는 슬라이스 없음
    { filename: '/proj/src/shared/ui/x.ts', code: "import '@/shared/lib';" },
  ],
  invalid: [
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/features/cart';",
      errors: [{ messageId: 'crossImport' }],
    },
    {
      filename: '/proj/src/entities/user/ui/x.ts',
      code: "import '@/entities/product';",
      errors: [{ messageId: 'crossImport' }],
    },
  ],
});
