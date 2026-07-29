import { it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-higher-level-imports';

RuleTester.it = it;
const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('no-higher-level-imports', rule, {
  valid: [
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user';" },
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/shared/ui';" },
    { filename: '/proj/src/app/providers/x.ts', code: "import '@/pages/home';" },
    // 외부 패키지 무시
    { filename: '/proj/src/entities/user/ui/x.ts', code: "import 'react';" },
  ],
  invalid: [
    {
      filename: '/proj/src/entities/user/ui/x.ts',
      code: "import '@/features/auth';",
      errors: [{ messageId: 'higherLevel' }],
    },
    {
      filename: '/proj/src/shared/ui/x.ts',
      code: "import '@/entities/user';",
      errors: [{ messageId: 'higherLevel' }],
    },
  ],
});
