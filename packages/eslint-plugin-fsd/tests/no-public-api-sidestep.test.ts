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
    // 슬라이스 레이어의 세그먼트 진입점. RSC에서 서버 전용 api와 클라이언트
    // ui가 한 배럴로 묶이지 않게 하려면 이쪽도 진입점이어야 한다.
    { filename: '/proj/src/features/auth/ui/x.ts', code: "import '@/entities/user/ui';" },
    { filename: '/proj/src/app/page.tsx', code: "import '@/entities/user/api';" },
    // 세그먼트 배럴이 자기 세그먼트 안을 re-export하는 것도 내부다.
    { filename: '/proj/src/entities/user/ui/index.ts', code: "export * from './Avatar';" },
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
    // 세그먼트를 인정해도 그 **안쪽 파일**은 여전히 막힌다. 메시지는 대신
    // 써야 할 진입점(세그먼트 배럴)을 이름한다.
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/entities/user/model/store';",
      errors: [{ messageId: 'sidestep', data: { target: 'entities/user/model' } }],
    },
    // 별칭 레이어(views)에서도 세그먼트까지만 진입점이다.
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/views/home/ui/Hero';",
      errors: [{ messageId: 'sidestep', data: { target: 'views/home/ui' } }],
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
    // 열리지는 않는다(레이어 방향 위반이기도 하다). 진입점은 레이어 폴더
    // 자체이므로 `app/providers`가 아니라 `app`을 이름해야 한다 — 세그먼트를
    // 이름하면 규칙이 통과시키지도 않을 경로를 해법이라고 안내하게 된다.
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/app/providers/Theme';",
      errors: [{ messageId: 'sidestep', data: { target: 'app' } }],
    },
    // 그래서 한 단계 얕은 `@/app/providers`도 우회다 — layer 단위의 공개
    // 깊이는 1이다.
    {
      filename: '/proj/src/features/auth/ui/x.ts',
      code: "import '@/app/providers';",
      errors: [{ messageId: 'sidestep', data: { target: 'app' } }],
    },
  ],
});
