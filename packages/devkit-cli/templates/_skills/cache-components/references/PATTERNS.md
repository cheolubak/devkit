# Cache Components 패턴 & 레시피

Cache Components를 효과적으로 구현하기 위한 일반적인 패턴들입니다.

## 패턴 1: 정적 + 캐시 + 동적 페이지

Partial Prerendering의 기본 패턴입니다:

```tsx
import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

// 정적 - 특별한 처리가 필요 없음
function Header() {
  return <header>My Blog</header>
}

// 캐시됨 - 정적 셸에 포함
async function FeaturedPosts() {
  'use cache'
  cacheLife('hours')

  const posts = await db.posts.findMany({
    where: { featured: true },
    take: 5,
  })

  return (
    <section>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </section>
  )
}

// 동적 - 요청 시 스트리밍
async function PersonalizedFeed() {
  const session = await getSession()
  const feed = await db.posts.findMany({
    where: { authorId: { in: session.following } },
  })

  return <FeedList posts={feed} />
}

// 페이지 구성
export default async function HomePage() {
  return (
    <>
      <Header />
      <FeaturedPosts />
      <Suspense fallback={<FeedSkeleton />}>
        <PersonalizedFeed />
      </Suspense>
    </>
  )
}
```

---

## 패턴 2: Server Actions를 사용한 읽기-후-쓰기

사용자가 자신의 변경 사항을 즉시 볼 수 있도록 보장합니다:

```tsx
// components/posts.tsx
import { cacheTag, cacheLife } from 'next/cache'

async function PostsList() {
  'use cache'
  cacheTag('posts')
  cacheLife('hours')

  const posts = await db.posts.findMany({ orderBy: { createdAt: 'desc' } })
  return (
    <ul>
      {posts.map((p) => (
        <PostItem key={p.id} post={p} />
      ))}
    </ul>
  )
}

// actions/posts.ts
'use server'
import { updateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({
    data: {
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    },
  })

  // 즉시 무효화 - 사용자가 새 게시물을 바로 확인
  updateTag('posts')

  return { success: true, postId: post.id }
}

// components/create-post-form.tsx
'use client'
import { useTransition } from 'react'
import { createPost } from '@/actions/posts'

export function CreatePostForm() {
  const [isPending, startTransition] = useTransition()

  return (
    <form
      action={(formData) => {
        startTransition(() => createPost(formData))
      }}
    >
      <input name="title" required />
      <textarea name="content" required />
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}
```

---

## 패턴 3: 세밀한 캐시 무효화

정밀한 무효화를 위해 여러 수준에서 캐시에 태그를 부여합니다:

```tsx
// 다중 태그로 캐시됨
async function BlogPost({ postId }: { postId: string }) {
  'use cache'
  cacheTag('posts', `post-${postId}`)
  cacheLife('days')

  const post = await db.posts.findUnique({
    where: { id: postId },
    include: { author: true, comments: true },
  })

  return <Article post={post} />
}

async function AuthorPosts({ authorId }: { authorId: string }) {
  'use cache'
  cacheTag('posts', `author-${authorId}`)
  cacheLife('hours')

  const posts = await db.posts.findMany({
    where: { authorId },
  })

  return <PostGrid posts={posts} />
}

// 대상 지정 무효화가 있는 Server Actions
'use server'
import { updateTag } from 'next/cache'

export async function updatePost(postId: string, data: FormData) {
  const post = await db.posts.update({
    where: { id: postId },
    data: { title: data.get('title'), content: data.get('content') },
  })

  // 특정 게시물만 무효화
  updateTag(`post-${postId}`)
}

export async function deleteAuthorPosts(authorId: string) {
  await db.posts.deleteMany({ where: { authorId } })

  // 저자의 모든 게시물 무효화
  updateTag(`author-${authorId}`)
}

export async function clearAllPosts() {
  await db.posts.deleteMany()

  // 최후의 수단 - 'posts' 태그가 있는 모든 것을 무효화
  updateTag('posts')
}
```

---

