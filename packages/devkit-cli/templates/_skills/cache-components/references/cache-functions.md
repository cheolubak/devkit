# Cache Functions 레퍼런스

cacheLife, cacheTag, updateTag, revalidateTag, revalidatePath, connection 함수에 대한 레퍼런스입니다.

## 함수: `cacheLife()`

캐시 지속 시간과 재검증 동작을 설정합니다.

### Import

```tsx
import { cacheLife } from 'next/cache'
```

### 시그니처

```tsx
function cacheLife(profile: string): void
function cacheLife(options: CacheLifeOptions): void

interface CacheLifeOptions {
  stale?: number // 클라이언트 캐시 지속 시간 (초)
  revalidate?: number // 백그라운드 재검증 기간 (초)
  expire?: number // 절대 만료 시간 (초)
}
```

### 매개변수

| 매개변수     | 설명                                                    | 제약 조건             |
| ------------ | ------------------------------------------------------- | --------------------- |
| `stale`      | 서버 검증 없이 클라이언트가 캐시할 수 있는 기간         | 없음                  |
| `revalidate` | 백그라운드 새로고침을 시작할 시점                        | `revalidate ≤ expire` |
| `expire`     | 절대 만료; 초과 시 동적으로 전환됨                      | 가장 큰 값이어야 함   |

### 사전 정의된 프로필

| 프로필      | stale | revalidate    | expire         |
| ----------- | ----- | ------------- | -------------- |
| `'default'` | 300\* | 900 (15분)    | ∞ (INFINITE)   |
| `'seconds'` | 30    | 1             | 60             |
| `'minutes'` | 300   | 60 (1분)      | 3600 (1시간)   |
| `'hours'`   | 300   | 3600 (1시간)  | 86400 (1일)    |
| `'days'`    | 300   | 86400 (1일)   | 604800 (1주)   |
| `'weeks'`   | 300   | 604800 (1주)  | 2592000 (30일) |
| `'max'`     | 300   | 2592000 (30일)| 31536000 (1년) |

\* 기본 `stale` 값은 `experimental.staleTimes.static` (300초)으로 폴백됩니다

