# Vitest 상세 설정

## 전체 vitest.config.ts

```typescript
// vitest.config.ts
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
  test: {
    globals: false,            // 명시적 import 권장
    environment: 'jsdom',      // 브라우저 환경 시뮬레이션
    include: ['__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'cypress'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'hooks/**', 'app/actions/**', 'app/api/**', 'stores/**'],
      exclude: ['**/*.d.ts', '**/*.config.ts', '**/types/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

## @vitejs/plugin-react 설정

Next.js는 SWC를 사용하지만, Vitest에서는 `@vitejs/plugin-react`가 JSX 변환을 담당한다. NestJS의 `unplugin-swc`와 다른 점이다.

```typescript
import react from '@vitejs/plugin-react';

// 기본 설정 (대부분의 경우 충분)
plugins: [react()]

// Emotion을 사용하는 경우
plugins: [react({ jsxImportSource: '@emotion/react' })]
```

## Path Alias 설정

`tsconfig.json`의 `paths`와 일치시켜야 한다:

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}

// vitest.config.ts
resolve: {
  alias: {
    '@': resolve(__dirname, './'),
  },
},
```

여러 alias가 있는 경우:

```typescript
resolve: {
  alias: {
    '@': resolve(__dirname, './'),
    '@components': resolve(__dirname, './components'),
    '@lib': resolve(__dirname, './lib'),
  },
},
```

## jsdom vs happy-dom

| 특성 | jsdom | happy-dom |
|------|-------|-----------|
| 호환성 | 높음 (표준) | 보통 |
| 속도 | 보통 | 빠름 (2-3배) |
| API 지원 | 광범위 | 제한적 |
| 설치 | `pnpm add -D jsdom` | `pnpm add -D happy-dom` |

**권장:** `jsdom`을 기본으로 사용. 테스트 수가 많아 속도가 중요하면 `happy-dom` 고려.

```typescript
// happy-dom 사용 시
test: {
  environment: 'happy-dom',
}
```

## 커버리지 설정

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],        // 리포터 형식
  reportsDirectory: './coverage',              // 출력 디렉토리
  include: ['lib/**', 'hooks/**', 'app/actions/**', 'app/api/**'],
  exclude: [
    '**/*.d.ts',
    '**/*.config.ts',
    '**/types/**',
    '**/__tests__/**',
  ],
  thresholds: {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  },
},
```

커버리지 실행:

```bash
pnpm add -D @vitest/coverage-v8
pnpm test:cov
```

## vitest.setup.ts 상세

```typescript
// vitest.setup.ts
import { vi } from 'vitest'; // globals: false이므로 반드시 import (없으면 ReferenceError로 전체 테스트가 부팅 실패)
import '@testing-library/jest-dom/vitest';

// ---- next/navigation 모킹 ----
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

// ---- 브라우저 API 모킹 ----
// IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

## next/navigation 모킹 패턴

테스트별로 모킹 값을 변경해야 할 때:

```typescript
import { vi } from 'vitest';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

describe('NavigationComponent', () => {
  it('should redirect on button click', () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    });

    // 컴포넌트 렌더링 및 테스트
    // ...

    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('should highlight active link', () => {
    vi.mocked(usePathname).mockReturnValue('/about');

    // 컴포넌트 렌더링 및 테스트
    // ...
  });

  it('should read search params', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('q=test&page=2') as any,
    );

    // 컴포넌트 렌더링 및 테스트
    // ...
  });
});
```

## next/headers 모킹 패턴

```typescript
import { vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name: string) => {
      const store: Record<string, string> = {
        'session-id': 'mock-session',
        theme: 'dark',
      };
      return store[name] ? { name, value: store[name] } : undefined;
    }),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn((name: string) => name === 'session-id'),
    getAll: vi.fn(() => []),
  })),
  headers: vi.fn(() => new Map([
    ['authorization', 'Bearer mock-token'],
    ['x-forwarded-for', '127.0.0.1'],
  ])),
}));
```

## next/cache 모킹 패턴

```typescript
import { vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}));

// 테스트에서 사용
import { updateTag, revalidateTag } from 'next/cache';

it('should call updateTag after mutation', async () => {
  await someServerAction();
  expect(updateTag).toHaveBeenCalledWith('users');
});
```

## 환경별 테스트 분리

특정 테스트 파일에서 다른 환경을 사용해야 할 때:

```typescript
// __tests__/api/route.test.ts
// @vitest-environment node
// ↑ 이 파일은 jsdom 대신 node 환경에서 실행

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('Health API', () => {
  it('should return 200', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });
});
```

API Route Handler 테스트는 브라우저 API가 불필요하므로 `node` 환경이 적합하다.