## 패턴 4: 캐시된 데이터 가져오기 함수

재사용 가능한 캐시 데이터 가져오기 함수를 만듭니다:

```tsx
// lib/data.ts
import { cacheTag, cacheLife } from 'next/cache'

export async function getUser(userId: string) {
  'use cache'
  cacheTag('users', `user-${userId}`)
  cacheLife('hours')

  return db.users.findUnique({ where: { id: userId } })
}

export async function getPostsByCategory(category: string) {
  'use cache'
  cacheTag('posts', `category-${category}`)
  cacheLife('minutes')

  return db.posts.findMany({
    where: { category },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getPopularProducts() {
  'use cache'
  cacheTag('products', 'popular')
  cacheLife('hours')

  return db.products.findMany({
    orderBy: { salesCount: 'desc' },
    take: 10,
  })
}

// 컴포넌트에서 사용
async function Sidebar() {
  const popular = await getPopularProducts()
  return <ProductList products={popular} />
}
```

---

## 패턴 5: 백그라운드 업데이트를 위한 Stale-While-Revalidate

중요하지 않은 업데이트에 `revalidateTag`를 사용합니다:

```tsx
// 백그라운드 분석이나 사용자에게 보이지 않는 업데이트용
'use server'
import { revalidateTag } from 'next/cache'

export async function trackView(postId: string) {
  await db.posts.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
  })

  // 백그라운드 재검증 - 업데이트하는 동안 이전 조회수가 표시됨
  revalidateTag(`post-${postId}`, 'max')
}

// 사용자에게 보이는 변이에는 updateTag를 대신 사용
export async function likePost(postId: string) {
  await db.likes.create({ data: { postId, userId: getCurrentUserId() } })

  // 즉시 - 사용자가 자신의 좋아요를 바로 확인
  updateTag(`post-${postId}`)
}
```

---

## 패턴 6: 콘텐츠 기반 조건부 캐싱

콘텐츠 특성에 따라 캐시합니다:

```tsx
async function ContentBlock({ id }: { id: string }) {
  'use cache'

  const content = await db.content.findUnique({ where: { id } })

  // 콘텐츠 유형에 따라 캐시 수명 조정
  if (content.type === 'static') {
    cacheLife('max')
    cacheTag('static-content')
  } else if (content.type === 'news') {
    cacheLife('minutes')
    cacheTag('news', `news-${id}`)
  } else {
    cacheLife('default')
    cacheTag('content', `content-${id}`)
  }

  return <ContentRenderer content={content} />
}
```

---

## 패턴 7: 중첩 캐시 컴포넌트

세밀한 캐싱을 위해 캐시 컴포넌트를 조합합니다:

```tsx
// 각 컴포넌트가 독립적으로 캐시
async function Header() {
  'use cache'
  cacheTag('layout', 'header')
  cacheLife('days')

  const nav = await db.navigation.findFirst()
  return <Nav items={nav.items} />
}

async function Footer() {
  'use cache'
  cacheTag('layout', 'footer')
  cacheLife('days')

  const footer = await db.footer.findFirst()
  return <FooterContent data={footer} />
}

async function Sidebar({ category }: { category: string }) {
  'use cache'
  cacheTag('sidebar', `category-${category}`)
  cacheLife('hours')

  const related = await db.posts.findMany({
    where: { category },
    take: 5,
  })
  return <RelatedPosts posts={related} />
}

// 페이지가 캐시된 컴포넌트들을 조합
export default async function BlogLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ category: string }>
}) {
  const { category } = await params // Next.js 15부터 params는 Promise다
  return (
    <>
      <Header />
      <main>
        {children}
        <Sidebar category={category} />
      </main>
      <Footer />
    </>
  )
}
```

---

## 패턴 8: 전자상거래 상품 페이지

전자상거래의 완전한 예시입니다:

```tsx
// app/products/[id]/page.tsx
import { Suspense } from 'react'
import { cacheTag, cacheLife } from 'next/cache'

// 캐시된 상품 상세 (변경 빈도 낮음)
async function ProductDetails({ productId }: { productId: string }) {
  'use cache'
  cacheTag('products', `product-${productId}`)
  cacheLife('hours')

  const product = await db.products.findUnique({
    where: { id: productId },
    include: { images: true, specifications: true },
  })

  return (
    <div>
      <ProductGallery images={product.images} />
      <ProductInfo product={product} />
      <Specifications specs={product.specifications} />
    </div>
  )
}

// 캐시된 리뷰 (중간 변경 빈도)
async function ProductReviews({ productId }: { productId: string }) {
  'use cache'
  cacheTag(`product-${productId}-reviews`)
  cacheLife('minutes')

  const reviews = await db.reviews.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return <ReviewsList reviews={reviews} />
}

// 동적 재고 (실시간)
async function InventoryStatus({ productId }: { productId: string }) {
  // 캐시 없음 - 항상 최신
  const inventory = await db.inventory.findUnique({
    where: { productId },
  })

  return (
    <div>
      {inventory.quantity > 0 ? (
        <span className="text-green-600">In Stock ({inventory.quantity})</span>
      ) : (
        <span className="text-red-600">Out of Stock</span>
      )}
    </div>
  )
}

// 페이지 구성
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <>
      <ProductDetails productId={id} />

      <Suspense fallback={<InventorySkeleton />}>
        <InventoryStatus productId={id} />
      </Suspense>

      {/* 캐시 컴포넌트 주변의 Suspense:
          - 빌드 시 (PPR): 캐시된 콘텐츠가 정적 셸에 사전 렌더링되므로
            초기 페이지 로드 시 fallback이 표시되지 않음.
          - 런타임 (캐시 미스/만료): 캐시가 만료되거나 콜드 스타트 시
            Suspense가 새 데이터가 로드되는 동안 fallback을 표시.
          - 오래 유지되는 캐시('minutes', 'hours', 'days')의 경우 Suspense는 선택사항이지만
            드문 캐시 미스 시 UX를 개선함. */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <ProductReviews productId={id} />
      </Suspense>
    </>
  )
}
```

---

## 패턴 9: 멀티 테넌트 SaaS 애플리케이션

테넌트별 캐싱을 처리합니다:

```tsx
// lib/tenant.ts
export async function getTenantId() {
  const host = (await headers()).get('host')
  return host?.split('.')[0] // 서브도메인을 테넌트 ID로 사용
}

// 테넌트 범위 캐시 데이터
async function TenantDashboard({ tenantId }: { tenantId: string }) {
  'use cache'
  cacheTag(`tenant-${tenantId}`, 'dashboards')
  cacheLife('minutes')

  const data = await db.dashboards.findFirst({
    where: { tenantId },
  })

  return <Dashboard data={data} />
}

// 테넌트 컨텍스트가 있는 페이지
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardLoader />
    </Suspense>
  )
}

async function DashboardLoader() {
  const tenantId = await getTenantId()
  return <TenantDashboard tenantId={tenantId} />
}

// 테넌트별 무효화
'use server'
import { updateTag } from 'next/cache'

export async function updateTenantSettings(data: FormData) {
  const tenantId = await getTenantId()

  await db.settings.update({
    where: { tenantId },
    data: {
      /* ... */
    },
  })

  // 이 테넌트의 캐시만 무효화
  updateTag(`tenant-${tenantId}`)
}
```

---

## 패턴 10: generateStaticParams를 활용한 서브셸 구성

매개변수 순열을 활용하여 재사용 가능한 서브셸을 생성합니다:

```tsx
// app/products/[category]/[slug]/page.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

// 상품 상세 - 두 매개변수를 모두 사용
async function ProductDetails({
  category,
  slug,
}: {
  category: string
  slug: string
}) {
  'use cache'
  cacheTag('products', `product-${slug}`)
  cacheLife('hours')

  const product = await db.products.findUnique({
    where: { category, slug },
  })

  return <ProductCard product={product} />
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params

  return <ProductDetails category={category} slug={slug} />
}

// 서브셸 생성을 활성화하기 위한 매개변수 제공
export async function generateStaticParams() {
  const products = await db.products.findMany({
    select: { category: true, slug: true },
    take: 100,
  })
  return products.map(({ category, slug }) => ({ category, slug }))
}
```

