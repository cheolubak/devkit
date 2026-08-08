# Cache Configuration 레퍼런스

next.config.ts 설정, generateStaticParams, Route Handlers, 마이그레이션 시나리오, 런타임 동작, 타입 정의에 대한 레퍼런스입니다.

## 설정: `next.config.ts`

### Cache Components 활성화

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

### 캐시 핸들러 설정

```typescript
const nextConfig: NextConfig = {
  cacheHandlers: {
    default: {
      maxMemorySize: 52428800, // 50MB
    },
    // 플랫폼별 원격 핸들러
    remote: CustomRemoteHandler,
  },
}
```

### 캐시 프로필 정의

```typescript
const nextConfig: NextConfig = {
  cacheLife: {
    default: {
      stale: 60,
      revalidate: 3600,
      expire: 86400,
    },
    posts: {
      stale: 300,
      revalidate: 3600,
      expire: 604800,
    },
  },
}
```

---

## Cache Components와 `generateStaticParams`

Cache Components가 활성화되면 `generateStaticParams` 동작이 크게 변경됩니다.

### 매개변수 순열 렌더링

Next.js는 제공된 매개변수의 모든 순열을 렌더링하여 재사용 가능한 서브셸을 생성합니다:

```tsx
// app/products/[category]/[slug]/page.tsx
export async function generateStaticParams() {
  return [
    { category: 'jackets', slug: 'bomber' },
    { category: 'jackets', slug: 'parka' },
    { category: 'shoes', slug: 'sneakers' },
  ]
}
```

**렌더링된 라우트:**

| 라우트                        | 알려진 매개변수    | 셸 유형           |
| ----------------------------- | ------------------ | ----------------- |
| `/products/jackets/bomber`    | category ✓, slug ✓ | 완전한 페이지     |
| `/products/jackets/parka`     | category ✓, slug ✓ | 완전한 페이지     |
| `/products/shoes/sneakers`    | category ✓, slug ✓ | 완전한 페이지     |
| `/products/jackets/[slug]`    | category ✓, slug ✗ | 카테고리 서브셸   |
| `/products/shoes/[slug]`      | category ✓, slug ✗ | 카테고리 서브셸   |
| `/products/[category]/[slug]` | category ✗, slug ✗ | 폴백 셸           |

### 요구사항

1. **최소 하나의 매개변수 세트를 반환해야 함** - 빈 배열은 빌드 오류를 발생시킵니다
2. **매개변수가 정적 안전성을 검증** - Next.js는 제공된 매개변수를 사용하여 동적 API가 접근되지 않는지 확인합니다
3. **서브셸에는 Suspense가 필요** - 알 수 없는 매개변수에 Suspense 없이 접근하면 서브셸이 생성되지 않습니다

```tsx
// ❌ 빌드 오류: 빈 배열 허용 안 됨
export function generateStaticParams() {
  return []
}

// ✅ 올바른: 최소 하나의 매개변수 세트 제공
export async function generateStaticParams() {
  const products = await getProducts({ limit: 100 })
  return products.map((p) => ({ category: p.category, slug: p.slug }))
}
```

### 레이아웃과 서브셸 생성

레이아웃에 Suspense를 추가하여 카테고리 수준의 서브셸을 생성합니다:

```tsx
// app/products/[category]/layout.tsx
export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ category: string }>
}) {
  const { category } = await params

  return (
    <>
      <h2>{category}</h2>
      <Suspense>{children}</Suspense> {/* 서브셸 경계를 생성 */}
    </>
  )
}
```

이제 `/products/jackets/[slug]`는 카테고리 헤더가 포함된 재사용 가능한 셸을 생성하고, 방문 시 제품 상세 정보를 스트리밍합니다.

### 서브셸이 중요한 이유

`generateStaticParams` 없이 `/products/jackets/unknown-product`를 방문하면:

- **이전**: 전체 동적 렌더링, 사용자가 모든 것을 기다림
- **이후**: 캐시된 카테고리 서브셸이 즉시 제공, 제품 상세 정보가 스트리밍됨

---

## Cache Components와 GET Route Handlers

GET Route Handlers는 페이지와 동일한 사전 렌더링 모델을 따릅니다. `cacheComponents: true`일 때, 동적 API가 없는 GET 핸들러는 빌드 시 사전 렌더링됩니다:

```tsx
// app/api/products/route.ts
import { cacheLife, cacheTag } from 'next/cache'

export async function GET() {
  'use cache'
  cacheTag('products')
  cacheLife('hours')

  const products = await db.products.findMany()
  return Response.json(products)
}
```

**주요 동작:**

