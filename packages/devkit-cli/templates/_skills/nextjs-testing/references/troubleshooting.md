# 문제 해결

## Vitest 문제

### SyntaxError: Cannot use import statement outside a module

**원인:** ESM 모듈이 올바르게 변환되지 않음.

**해결:**

```typescript
// vitest.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    // 특정 패키지를 변환 대상에 포함
    deps: {
      optimizer: {
        web: {
          include: ['problematic-package'],
        },
      },
    },
  },
});
```

### Module not found: Can't resolve '@/...'

**원인:** path alias가 vitest.config.ts에 설정되지 않음.

**해결:**

```typescript
// vitest.config.ts
resolve: {
  alias: {
    '@': resolve(__dirname, './'),
  },
},
```

tsconfig.json의 `paths`와 일치하는지 확인.

### ReferenceError: document is not defined

**원인:** 테스트 환경이 `node`로 설정되어 있음.

**해결:**

```typescript
// vitest.config.ts
test: {
  environment: 'jsdom',  // 'node' → 'jsdom' 변경
}
```

또는 특정 파일에서만:

```typescript
// @vitest-environment jsdom
```

### useRouter/usePathname 등 next/navigation 에러

**원인:** next/navigation이 모킹되지 않음.

**해결:** `vitest.setup.ts`에 모킹 추가:

```typescript
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
```

### act() warning: An update was not wrapped in act(...)

**원인:** 상태 업데이트가 `act()` 밖에서 발생.

**해결:**

```typescript
import { act } from '@testing-library/react';

// 상태 변경을 act로 감싸기
await act(async () => {
  fireEvent.click(button);
});

// 또는 findBy* 사용 (자동으로 act 처리)
const element = await screen.findByText('결과');
```

### vi.mock()이 작동하지 않음

**원인:** `vi.mock()`은 파일 최상단에서 호이스팅됨. import 순서에 주의.

**해결:**

```typescript
// 올바른 순서
vi.mock('@/lib/db', () => ({
  db: { user: { findMany: vi.fn() } },
}));

// vi.mock 이후에 import
import { db } from '@/lib/db';
import { getUsers } from '@/app/actions/user';
```

## Cypress 컴포넌트 테스트 문제

### Error: Could not find a Next.js project

**원인:** `next.config.ts`(또는 `.js`, `.mjs`)가 프로젝트 루트에 없음.

**해결:** `next.config.ts` 파일이 존재하는지 확인. 최소한:

```typescript
// next.config.ts
const nextConfig = {};
export default nextConfig;
```

### CSS/Tailwind 스타일이 적용되지 않음

**원인:** `cypress/support/component.tsx`에서 CSS를 import하지 않음.

**해결:**

```tsx
// cypress/support/component.tsx
import '../../app/globals.css';  // Tailwind CSS 포함
```

### Provider 누락으로 인한 에러 (ThemeProvider, QueryClient 등)

**원인:** 컴포넌트가 Context Provider를 필요로 함.

**해결:** `cypress/support/component.tsx`에서 Provider 래핑:

```tsx
Cypress.Commands.add('mount', (component, options) => {
  const wrapped = (
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider defaultTheme="light">
        {component}
      </ThemeProvider>
    </QueryClientProvider>
  );
  return mount(wrapped, options);
});
```

### next/image 에러

**원인:** `framework: 'next'` 설정이 누락됨.

**해결:** `cypress.config.ts` 확인:

```typescript
component: {
  devServer: {
    framework: 'next',    // 이 설정이 반드시 필요
    bundler: 'webpack',
  },
},
```

## Cypress E2E 문제

### cy.visit() 실패: ECONNREFUSED

**원인:** 개발 서버가 실행되지 않음.

**해결:**

```bash
# 터미널 1: 개발 서버 실행
pnpm dev

# 터미널 2: E2E 테스트 실행
pnpm cy:e2e
```

또는 `start-server-and-test` 사용:

```bash
pnpm add -D start-server-and-test
```

```json
// package.json
{
  "scripts": {
    "cy:e2e:ci": "start-server-and-test dev http://localhost:3000 cy:e2e"
  }
}
```

### 요소를 찾을 수 없음 (Timed out retrying)

**원인:** 요소가 아직 렌더링되지 않았거나 잘못된 선택자.

**해결:**

```typescript
// 나쁨 - CSS 클래스에 의존
cy.get('.btn-primary').click();

// 좋음 - data-testid 사용
cy.getByTestId('submit-button').click();

// 좋음 - 텍스트로 찾기
cy.contains('제출').click();

// 비동기 렌더링 대기
cy.getByTestId('user-list', { timeout: 15000 }).should('be.visible');
```

### Cross-origin 에러

**원인:** 외부 도메인으로 이동 시 발생.

**해결:**

```typescript
// cypress.config.ts
e2e: {
  chromeWebSecurity: false,  // cross-origin 허용 (주의: 보안 검증 비활성화)
}
```

또는 외부 서비스를 `cy.intercept()`로 스텁:

```typescript
cy.intercept('GET', 'https://external-api.com/**', {
  statusCode: 200,
  body: { data: 'mocked' },
});
```

### Flaky 테스트 (간헐적 실패)

**원인:** 타이밍, 애니메이션, 네트워크 의존.

**해결:**

```typescript
// 1. 명시적 대기
cy.getByTestId('loading').should('not.exist');
cy.getByTestId('data-table').should('be.visible');

// 2. 재시도 설정
// cypress.config.ts
e2e: {
  retries: {
    runMode: 2,   // CI에서 2회 재시도
    openMode: 0,
  },
}

// 3. 애니메이션 비활성화
// cypress/support/e2e.ts
beforeEach(() => {
  cy.get('body').invoke('css', 'transition', 'none');
});

// 4. API 응답 대기
cy.intercept('GET', '/api/data').as('getData');
cy.visit('/');
cy.wait('@getData');
```

## CI/CD 설정

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm test:cov

  cypress-component:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - uses: cypress-io/github-action@v6
        with:
          component: true
          install: false

  cypress-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: cypress-io/github-action@v6
        with:
          start: pnpm start
          wait-on: 'http://localhost:3000'
          wait-on-timeout: 60
          install: false
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: cypress-screenshots
          path: cypress/screenshots
```

### 헤드리스 모드

CI에서는 자동으로 헤드리스 모드로 실행됨. 로컬에서 명시적으로:

```bash
# 헤드리스 (기본)
pnpm cy:e2e

# 브라우저 표시
pnpm cy:e2e:headed

# 특정 브라우저
cypress run --browser chrome
cypress run --browser firefox
```

### 병렬 실행 (Cypress Cloud)

```bash
# Cypress Cloud 연동 시
cypress run --record --parallel --key $CYPRESS_RECORD_KEY
```

## 일반적인 실수

### 1. 테스트 간 상태 공유

```typescript
// 나쁨 - 테스트 간 상태 누출
let count = 0;

it('test 1', () => { count++; expect(count).toBe(1); });
it('test 2', () => { count++; expect(count).toBe(1); }); // 실패!

// 좋음 - beforeEach에서 초기화
let count: number;
beforeEach(() => { count = 0; });
```

### 2. 하드코딩된 타임아웃

```typescript
// 나쁨
cy.wait(3000);
cy.get('.result').should('exist');

// 좋음 - 조건부 대기
cy.intercept('GET', '/api/data').as('getData');
cy.wait('@getData');
cy.getByTestId('result').should('be.visible');
```

### 3. 구현 세부사항 테스트

```typescript
// 나쁨 - 내부 상태 직접 검증
expect(component.state.isOpen).toBe(true);

// 좋음 - 사용자가 보는 결과 검증
cy.getByTestId('dropdown-menu').should('be.visible');
```