```tsx
// app/products/[category]/layout.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

// 카테고리 헤더 - category 매개변수만 사용
async function CategoryHeader({ category }: { category: string }) {
  'use cache'
  cacheTag('categories', `category-${category}`)
  cacheLife('days')

  const cat = await db.categories.findUnique({ where: { slug: category } })
  return (
    <header>
      <h1>{cat.name}</h1>
      <p>{cat.description}</p>
    </header>
  )
}

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
      <CategoryHeader category={category} />
      {/* Suspense가 서브셸 생성을 활성화 */}
      <Suspense fallback={<ProductSkeleton />}>{children}</Suspense>
    </>
  )
}
```

**결과**: 사용자가 `/products/jackets/unknown-jacket`으로 이동할 때:

1. 카테고리 서브셸(`/products/jackets/[slug]`)이 즉시 제공됨
2. 상품 상세가 로드되면서 스트리밍됨
3. 향후 어떤 재킷 상품을 방문하더라도 카테고리 셸을 재사용

---

## 패턴 11: 깊은 라우트를 위한 계층적 매개변수

깊이 중첩된 라우트의 경우, 서브셸 재사용을 극대화하도록 레이아웃을 구성합니다:

```tsx
// 라우트: /store/[region]/[category]/[productId]

// app/store/[region]/layout.tsx
export default async function RegionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ region: string }>
}) {
  const { region } = await params

  return (
    <>
      <RegionHeader region={region} /> {/* 캐시됨 */}
      <RegionPromos region={region} /> {/* 캐시됨 */}
      <Suspense>{children}</Suspense> {/* 서브셸 경계 */}
    </>
  )
}

// app/store/[region]/[category]/layout.tsx
export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ region: string; category: string }>
}) {
  const { region, category } = await params

  return (
    <>
      <CategoryNav region={region} category={category} /> {/* 캐시됨 */}
      <Suspense>{children}</Suspense> {/* 서브셸 경계 */}
    </>
  )
}

// app/store/[region]/[category]/[productId]/page.tsx
export default async function ProductPage({
  params,
}: {
  params: Promise<{ region: string; category: string; productId: string }>
}) {
  const { region, category, productId } = await params

  return <ProductDetails region={region} productId={productId} />
}

export async function generateStaticParams() {
  // 인기 상품 반환 - 모든 고유한 region/category 조합에 대해 서브셸이 생성됨
  return [
    { region: 'us', category: 'electronics', productId: 'iphone-16' },
    { region: 'us', category: 'electronics', productId: 'macbook-pro' },
    { region: 'us', category: 'clothing', productId: 'hoodie-xl' },
    { region: 'eu', category: 'electronics', productId: 'iphone-16' },
  ]
}
```

**생성된 서브셸:**

- `/store/us/[category]/[productId]` - US 지역 셸
- `/store/eu/[category]/[productId]` - EU 지역 셸
- `/store/us/electronics/[productId]` - US Electronics 셸
- `/store/us/clothing/[productId]` - US Clothing 셸
- `/store/eu/electronics/[productId]` - EU Electronics 셸

---

## 캐시 컴포넌트에 Suspense를 사용해야 하는 경우

캐시 컴포넌트에서 Suspense가 필수인 경우와 선택적인 경우를 이해합니다:

### 동적 컴포넌트 (캐시 없음) → Suspense 필수

```tsx
// 동적 콘텐츠는 스트리밍을 위해 반드시 Suspense가 필요
async function PersonalizedFeed() {
  const session = await getSession() // 동적 - 쿠키를 읽음
  const feed = await fetchFeed(session.userId)
  return <Feed posts={feed} />
}

export default function Page() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <PersonalizedFeed />
    </Suspense>
  )
}
```

