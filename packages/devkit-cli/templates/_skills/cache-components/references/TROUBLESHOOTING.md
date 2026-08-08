# Cache Components 문제 해결

Cache Components의 일반적인 문제, 디버깅 기법 및 해결 방법입니다.

## 빌드 시 피드백 철학

Cache Components는 개발 중 **조기 피드백**을 제공합니다. 이전에는 오류가 프로덕션에서만 나타날 수 있었지만, Cache Components는 **최적의 패턴으로 안내하는** 빌드 오류를 생성합니다.

핵심 원칙: **빌드가 되면 올바른 것입니다.** 빌드 프로세스는 다음을 검증합니다:

- 동적 데이터가 Suspense 경계 외부에서 접근되지 않음
- 캐시 데이터가 요청별 API에 의존하지 않음
- `generateStaticParams`가 렌더링을 테스트하기 위한 유효한 매개변수를 제공함

---

## 빠른 디버깅 체크리스트

캐시 문제를 디버깅할 때 이 체크리스트를 복사하세요:

### 캐시가 작동하지 않음

- [ ] `next.config`에 `cacheComponents: true`가 있는가?
- [ ] 함수가 `async`인가?
- [ ] `'use cache'`가 함수 본문의 첫 번째 문장인가?
- [ ] 모든 인자가 직렬화 가능한가 (함수, 클래스 인스턴스 없음)?
- [ ] 캐시 내부에서 `cookies()`/`headers()`에 접근하지 않는가?

### 변이 후 오래된 데이터

- [ ] 변이 후 `updateTag()` 또는 `revalidateTag()`를 호출했는가?
- [ ] 무효화의 태그가 `cacheTag()`의 태그와 일치하는가?
- [ ] 즉시 업데이트를 위해 `revalidateTag()`가 아닌 `updateTag()`를 사용하고 있는가?

### 빌드 오류

- [ ] 동적 데이터가 `<Suspense>`로 래핑되어 있는가?
- [ ] `generateStaticParams`가 최소 하나의 매개변수를 반환하는가?
- [ ] `'use cache'`와 `cookies()`/`headers()`를 혼합하지 않았는가?

### 성능 문제

- [ ] 캐시 세분화가 적절한가? (너무 거칠거나 세밀하지 않은지)
- [ ] `cacheLife`가 데이터 변동성에 맞게 적절히 설정되어 있는가?
- [ ] 대상 지정 무효화를 위해 계층적 태그를 사용하고 있는가?

---

## 오류: UseCacheTimeoutError

### 증상

```
Error: A component used 'use cache' but didn't complete within 50 seconds.
```

### 원인

캐시 함수가 요청별 데이터(cookies, headers, searchParams)에 접근하거나 런타임 컨텍스트에 의존하는 요청을 수행하고 있습니다.

### 해결 방법

런타임 데이터(cookies, headers, searchParams)에 의존하는 사용자별 콘텐츠는 **캐시해서는 안 됩니다**. 대신 동적으로 스트리밍하세요:

```tsx
// ❌ 잘못됨: 사용자별 콘텐츠를 캐시하려고 시도
async function UserContent() {
  'use cache'
  const session = await cookies() // 타임아웃 발생!
  return await fetchContent(session.userId)
}

// ✅ 올바름: 사용자별 콘텐츠는 캐시하지 않고 스트리밍
async function UserContent() {
  const session = await cookies()
  return await fetchContent(session.get('userId')?.value)
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <UserContent /> {/* 'use cache' 없음 - 동적으로 스트리밍 */}
    </Suspense>
  )
}
```

**핵심 인사이트**: Cache Components는 사용자 간 공유할 수 있는 콘텐츠(예: 상품 상세, 블로그 게시물)를 위한 것입니다. 사용자별 콘텐츠는 요청 시 스트리밍해야 합니다.

---

## 오류: 동기 함수에서 'use cache' 사용 불가

### 증상

```
Error: 'use cache' can only be used in async functions
```

### 원인

Cache Components는 캐시 출력이 스트리밍되기 때문에 async 함수가 필요합니다.

### 해결 방법

