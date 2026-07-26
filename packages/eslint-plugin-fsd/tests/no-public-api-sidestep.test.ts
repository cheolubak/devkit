import { it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-public-api-sidestep';

RuleTester.it = it as unknown as typeof RuleTester.it;
const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('no-public-api-sidestep', rule, {
  valid: [
    // 슬라이스 진입점
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user';" },
    // shared 세그먼트 진입점
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/shared/ui';" },
    // 같은 슬라이스 내부 깊은 상대 import
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '../model/store';" },
  ],
  invalid: [
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/entities/user/model/store';",
      errors: [{ messageId: 'sidestep' }],
    },
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/shared/ui/Button';",
      errors: [{ messageId: 'sidestep' }],
    },
  ],
});