### 캐시 컴포넌트 → Suspense 선택적 (하지만 권장)

```tsx
// 캐시된 콘텐츠: Suspense는 선택적이지만 UX를 개선
async function ProductReviews({ productId }: { productId: string }) {
  'use cache'
  cacheLife('minutes')
  const reviews = await fetchReviews(productId)
  return <ReviewsList reviews={reviews} />
}

// ✅ Suspense 사용 - 캐시 미스를 우아하게 처리
<Suspense fallback={<ReviewsSkeleton />}>
  <ProductReviews productId={id} />
</Suspense>

// ✅ Suspense 미사용 - 오래 유지되는 캐시에도 유효
<ProductReviews productId={id} />
```

### 캐시 컴포넌트가 항상 Suspense를 필요로 하지 않는 이유

| 시나리오 | 발생하는 일 | Suspense 필요? |
|----------|-------------|----------------|
| **빌드 시 (PPR 활성화)** | 콘텐츠가 정적 셸에 사전 렌더링됨 | 아니오 - fallback이 표시되지 않음 |
| **런타임 - 캐시 히트** | 캐시 결과가 즉시 반환됨 | 아니오 - 중단 없음 |
| **런타임 - 캐시 미스** | 비동기 함수가 실행되고 컴포넌트가 중단됨 | 예 - 더 나은 UX를 위해 |

### 캐시 수명별 권장사항

| 캐시 수명 | Suspense 권장 | 이유 |
|-----------|--------------|------|
| `'seconds'` | **권장** | 빈번한 캐시 미스 |
| `'minutes'` | 선택적 | ~5분 만료, 간헐적 미스 |
| `'hours'` / `'days'` | 선택적 | 드문 캐시 미스 |
| `'max'` | 불필요 | 본질적으로 정적 |

### 트레이드오프

**Suspense 없이**: 캐시 미스 시, 페이지가 하위 콘텐츠를 렌더링하기 전에 데이터를 기다립니다. 오래 유지되는 캐시의 경우 이는 드물고 짧습니다.

**Suspense 사용 시**: 캐시 미스 시, 사용자가 데이터 로드 중에 즉시 스켈레톤을 봅니다. 체감 성능이 더 좋으며, 코드가 약간 더 많아집니다.

**경험 법칙**: 확실하지 않다면 Suspense를 추가하세요. 해가 되지 않으며 엣지 케이스를 우아하게 처리합니다.

---

## 피해야 할 안티패턴

### ❌ 매개변수 없이 사용자별 데이터 캐싱

```tsx
// 나쁨: 모든 사용자에게 동일한 캐시
async function UserProfile() {
  'use cache'
  const user = await getCurrentUser() // 사용자마다 다름!
  return <Profile user={user} />
}

// 좋음: 사용자 ID를 매개변수로 (캐시 키가 됨)
async function UserProfile({ userId }: { userId: string }) {
  'use cache'
  cacheTag(`user-${userId}`)
  const user = await db.users.findUnique({ where: { id: userId } })
  return <Profile user={user} />
}
```

### ❌ 변동이 잦은 데이터의 과도한 캐싱

```tsx
// 나쁨: 실시간 데이터를 캐싱
async function StockPrice({ symbol }: { symbol: string }) {
  'use cache'
  cacheLife('hours') // 오래된 가격!
  return await fetchStockPrice(symbol)
}

// 좋음: 캐시하지 않거나 매우 짧은 캐시 사용
async function StockPrice({ symbol }: { symbol: string }) {
  'use cache'
  cacheLife('seconds') // 최대 1초
  return await fetchStockPrice(symbol)
}

// 더 좋음: 진정한 실시간 데이터에는 캐시 없음
async function StockPrice({ symbol }: { symbol: string }) {
  return await fetchStockPrice(symbol)
}
```

### ❌ 동적 콘텐츠에 Suspense를 잊어버림

