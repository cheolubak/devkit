import { it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../src/rules/no-public-api-sidestep';

RuleTester.it = it;
const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

ruleTester.run('no-public-api-sidestep', rule, {
  valid: [
    // 슬라이스 진입점
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user';" },
    // shared 세그먼트 진입점
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/shared/ui';" },
    // 같은 슬라이스 내부 깊은 상대 import
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '../model/store';" },
    // 비-슬라이스 레이어의 내부 import. shared는 슬라이스가 없어 세그먼트가
    // Public API 단위이므로, 같은 세그먼트 안의 형제 파일은 우회가 아니다.
    { filename: '/proj/src/shared/ui/Button.tsx', code: "import './Icon';" },
    { filename: '/proj/src/shared/ui/index.ts', code: "export * from './Button';" },
    // app 레이어는 아무도 import할 수 없으므로(no-higher-level-imports가 막는다)
    // 넘을 Public API 경계가 없다. 내부 구성은 전부 내부다.
    { filename: '/proj/src/app/layout.tsx', code: "import './providers/Theme';" },
    { filename: '/proj/src/app/products/page.tsx', code: "import './loading';" },
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
    // shared 안에서도 세그먼트를 넘으면 우회다. 세그먼트가 shared의
    // Public API 단위이므로 '@/shared/lib'을 거쳐야 한다.
    {
      filename: '/proj/src/shared/ui/Button.tsx',
      code: "import '../lib/cn';",
      errors: [{ messageId: 'sidestep' }],
    },
    // app을 레이어 통째로 한 단위로 본다고 해서, 밖에서 app 내부를 짚는 것까지
    // 열리지는 않는다(레이어 방향 위반이기도 하다).
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/app/providers/Theme';",
      errors: [{ messageId: 'sidestep' }],
    },
  ],
});