```tsx
// ❌ 잘못됨: 동기 함수
function CachedComponent() {
  'use cache'
  return <div>Hello</div>
}

// ✅ 올바름: Async 함수
async function CachedComponent() {
  'use cache'
  return <div>Hello</div>
}
```

---

## 오류: Suspense 외부의 동적 데이터

### 증상

```
Error: Accessing cookies/headers/searchParams outside a Suspense boundary
```

### 원인

Cache Components에서는 요청별 API(cookies, headers, searchParams, connection)에 접근할 때 Suspense 경계가 필요하며, 이를 통해 Next.js가 정적 fallback을 제공할 수 있습니다.

### 이것이 변경된 이유

**Cache Components 이전**: 페이지가 조용히 완전 동적으로 전환됨 - 정적 콘텐츠가 제공되지 않음.

**Cache Components 이후**: 빌드 오류가 동적 경계를 명시적으로 처리하도록 보장.

### 해결 방법

동적 콘텐츠를 Suspense로 래핑하세요:

```tsx
// ❌ 오류: Suspense 경계 없음
export default async function Page() {
  return (
    <>
      <Header />
      <UserDeals /> {/* cookies()를 사용 */}
    </>
  )
}

// ✅ 올바름: Suspense가 정적 fallback을 제공
export default async function Page() {
  return (
    <>
      <Header />
      <Suspense fallback={<DealsSkeleton />}>
        <UserDeals />
      </Suspense>
    </>
  )
}
```

> **참고**: PATTERNS.md의 패턴 1 (정적 + 캐시 + 동적 페이지)에서 기본적인 Suspense 경계 패턴을 확인하세요.

---

## 오류: Suspense 외부의 캐시되지 않은 데이터

### 증상

```
Error: Accessing uncached data outside Suspense
```

### 원인

Cache Components에서는 모든 **비동기** I/O가 기본적으로 동적으로 간주됩니다. 데이터베이스 쿼리, fetch 호출, 파일 읽기는 캐시되거나 Suspense로 래핑되어야 합니다.

> **동기 데이터베이스에 대한 참고**: 동기 API를 가진 라이브러리(예: `better-sqlite3`)는 비동기 I/O가 관련되지 않으므로 이 오류를 트리거하지 않습니다. 동기 연산은 렌더링 중에 완료되어 정적 셸에 포함됩니다. 그러나 이는 렌더 스레드를 차단한다는 의미이기도 합니다 — 작고 빠른 쿼리에만 신중하게 사용하세요.

### 해결 방법

데이터를 캐시하거나 Suspense로 래핑하세요:

```tsx
// ❌ 오류: Suspense 없이 캐시되지 않은 데이터베이스 쿼리
export default async function ProductPage({ params }) {
  const product = await db.products.findUnique({ where: { id: params.id } })
  return <ProductCard product={product} />
}

// ✅ 옵션 1: 데이터를 캐시
async function getProduct(id: string) {
  'use cache'
  cacheTag(`product-${id}`)
  cacheLife('hours')

  return await db.products.findUnique({ where: { id } })
}

export default async function ProductPage({ params }) {
  const product = await getProduct(params.id)
  return <ProductCard product={product} />
}

// ✅ 옵션 2: Suspense로 래핑 (동적으로 스트리밍)
export default async function ProductPage({ params }) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent id={params.id} />
    </Suspense>
  )
}
```

> **참고**: PATTERNS.md의 패턴 5 (캐시된 데이터 가져오기 함수)에서 재사용 가능한 캐시 데이터 가져오기 패턴을 확인하세요.

---

## 오류: 비어있는 generateStaticParams

### 증상

```
Error: generateStaticParams must return at least one parameter set
```

### 원인

Cache Components에서는 비어있는 `generateStaticParams`가 더 이상 허용되지 않습니다. 이는 컴포넌트의 동적 API 사용이 프로덕션에서만 오류를 발생시키는 종류의 버그를 방지합니다.

### 이것이 변경된 이유

**이전**: 빈 배열 = "이것이 정적이라고 믿어주세요". 프로덕션에서 동적 API 사용 시 런타임 오류 발생.

