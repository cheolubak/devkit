# 고급 테스트 패턴

## MSW (Mock Service Worker)

외부 API 호출을 가로채는 네트워크 레벨 모킹. fetch, axios 등 HTTP 클라이언트에 무관하게 작동.

### 설치

```bash
pnpm add -D msw
```

### Handlers 정의

```typescript
// __tests__/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // GET /api/users
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'John', email: 'john@test.com' },
      { id: '2', name: 'Jane', email: 'jane@test.com' },
    ]);
  }),

  // POST /api/users
  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      { id: '3', ...body },
      { status: 201 },
    );
  }),

  // 에러 응답
  http.get('/api/products', () => {
    return HttpResponse.json(
      { error: 'Not Found' },
      { status: 404 },
    );
  }),

  // 외부 API
  http.get('https://api.example.com/data', () => {
    return HttpResponse.json({ result: 'mocked' });
  }),
];
```

### Server 설정

```typescript
// __tests__/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

### vitest.setup.ts 연동

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { server } from './__tests__/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 테스트별 핸들러 오버라이드

```typescript
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

it('should handle server error', async () => {
  // 이 테스트에서만 에러 응답 반환
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
      );
    }),
  );

  // 에러 처리 테스트
});
```

## 테스트 픽스처

### 팩토리 함수 패턴

```typescript
// __tests__/fixtures/user.ts
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: Date;
}

let counter = 0;

export function createMockUser(overrides: Partial<User> = {}): User {
  counter += 1;
  return {
    id: `user-${counter}`,
    name: `User ${counter}`,
    email: `user${counter}@test.com`,
    role: 'user',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// 사용 예
const admin = createMockUser({ role: 'admin', name: 'Admin' });
const users = Array.from({ length: 5 }, () => createMockUser());
```

```typescript
// __tests__/fixtures/product.ts
interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  categoryId: string;
}

let productCounter = 0;

export function createMockProduct(overrides: Partial<Product> = {}): Product {
  productCounter += 1;
  return {
    id: `product-${productCounter}`,
    name: `상품 ${productCounter}`,
    price: 10000 * productCounter,
    stock: 100,
    categoryId: 'category-1',
    ...overrides,
  };
}
```

### Cypress 픽스처

```json
// cypress/fixtures/products.json
[
  {
    "id": "1",
    "name": "기계식 키보드",
    "price": 89000,
    "image": "/products/keyboard.jpg"
  },
  {
    "id": "2",
    "name": "무선 마우스",
    "price": 45000,
    "image": "/products/mouse.jpg"
  }
]
```

```typescript
// 사용
cy.intercept('GET', '/api/products', { fixture: 'products.json' });
```

## Cypress 커스텀 커맨드

### data-testid 선택

```typescript
// cypress/support/commands.ts
Cypress.Commands.add('getByTestId', (testId: string) => {
  return cy.get(`[data-testid="${testId}"]`);
});

// 사용
cy.getByTestId('submit-button').click();
```

### 로그인 커맨드

```typescript
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();
    cy.url().should('not.include', '/login');
  });
});

// 사용
cy.login('admin@test.com', 'P@ssw0rd!');
cy.visit('/dashboard');
```

### API 로그인 (빠른 방식)

```typescript
Cypress.Commands.add('loginByApi', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.request('POST', '/api/auth/login', { email, password }).then((res) => {
      // 쿠키 기반 인증이면 자동으로 설정됨
      // 토큰 기반이면 localStorage에 저장
      window.localStorage.setItem('token', res.body.accessToken);
    });
  });
});
```

### TypeScript 선언

```typescript
// cypress/support/commands.ts 하단
declare global {
  namespace Cypress {
    interface Chainable {
      getByTestId(testId: string): Chainable<JQuery<HTMLElement>>;
      login(email: string, password: string): Chainable<void>;
      loginByApi(email: string, password: string): Chainable<void>;
    }
  }
}
```

## Cypress 세션 관리

`cy.session()`으로 인증 상태를 캐싱하여 테스트 속도를 높인다:

```typescript
// 기본 사용
cy.session('admin', () => {
  cy.visit('/login');
  cy.get('input[name="email"]').type('admin@test.com');
  cy.get('input[name="password"]').type('P@ssw0rd!');
  cy.get('button[type="submit"]').click();
  cy.url().should('include', '/dashboard');
});

// validate 옵션으로 세션 유효성 검증
cy.session('admin', () => {
  cy.visit('/login');
  // ... 로그인
}, {
  validate() {
    cy.request('/api/auth/me').its('status').should('eq', 200);
  },
});
```

## 비동기 테스트 (Testing Library)

### waitFor

```typescript
import { render, screen, waitFor } from '@testing-library/react';

it('should load data asynchronously', async () => {
  render(<UserList />);

  // 비동기 데이터 로딩 대기
  await waitFor(() => {
    expect(screen.getByText('John')).toBeInTheDocument();
  });
});
```

### findBy*

```typescript
it('should show success message after submit', async () => {
  render(<ContactForm />);

  // ... 폼 입력 및 제출

  // findBy*는 waitFor + getBy 조합과 동일
  const message = await screen.findByText('전송 완료');
  expect(message).toBeInTheDocument();
});
```

### act와 함께 사용

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';

it('should fetch data in hook', async () => {
  const { result } = renderHook(() => useUsers());

  // 초기 로딩 상태
  expect(result.current.isLoading).toBe(true);

  // 데이터 로딩 완료 대기
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });

  expect(result.current.users).toHaveLength(2);
});
```

## 환경별 테스트 분리

파일 상단의 디렉티브로 테스트 환경을 지정할 수 있다:

```typescript
// @vitest-environment node
// API Route Handler 테스트 - 브라우저 API 불필요
import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('Health API', () => {
  it('should return status ok', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
```

```typescript
// @vitest-environment jsdom
// 컴포넌트/Hook 테스트 - 브라우저 API 필요 (기본값)
import { renderHook } from '@testing-library/react';
import { useMediaQuery } from '@/hooks/use-media-query';

describe('useMediaQuery', () => {
  it('should return false for non-matching query', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });
});
```

## 브라우저 API 모킹

### IntersectionObserver

```typescript
// vitest.setup.ts 또는 개별 테스트 파일
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(private callback: IntersectionObserverCallback) {}

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);

  // 테스트에서 교차 상태를 트리거하려면:
  trigger(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(entries as IntersectionObserverEntry[], this);
  }
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
```

### ResizeObserver

```typescript
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);
```

### scrollTo / scrollIntoView

```typescript
window.scrollTo = vi.fn();
Element.prototype.scrollIntoView = vi.fn();
```

### localStorage / sessionStorage

jsdom에서 기본 제공되지만, 필요 시 직접 모킹:

```typescript
const mockStorage: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  }),
});
```