> **중요:** `expire < 300`초인 프로필(예: `'seconds'`)은 **동적**으로 처리되며 Partial Prerendering 중 정적 셸에 포함되지 않습니다. 아래 [동적 임계값](#동적-임계값) 섹션을 참조하세요.

### 커스텀 프로필

`next.config.ts`에서 커스텀 프로필을 정의합니다:

```typescript
const nextConfig: NextConfig = {
  cacheLife: {
    // 커스텀 프로필
    'blog-posts': {
      stale: 300, // 5분
      revalidate: 3600, // 1시간
      expire: 86400, // 1일
    },
    // 기본값 재정의
    default: {
      stale: 60,
      revalidate: 600,
      expire: 3600,
    },
  },
}
```

### 사용법

```tsx
async function BlogPosts() {
  'use cache'
  cacheLife('blog-posts') // 커스텀 프로필

  return await db.posts.findMany()
}
```

### HTTP Cache-Control 매핑

```
stale     → max-age
revalidate → s-maxage
expire - revalidate → stale-while-revalidate

예시: stale=60, revalidate=3600, expire=86400
→ Cache-Control: max-age=60, s-maxage=3600, stale-while-revalidate=82800
```

### 동적 임계값

캐시 항목의 만료 시간이 짧으면 Partial Prerendering 중 **동적 홀**로 처리됩니다:

| 조건                    | 동작                                     |
| ----------------------- | ---------------------------------------- |
| `expire < 300`초        | 동적으로 처리 (정적 셸에 포함되지 않음)  |
| `revalidate === 0`      | 동적으로 처리 (정적 셸에 포함되지 않음)  |
| `expire >= 300`초       | 정적 셸에 포함                           |

**왜 `stale`이 아니라 `expire`인가?**

임계값이 `expire` (절대 만료)를 사용하는 이유:

- `expire`는 캐시 항목의 **최대 수명**을 정의합니다
- `expire`가 매우 짧으면 캐시된 콘텐츠가 정적 셸에서 즉시 무효화됩니다
- `stale`은 **클라이언트 측 신선도 인식**에만 영향을 줍니다 — 브라우저가 재검증하기 전까지의 기간
- 수명이 짧은 콘텐츠를 정적 셸에 포함하면 확실히 오래된 데이터를 제공하게 됩니다

**실질적 의미:**

- `cacheLife('seconds')` (expire=60) → **동적** - 요청 시 스트리밍
- `cacheLife('minutes')` (expire=3600) → **정적** - PPR 셸에 포함
- 커스텀 `cacheLife({ expire: 120 })` → **동적** - 300초 임계값 미만

이 300초 임계값은 매우 수명이 짧은 캐시가 즉시 오래된 콘텐츠로 정적 셸을 오염시키는 것을 방지합니다.

```tsx
// 이 캐시는 동적임 (expire=60 < 300)
async function RealtimePrice() {
  'use cache'
  cacheLife('seconds') // expire=60, 임계값 미만
  return await fetchPrice()
}

// 이 캐시는 정적임 (expire=3600 >= 300)
async function ProductDetails() {
  'use cache'
  cacheLife('minutes') // expire=3600, 임계값 이상
  return await fetchProduct()
}
```

---

## 함수: `cacheTag()`

대상 지정 무효화를 위해 캐시 데이터에 태그를 부여합니다.

### Import

```tsx
import { cacheTag } from 'next/cache'
```

### 시그니처

```tsx
function cacheTag(...tags: string[]): void
```

### 사용법

```tsx
async function UserProfile({ userId }: { userId: string }) {
  'use cache'
  cacheTag('users', `user-${userId}`) // 다중 태그
  cacheLife('hours')

  return await db.users.findUnique({ where: { id: userId } })
}
```

### 태그 전략

**엔티티 기반 태그**:

```tsx
cacheTag('posts') // 모든 게시물
cacheTag(`post-${postId}`) // 특정 게시물
cacheTag(`user-${userId}-posts`) // 사용자의 게시물
```

**기능 기반 태그**:

```tsx
cacheTag('homepage')
cacheTag('dashboard')
cacheTag('admin')
```

**결합 접근법**:

```tsx
cacheTag('posts', `post-${id}`, `author-${authorId}`)
```

### 태그 제약 사항

태그에는 강제 제한이 있습니다:

| 제한               | 값             | 초과 시 동작                   |
| ------------------ | -------------- | ------------------------------ |
| 최대 태그 길이     | 256자          | 경고 로그 기록, 태그 무시      |
| 최대 총 태그 수    | 128개          | 경고 로그 기록, 초과분 무시    |

```tsx
// ❌ 태그가 너무 김 (>256자) - 경고와 함께 무시됨
cacheTag('a'.repeat(300))

// ❌ 태그가 너무 많음 (>128개) - 초과분은 경고와 함께 무시됨
cacheTag(...Array(200).fill('tag'))

// ✅ 올바른 사용법
cacheTag('products', `product-${id}`, `category-${category}`)
```

### 암시적 태그 (자동)

명시적 `cacheTag()` 호출 외에도, Next.js는 라우트 계층 구조에 기반하여 자동으로 **암시적 태그**를 적용합니다. 이는 명시적 `cacheTag()` 호출 없이도 `revalidatePath()`가 작동함을 의미합니다:

```tsx
'use server'
import { revalidatePath } from 'next/cache'

export async function publishBlogPost() {
  await db.posts.create({
    /* ... */
  })

  // 명시적 cacheTag() 없이 작동 - 암시적 라우트 기반 태그 사용
  revalidatePath('/blog', 'layout') // 모든 /blog/* 라우트를 무효화
}
```

**작동 원리:**

- 각 라우트 세그먼트(layout, page)는 자동으로 내부 태그를 받습니다
- `revalidatePath('/blog', 'layout')`는 `/blog` 레이아웃과 모든 중첩 라우트를 무효화합니다
- `revalidatePath('/blog/my-post')`는 해당 특정 페이지만 무효화합니다

**암시적 태그와 명시적 태그 중 선택:**

| 사용 사례                                | 접근 방식                           |
| ---------------------------------------- | ----------------------------------- |
| 라우트 하위의 모든 캐시 데이터 무효화    | `revalidatePath()` (암시적 사용)    |
| 라우트 간 특정 엔티티 무효화             | `cacheTag()` + `updateTag()`        |
| 사용자가 변경 사항을 즉시 확인 (즉시)    | 명시적 태그와 함께 `updateTag()`    |
| 백그라운드 업데이트, 최종 일관성 (지연)  | 명시적 태그와 함께 `revalidateTag()`|

---

## 캐시 범위 이해하기

### 새 캐시 항목은 언제 생성되는가?

다음 중 하나라도 다르면 새 캐시 항목이 생성됩니다:

| 요인                  | 예시                                    |
| --------------------- | --------------------------------------- |
| **함수 ID**           | 다른 함수 = 다른 항목                   |
| **인자**              | `getUser("123")` vs `getUser("456")`    |
| **파일 경로**         | 다른 파일의 동일한 함수 이름            |

### 캐시 키 구성

캐시 키는 여러 부분으로 구성됩니다:

```
[buildId, functionId, serializedArgs, (hmrRefreshHash)]
```

| 부분             | 설명                                                            |
| ---------------- | --------------------------------------------------------------- |
| `buildId`        | 고유 빌드 식별자 (배포 간 캐시 재사용 방지)                     |
| `functionId`     | 캐시 함수의 서버 참조 ID                                       |
| `serializedArgs` | React Flight 인코딩된 함수 인자                                |
| `hmrRefreshHash` | (개발 전용) 파일 변경 시 캐시 무효화                            |

```tsx
// 두 개의 별도 캐시 항목이 생성됨 (세 번째 호출은 캐시 히트):
async function getProduct(id: string) {
  'use cache'
  return db.products.findUnique({ where: { id } })
}

await getProduct('prod-1') // 캐시 항목 1: [buildId, getProduct, "prod-1"]
await getProduct('prod-2') // 캐시 항목 2: [buildId, getProduct, "prod-2"]
await getProduct('prod-1') // 항목 1에 대한 캐시 히트
```

### 객체 인자와 캐시 키

인자는 React의 `encodeReply()`를 사용하여 직렬화되며, **구조적 직렬화**를 수행합니다:

```tsx
async function getData(options: { limit: number }) {
  'use cache'
  return fetch(`/api?limit=${options.limit}`)
}

// 동일한 구조의 객체는 동일한 캐시 키를 생성함
getData({ limit: 10 }) // 캐시 키에 직렬화된 { limit: 10 } 포함
getData({ limit: 10 }) // 히트! 동일한 구조적 내용

// 다른 값 = 다른 캐시 키
getData({ limit: 20 }) // 미스 - 다른 내용
```

**모범 사례:** 객체가 올바르게 작동하지만, 원시값이 이해하기 더 쉽습니다:

```tsx
// ✅ 명확하고 명시적
async function getData(limit: number) {
  'use cache'
  return fetch(`/api?limit=${limit}`)
}
```

> **참고:** 직렬화 불가능한 값(함수, 클래스 인스턴스, Symbol)은 캐시 함수의 인자로 사용할 수 없으며 오류를 발생시킵니다.

> **패스스루 예외:** `children` (ReactNode)과 Server Actions 같은 일부 직렬화 불가능한 값은 캐시 키에 영향을 주지 않으면서 캐시된 컴포넌트를 통해 전달될 수 있습니다. 이러한 값은 캐시 범위 내에서 읽거나 호출되지 않으며, 출력에 그대로 전달됩니다. PATTERNS.md의 패턴 12 (Children을 사용한 인터리빙)를 참조하세요.

### React.cache 격리

`React.cache()`는 일반 Server Components에 대해 요청별 중복 제거를 제공하지만, `'use cache'` 경계를 넘어서는 작동하지 **않습니다**. 각 `'use cache'` 함수는 자체 격리된 범위에서 실행됩니다 — 외부 요청의 `React.cache()` 저장소는 캐시 함수 내부에서 사용할 수 없습니다.

```tsx
import { cache } from 'react'

const getUser = cache(async (id: string) => {
  console.log('Fetching user', id)
  return await db.users.findUnique({ where: { id } })
})

// 'use cache' 외부 - React.cache가 정상적으로 중복 제거
async function UserHeader({ userId }: { userId: string }) {
  const user = await getUser(userId) // Fetch #1
  return <h1>{user.name}</h1>
}

async function UserSidebar({ userId }: { userId: string }) {
  const user = await getUser(userId) // 중복 제거됨 - Fetch #1 재사용
  return <aside>{user.bio}</aside>
}

// 'use cache' 내부 - React.cache가 중복 제거하지 않음
async function CachedUserCard({ userId }: { userId: string }) {
  'use cache'
  const user = await getUser(userId) // 별도 fetch - 격리된 범위
  return <div>{user.name}</div>
}
```

**핵심 요점**: `'use cache'` 내부에서 중복 제거가 필요하면 `'use cache'` 메커니즘 자체에 의존하세요 (동일한 함수 + 동일한 인자 = 캐시 히트). 경계 간 중복 제거를 위해 `React.cache()`에 의존하지 마세요.

---

## 함수: `updateTag()`

캐시 항목을 즉시 무효화하고 읽기-후-쓰기 일관성을 보장합니다.

### Import

```tsx
import { updateTag } from 'next/cache'
```

### 시그니처

```tsx
function updateTag(tag: string): void
```

### 사용법

```tsx
'use server'
import { updateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({ data: formData })

  updateTag('posts') // 'posts' 태그가 있는 모든 캐시 항목 업데이트
  updateTag(`user-${userId}`) // 이 사용자 태그가 있는 모든 캐시 항목 업데이트

  // 클라이언트가 즉시 최신 데이터를 확인
}
```

### 동작

- **즉시**: 캐시가 동기적으로 무효화됨
- **읽기-후-쓰기**: 후속 읽기가 최신 데이터를 반환
- **Server Actions 전용**: Server Actions에서만 호출 가능

---

## 함수: `revalidateTag()`

캐시 항목을 오래된 것으로 표시하여 백그라운드 재검증을 수행합니다.

### Import

```tsx
import { revalidateTag } from 'next/cache'
```

### 시그니처

```tsx
function revalidateTag(tag: string, profile: string | { expire?: number }): void
```

### 매개변수

| 매개변수  | 타입                            | 설명                                                           |
| --------- | ------------------------------- | -------------------------------------------------------------- |
| `tag`     | `string`                        | 무효화할 캐시 태그                                             |
| `profile` | `string \| { expire?: number }` | 캐시 프로필 이름 또는 만료 시간(초)이 포함된 객체              |

> **참고:** `stale`, `revalidate`, `expire`를 허용하는 `cacheLife()`와 달리, `revalidateTag()`의 객체 형식은 `expire`만 허용합니다. stale-while-revalidate 동작을 완전히 제어하려면 사전 정의된 프로필 이름(예: `'hours'`)을 사용하세요.

### 사용법

```tsx
'use server'
import { revalidateTag } from 'next/cache'

export async function updateSettings(data: FormData) {
  await db.settings.update({ data })

  // 사전 정의된 프로필 사용 (권장)
  revalidateTag('settings', 'hours')

  // 커스텀 만료 시간 사용
  revalidateTag('settings', { expire: 3600 })
}
```

### 동작

- **Stale-while-revalidate**: 백그라운드에서 새로고침하는 동안 캐시된 콘텐츠를 제공
- **백그라운드 새로고침**: 다음 방문 후 백그라운드에서 캐시 항목이 새로고침됨
- **더 넓은 컨텍스트**: Route Handlers와 Server Actions에서 호출 가능

---

## updateTag() vs revalidateTag(): 각각의 사용 시기

핵심 차이점은 **즉시(eager) vs 지연(lazy)** 무효화입니다:

- **`updateTag()`** - 즉시 무효화. 캐시가 즉시 무효화되고, 다음 읽기가 동기적으로 최신 데이터를 가져옵니다. 액션을 트리거한 사용자가 결과를 확인해야 할 때 사용합니다.
- **`revalidateTag()`** - 지연(SWR 스타일) 무효화. 백그라운드에서 최신 데이터를 가져오는 동안 오래된 데이터가 제공될 수 있습니다. 최종 일관성이 허용될 때 사용합니다.

결정 가이드:

| 시나리오                       | 사용할 함수       | 이유                                       |
| ------------------------------ | ----------------- | ------------------------------------------ |
| 사용자가 게시물을 작성         | `updateTag()`     | 사용자가 게시물을 즉시 확인해야 함         |
| 사용자가 프로필을 업데이트     | `updateTag()`     | 읽기-후-쓰기 의미론                        |
| 관리자가 콘텐츠를 게시         | `revalidateTag()` | 다른 사용자는 잠시 오래된 데이터도 가능    |
| 분석/조회수                    | `revalidateTag()` | 신선도가 덜 중요                           |
| 백그라운드 동기화 작업         | `revalidateTag()` | 결과를 기다리는 사용자 없음                |
| 전자상거래 장바구니 업데이트   | `updateTag()`     | 사용자에게 정확한 장바구니 상태 필요       |

### 전자상거래 예시

```tsx
'use server'
import { updateTag, revalidateTag } from 'next/cache'

// 사용자가 장바구니에 추가할 때 → updateTag (정확한 수량이 필요)
export async function addToCart(productId: string, userId: string) {
  await db.cart.add({ productId, userId })
  updateTag(`cart-${userId}`) // 즉시 - 사용자가 장바구니를 확인
}

// 창고 동기화로 재고가 변경될 때 → revalidateTag
export async function syncInventory(products: Product[]) {
  await db.inventory.bulkUpdate(products)
  revalidateTag('inventory', 'max') // 백그라운드 - 최종 일관성으로 충분
}

// 사용자가 구매를 완료할 때 → 구매자에겐 updateTag, 상품에는 revalidateTag
export async function completePurchase(orderId: string) {
  const order = await processOrder(orderId)

  updateTag(`order-${orderId}`) // 구매자가 즉시 확인서를 확인
  updateTag(`cart-${order.userId}`) // 구매자의 장바구니가 즉시 비워짐
  revalidateTag(`product-${order.productId}`, 'max') // 다른 사용자는 업데이트된 재고를 최종적으로 확인
}
```

### 경험 법칙

> **updateTag**: "이 액션을 트리거한 사용자가 결과를 보려고 기다리고 있음"
>
> **revalidateTag**: "이 업데이트는 다른 사용자에게 영향을 주지만, 그들은 기다릴 필요를 모름"

---

## 함수: `revalidatePath()`

경로와 연관된 모든 캐시 항목을 재검증합니다.

### Import

```tsx
import { revalidatePath } from 'next/cache'
```

### 시그니처

```tsx
function revalidatePath(path: string, type?: 'page' | 'layout'): void
```

### 사용법

```tsx
'use server'
import { revalidatePath } from 'next/cache'

export async function updateBlog() {
  await db.posts.update({
    /* ... */
  })

  revalidatePath('/blog') // 특정 경로
  revalidatePath('/blog', 'layout') // 레이아웃과 모든 하위
  revalidatePath('/', 'layout') // 전체 앱
}
```

---

## 함수: `connection()`

`cookies()`나 `headers()` 같은 런타임 API에 접근하지 않고도 명시적으로 렌더링을 요청 시점으로 지연시킵니다.

### Import

```tsx
import { connection } from 'next/server'
```

### 시그니처

```tsx
function connection(): Promise<void>
```

### 사용법

```tsx
import { connection } from 'next/server'
import { Suspense } from 'react'

async function UniqueContent() {
  await connection() // 요청 시점으로 지연

  // 요청마다 새로운 값이 필요한 비결정적 연산
  const uuid = crypto.randomUUID()
  const timestamp = Date.now()
  const random = Math.random()

  return (
    <div>
      <p>UUID: {uuid}</p>
      <p>생성 시각: {timestamp}</p>
      <p>랜덤: {random}</p>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <UniqueContent />
    </Suspense>
  )
}
```

### `connection()` 사용 시기

| 시나리오                                                      | `connection()` 사용? |
| ------------------------------------------------------------- | -------------------- |
| 요청마다 고유한 값이 필요 (`crypto.randomUUID()`)             | ✅ 예                |
| `Math.random()`, `Date.now()` 사용                            | ✅ 예                |
| 캐시되지 않아야 할 비결정적 연산                              | ✅ 예                |
| 이미 `cookies()` 또는 `headers()`를 사용 중                   | ❌ 아니오 (불필요)   |
| 데이터가 캐시 가능 (모든 사용자에게 동일)                     | ❌ 아니오 (`'use cache'` 사용) |

### `connection()`이 존재하는 이유

`connection()` 없이는 Server Components의 비결정적 연산이 빌드 시점에 실행되어 정적 셸에 고정될 수 있습니다:

```tsx
// ❌ 문제: UUID가 빌드 시 한 번만 생성됨
async function BadExample() {
  const uuid = crypto.randomUUID() // 모든 사용자에게 동일한 값!
  return <div>{uuid}</div>
}

// ✅ 해결: 요청마다 UUID 생성
async function GoodExample() {
  await connection()
  const uuid = crypto.randomUUID() // 요청마다 고유
  return <div>{uuid}</div>
}
```

### `connection()` vs 런타임 API

이미 `cookies()`나 `headers()`에 접근하고 있다면 `connection()`이 필요하지 않습니다:

```tsx
// connection() 불필요 - cookies()가 이미 이것을 동적으로 만듦
async function UserContent() {
  const session = (await cookies()).get('session')
  const timestamp = Date.now() // cookies()로 인해 이미 동적
  return <div>{timestamp}</div>
}

// connection() 필요 - 다른 동적 API를 사용하지 않음
async function AnonymousContent() {
  await connection() // 명시적 동적
  const timestamp = Date.now()
  return <div>{timestamp}</div>
}
```