**이후**: Next.js가 페이지가 실제로 정적으로 렌더링되는지 검증할 수 있도록 최소 하나의 매개변수 세트를 제공해야 합니다.

### 해결 방법

```tsx
// ❌ 오류: 빈 배열
export function generateStaticParams() {
  return []
}

// ✅ 올바름: 최소 하나의 매개변수 제공
export async function generateStaticParams() {
  const products = await getPopularProducts()
  return products.map(({ category, slug }) => ({ category, slug }))
}

// ✅ 이것도 올바름: 알려진 라우트에 대해 하드코딩
export function generateStaticParams() {
  return [{ slug: 'about' }, { slug: 'contact' }, { slug: 'pricing' }]
}
```

---

## 오류: 캐시 내부의 요청 데이터

### 증상

```
Error: Cannot access cookies/headers inside 'use cache'
```

### 원인

캐시 컨텍스트는 요청별 데이터에 의존할 수 없습니다. 캐시된 결과가 모든 사용자에게 공유되기 때문입니다.

### 해결 방법

사용자별 콘텐츠는 **캐시해서는 안 됩니다**. `'use cache'`를 제거하고 콘텐츠를 동적으로 스트리밍하세요:

```tsx
// ❌ 오류: 캐시 내부의 Cookies
async function UserDashboard() {
  'use cache'
  const session = await cookies() // 오류!
  return await fetchDashboard(session.get('userId'))
}

// ✅ 올바름: 사용자별 콘텐츠를 캐시하지 않음
async function UserDashboard() {
  const session = await cookies()
  return await fetchDashboard(session.get('userId')?.value)
}

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <UserDashboard /> {/* 요청 시 스트리밍 */}
    </Suspense>
  )
}
```

**핵심 인사이트**: Cache Components는 사용자 간 공유할 수 있는 콘텐츠를 위한 것입니다. 사용자별 대시보드는 동적으로 스트리밍해야 합니다.

---

## 문제: 캐시가 사용되지 않음

### 증상

- 매 요청마다 데이터가 항상 최신
- 캐싱 동작이 관찰되지 않음
- 빌드 로그에 캐시된 라우트가 표시되지 않음

### 체크리스트

**1. `cacheComponents`가 활성화되어 있는가?**

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true, // 필수!
}
```

**2. 함수가 async인가?**

```tsx
// 반드시 async여야 함
async function CachedData() {
  'use cache'
  return await fetchData()
}
```

**3. `'use cache'`가 첫 번째 문장인가?**

```tsx
// ❌ 잘못됨: 지시어가 첫 번째가 아님
async function CachedData() {
  const x = 1 // 'use cache' 전에 무언가가 있음
  ;('use cache')
  return await fetchData()
}

// ✅ 올바름: 지시어가 첫 번째
async function CachedData() {
  'use cache'
  const x = 1
  return await fetchData()
}
```

**4. 인자가 직렬화 가능한가?**

```tsx
// ❌ 잘못됨: 함수를 인자로 (직렬화 불가)
async function CachedData({ transform }: { transform: (x: any) => any }) {
  'use cache'
  const data = await fetchData()
  return transform(data)
}

// ✅ 올바름: 직렬화 가능한 인자만
async function CachedData({ transformType }: { transformType: string }) {
  'use cache'
  const data = await fetchData()
  return applyTransform(data, transformType)
}
```

---

## 문제: 변이 후 오래된 데이터

### 증상

- 생성/업데이트된 데이터가 즉시 나타나지 않음
- 변경 사항을 보려면 페이지를 새로고침해야 함

### 원인

변이 후 캐시가 무효화되지 않음.

### 해결 방법

**1. 즉시 일관성을 위해 `updateTag()`를 사용:**

```tsx
'use server'
import { updateTag } from 'next/cache'

export async function createPost(data: FormData) {
  await db.posts.create({ data })
  updateTag('posts') // 즉시 무효화
}
```

**2. 태그가 일치하는지 확인:**

```tsx
// 캐시가 이 태그를 사용
async function Posts() {
  'use cache'
  cacheTag('posts') // 무효화 태그와 일치해야 함
  return await db.posts.findMany()
}

