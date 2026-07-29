import { it } from 'vitest';
import { RuleTester } from 'eslint';
import { createImportRule } from '../src/lib/create-rule';

RuleTester.it = it;

// 테스트용 rule: from.rank > to.rank 이면(하위→상위) 리포트
const testRule = createImportRule({
  meta: { docs: '테스트' },
  messages: { hit: 'hit {{ fromLayer }}->{{ toLayer }}' },
  check: ({ from, to }) =>
    to.rank < from.rank ? { messageId: 'hit', data: { fromLayer: from.layer, toLayer: to.layer } } : null,
});

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('test-rule', testRule, {
  valid: [
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import { u } from '@/entities/user';",
      options: [{ alias: ['@'] }],
    },
    {
      // importer가 FSD 밖 → skip
      filename: '/proj/config/x.ts',
      code: "import { a } from '@/features/auth';",
      options: [{ alias: ['@'] }],
    },
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "const load = () => import('@/entities/user');",
      options: [{ alias: ['@'] }],
    },
  ],
  invalid: [
    {
      filename: '/proj/src/entities/user/ui/x.ts',
      code: "import { a } from '@/features/auth';",
      options: [{ alias: ['@'] }],
      errors: [{ messageId: 'hit' }],
    },
    {
      filename: '/proj/src/entities/user/ui/x.ts',
      code: "const load = () => import('@/features/auth');",
      options: [{ alias: ['@'] }],
      errors: [{ messageId: 'hit' }],
    },
  ],
});
