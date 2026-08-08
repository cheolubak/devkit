# 프론트엔드 심화 TDD: Server Action · TanStack Query · Zustand

기본 유틸·훅·컴포넌트 test-first는 [frontend-vitest.md](frontend-vitest.md)에 있다. 여기서는 **비동기·서버·전역상태가 끼어들 때 테스트가 무엇이 달라지는지**만 다룬다. 각 라이브러리 자체 사용법은 전용 스킬(server-actions / tanstack-query / zustand-patterns)을 본다 — 이 문서는 그것들을 **test-first로 검증하는 각도**다.

핵심 원칙 하나: **외부 경계만 mock하고, 관찰 가능한 결과를 검증한다.** async가 들어와도 규율은 그대로다.

---

## 1. Server Action — 경계를 mock하고 `await`로 결과를 검증

Server Action은 "입력 검증 → 부수효과 → 반환값"의 함수다. 순수 로직처럼 test-first가 가능하다. **DB·`revalidatePath` 같은 경계만 mock**하고 반환값을 검증한다.

### RED

```typescript
// src/actions/create-todo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTodo } from './create-todo';
import { db } from '@/lib/db';

vi.mock('@/lib/db', () => ({ db: { todo: { create: vi.fn() } } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('createTodo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('빈 제목이면 검증 에러를 반환한다', async () => {
    const form = new FormData();
    form.set('title', '');

    const result = await createTodo(form);

    expect(result).toEqual({ error: '제목을 입력하세요' });
    expect(db.todo.create).not.toHaveBeenCalled(); // 경계까지 안 갔다
  });
});
```

검증 실패 시 **DB를 건드리지 않는 것**까지 확인하는 게 포인트다. `create-todo.ts`가 없으니 RED.

### GREEN

```typescript
// src/actions/create-todo.ts
'use server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const schema = z.object({ title: z.string().min(1, '제목을 입력하세요') });

export async function createTodo(form: FormData) {
  const parsed = schema.safeParse({ title: form.get('title') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  await db.todo.create({ data: parsed.data });
  revalidatePath('/todos');
  return { ok: true };
}
```

다음 케이스(정상 생성 시 `db.todo.create` 호출 인자, `revalidatePath` 호출)를 리스트에 적고 각각 RED→GREEN. **부수효과는 반환값으로 못 볼 때만** `toHaveBeenCalledWith`로 검증한다(과도한 상호작용 검증 주의).

---

## 2. TanStack Query — 네트워크를 mock하고 `waitFor`로 상태 전이를 검증

Query 훅의 관찰 대상은 **비동기 상태 전이**(loading → success/error)다. `fetch`/API 함수를 mock하고 `QueryClientProvider`로 감싼 뒤 `waitFor`로 최종 상태를 기다린다.

```typescript
// src/hooks/use-todos.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTodos } from './use-todos';
import * as api from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  // 테스트에선 재시도를 꺼서 실패 케이스가 빨리 확정되게 한다
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('요청이 성공하면 목록 데이터를 노출한다', async () => {
  vi.spyOn(api, 'fetchTodos').mockResolvedValue([{ id: 1, title: '할 일' }]);

  const { result } = renderHook(() => useTodos(), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([{ id: 1, title: '할 일' }]);
});
```

- **경계는 `api.fetchTodos`** 하나만 mock한다. QueryClient는 실제 것을 쓴다(내부 구현이 아니라 진짜 상태 전이를 검증).
- 테스트마다 **새 QueryClient**를 만들어 캐시 격리. `retry: false`로 실패 케이스가 무한정 기다리지 않게 한다.
- 실패 케이스는 `mockRejectedValue` 후 `waitFor(() => expect(result.current.isError).toBe(true))`.

---

## 3. Zustand — 스토어 액션의 관찰 가능한 출력을 검증

전역 스토어는 **액션 호출 후 상태(getState)** 를 검증한다. 컴포넌트 없이 스토어 자체를 test-first로 만들 수 있다. 단, 스토어는 모듈 싱글턴이라 **테스트 간 초기화**가 필수다.

```typescript
// src/stores/cart.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from './cart';

describe('cartStore', () => {
  // 싱글턴 상태 오염 방지: 매 테스트 전에 초기 상태로 리셋
  beforeEach(() => useCartStore.setState({ items: [] }));

  it('상품을 담으면 items에 추가된다', () => {
    useCartStore.getState().add({ id: 1, title: '책', price: 10000 });

    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('같은 상품을 다시 담으면 수량만 증가한다', () => {
    const store = useCartStore.getState();
    store.add({ id: 1, title: '책', price: 10000 });
    store.add({ id: 1, title: '책', price: 10000 });

    expect(useCartStore.getState().items[0].qty).toBe(2);
  });
});
```

- 훅을 렌더링하지 않고 **`getState()`로 액션 호출 + 결과 조회**. 스토어 로직은 이렇게 순수하게 검증하는 게 가장 빠르다.
- `beforeEach`의 `setState` 리셋을 빠뜨리면 이전 테스트가 담은 상품이 다음 테스트로 새어 들어간다 — 전역상태 테스트의 대표적 함정.
- 컴포넌트가 스토어를 **어떻게 그리는지**는 별개 관심사다. 그건 [frontend-vitest.md](frontend-vitest.md)의 컴포넌트 테스트(`getByRole`)로 검증한다.

---

## 요약: 무엇이 달라졌나

| 대상 | mock하는 경계 | 검증하는 관찰값 |
|------|--------------|----------------|
| Server Action | DB·`revalidatePath` | 반환값(+검증 실패 시 경계 미호출) |
| TanStack Query | API 함수 | `waitFor`로 기다린 최종 상태·data |
| Zustand | 없음(순수) | 액션 후 `getState()` |

async·서버·전역이 끼어들어도 규칙은 하나다 — **경계만 mock, 나머지는 관찰 가능한 결과.**