// 무효화가 동일한 태그를 사용해야 함
export async function createPost(data: FormData) {
  await db.posts.create({ data })
  updateTag('posts') // 동일한 태그!
}
```

**3. 관련된 모든 태그를 무효화:**

```tsx
export async function updatePost(postId: string, data: FormData) {
  const post = await db.posts.update({
    where: { id: postId },
    data,
  })

  // 영향받는 모든 캐시를 무효화
  updateTag('posts') // 모든 게시물 목록
  updateTag(`post-${postId}`) // 특정 게시물
  updateTag(`author-${post.authorId}`) // 저자의 게시물
}
```

---

## 문제: 동일한 키에 대한 다른 캐시 값

### 증상

- 동일한 쿼리여야 하는데 캐시가 다른 값을 반환
- 요청 간 일관성 없는 동작

### 원인

인자가 캐시 키의 일부입니다. 다른 인자 값 = 다른 캐시 항목.

### 해결 방법

인자를 정규화하세요:

```tsx
// ❌ 문제: 객체 참조가 다름
async function CachedData({ options }: { options: { limit: number } }) {
  'use cache'
  return await fetchData(options)
}

// 각 호출이 새 객체를 생성 = 새 캐시 키
<CachedData options={{ limit: 10 }} />
<CachedData options={{ limit: 10 }} /> // 다른 캐시 항목!

// ✅ 해결: 원시값 또는 안정적인 참조 사용
async function CachedData({ limit }: { limit: number }) {
  'use cache'
  return await fetchData({ limit })
}

<CachedData limit={10} />
<CachedData limit={10} /> // 동일한 캐시 항목!
```

---

## 문제: 'use cache' 내부에서 React.cache 중복 제거가 작동하지 않음

### 증상

- `React.cache()`로 래핑된 함수가 중복 제거 대신 여러 번 호출됨
- `'use cache'` 함수 내에서 중복 데이터베이스 쿼리 또는 API 호출
- `'use cache'` 외부에서는 예상대로 중복 제거가 작동하지만 내부에서는 작동하지 않음

### 원인

`React.cache()`는 중복 제거를 위해 요청별 저장소를 사용합니다. `'use cache'` 함수는 이 요청 수준 저장소를 사용할 수 없는 격리된 범위에서 실행됩니다. 두 캐싱 메커니즘은 독립적으로 작동합니다.

### 해결 방법

`'use cache'` 경계 내에서 중복 제거를 위해 `React.cache()`에 의존하지 마세요. 대신 `'use cache'` 메커니즘 자체에 의존하세요:

```tsx
import { cache } from 'react'

const getUser = cache(async (id: string) => {
  return await db.users.findUnique({ where: { id } })
})

// ❌ 잘못됨: React.cache는 'use cache' 내부에서 중복 제거하지 않음
async function CachedProfile({ userId }: { userId: string }) {
  'use cache'
  const user = await getUser(userId) // React.cache가 여기서 격리됨
  const posts = await getPostsByAuthor(userId)
  return <Profile user={user} posts={posts} />
}

// ✅ 올바름: 공유 데이터를 별도의 캐시 함수로 추출
async function getUser(id: string) {
  'use cache'
  cacheTag(`user-${id}`)
  cacheLife('hours')
  return await db.users.findUnique({ where: { id } })
}

