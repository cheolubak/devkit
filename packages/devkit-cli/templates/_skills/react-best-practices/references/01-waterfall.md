## 1. 워터폴 제거

**영향: CRITICAL**

워터폴은 성능 저하의 1순위 원인입니다. 각각의 순차적 await는 전체 네트워크 지연 시간을 추가합니다. 이를 제거하면 가장 큰 성능 향상을 얻을 수 있습니다.

### 1.1 필요할 때까지 Await 지연하기

**영향: HIGH (사용되지 않는 코드 경로의 블로킹 방지)**

`await` 연산을 실제로 사용되는 분기 내부로 이동하여, 필요하지 않은 코드 경로가 블로킹되는 것을 방지합니다.

**잘못된 예: 두 분기 모두 블로킹**

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  const userData = await fetchUserData(userId)

  if (skipProcessing) {
    // 즉시 반환하지만 여전히 userData를 기다림
    return { skipped: true }
  }

  // 이 분기만 userData를 사용함
  return processUserData(userData)
}
```

**올바른 예: 필요할 때만 블로킹**

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  if (skipProcessing) {
    // 기다리지 않고 즉시 반환
    return { skipped: true }
  }

  // 필요할 때만 데이터 페칭
  const userData = await fetchUserData(userId)
  return processUserData(userData)
}
```

**또 다른 예: 조기 반환 최적화**

```typescript
// 잘못된 예: 항상 권한을 가져옴
async function updateResource(resourceId: string, userId: string) {
  const permissions = await fetchPermissions(userId)
  const resource = await getResource(resourceId)

  if (!resource) {
    return { error: 'Not found' }
  }

  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }

  return await updateResourceData(resource, permissions)
}

// 올바른 예: 필요할 때만 가져옴
async function updateResource(resourceId: string, userId: string) {
  const resource = await getResource(resourceId)

  if (!resource) {
    return { error: 'Not found' }
  }

  const permissions = await fetchPermissions(userId)

  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }

  return await updateResourceData(resource, permissions)
}
```

이 최적화는 건너뛰는 분기가 자주 실행되거나, 지연된 작업이 비용이 큰 경우에 특히 유용합니다.

### 1.2 의존성 기반 병렬화

**영향: CRITICAL (2~10배 개선)**

부분적 의존성이 있는 작업에는 `better-all`을 사용하여 병렬성을 극대화합니다. 각 작업을 가능한 가장 빠른 시점에 자동으로 시작합니다.

**잘못된 예: profile이 config를 불필요하게 기다림**

```typescript
const [user, config] = await Promise.all([
  fetchUser(),
  fetchConfig()
])
const profile = await fetchProfile(user.id)
```

**올바른 예: config과 profile이 병렬로 실행됨**

```typescript
import { all } from 'better-all'

const { user, config, profile } = await all({
  async user() { return fetchUser() },
  async config() { return fetchConfig() },
  async profile() {
    return fetchProfile((await this.$.user).id)
  }
})
```

참조: [https://github.com/shuding/better-all](https://github.com/shuding/better-all)

### 1.3 API 라우트에서 워터폴 체인 방지

**영향: CRITICAL (2~10배 개선)**

API 라우트와 Server Actions에서 독립적인 작업은 await하지 않더라도 즉시 시작합니다.

**잘못된 예: config이 auth를 기다리고, data가 둘 다 기다림**

```typescript
export async function GET(request: Request) {
  const session = await auth()
  const config = await fetchConfig()
  const data = await fetchData(session.user.id)
  return Response.json({ data, config })
}
```

**올바른 예: auth와 config이 즉시 시작됨**

```typescript
export async function GET(request: Request) {
  const sessionPromise = auth()
  const configPromise = fetchConfig()
  const session = await sessionPromise
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id)
  ])
  return Response.json({ data, config })
}
```

더 복잡한 의존성 체인이 있는 작업에는 `better-all`을 사용하여 자동으로 병렬성을 극대화할 수 있습니다 (의존성 기반 병렬화 참조).

### 1.4 독립 작업에 Promise.all() 사용

**영향: CRITICAL (2~10배 개선)**

비동기 작업 간에 상호 의존성이 없는 경우, `Promise.all()`을 사용하여 동시에 실행합니다.

**잘못된 예: 순차 실행, 3회 왕복**

```typescript
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()
```

**올바른 예: 병렬 실행, 1회 왕복**

```typescript
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```

### 1.5 전략적 Suspense 경계

**영향: HIGH (더 빠른 초기 페인트)**

비동기 컴포넌트에서 JSX를 반환하기 전에 데이터를 기다리는 대신, Suspense 경계를 사용하여 데이터가 로드되는 동안 래퍼 UI를 더 빨리 표시합니다.

**잘못된 예: 데이터 페칭에 의해 래퍼가 블로킹됨**

```tsx
async function Page() {
  const data = await fetchData() // 전체 페이지를 블로킹

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <DataDisplay data={data} />
      </div>
      <div>Footer</div>
    </div>
  )
}
```

중간 섹션만 데이터가 필요한데도 전체 레이아웃이 데이터를 기다립니다.

**올바른 예: 래퍼가 즉시 표시되고, 데이터가 스트리밍됨**

```tsx
function Page() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <Suspense fallback={<Skeleton />}>
          <DataDisplay />
        </Suspense>
      </div>
      <div>Footer</div>
    </div>
  )
}

async function DataDisplay() {
  const data = await fetchData() // 이 컴포넌트만 블로킹
  return <div>{data.content}</div>
}
```

Sidebar, Header, Footer는 즉시 렌더링됩니다. DataDisplay만 데이터를 기다립니다.

**대안: 컴포넌트 간 promise 공유**

```tsx
function Page() {
  // 페칭을 즉시 시작하되, await하지 않음
  const dataPromise = fetchData()

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay dataPromise={dataPromise} />
        <DataSummary dataPromise={dataPromise} />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

function DataDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // promise를 언래핑
  return <div>{data.content}</div>
}

function DataSummary({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // 같은 promise를 재사용
  return <div>{data.summary}</div>
}
```

두 컴포넌트가 같은 promise를 공유하므로, 페칭은 한 번만 발생합니다. 레이아웃은 즉시 렌더링되고 두 컴포넌트는 함께 기다립니다.

**이 패턴을 사용하지 말아야 할 때:**

- 레이아웃 결정에 필요한 핵심 데이터 (위치에 영향)

- 스크롤 없이 보이는 영역의 SEO 핵심 콘텐츠

- Suspense 오버헤드가 가치 없는 작고 빠른 쿼리

- 레이아웃 시프트를 피하고 싶을 때 (로딩 -> 콘텐츠 전환)

**트레이드오프:** 더 빠른 초기 페인트 vs 잠재적 레이아웃 시프트. UX 우선순위에 따라 선택하세요.

---
