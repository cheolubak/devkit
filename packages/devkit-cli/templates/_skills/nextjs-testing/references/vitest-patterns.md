# 유닛 테스트 패턴 (Vitest)

### 유틸리티 함수

```typescript
// __tests__/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice, slugify, truncate } from '@/lib/utils';

describe('formatPrice', () => {
  it('should format number to KRW', () => {
    expect(formatPrice(10000)).toBe('₩10,000');
  });

  it('should handle zero', () => {
    expect(formatPrice(0)).toBe('₩0');
  });
});

describe('slugify', () => {
  it('should convert string to slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should remove special characters', () => {
    expect(slugify('Hello @World!')).toBe('hello-world');
  });
});

describe('truncate', () => {
  it('should truncate long text', () => {
    expect(truncate('Lorem ipsum dolor sit amet', 10)).toBe('Lorem ipsu...');
  });

  it('should return original text if shorter than limit', () => {
    expect(truncate('Short', 10)).toBe('Short');
  });
});
```

### React Hook

```typescript
// __tests__/hooks/use-counter.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCounter } from '@/hooks/use-counter';

describe('useCounter', () => {
  it('should initialize with default value', () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
  });

  it('should initialize with custom value', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  it('should increment', () => {
    const { result } = renderHook(() => useCounter());
    act(() => result.current.increment());
    expect(result.current.count).toBe(1);
  });

  it('should decrement', () => {
    const { result } = renderHook(() => useCounter(5));
    act(() => result.current.decrement());
    expect(result.current.count).toBe(4);
  });

  it('should reset to initial value', () => {
    const { result } = renderHook(() => useCounter(5));
    act(() => result.current.increment());
    act(() => result.current.reset());
    expect(result.current.count).toBe(5);
  });
});
```

### Server Action

```typescript
// __tests__/actions/user.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// next/cache 모킹
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

// next/headers 모킹
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name: string) => ({ name, value: 'mock-session-id' })),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map([['authorization', 'Bearer mock-token']])),
}));

import { createUser, deleteUser } from '@/app/actions/user';
import { updateTag } from 'next/cache';

// DB 모킹 (Prisma 예시)
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { db } from '@/lib/db';

describe('User Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user and revalidate', async () => {
      const mockUser = { id: '1', name: 'John', email: 'john@test.com' };
      vi.mocked(db.user.create).mockResolvedValue(mockUser);

      const formData = new FormData();
      formData.set('name', 'John');
      formData.set('email', 'john@test.com');

      const result = await createUser(formData);

      expect(db.user.create).toHaveBeenCalledWith({
        data: { name: 'John', email: 'john@test.com' },
      });
      expect(updateTag).toHaveBeenCalledWith('users');
      expect(result).toEqual({ success: true });
    });

    it('should return error for invalid data', async () => {
      const formData = new FormData();
      formData.set('name', '');
      formData.set('email', 'invalid');

      const result = await createUser(formData);

      expect(result).toHaveProperty('error');
      expect(db.user.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('should delete user by id', async () => {
      vi.mocked(db.user.delete).mockResolvedValue({ id: '1' } as any);

      const result = await deleteUser('1');

      expect(db.user.delete).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(updateTag).toHaveBeenCalledWith('users');
      expect(result).toEqual({ success: true });
    });
  });
});
```

### API Route Handler

```typescript
// __tests__/api/users/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/users/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { db } from '@/lib/db';

describe('GET /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return users list', async () => {
    const mockUsers = [{ id: '1', name: 'John' }];
    vi.mocked(db.user.findMany).mockResolvedValue(mockUsers);

    const request = new NextRequest('http://localhost:3000/api/users');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockUsers);
  });

  it('should support search params', async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/users?search=john');
    await GET(request);

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: expect.objectContaining({ contains: 'john' }),
        }),
      }),
    );
  });
});

describe('POST /api/users', () => {
  it('should create a user', async () => {
    const mockUser = { id: '1', name: 'John', email: 'john@test.com' };
    vi.mocked(db.user.create).mockResolvedValue(mockUser);

    const request = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'John', email: 'john@test.com' }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual(mockUser);
  });

  it('should return 400 for invalid body', async () => {
    const request = new NextRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
```

### Zustand 스토어

```typescript
// __tests__/stores/cart.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/stores/cart';

describe('useCartStore', () => {
  beforeEach(() => {
    // 스토어 초기화
    useCartStore.setState({
      items: [],
      total: 0,
    });
  });

  it('should add item to cart', () => {
    const item = { id: '1', name: '상품', price: 10000, quantity: 1 };

    useCartStore.getState().addItem(item);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(item);
  });

  it('should increase quantity for duplicate item', () => {
    const item = { id: '1', name: '상품', price: 10000, quantity: 1 };

    useCartStore.getState().addItem(item);
    useCartStore.getState().addItem(item);

    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it('should remove item from cart', () => {
    const item = { id: '1', name: '상품', price: 10000, quantity: 1 };
    useCartStore.setState({ items: [item] });

    useCartStore.getState().removeItem('1');

    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('should calculate total', () => {
    useCartStore.setState({
      items: [
        { id: '1', name: '상품A', price: 10000, quantity: 2 },
        { id: '2', name: '상품B', price: 5000, quantity: 1 },
      ],
    });

    useCartStore.getState().calculateTotal();

    expect(useCartStore.getState().total).toBe(25000);
  });

  it('should clear cart', () => {
    useCartStore.setState({
      items: [{ id: '1', name: '상품', price: 10000, quantity: 1 }],
      total: 10000,
    });

    useCartStore.getState().clearCart();

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().total).toBe(0);
  });
});
```