// 두 컴포넌트가 동일한 'use cache' 항목을 공유
async function CachedProfile({ userId }: { userId: string }) {
  'use cache'
  const user = await getUser(userId) // 'use cache' 항목에 히트
  return <Profile user={user} />
}
```

> **참고**: REFERENCE.md의 "React.cache 격리" 섹션에서 이 동작의 기술적 이유를 설명합니다.

---

## 문제: 캐시가 너무 공격적 (오래된 데이터)

### 증상

- 예상대로 데이터가 업데이트되지 않음
- 사용자가 오래된 콘텐츠를 봄

### 해결 방법

**1. 캐시 수명 줄이기:**

```tsx
async function FrequentlyUpdatedData() {
  'use cache'
  cacheLife('seconds') // 짧은 캐시

  // 또는 커스텀 짧은 기간
  cacheLife({
    stale: 0,
    revalidate: 30,
    expire: 60,
  })

  return await fetchData()
}
```

**2. 변동이 잦은 데이터는 캐시하지 않기:**

```tsx
// 진정한 실시간 데이터의 경우 캐싱 건너뛰기
async function LiveData() {
  // 'use cache' 없음
  return await fetchLiveData()
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <LiveData />
    </Suspense>
  )
}
```

---

## 문제: 빌드 시간이 너무 오래 걸림

### 증상

- 사전 렌더링 중 빌드가 멈춤
- `next build` 중 타임아웃 오류

### 원인

캐시 함수가 빌드 중 느린 네트워크 요청을 만들거나 사용 불가능한 서비스에 접근.

### 해결 방법

**1. 빌드용 fallback 데이터 사용:**

```tsx
async function CachedData() {
  'use cache'

  try {
    return await fetchFromAPI()
  } catch (error) {
    // API를 사용할 수 없을 때 빌드 중 fallback 반환
    return getFallbackData()
  }
}
```

**2. 정적 생성 범위 제한:**

```tsx
// app/[slug]/page.tsx
export function generateStaticParams() {
  // 빌드 시 가장 중요한 페이지만 사전 렌더링
  // 다른 페이지는 요청 시 온디맨드로 생성됨
  return [{ slug: 'home' }, { slug: 'about' }]
}
```

**3. 진정한 동적 콘텐츠에 Suspense 사용:**

```tsx
// app/[slug]/page.tsx
import { Suspense } from 'react'

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DynamicContent params={params} />
    </Suspense>
  )
}
```

> **참고:** `export const dynamic = 'force-dynamic'` 사용을 피하세요. 이 세그먼트 설정은 Cache Components에서 사용 중단되었습니다. 세밀한 제어를 위해 Suspense 경계와 `'use cache'`를 사용하세요.

### 런타임 데이터 Promise를 캐시 컴포넌트에 Props로 전달하지 않기

**증상**: 사전 렌더링 중 빌드가 무한정 멈추고 결국 타임아웃됩니다.

**원인**: 런타임 데이터(`params`나 `searchParams` 등)에 의존하는 Promise를 `'use cache'` 컴포넌트에 prop으로 전달. 빌드 중에는 실제 요청이 없기 때문에 Promise가 절대 resolve되지 않습니다.

```tsx
// ❌ 잘못됨: params Promise를 캐시 컴포넌트에 전달
async function CachedContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>
}) {
  'use cache'
  const { id } = await paramsPromise // 빌드 시 멈춤!
  return await fetchData(id)
}

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <CachedContent paramsPromise={params} />
}

// ✅ 올바름: 캐시 외부에서 params를 resolve하고 원시값 전달
async function CachedContent({ id }: { id: string }) {
  'use cache'
  cacheTag(`content-${id}`)
  return await fetchData(id)
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CachedContent id={id} />
}
```

**규칙**: 항상 런타임 Promise를 resolve한 후 그 값을 `'use cache'` 함수에 전달하세요. Promise가 아닌 resolve된 원시값을 전달하세요.

### 캐시 코드에서 접근하는 공유 중복 제거 저장소 피하기

**증상**: 빌드가 멈추거나 일관성 없는 결과를 생성합니다. `'use cache'` 내부의 `React.cache()` 호출이 완료되지 않습니다.

**원인**: `'use cache'` 내부의 코드가 빌드 시 사전 렌더링 중에는 존재하지 않는 `React.cache()` 또는 기타 요청별 공유 저장소에서 읽으려고 시도합니다. 중복 제거 메커니즘이 도착하지 않는 요청 컨텍스트를 기다립니다.

```tsx
import { cache } from 'react'

const getData = cache(async () => {
  return await db.data.findMany()
})

// ❌ 잘못됨: 'use cache' 내부의 React.cache가 빌드 중 멈출 수 있음
async function CachedWidget() {
  'use cache'
  const data = await getData() // 중복 제거 저장소를 사용할 수 없음
  return <Widget data={data} />
}