- `'use cache'`가 있는 GET 핸들러는 빌드 시 사전 렌더링됩니다 (정적 출력에 포함)
- `cookies()`, `headers()` 또는 기타 동적 API를 호출하는 GET 핸들러는 요청 시 렌더링됩니다
- `cacheTag()`과 `cacheLife()`는 페이지 컴포넌트와 동일하게 작동합니다
- GET이 아닌 메서드(POST, PUT, DELETE)는 항상 동적이며 `'use cache'`를 사용할 수 없습니다

```tsx
// 동적 GET 핸들러 (요청 헤더 읽기)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const data = await fetchProtectedData(authHeader)
  return Response.json(data)
}

// 캐시가 있는 정적 GET 핸들러 (동적 API 없음)
export async function GET() {
  'use cache'
  cacheLife('days')
  const sitemap = await generateSitemapData()
  return Response.json(sitemap)
}
```

---

## 사용 중단된 세그먼트 설정

`cacheComponents: true`일 때 다음 export는 **사용 중단**됩니다:

### `export const revalidate` (사용 중단)

**이전:**

```tsx
// app/products/page.tsx
export const revalidate = 3600 // 1시간

export default async function ProductsPage() {
  const products = await db.products.findMany()
  return <ProductList products={products} />
}
```

**이 접근 방식의 문제점:**

- 재검증 시간이 데이터가 아닌 세그먼트 수준에 있었음
- 가져온 데이터에 따라 재검증을 달리할 수 없었음
- 클라이언트 측 캐싱(`stale`)이나 만료를 제어할 수 없었음

**이후 (Cache Components):**

```tsx
// app/products/page.tsx
import { cacheLife } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheLife('hours') // 데이터와 함께 배치됨

  return await db.products.findMany()
}

export default async function ProductsPage() {
  const products = await getProducts()
  return <ProductList products={products} />
}
```

**장점:**

- 캐시 수명이 데이터 가져오기와 함께 배치됨
- 세밀한 제어: `stale`, `revalidate`, `expire`
- 다른 함수마다 다른 수명 설정 가능
- 데이터에 따라 조건부로 캐시 수명 설정 가능

### `export const dynamic` (사용 중단)

**이전:**

```tsx
// app/products/page.tsx
export const dynamic = 'force-static'

export default async function ProductsPage() {
  // Headers가 빈 값을 반환하여 컴포넌트가 조용히 깨짐
  const headers = await getHeaders()
  return <ProductList />
}
```

**문제점:**

- 전부 아니면 전무 접근 방식
- `force-static`이 동적 API를 조용히 깨뜨림 (cookies, headers가 빈 값 반환)
- `force-dynamic`이 모든 정적 최적화를 방지
- 동적 컴포넌트가 빈 데이터를 받을 때 숨겨진 버그

**이후 (Cache Components):**

```tsx
// app/products/page.tsx
export default async function ProductsPage() {
  return (
    <>
      <CachedProductList /> {/* 'use cache'를 통한 정적 */}
      <Suspense fallback={<Skeleton />}>
        <DynamicUserRecommendations /> {/* Suspense를 통한 동적 */}
      </Suspense>
    </>
  )
}
```

**장점:**

- 조용한 API 실패 없음
- 컴포넌트 수준의 세밀한 정적/동적 제어
- 빌드 오류가 올바른 패턴으로 안내
- 페이지가 정적이면서 동시에 동적일 수 있음

### 마이그레이션 가이드

| 이전 패턴                                | 새 패턴                                                        |
| ---------------------------------------- | -------------------------------------------------------------- |
| `export const revalidate = 60`           | `'use cache'` 내부에서 `cacheLife({ revalidate: 60 })`         |
| `export const revalidate = 0`            | 캐시 제거 또는 `cacheLife('seconds')` 사용                     |
| `export const revalidate = false`        | 장기 캐싱을 위한 `cacheLife('max')`                            |
| `export const dynamic = 'force-static'`  | 데이터 가져오기에 `'use cache'` 사용                           |
| `export const dynamic = 'force-dynamic'` | 캐시 없이 `<Suspense>`로 래핑                                  |
| `export const dynamic = 'auto'`          | 기본 동작 - 불필요                                             |
| `export const dynamic = 'error'`         | Cache Components의 기본값 (빌드 오류가 안내)                   |
| `export const fetchCache`                | 불필요 — `'use cache'`가 fetch 수준 설정을 대체                |
| `export const runtime = 'edge'`          | Cache Components와 지원되지 않음                               |

---

## 마이그레이션 시나리오

### 시나리오 1: `revalidate` Export가 있는 페이지

**이전:**

```tsx
// app/products/page.tsx
export const revalidate = 3600

export default async function ProductsPage() {
  const products = await db.products.findMany()
  return <ProductGrid products={products} />
}
```

**이후:**

```tsx
// app/products/page.tsx
import { cacheLife } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheLife('hours') // revalidate = 3600과 대략 동일

  return db.products.findMany()
}

export default async function ProductsPage() {
  const products = await getProducts()
  return <ProductGrid products={products} />
}
```

