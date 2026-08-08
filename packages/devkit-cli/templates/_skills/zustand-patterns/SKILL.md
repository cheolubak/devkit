---
name: zustand-patterns
description: "Zustand 상태 관리 패턴. 스토어 설계, 슬라이스 패턴, persist/immer 미들웨어, SSR 하이드레이션, 셀렉터 최적화.\nAPPLIES: `create()` 스토어로 클라이언트 전역 상태를 만들거나 셀렉터·persist·slice를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"상태 관리\", \"전역 상태\", \"스토어 만들어줘\", \"zustand\", \"store 설계\", \"상태 공유\", \"전역 데이터\", React/Next.js에서 클라이언트 상태 관리 구현 시.\nSKIP: 서버 데이터 캐싱/페칭은 tanstack-query. 폼 상태는 react-hook-form. 서버 컴포넌트 상태는 react-best-practices."
---

# Zustand 상태 관리 가이드

## 설치

```bash
pnpm add zustand
```

## 기본 스토어

```typescript
// stores/counter-store.ts
import { create } from "zustand";

interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));
```

## 셀렉터 패턴 (리렌더링 최적화)

```tsx
// 나쁨 - 스토어 전체 구독 (모든 변경에 리렌더링)
const { count, increment } = useCounterStore();

// 좋음 - 필요한 값만 개별 셀렉터로 구독
const count = useCounterStore((s) => s.count);
const increment = useCounterStore((s) => s.increment);

// 좋음 - 여러 값을 shallow 비교로 구독
import { useShallow } from "zustand/shallow";

const { count, increment } = useCounterStore(
  useShallow((s) => ({ count: s.count, increment: s.increment }))
);
```

## 실전 스토어 설계

### 비동기 액션 포함 스토어

```typescript
// stores/user-store.ts
import { create } from "zustand";

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  fetchUser: (id: string) => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  clearUser: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  isLoading: false,
  error: null,

  fetchUser: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const user = await res.json();
      set({ user, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  updateUser: async (data) => {
    const { user } = get();
    if (!user) return;

    // 낙관적 업데이트
    const previous = user;
    set({ user: { ...user, ...data } });

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      set({ user: previous }); // 롤백
    }
  },

  clearUser: () => set({ user: null, error: null }),
}));
```

### UI 상태 스토어

```typescript
// stores/ui-store.ts
import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  theme: "light" | "dark" | "system";
  toggleSidebar: () => void;
  setTheme: (theme: UIState["theme"]) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  theme: "system",
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTheme: (theme) => set({ theme }),
}));
```

## 슬라이스 패턴 (대규모 스토어 분리)

```typescript
// stores/slices/auth-slice.ts
import { StateCreator } from "zustand";

export interface AuthSlice {
  isAuthenticated: boolean;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

export const createAuthSlice: StateCreator<
  AuthSlice & CartSlice, // 전체 스토어 타입
  [],
  [],
  AuthSlice
> = (set) => ({
  isAuthenticated: false,
  token: null,
  login: (token) => set({ isAuthenticated: true, token }),
  logout: () => set({ isAuthenticated: false, token: null }),
});

// stores/slices/cart-slice.ts
export interface CartSlice {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  totalPrice: () => number;
}

export const createCartSlice: StateCreator<
  AuthSlice & CartSlice,
  [],
  [],
  CartSlice
> = (set, get) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  totalPrice: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
});

// stores/app-store.ts
import { create } from "zustand";
import { createAuthSlice, AuthSlice } from "./slices/auth-slice";
import { createCartSlice, CartSlice } from "./slices/cart-slice";

export const useAppStore = create<AuthSlice & CartSlice>()((...a) => ({
  ...createAuthSlice(...a),
  ...createCartSlice(...a),
}));
```

## 미들웨어

### Persist (영구 저장)

```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: "ko",
      notifications: true,
      setLanguage: (language) => set({ language }),
      toggleNotifications: () => set((s) => ({ notifications: !s.notifications })),
    }),
    {
      name: "settings-storage", // localStorage 키
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        language: state.language,
        notifications: state.notifications,
      }), // 액션 제외, 상태만 저장
    }
  )
);
```

### Immer (불변 업데이트 간소화)

```typescript
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface TodoState {
  todos: { id: string; text: string; done: boolean }[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  updateTodo: (id: string, text: string) => void;
}

export const useTodoStore = create<TodoState>()(
  immer((set) => ({
    todos: [],
    addTodo: (text) =>
      set((state) => {
        state.todos.push({ id: crypto.randomUUID(), text, done: false });
      }),
    toggleTodo: (id) =>
      set((state) => {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) todo.done = !todo.done;
      }),
    updateTodo: (id, text) =>
      set((state) => {
        const todo = state.todos.find((t) => t.id === id);
        if (todo) todo.text = text;
      }),
  }))
);
```

### Devtools

```typescript
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export const useStore = create<State>()(
  devtools(
    (set) => ({
      // ...
    }),
    { name: "MyStore" } // Redux DevTools에 표시될 이름
  )
);
```

### 미들웨어 조합

```typescript
export const useStore = create<State>()(
  devtools(
    persist(
      immer((set) => ({
        // 스토어 정의
      })),
      { name: "store-key" }
    ),
    { name: "StoreName" }
  )
);
// 순서: devtools → persist → immer (안쪽부터 적용)
```

## SSR/하이드레이션 안전 패턴

### Next.js에서 하이드레이션 불일치 방지

```tsx
// hooks/use-store-hydration.ts
import { useEffect, useState } from "react";

export function useStoreHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}

// 컴포넌트에서 사용
"use client";
import { useStoreHydration } from "@/hooks/use-store-hydration";
import { useSettingsStore } from "@/stores/settings-store";

export function SettingsPanel() {
  const hydrated = useStoreHydration();
  const language = useSettingsStore((s) => s.language);

  if (!hydrated) return <Skeleton />; // 서버/클라이언트 불일치 방지
  return <div>Language: {language}</div>;
}
```

### onFinishHydration 활용

```typescript
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({ /* ... */ }),
    {
      name: "settings",
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) console.error("Hydration failed:", error);
        };
      },
    }
  )
);
```

## Zustand vs React Context 선택 기준

| 기준 | Zustand | React Context |
|------|---------|---------------|
| 전역 상태 (인증, 테마, 장바구니) | O | |
| 빈번한 업데이트 | O (셀렉터로 최적화) | X (전체 리렌더링) |
| 서버 상태 캐시 | X (TanStack Query 사용) | X |
| 폼 상태 | X (React Hook Form) | X |
| 컴포넌트 트리 일부 공유 | | O (Provider 범위 제한) |

## 자주 하는 실수

1. **셀렉터 없이 전체 스토어 구독** - 불필요한 리렌더링 발생
2. **서버 상태를 Zustand에 저장** - API 데이터는 TanStack Query 사용
3. **persist에 함수 포함** - `partialize`로 상태만 저장
4. **SSR에서 persist 스토어 직접 사용** - 하이드레이션 체크 필수
5. **스토어 안에서 다른 스토어 접근** - 스토어 간 의존은 슬라이스 패턴 또는 컴포넌트 레벨에서 조합