// ✅ 올바름: 직접 fetch하거나 별도의 'use cache' 함수 사용
async function CachedWidget() {
  'use cache'
  cacheTag('widget')
  const data = await db.data.findMany() // 캐시 범위 내에서 직접 fetch
  return <Widget data={data} />
}
```

---

## 디버깅 기법

### 1. 캐시 헤더 확인

개발 중 응답 헤더를 검사합니다:

```bash
curl -I http://localhost:3000/your-page
```

확인할 항목:

- `x-nextjs-cache: HIT` - 캐시에서 제공됨
- `x-nextjs-cache: MISS` - 캐시 미스, 재계산됨
- `x-nextjs-cache: STALE` - 오래된 콘텐츠, 재검증 중

### 2. 상세 로깅 활성화

```bash
# 캐시 디버깅을 위한 환경 변수
NEXT_PRIVATE_DEBUG_CACHE=1 npm run dev
```

### 3. 빌드 출력 확인

```bash
npm run build

# 확인할 항목:
# ○ (Static) - 완전 정적
# ◐ (Partial) - 캐시를 포함한 부분 사전 렌더링
# λ (Dynamic) - 서버 렌더링
```

### 4. 캐시 태그 검사

태그를 확인하기 위한 로깅 추가:

```tsx
async function CachedData({ id }: { id: string }) {
  'use cache'

  const tags = ['data', `item-${id}`]
  console.log('Cache tags:', tags) // 빌드 중 확인

  tags.forEach((tag) => cacheTag(tag))
  cacheLife('hours')

  return await fetchData(id)
}
```

---

## 일반적인 실수 체크리스트

| 실수                               | 증상               | 수정 방법             |
| ---------------------------------- | ------------------ | --------------------- |
| `cacheComponents: true` 누락       | 캐싱 안 됨         | next.config.ts에 추가 |
| 동기 함수에 `'use cache'` 사용     | 빌드 오류          | 함수를 async로 변경   |
| `'use cache'`가 첫 번째 문장이 아님 | 캐시 무시됨       | 첫 번째 줄로 이동     |
| 캐시에서 cookies/headers 접근      | 타임아웃 오류      | 래퍼로 추출           |
| 직렬화 불가능한 인자               | 일관성 없는 캐시   | 원시값 사용           |
| 동적 콘텐츠에 Suspense 누락       | 스트리밍 깨짐      | Suspense로 래핑       |
| 무효화에서 잘못된 태그             | 오래된 데이터      | 캐시 태그 일치시키기  |
| 변동이 잦은 데이터의 과도한 캐싱   | 오래된 데이터      | cacheLife 줄이기      |

---

## 성능 최적화 팁

### 1. 캐시 히트율 프로파일링

캐시 효과를 모니터링합니다:

```tsx
async function CachedData() {
  'use cache'

  const start = performance.now()
  const data = await fetchData()
  const duration = performance.now() - start

  // 분석을 위한 로그
  console.log(`Cache execution: ${duration}ms`)

  return data
}
```

### 2. 캐시 세분화 최적화

```tsx
// ❌ 거친 세분화: 하나의 큰 캐시 컴포넌트
async function PageContent() {
  'use cache'
  const header = await fetchHeader()
  const posts = await fetchPosts()
  const sidebar = await fetchSidebar()
  return <>{/* 모든 것 */}</>
}

// ✅ 세밀한 세분화: 독립적인 캐시 컴포넌트들
async function Header() {
  'use cache'
  cacheLife('days')
  return await fetchHeader()
}

async function Posts() {
  'use cache'
  cacheLife('hours')
  return await fetchPosts()
}

async function Sidebar() {
  'use cache'
  cacheLife('minutes')
  return await fetchSidebar()
}
```

### 3. 전략적 태그 설계

```tsx
// 대상 지정 무효화를 위한 계층적 태그
cacheTag(
  'posts', // 모든 게시물
  `category-${category}`, // 카테고리별 게시물
  `post-${id}`, // 특정 게시물
  `author-${authorId}` // 저자의 게시물
)

// 적절한 수준에서 무효화
updateTag(`post-${id}`) // 단일 게시물 변경
updateTag(`author-${author}`) // 저자가 모든 게시물 업데이트
updateTag('posts') // 최후의 수단
```
