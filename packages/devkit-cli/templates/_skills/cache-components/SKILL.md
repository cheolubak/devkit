---
name: cache-components
description: "Next.js Cache Components (use cache) 패턴 가이드. cacheTag, cacheLife, updateTag 사용법.\nAPPLIES: Next.js App Router에서 `use cache`·`cacheTag`·`cacheLife`가 붙은 코드를 읽거나 쓸 때, 서버 데이터가 갱신되지 않거나 너무 자주 갱신될 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"캐싱 어떻게\", \"use cache\", \"캐시 전략\", \"cacheTag\", \"cacheLife\", \"데이터 캐싱\", \"revalidate\", Next.js 앱에서 캐시/캐싱 관련 질문이나 구현 시.\nSKIP: TanStack Query 클라이언트 캐싱은 tanstack-query. HTTP 캐시 헤더/CDN 설정은 nextjs-deployment. NestJS 서버 사이드 캐싱(Redis·CacheModule)은 nestjs-caching."
---

> 참조:
> - [references/cache-directives.md](references/cache-directives.md) - 'use cache' 지시어 및 캐시 핸들러
> - [references/cache-functions.md](references/cache-functions.md) - cacheLife, cacheTag, updateTag, revalidateTag, connection 함수
> - [references/cache-configuration.md](references/cache-configuration.md) - 설정, 마이그레이션, 런타임 동작, 타입 정의
> - [references/PATTERNS.md](references/PATTERNS.md) - 12개 캐시 패턴 & 레시피 (이커머스, SaaS, 서브셸 등)
> - [references/TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) - 디버깅 체크리스트, 에러 해결, 성능 최적화

# Next.js Cache Components 가이드

## 전제 조건

`next.config.ts`에서 활성화 필요:

```ts
const nextConfig = {
  cacheComponents: true,
};
```

## 캐시 지시어

### 'use cache' (기본)

인메모리 캐시. 가장 기본적인 캐시 방식.

```tsx
"use cache";

import { cacheTag, cacheLife } from "next/cache";

export async function getProducts() {
  cacheTag("products");
  cacheLife("hours");
  return db.query.products.findMany();
}
```

### 'use cache: private'

cookies()/headers() 접근이 필요할 때 사용.

```tsx
"use cache: private";

import { cookies } from "next/headers";
import { cacheTag, cacheLife } from "next/cache";

export async function getUserPreferences() {
  cacheTag("user-prefs");
  cacheLife("minutes");
  const session = await cookies();
  const userId = session.get("userId")?.value;
  return db.query.preferences.findFirst({ where: { userId } });
}
```

### 'use cache: remote'

인스턴스 간 공유되는 영구 캐시 (Redis, KV).

```tsx
"use cache: remote";

import { cacheTag, cacheLife } from "next/cache";

export async function getGlobalConfig() {
  cacheTag("global-config");
  cacheLife("days");
  return db.query.config.findFirst();
}
```

## cacheLife 프리셋

| 프리셋      | stale    | revalidate | expire   |
| ----------- | -------- | ---------- | -------- |
| `"seconds"` | 30초     | 1초        | 60초     |
| `"minutes"` | 5분      | 1분        | 1시간    |
| `"hours"`   | 5분      | 1시간      | 1일      |
| `"days"`    | 5분      | 1일        | 1주      |
| `"weeks"`   | 5분      | 1주        | 30일     |
| `"max"`     | 5분      | 30일       | 1년      |

`stale`은 클라이언트 라우터 캐시가 재검증 없이 재사용하는 시간이라 어떤 프리셋에서도 0이 아니다(기본 300초). `"max"`의 `expire`도 무한이 아니라 1년이다 — 초 단위 정확한 값은 [references/cache-functions.md](references/cache-functions.md)를 본다.

### 커스텀 cacheLife

```tsx
cacheLife({
  stale: 300,       // 5분 동안 stale 허용
  revalidate: 3600, // 1시간마다 재검증
  expire: 86400,    // 1일 후 만료
});
```

## cacheTag - 무효화 키

```tsx
"use cache";

import { cacheTag, cacheLife } from "next/cache";

// 단일 태그
export async function getPost(id: string) {
  cacheTag(`post-${id}`);
  cacheLife("hours");
  return db.query.posts.findFirst({ where: { id } });
}

// 다중 태그
export async function getPostWithComments(id: string) {
  cacheTag(`post-${id}`, "comments");
  cacheLife("minutes");
  return {
    post: await db.query.posts.findFirst({ where: { id } }),
    comments: await db.query.comments.findMany({ where: { postId: id } }),
  };
}
```

## 무효화: updateTag vs revalidateTag

### updateTag (Server Actions 전용, 즉시)

```tsx
"use server";

import { updateTag } from "next/cache";

export async function updatePost(id: string, formData: FormData) {
  await db.posts.update({
    where: { id },
    data: { title: formData.get("title") as string },
  });
  updateTag(`post-${id}`); // 즉시 무효화 (read-your-own-writes)
}
```

### revalidateTag (Server Actions + Route Handlers)

```tsx
import { revalidateTag } from "next/cache";

// Route Handler에서 사용 가능
export async function POST(request: Request) {
  const data = await request.json();
  await processWebhook(data);
  revalidateTag("products"); // stale-while-revalidate
  return Response.json({ ok: true });
}
```

**권장:** Server Actions에서는 `updateTag()` 사용 (즉시 반영).

## 주의사항

### 'use cache'는 반드시 첫 번째 문장

```tsx
// ✅ 올바름
"use cache";
import { cacheTag } from "next/cache";

// ❌ 오류
import { cacheTag } from "next/cache";
("use cache");
```

### 'use cache' 내부에서 cookies/headers 금지

```tsx
// ❌ 오류
"use cache";
export async function getData() {
  const session = await cookies(); // 오류 발생
}

// ✅ 'use cache: private' 사용
"use cache: private";
export async function getData() {
  const session = await cookies(); // OK
}
```

### Suspense로 동적 콘텐츠 감싸기

```tsx
import { Suspense } from "react";

export default function ProductPage() {
  return (
    <>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductDetails />
      </Suspense>
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews />
      </Suspense>
    </>
  );
}
```

## 지원 중단된 패턴

```tsx
// ❌ 지원 중단
export const revalidate = 3600;    // → cacheLife("hours")
export const dynamic = "force-dynamic"; // → 제거, 'use cache' + Suspense
export const fetchCache = "force-cache"; // → 'use cache'

// ✅ 대체
"use cache";
cacheLife("hours");
```

## 컴포넌트 레벨 캐싱

```tsx
"use cache";

import { cacheTag, cacheLife } from "next/cache";

export async function CachedSidebar() {
  cacheTag("sidebar");
  cacheLife("days");

  const navigation = await getNavigation();
  return (
    <nav>
      {navigation.map(item => (
        <a key={item.href} href={item.href}>{item.label}</a>
      ))}
    </nav>
  );
}
```
