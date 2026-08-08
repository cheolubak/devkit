---
name: tanstack-query
description: "TanStack Query v5 데이터 페칭 패턴. useQuery, useMutation, 프리페칭, 옵티미스틱 업데이트, 무한 스크롤, Next.js App Router 통합.\nAPPLIES: `useQuery`·`useMutation`으로 클라이언트에서 서버 데이터를 가져오거나 캐시를 무효화할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"데이터 가져와\", \"API 호출\", \"서버 데이터\", \"useQuery\", \"react-query\", \"데이터 페칭\", \"무한 스크롤\", \"로딩 처리\", \"낙관적 업데이트\", 클라이언트에서 서버 데이터 페칭/캐싱 시.\nSKIP: 서버 컴포넌트 데이터 페칭은 cache-components. 폼 제출은 react-hook-form + server-actions."
---

# TanStack Query v5 가이드

## 설치

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools
```

## 프로바이더 설정 (Next.js App Router)

```tsx
// providers/query-provider.tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1분
            gcTime: 5 * 60 * 1000, // 5분
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

// app/layout.tsx
import { QueryProvider } from "@/providers/query-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

## Query Key Factory 패턴

```typescript
// lib/query-keys.ts
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

export const postKeys = {
  all: ["posts"] as const,
  lists: () => [...postKeys.all, "list"] as const,
  list: (filters?: PostFilters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, "detail"] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
  comments: (postId: string) => [...postKeys.detail(postId), "comments"] as const,
};
```

## API 함수 분리

```typescript
// lib/api/users.ts
import type { User, CreateUserInput, UpdateUserInput } from "@/types";

const BASE_URL = "/api";

export async function getUsers(filters?: UserFilters): Promise<User[]> {
  const params = new URLSearchParams(filters as Record<string, string>);
  const res = await fetch(`${BASE_URL}/users?${params}`);
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function getUser(id: string): Promise<User> {
  const res = await fetch(`${BASE_URL}/users/${id}`);
  if (!res.ok) throw new Error("User not found");
  return res.json();
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const res = await fetch(`${BASE_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to create user");
  return res.json();
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const res = await fetch(`${BASE_URL}/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to update user");
  return res.json();
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/users/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete user");
}
```

## Custom Hooks

### useQuery 기본

```typescript
// hooks/use-users.ts
import { useQuery } from "@tanstack/react-query";
import { getUsers, getUser } from "@/lib/api/users";
import { userKeys } from "@/lib/query-keys";

export function useUsers(filters?: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => getUsers(filters),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => getUser(id),
    enabled: !!id, // id가 없으면 쿼리 실행하지 않음
  });
}
```

### useMutation + 캐시 무효화

```typescript
// hooks/use-create-user.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createUser } from "@/lib/api/users";
import { userKeys } from "@/lib/query-keys";

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
```

### 옵티미스틱 업데이트

```typescript
// hooks/use-update-user.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateUser } from "@/lib/api/users";
import { userKeys } from "@/lib/query-keys";

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateUserInput) => updateUser(id, input),
    onMutate: async (newData) => {
      // 진행 중인 쿼리 취소
      await queryClient.cancelQueries({ queryKey: userKeys.detail(id) });

      // 이전 데이터 스냅샷
      const previousUser = queryClient.getQueryData(userKeys.detail(id));

      // 낙관적 업데이트
      queryClient.setQueryData(userKeys.detail(id), (old: User) => ({
        ...old,
        ...newData,
      }));

      return { previousUser };
    },
    onError: (_err, _newData, context) => {
      // 실패 시 롤백
      if (context?.previousUser) {
        queryClient.setQueryData(userKeys.detail(id), context.previousUser);
      }
    },
    onSettled: () => {
      // 성공/실패 관계없이 캐시 갱신
      queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
    },
  });
}
```

### 무한 스크롤

```typescript
// hooks/use-infinite-posts.ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { postKeys } from "@/lib/query-keys";

interface PostsResponse {
  posts: Post[];
  nextCursor: string | null;
}

export function useInfinitePosts() {
  return useInfiniteQuery({
    queryKey: postKeys.lists(),
    queryFn: async ({ pageParam }): Promise<PostsResponse> => {
      const res = await fetch(`/api/posts?cursor=${pageParam}&limit=20`);
      return res.json();
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

// 컴포넌트에서 사용
"use client";
import { useInfinitePosts } from "@/hooks/use-infinite-posts";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";

export function PostList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinitePosts();
  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) fetchNextPage();
  }, [inView, hasNextPage, fetchNextPage]);

  return (
    <div>
      {data?.pages.map((page) =>
        page.posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
      <div ref={ref}>
        {isFetchingNextPage && <Spinner />}
      </div>
    </div>
  );
}
```

## Server Component에서 프리페칭

```tsx
// app/users/page.tsx (Server Component)
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getUsers } from "@/lib/api/users";
import { userKeys } from "@/lib/query-keys";
import { UserList } from "./user-list";

export default async function UsersPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: userKeys.list(),
    queryFn: () => getUsers(),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserList /> {/* Client Component - useUsers() 사용 */}
    </HydrationBoundary>
  );
}
```

## 폴링 (주기적 갱신)

```typescript
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 30 * 1000, // 30초마다 갱신
    refetchIntervalInBackground: false, // 탭 비활성 시 중지
  });
}
```

## 병렬 & 의존 쿼리

```typescript
// 병렬 쿼리
import { useQueries } from "@tanstack/react-query";

export function useMultipleUsers(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: userKeys.detail(id),
      queryFn: () => getUser(id),
    })),
  });
}

// 의존 쿼리 (순차 실행)
export function useUserPosts(userId: string) {
  const userQuery = useUser(userId);

  return useQuery({
    queryKey: postKeys.list({ authorId: userId }),
    queryFn: () => getPostsByAuthor(userId),
    enabled: !!userQuery.data, // user 로딩 완료 후 실행
  });
}
```

## 에러/로딩 UI 패턴

```tsx
"use client";
export function UserProfile({ id }: { id: string }) {
  const { data: user, isLoading, error } = useUser(id);

  if (isLoading) return <UserSkeleton />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!user) return <NotFound />;

  return <div>{user.name}</div>;
}
```

## TanStack Query vs Server Component 선택 기준

| 시나리오 | 방법 |
|----------|------|
| 정적/SEO 필요 데이터 | Server Component에서 직접 fetch |
| 사용자 인터랙션 후 데이터 | TanStack Query |
| 실시간/폴링 | TanStack Query (refetchInterval) |
| 무한 스크롤 | TanStack Query (useInfiniteQuery) |
| 낙관적 업데이트 | TanStack Query (onMutate) |
| 초기 로드 + 클라이언트 갱신 | Server Component 프리페칭 + HydrationBoundary |

## 자주 하는 실수

1. **queryKey에 객체 리터럴 직접 사용** - Query Key Factory 패턴으로 일관성 유지
2. **mutationFn 안에서 캐시 무효화** - `onSuccess` 콜백에서 처리
3. **staleTime 0 (기본값)** - 적절한 staleTime 설정으로 불필요한 리페치 방지
4. **Server Component에서 useQuery 사용** - 서버에서는 직접 fetch, 클라이언트만 useQuery
5. **enabled 없이 조건부 쿼리** - undefined 파라미터 시 `enabled: !!param` 필수
6. **QueryClient를 컴포넌트 바깥에서 생성** - `useState`로 인스턴스 안정화
