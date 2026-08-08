## 3. 서버 사이드 성능

**영향: HIGH**

서버 사이드 렌더링과 데이터 페칭을 최적화하면 서버 사이드 워터폴을 제거하고 응답 시간을 단축할 수 있습니다.

### 3.1 Server Actions을 API 라우트처럼 인증하기

**영향: CRITICAL (서버 변이에 대한 무단 접근 방지)**

Server Actions (`"use server"` 함수)은 API 라우트와 마찬가지로 공개 엔드포인트로 노출됩니다. 항상 각 Server Action **내부에서** 인증과 권한을 검증하세요. 미들웨어, 레이아웃 가드, 페이지 수준 검사에만 의존하지 마세요. Server Actions은 직접 호출될 수 있습니다.

Next.js 문서에 명시적으로 다음과 같이 기술되어 있습니다: "Server Actions을 공개 API 엔드포인트와 동일한 보안 고려사항으로 취급하고, 사용자가 변이를 수행할 권한이 있는지 확인하세요."

**잘못된 예: 인증 검사 없음**

```typescript
'use server'

export async function deleteUser(userId: string) {
  // 누구나 호출 가능! 인증 검사 없음
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

**올바른 예: 액션 내부에서 인증**

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { unauthorized } from '@/lib/errors'

export async function deleteUser(userId: string) {
  // 항상 액션 내부에서 인증 검사
  const session = await verifySession()

  if (!session) {
    throw unauthorized('Must be logged in')
  }

  // 권한도 검사
  if (session.user.role !== 'admin' && session.user.id !== userId) {
    throw unauthorized('Cannot delete other users')
  }

  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

**입력 유효성 검사 포함:**

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  userId: z.uuid(),
  name: z.string().min(1).max(100),
  email: z.email()
})

export async function updateProfile(data: unknown) {
  // 먼저 입력 유효성 검사
  const validated = updateProfileSchema.parse(data)

  // 그 다음 인증
  const session = await verifySession()
  if (!session) {
    throw new Error('Unauthorized')
  }

  // 그 다음 권한 확인
  if (session.user.id !== validated.userId) {
    throw new Error('Can only update own profile')
  }

  // 마지막으로 변이 수행
  await db.user.update({
    where: { id: validated.userId },
    data: {
      name: validated.name,
      email: validated.email
    }
  })

  return { success: true }
}
```