```tsx
// 나쁨: 동적 콘텐츠에 fallback 없음 - 스트리밍이 깨짐
export default async function Page() {
  return (
    <>
      <CachedHeader />
      <DynamicContent /> {/* 동적 - Suspense가 필요 */}
    </>
  )
}

// 좋음: 동적 콘텐츠에 적절한 Suspense 경계
export default async function Page() {
  return (
    <>
      <CachedHeader />
      <Suspense fallback={<ContentSkeleton />}>
        <DynamicContent />
      </Suspense>
    </>
  )
}

// 이것도 좋음: Suspense 없는 캐시 콘텐츠 (오래 유지되는 캐시에 선택적)
export default async function Page() {
  return (
    <>
      <CachedHeader />       {/* 'use cache' - Suspense 불필요 */}
      <CachedSidebar />      {/* 'use cache' - Suspense 불필요 */}
      <Suspense fallback={<ContentSkeleton />}>
        <DynamicContent />   {/* 동적 - Suspense 필수 */}
      </Suspense>
    </>
  )
}
```

---

## 패턴 12: Children을 사용한 인터리빙 (패스스루)

`children` (ReactNode)과 Server Actions 같은 직렬화 불가능한 값을 캐시 컴포넌트를 통해 전달합니다. 이러한 값은 출력에 변경 없이 전달됩니다 — 캐시 키의 일부가 되지 않으며 캐시 범위 내에서 읽거나 호출해서는 안 됩니다.

### 캐시된 래퍼가 Children을 패스스루

```tsx
import { cacheLife, cacheTag } from 'next/cache'

// 캐시된 레이아웃 래퍼 - children은 캐시에 영향을 주지 않고 패스스루
async function CachedPageShell({
  children,
  category,
}: {
  children: React.ReactNode
  category: string
}) {
  'use cache'
  cacheTag(`shell-${category}`)
  cacheLife('days')

  const nav = await db.navigation.findFirst({ where: { category } })
  const promo = await db.promos.findFirst({ where: { category, active: true } })

  return (
    <div>
      <Nav items={nav.items} />
      <PromoBanner promo={promo} />
      {children} {/* 패스스루: 캐시가 읽지 않고 그냥 전달 */}
    </div>
  )
}

// 사용법: 캐시된 셸이 동적 콘텐츠를 래핑
export default function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = React.use(params)

  return (
    <CachedPageShell category={category}>
      <Suspense fallback={<ProductsSkeleton />}>
        <DynamicProducts category={category} />
      </Suspense>
    </CachedPageShell>
  )
}
```

### Client Component로의 Server Action 패스스루

```tsx
// 서버 파일에 정의된 Server Action
'use server'
import { updateTag } from 'next/cache'

export async function addToCart(productId: string) {
  await db.cart.add({ productId })
  updateTag('cart')
}

// 캐시 컴포넌트가 Server Action을 Client Component로 전달
async function CachedProductCard({ productId }: { productId: string }) {
  'use cache'
  cacheTag(`product-${productId}`)
  cacheLife('hours')

  const product = await db.products.findUnique({ where: { id: productId } })

  // Server Action이 prop으로 전달됨 - 캐시 범위에서 호출되지 않음
  return <AddToCartButton product={product} onAdd={addToCart} />
}

// Client Component가 action을 받음
'use client'
function AddToCartButton({
  product,
  onAdd,
}: {
  product: Product
  onAdd: (id: string) => Promise<void>
}) {
  return (
    <button onClick={() => onAdd(product.id)}>
      Add {product.name} to Cart
    </button>
  )
}
```

### 패스스루 규칙

1. 캐시 범위 내에서 `children`을 **읽지 마세요** — JSX 출력에서만 렌더링하세요
2. 캐시 범위 내에서 Server Actions를 **호출하지 마세요** — props로만 전달하세요
3. 패스스루 값은 캐시 키에 영향을 주지 않습니다 — 직렬화 가능한 인자만 영향을 줍니다
4. 이 패턴은 캐시된 셸과 동적 또는 인터랙티브 콘텐츠를 인터리빙할 수 있게 합니다
