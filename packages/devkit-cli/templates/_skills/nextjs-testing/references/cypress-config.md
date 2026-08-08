# Cypress 상세 설정

## cypress.config.ts

```typescript
// cypress.config.ts
import { defineConfig } from 'cypress';

export default defineConfig({
  // ---- 컴포넌트 테스트 ----
  component: {
    devServer: {
      framework: 'next',       // Next.js 공식 지원
      bundler: 'webpack',      // Next.js의 기본 번들러
    },
    specPattern: 'cypress/component/**/*.cy.{ts,tsx}',
    supportFile: 'cypress/support/component.tsx',
  },

  // ---- E2E 테스트 ----
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    video: false,                       // CI에서만 활성화 권장
    screenshotOnRunFailure: true,
  },
});
```

## 컴포넌트 테스트 devServer

`framework: 'next'` 설정 시 Cypress가 자동으로 처리하는 것:

- `next/image` → 일반 `<img>` 태그로 변환
- `next/link` → 일반 `<a>` 태그로 변환
- CSS Modules, Tailwind CSS 처리
- `tsconfig.json` path alias 인식
- `.env.local` 환경 변수 로드

별도의 webpack 설정이 필요한 경우:

```typescript
component: {
  devServer: {
    framework: 'next',
    bundler: 'webpack',
    webpackConfig: {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './'),
        },
      },
    },
  },
},
```

## E2E 설정 옵션

```typescript
e2e: {
  baseUrl: 'http://localhost:3000',
  specPattern: 'cypress/e2e/**/*.cy.ts',
  supportFile: 'cypress/support/e2e.ts',

  // 뷰포트
  viewportWidth: 1280,
  viewportHeight: 720,

  // 타임아웃
  defaultCommandTimeout: 10000,    // cy.get() 등 DOM 커맨드
  requestTimeout: 10000,           // cy.request(), cy.intercept()
  responseTimeout: 30000,          // 서버 응답 대기
  pageLoadTimeout: 60000,          // 페이지 로드 대기

  // 재시도
  retries: {
    runMode: 2,                    // CI에서 실패 시 재시도
    openMode: 0,                   // GUI에서는 재시도 안 함
  },

  // 미디어
  video: false,
  screenshotOnRunFailure: true,
  screenshotsFolder: 'cypress/screenshots',
  videosFolder: 'cypress/videos',

  // 실험적 기능
  experimentalRunAllSpecs: true,   // "Run All Specs" 버튼
},
```

## cypress/support/component.tsx

컴포넌트 테스트에서 모든 컴포넌트에 적용될 전역 설정:

```tsx
// cypress/support/component.tsx
import { mount } from 'cypress/react';

// 전역 CSS import
import '../../app/globals.css';

// Provider 래핑이 필요한 경우
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

// 커스텀 mount 명령 등록
Cypress.Commands.add('mount', (component, options) => {
  const wrapped = (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
    >
      {component}
      <Toaster />
    </ThemeProvider>
  );

  return mount(wrapped, options);
});

// TypeScript 타입 선언
declare global {
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
    }
  }
}
```

Provider가 필요 없는 단순한 경우:

```tsx
// cypress/support/component.tsx
import { mount } from 'cypress/react';
import '../../app/globals.css';

Cypress.Commands.add('mount', mount);

declare global {
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
    }
  }
}
```

## cypress/support/e2e.ts

E2E 테스트에서 사용할 전역 설정과 커스텀 커맨드:

```typescript
// cypress/support/e2e.ts
import './commands';

// 캐치되지 않은 예외 무시 (Next.js hydration 에러 등)
Cypress.on('uncaught:exception', (err) => {
  // hydration 에러는 무시
  if (err.message.includes('Hydration')) {
    return false;
  }
  // ResizeObserver 에러 무시
  if (err.message.includes('ResizeObserver')) {
    return false;
  }
  // 그 외 에러는 테스트 실패
  return true;
});
```

## cypress/support/commands.ts

```typescript
// cypress/support/commands.ts

// data-testid로 요소 선택
Cypress.Commands.add('getByTestId', (testId: string) => {
  return cy.get(`[data-testid="${testId}"]`);
});

// 로그인 커맨드
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();
    cy.url().should('not.include', '/login');
  });
});

// TypeScript 타입 선언
declare global {
  namespace Cypress {
    interface Chainable {
      getByTestId(testId: string): Chainable<JQuery<HTMLElement>>;
      login(email: string, password: string): Chainable<void>;
    }
  }
}
```

## TypeScript 설정

```json
// cypress/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["cypress"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "baseUrl": "..",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx"
  ]
}
```

## 환경 변수

```json
// cypress.env.json (gitignore에 추가)
{
  "TEST_USER_EMAIL": "test@test.com",
  "TEST_USER_PASSWORD": "P@ssw0rd!",
  "API_URL": "http://localhost:3000/api"
}
```

테스트에서 사용:

```typescript
cy.get('input[name="email"]').type(Cypress.env('TEST_USER_EMAIL'));
```

`.gitignore`에 추가:

```
cypress.env.json
```

## 모바일 뷰포트 테스트

```typescript
// cypress/e2e/mobile.cy.ts
describe('Mobile Layout', () => {
  beforeEach(() => {
    cy.viewport('iphone-14');  // 또는 cy.viewport(390, 844)
  });

  it('should show mobile menu', () => {
    cy.visit('/');
    cy.get('[data-testid="mobile-menu-button"]').should('be.visible');
    cy.get('[data-testid="desktop-nav"]').should('not.be.visible');
  });
});
```

사전 정의된 뷰포트: `iphone-14`, `ipad-2`, `macbook-15`, `samsung-s10` 등.