참조: [https://nextjs.org/docs/app/guides/authentication](https://nextjs.org/docs/app/guides/authentication)

### 3.2 RSC Props에서 중복 직렬화 방지

**영향: LOW (중복 직렬화를 방지하여 네트워크 페이로드 감소)**

RSC에서 클라이언트로의 직렬화는 값이 아닌 객체 참조로 중복을 제거합니다. 같은 참조 = 한 번 직렬화; 새 참조 = 다시 직렬화. 변환(`.toSorted()`, `.filter()`, `.map()`)은 서버가 아닌 클라이언트에서 수행합니다.

**잘못된 예: 배열 중복**

```tsx
// RSC: 6개 문자열 전송 (2개 배열 x 3개 항목)
<ClientList usernames={usernames} usernamesOrdered={usernames.toSorted()} />
```

**올바른 예: 3개 문자열 전송**

```tsx
// RSC: 한 번 전송
<ClientList usernames={usernames} />

// 클라이언트: 여기서 변환
'use client'
const sorted = useMemo(() => [...usernames].sort(), [usernames])
```

**중첩 중복 제거 동작:**

```tsx
// string[] - 모든 것을 중복
usernames={['a','b']} sorted={usernames.toSorted()} // 4개 문자열 전송

// object[] - 배열 구조만 중복
users={[{id:1},{id:2}]} sorted={users.toSorted()} // 2개 배열 + 2개 고유 객체 전송 (4개가 아님)
```

중복 제거는 재귀적으로 작동합니다. 데이터 타입에 따라 영향이 다릅니다:

- `string[]`, `number[]`, `boolean[]`: **높은 영향** - 배열 + 모든 프리미티브가 완전히 중복됨

- `object[]`: **낮은 영향** - 배열이 중복되지만, 중첩 객체는 참조로 중복 제거됨

**중복 제거를 깨뜨리는 연산: 새 참조 생성**

- 배열: `.toSorted()`, `.filter()`, `.map()`, `.slice()`, `[...arr]`

- 객체: `{...obj}`, `Object.assign()`, `structuredClone()`, `JSON.parse(JSON.stringify())`

**추가 예시:**

```tsx
// ❌ 잘못된 예
<C users={users} active={users.filter(u => u.active)} />
<C product={product} productName={product.name} />

// ✅ 올바른 예
<C users={users} />
<C product={product} />
// 필터링/구조분해는 클라이언트에서 수행
```

**예외:** 변환 비용이 크거나 클라이언트가 원본 데이터를 필요로 하지 않을 때 파생 데이터를 전달합니다.

### 3.3 요청 간 LRU 캐싱

**영향: HIGH (요청 간 캐싱)**

`React.cache()`는 하나의 요청 내에서만 작동합니다. 순차적 요청 간에 공유되는 데이터(사용자가 버튼 A를 클릭한 후 버튼 B를 클릭)에는 LRU 캐시를 사용합니다.

**구현:**

```typescript
import { LRUCache } from 'lru-cache'

const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 5 * 60 * 1000  // 5분
})

export async function getUser(id: string) {
  const cached = cache.get(id)
  if (cached) return cached

  const user = await db.user.findUnique({ where: { id } })
  cache.set(id, user)
  return user
}

// 요청 1: DB 쿼리, 결과 캐싱
// 요청 2: 캐시 히트, DB 쿼리 없음
```

순차적 사용자 액션이 수초 이내에 같은 데이터를 필요로 하는 여러 엔드포인트를 호출할 때 사용합니다.

**Vercel의 [Fluid Compute](https://vercel.com/docs/fluid-compute)와 함께:** 여러 동시 요청이 같은 함수 인스턴스와 캐시를 공유할 수 있으므로 LRU 캐싱이 특히 효과적입니다. Redis와 같은 외부 스토리지 없이도 캐시가 요청 간에 유지됩니다.

**전통적인 서버리스에서:** 각 호출이 격리되어 실행되므로, 프로세스 간 캐싱에는 Redis를 고려하세요.

참조: [https://github.com/isaacs/node-lru-cache](https://github.com/isaacs/node-lru-cache)

### 3.4 RSC 경계에서 직렬화 최소화

**영향: HIGH (데이터 전송 크기 감소)**

React 서버/클라이언트 경계는 모든 객체 속성을 문자열로 직렬화하여 HTML 응답과 후속 RSC 요청에 포함합니다. 이 직렬화된 데이터는 페이지 무게와 로드 시간에 직접 영향을 미치므로, **크기가 매우 중요합니다**. 클라이언트가 실제로 사용하는 필드만 전달하세요.

**잘못된 예: 50개 필드 모두 직렬화**

```tsx
async function Page() {
  const user = await fetchUser()  // 50개 필드
  return <Profile user={user} />
}

'use client'
function Profile({ user }: { user: User }) {
  return <div>{user.name}</div>  // 1개 필드만 사용
}
```

**올바른 예: 1개 필드만 직렬화**

```tsx
async function Page() {
  const user = await fetchUser()
  return <Profile name={user.name} />
}

'use client'
function Profile({ name }: { name: string }) {
  return <div>{name}</div>
}
```

### 3.5 컴포넌트 합성을 통한 병렬 데이터 페칭

**영향: CRITICAL (서버 사이드 워터폴 제거)**

React Server Components는 트리 내에서 순차적으로 실행됩니다. 합성(composition)으로 구조를 변경하여 데이터 페칭을 병렬화합니다.

**잘못된 예: Sidebar가 Page의 페칭 완료를 기다림**

```tsx
export default async function Page() {
  const header = await fetchHeader()
  return (
    <div>
      <div>{header}</div>
      <Sidebar />
    </div>
  )
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}
```

**올바른 예: 둘 다 동시에 페칭**

```tsx
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

export default function Page() {
  return (
    <div>
      <Header />
      <Sidebar />
    </div>
  )
}
```

**children prop을 사용한 대안:**

```tsx
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <Header />
      {children}
    </div>
  )
}

export default function Page() {
  return (
    <Layout>
      <Sidebar />
    </Layout>
  )
}
```

### 3.6 React.cache()를 이용한 요청별 중복 제거

**영향: MEDIUM (요청 내 중복 제거)**

서버 사이드 요청 중복 제거에 `React.cache()`를 사용합니다. 인증 및 데이터베이스 쿼리가 가장 큰 혜택을 받습니다.

**사용법:**

```typescript
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  return await db.user.findUnique({
    where: { id: session.user.id }
  })
})
```

단일 요청 내에서 `getCurrentUser()`를 여러 번 호출해도 쿼리는 한 번만 실행됩니다.

**인라인 객체를 인수로 사용하지 마세요:**

`React.cache()`는 캐시 히트를 결정하기 위해 얕은 동등성(`Object.is`)을 사용합니다. 인라인 객체는 호출할 때마다 새 참조를 생성하여 캐시 히트를 방지합니다.

**잘못된 예: 항상 캐시 미스**

```typescript
const getUser = cache(async (params: { uid: number }) => {
  return await db.user.findUnique({ where: { id: params.uid } })
})

// 호출할 때마다 새 객체를 생성, 캐시 히트 불가
getUser({ uid: 1 })
getUser({ uid: 1 })  // 캐시 미스, 쿼리 재실행
```

**올바른 예: 캐시 히트**

```typescript
const getUser = cache(async (uid: number) => {
  return await db.user.findUnique({ where: { id: uid } })
})

// 프리미티브 인수는 값 동등성 사용
getUser(1)
getUser(1)  // 캐시 히트, 캐시된 결과 반환
```

객체를 전달해야 하는 경우, 같은 참조를 전달하세요:

```typescript
const params = { uid: 1 }
getUser(params)  // 쿼리 실행
getUser(params)  // 캐시 히트 (같은 참조)
```

**Next.js 관련 참고:**

Next.js에서는 `fetch` API가 자동으로 요청 메모이제이션으로 확장됩니다. 같은 URL과 옵션으로의 요청은 단일 요청 내에서 자동으로 중복 제거되므로, `fetch` 호출에는 `React.cache()`가 필요하지 않습니다. 하지만 `React.cache()`는 다른 비동기 작업에 여전히 필수적입니다:

- 데이터베이스 쿼리 (Prisma, Drizzle 등)

- 무거운 계산

- 인증 검사

- 파일 시스템 작업

- fetch가 아닌 모든 비동기 작업

컴포넌트 트리 전체에서 이러한 작업을 중복 제거하기 위해 `React.cache()`를 사용하세요.

참조: [https://react.dev/reference/react/cache](https://react.dev/reference/react/cache)

### 3.7 논블로킹 작업에 after() 사용

**영향: MEDIUM (더 빠른 응답 시간)**

Next.js의 `after()`를 사용하여 응답이 전송된 후 실행해야 할 작업을 예약합니다. 로깅, 분석 및 기타 부수 효과가 응답을 블로킹하는 것을 방지합니다.

**잘못된 예: 응답을 블로킹**

```tsx
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // 변이 수행
  await updateDatabase(request)

  // 로깅이 응답을 블로킹
  const userAgent = request.headers.get('user-agent') || 'unknown'
  await logUserAction({ userAgent })

  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

**올바른 예: 논블로킹**

```tsx
import { after } from 'next/server'
import { headers, cookies } from 'next/headers'
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // 변이 수행
  await updateDatabase(request)

  // 응답 전송 후 로깅
  after(async () => {
    const userAgent = (await headers()).get('user-agent') || 'unknown'
    const sessionCookie = (await cookies()).get('session-id')?.value || 'anonymous'

    logUserAction({ sessionCookie, userAgent })
  })

  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

응답은 즉시 전송되고, 로깅은 백그라운드에서 수행됩니다.

**주요 사용 사례:**

- 분석 추적

- 감사 로깅

- 알림 전송

- 캐시 무효화

- 정리 작업

**중요 참고:**

- `after()`는 응답이 실패하거나 리디렉트되어도 실행됩니다

- Server Actions, Route Handlers, Server Components에서 동작합니다

참조: [https://nextjs.org/docs/app/api-reference/functions/after](https://nextjs.org/docs/app/api-reference/functions/after)

---