### 시나리오 2: `dynamic = 'force-dynamic'`이 있는 페이지

**이전:**

```tsx
// app/dashboard/page.tsx
export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const user = await getCurrentUser()
  const stats = await getStats()
  const notifications = await getNotifications(user.id)

  return (
    <div>
      <UserHeader user={user} />
      <Stats data={stats} />
      <Notifications items={notifications} />
    </div>
  )
}
```

**이후:**

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react'

// 모든 데이터가 동적 - 사용자별 콘텐츠를 가져옴
async function DashboardContent() {
  const user = await getCurrentUser()
  const stats = await getStats()
  const notifications = await getNotifications(user.id)

  return (
    <>
      <UserHeader user={user} />
      <Stats data={stats} />
      <Notifications items={notifications} />
    </>
  )
}

export default function Dashboard() {
  return (
    <div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent /> {/* 동적으로 스트리밍 */}
      </Suspense>
    </div>
  )
}
```

**핵심 차이점:** `export const dynamic`이 필요 없음. 컴포넌트는 기본적으로 동적입니다 — 스트리밍을 활성화하려면 Suspense로 래핑하기만 하면 됩니다.

### 시나리오 3: `revalidate` + 온디맨드 재검증을 사용한 ISR

**이전:**

```tsx
// app/blog/[slug]/page.tsx
export const revalidate = 3600

export async function generateStaticParams() {
  const posts = await getAllPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  return <Article post={post} />
}

// api/revalidate/route.ts
export async function POST(request: Request) {
  const { slug } = await request.json()
  revalidatePath(`/blog/${slug}`)
  return Response.json({ revalidated: true })
}
```

**이후:**

```tsx
// lib/posts.ts
import { cacheTag, cacheLife } from 'next/cache'

export async function getPost(slug: string) {
  'use cache'
  cacheTag('posts', `post-${slug}`)
  cacheLife('hours')

  return db.posts.findUnique({ where: { slug } })
}

// app/blog/[slug]/page.tsx
export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)
  return <Article post={post} />
}

// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  const { slug } = await request.json()
  revalidatePath(`/blog/${slug}`)
  return Response.json({ revalidated: true })
}
```

**주요 개선 사항:**

- 캐시 설정이 `'use cache'`를 통해 데이터 가져오기와 함께 배치됨
- 명시적 캐시 태그로 대상 지정 무효화 가능
- 외부 웹훅 통합을 위한 Route Handler 패턴 유지

### 시나리오 4: `fetchCache` Export가 있는 페이지

**이전:**

```tsx
// app/products/page.tsx
export const fetchCache = 'force-cache' // 모든 fetch가 캐시됨

export default async function ProductsPage() {
  const products = await fetch('/api/products').then((r) => r.json())
  const categories = await fetch('/api/categories').then((r) => r.json())
  return <ProductGrid products={products} categories={categories} />
}
```

**이후:**

```tsx
// app/products/page.tsx
import { cacheLife, cacheTag } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheTag('products')
  cacheLife('hours')

  return fetch('/api/products').then((r) => r.json())
}

async function getCategories() {
  'use cache'
  cacheTag('categories')
  cacheLife('days')

  return fetch('/api/categories').then((r) => r.json())
}

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
  ])
  return <ProductGrid products={products} categories={categories} />
}
```

**주요 개선 사항:** 각 데이터 소스가 독립적인 캐시 수명과 태그를 가지며, 모든 fetch에 동일한 정책을 적용하던 일괄적인 `fetchCache`를 대체합니다.

---

## 런타임 동작

### Draft Mode

[Draft Mode](https://nextjs.org/docs/app/building-your-application/configuring/draft-mode)가 활성화되면 캐시 항목이 **저장되지 않습니다**:

```tsx
import { draftMode } from 'next/headers'

export default async function PreviewPage() {
  const { isEnabled } = await draftMode()

  // isEnabled가 true일 때:
  // - 'use cache' 함수는 여전히 실행됨
  // - 하지만 결과가 캐시에 저장되지 않음
  // - 미리보기 콘텐츠가 항상 최신 상태를 보장
}
```

이는 오래된 미리보기 콘텐츠가 캐시되어 프로덕션 사용자에게 제공되는 것을 방지합니다.

### 캐시 바이패스 조건

다음 경우에 캐시가 바이패스됩니다 (읽히지 않음):

| 조건                   | 설명                                               |
| ---------------------- | -------------------------------------------------- |
| Draft Mode 활성화      | `draftMode().isEnabled === true`                   |
| 온디맨드 재검증        | `revalidateTag()` 또는 `revalidatePath()` 호출됨   |
| 개발 모드 + no-cache   | 요청에 `Cache-Control: no-cache` 헤더 포함         |

### Metadata와 Viewport

`generateMetadata()`와 `generateViewport()`는 페이지 캐시와 **별도로** 추적됩니다. 페이지가 `'use cache'`를 사용하더라도 이러한 함수는 자체 캐싱 동작을 가집니다:

```tsx
// app/products/[id]/page.tsx

// Metadata는 페이지와 독립적으로 캐시됨
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await getProduct(id) // 자체 'use cache'를 사용할 수 있음
  return { title: product.name, description: product.summary }
}

// Viewport도 동일한 독립적 추적을 따름
export async function generateViewport() {
  return { themeColor: '#000000' }
}

// 페이지 캐시는 metadata 캐시와 별도
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProductDetails productId={id} />
}
```

**시사점**: 페이지의 캐시 태그를 무효화해도 메타데이터는 자동으로 무효화되지 않습니다. 메타데이터가 캐시된 데이터에 의존하는 경우, 관련 태그가 둘 다 포괄하는지 확인하세요.

### 사전 렌더링 타임아웃

정적 사전 렌더링(빌드 시) 중 캐시 함수에는 **50초 타임아웃**이 있습니다:

- 캐시 함수가 50초 이내에 완료되지 않으면 동적 홀이 됩니다
- 요청 시에는 **타임아웃이 없습니다** — 백그라운드 재검증은 필요한 만큼 시간이 걸릴 수 있습니다
- 타임아웃 오류는 코드 `'USE_CACHE_TIMEOUT'`과 함께 `UseCacheTimeoutError`를 던집니다

```tsx
// 빌드 중 50초 이상 걸리면 동적이 됨
async function SlowData() {
  'use cache'
  return await verySlowApiCall() // 사전 렌더링 중 타임아웃될 수 있음
}
```

### 개발 모드: HMR 캐시 무효화

개발 시 캐시 키에 **HMR 새로고침 해시**가 포함됩니다:

- 캐시 함수가 포함된 파일을 편집하면 캐시가 자동으로 무효화됩니다
- 개발 중 수동 캐시 삭제가 필요 없습니다
- 이 해시는 프로덕션 빌드에 포함되지 않습니다

### 캐시 전파 (중첩 캐시)

캐시 함수가 다른 캐시 함수를 호출하면 캐시 메타데이터가 **상위로 전파**됩니다:

```tsx
async function Inner() {
  'use cache'
  cacheLife('seconds') // expire=60
  cacheTag('inner')
  return await fetchData()
}

async function Outer() {
  'use cache'
  cacheLife('hours') // expire=86400
  cacheTag('outer')

  const data = await Inner() // 내부 캐시 함수 호출
  return process(data)
}

// Outer의 실효 캐시:
// - expire = min(86400, 60) = 60 (Inner의 더 짧은 만료를 상속)
// - tags = ['outer', 'inner'] (태그가 병합됨)
```

이는 부모 캐시가 의존성보다 오래 유지되지 않도록 보장합니다.

### 런타임 환경 고려사항

캐시 동작은 배포 대상에 따라 달라집니다:

| 환경           | 캐시 영속성                                 | 설정                                 |
| -------------- | ------------------------------------------- | ------------------------------------ |
| **Serverless** | 호출 간 캐시가 유지되지 않음                | 공유 상태를 위해 `'use cache: remote'` 사용 |
| **셀프 호스팅** | 인메모리 캐시가 요청 간 유지됨             | `cacheMaxMemorySize` 설정            |

**Serverless (Vercel, AWS Lambda 등)**: 각 함수 호출은 콜드 캐시로 시작합니다. 기본 핸들러의 인메모리 캐시는 호출 간에 손실됩니다. 영속되어야 하는 데이터에는 `'use cache: remote'` 또는 플랫폼별 원격 캐시 핸들러를 사용하세요.

**셀프 호스팅 (Node.js 서버)**: 기본 캐시 핸들러는 프로세스 수명 동안 요청 간에 유지되는 인메모리 저장소를 사용합니다. 최대 메모리 크기를 설정합니다:

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  cacheHandlers: {
    default: {
      maxMemorySize: 52428800, // 50MB (기본값)
    },
  },
}
```

`maxMemorySize: 0`을 설정하면 인메모리 캐싱이 완전히 비활성화되며, 외부 캐시 핸들러만 사용할 때 유용할 수 있습니다.

---

## 타입 정의

### CacheLife

```typescript
type CacheLife = {
  stale?: number // 기본값: 300 (staleTimes.static에서)
  revalidate?: number // 기본값: 프로필에 따라 다름
  expire?: number // 기본값: 프로필에 따라 다름
}
```

### CacheLifeProfile

```typescript
type CacheLifeProfile =
  | 'default'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'max'
  | string // 커스텀 프로필
```
