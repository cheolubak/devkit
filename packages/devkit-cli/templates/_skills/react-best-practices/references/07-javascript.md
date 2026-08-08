## 7. JavaScript 성능

**영향: LOW-MEDIUM**

핫 경로에 대한 마이크로 최적화가 누적되면 의미 있는 개선이 됩니다.

### 7.1 DOM CSS 변경 일괄 처리

**영향: MEDIUM (리플로우/리페인트 감소)**

스타일 쓰기와 레이아웃 읽기를 인터리빙하지 마세요. 스타일 변경 사이에 레이아웃 속성(`offsetWidth`, `getBoundingClientRect()`, `getComputedStyle()` 등)을 읽으면, 브라우저가 동기 리플로우를 강제로 트리거합니다.

**잘못된 예: 인터리빙된 읽기와 쓰기가 리플로우를 강제**

```typescript
function updateElementStyles(element: HTMLElement) {
  element.style.width = '100px'
  const width = element.offsetWidth  // 리플로우 강제
  element.style.height = '200px'
  const height = element.offsetHeight  // 또 다른 리플로우 강제
}
```

**올바른 예: 쓰기를 일괄 처리한 후 한 번 읽기**

```typescript
function updateElementStyles(element: HTMLElement) {
  element.classList.add('highlighted-box')

  const { width, height } = element.getBoundingClientRect()
}
```

**더 좋은 방법: CSS 클래스 사용**

가능하면 인라인 스타일보다 CSS 클래스를 선호하세요. CSS 파일은 브라우저에 의해 캐시되고, 클래스는 관심사 분리가 더 좋으며 유지보수가 더 쉽습니다.

### 7.2 반복 조회를 위한 인덱스 맵 구축

**영향: LOW-MEDIUM (1M 연산을 2K 연산으로)**

같은 키로 여러 번 `.find()` 호출하는 경우 Map을 사용해야 합니다.

**잘못된 예 (조회당 O(n)):**

```typescript
function processOrders(orders: Order[], users: User[]) {
  return orders.map(order => ({
    ...order,
    user: users.find(u => u.id === order.userId)
  }))
}
```

**올바른 예 (조회당 O(1)):**

```typescript
function processOrders(orders: Order[], users: User[]) {
  const userById = new Map(users.map(u => [u.id, u]))

  return orders.map(order => ({
    ...order,
    user: userById.get(order.userId)
  }))
}
```

맵을 한 번 구축(O(n))한 후, 모든 조회는 O(1)입니다.

1000개 주문 x 1000명 사용자의 경우: 1M 연산 -> 2K 연산.

### 7.3 루프에서 속성 접근 캐싱

**영향: LOW-MEDIUM (조회 횟수 감소)**

핫 경로에서 객체 속성 조회를 캐싱합니다.

**잘못된 예: N회 반복마다 3번 조회**

```typescript
for (let i = 0; i < arr.length; i++) {
  process(obj.config.settings.value)
}
```

**올바른 예: 총 1번 조회**

```typescript
const value = obj.config.settings.value
const len = arr.length
for (let i = 0; i < len; i++) {
  process(value)
}
```

### 7.4 반복 함수 호출 캐싱

**영향: MEDIUM (중복 계산 방지)**

렌더 중에 같은 입력으로 같은 함수가 반복 호출될 때, 모듈 수준 Map을 사용하여 함수 결과를 캐싱합니다.

**잘못된 예: 중복 계산**

```typescript
function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // 같은 프로젝트 이름에 대해 slugify()가 100번 이상 호출됨
        const slug = slugify(project.name)

        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

**올바른 예: 캐시된 결과**

```typescript
// 모듈 수준 캐시
const slugifyCache = new Map<string, string>()

function cachedSlugify(text: string): string {
  if (slugifyCache.has(text)) {
    return slugifyCache.get(text)!
  }
  const result = slugify(text)
  slugifyCache.set(text, result)
  return result
}

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // 고유 프로젝트 이름당 한 번만 계산됨
        const slug = cachedSlugify(project.name)

        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

**단일 값 함수를 위한 더 간단한 패턴:**

```typescript
let isLoggedInCache: boolean | null = null

function isLoggedIn(): boolean {
  if (isLoggedInCache !== null) {
    return isLoggedInCache
  }

  isLoggedInCache = document.cookie.includes('auth=')
  return isLoggedInCache
}

// 인증 변경 시 캐시 초기화
function onAuthChange() {
  isLoggedInCache = null
}
```

Map(훅이 아닌)을 사용하면 유틸리티, 이벤트 핸들러 등 React 컴포넌트가 아닌 곳에서도 작동합니다.

참조: [https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)

### 7.5 Storage API 호출 캐싱

**영향: LOW-MEDIUM (비용이 큰 I/O 감소)**

`localStorage`, `sessionStorage`, `document.cookie`는 동기적이고 비용이 큽니다. 읽기를 메모리에 캐싱합니다.

**잘못된 예: 호출할 때마다 스토리지를 읽음**

```typescript
function getTheme() {
  return localStorage.getItem('theme') ?? 'light'
}
// 10번 호출 = 10번 스토리지 읽기
```

**올바른 예: Map 캐시**

```typescript
const storageCache = new Map<string, string | null>()

function getLocalStorage(key: string) {
  if (!storageCache.has(key)) {
    storageCache.set(key, localStorage.getItem(key))
  }
  return storageCache.get(key)
}

function setLocalStorage(key: string, value: string) {
  localStorage.setItem(key, value)
  storageCache.set(key, value)  // 캐시 동기화 유지
}
```

Map(훅이 아닌)을 사용하면 유틸리티, 이벤트 핸들러 등 React 컴포넌트가 아닌 곳에서도 작동합니다.

**쿠키 캐싱:**

```typescript
let cookieCache: Record<string, string> | null = null

function getCookie(name: string) {
  if (!cookieCache) {
    cookieCache = Object.fromEntries(
      document.cookie.split('; ').map(c => c.split('='))
    )
  }
  return cookieCache[name]
}
```

**중요: 외부 변경 시 무효화**

```typescript
window.addEventListener('storage', (e) => {
  if (e.key) storageCache.delete(e.key)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    storageCache.clear()
  }
})
```

스토리지가 외부에서 변경될 수 있는 경우(다른 탭, 서버 설정 쿠키), 캐시를 무효화합니다:

### 7.6 여러 배열 반복 결합

**영향: LOW-MEDIUM (반복 횟수 감소)**

여러 `.filter()` 또는 `.map()` 호출은 배열을 여러 번 반복합니다. 하나의 루프로 결합합니다.

**잘못된 예: 3회 반복**

```typescript
const admins = users.filter(u => u.isAdmin)
const testers = users.filter(u => u.isTester)
const inactive = users.filter(u => !u.isActive)
```

**올바른 예: 1회 반복**

```typescript
const admins: User[] = []
const testers: User[] = []
const inactive: User[] = []

for (const user of users) {
  if (user.isAdmin) admins.push(user)
  if (user.isTester) testers.push(user)
  if (!user.isActive) inactive.push(user)
}
```

### 7.7 배열 비교 시 조기 길이 검사

**영향: MEDIUM-HIGH (길이가 다를 때 비용이 큰 연산 방지)**

비용이 큰 연산(정렬, 깊은 동등성, 직렬화)으로 배열을 비교할 때, 먼저 길이를 검사합니다. 길이가 다르면 배열은 같을 수 없습니다.

실제 애플리케이션에서 이 최적화는 비교가 핫 경로(이벤트 핸들러, 렌더 루프)에서 실행될 때 특히 유용합니다.

**잘못된 예: 항상 비용이 큰 비교를 실행**

```typescript
function hasChanges(current: string[], original: string[]) {
  // 길이가 다를 때도 항상 정렬하고 결합
  return current.sort().join() !== original.sort().join()
}
```

`current.length`가 5이고 `original.length`가 100일 때도 두 번의 O(n log n) 정렬이 실행됩니다. 배열을 결합하고 문자열을 비교하는 오버헤드도 있습니다.

**올바른 예 (O(1) 길이 검사 먼저):**

```typescript
function hasChanges(current: string[], original: string[]) {
  // 길이가 다르면 조기 반환
  if (current.length !== original.length) {
    return true
  }
  // 길이가 같을 때만 정렬
  const currentSorted = current.toSorted()
  const originalSorted = original.toSorted()
  for (let i = 0; i < currentSorted.length; i++) {
    if (currentSorted[i] !== originalSorted[i]) {
      return true
    }
  }
  return false
}
```

이 새로운 접근 방식이 더 효율적인 이유:

- 길이가 다를 때 정렬과 결합의 오버헤드를 방지

- 결합된 문자열의 메모리 소비를 방지 (특히 큰 배열에서 중요)

- 원본 배열의 변이를 방지

- 차이가 발견되면 조기 반환

### 7.8 함수에서 조기 반환

**영향: LOW-MEDIUM (불필요한 계산 방지)**

결과가 결정되면 조기에 반환하여 불필요한 처리를 건너뜁니다.

**잘못된 예: 답을 찾은 후에도 모든 항목을 처리**

```typescript
function validateUsers(users: User[]) {
  let hasError = false
  let errorMessage = ''

  for (const user of users) {
    if (!user.email) {
      hasError = true
      errorMessage = 'Email required'
    }
    if (!user.name) {
      hasError = true
      errorMessage = 'Name required'
    }
    // 에러를 찾은 후에도 계속 모든 사용자를 검사
  }

  return hasError ? { valid: false, error: errorMessage } : { valid: true }
}
```

**올바른 예: 첫 번째 에러에서 즉시 반환**

```typescript
function validateUsers(users: User[]) {
  for (const user of users) {
    if (!user.email) {
      return { valid: false, error: 'Email required' }
    }
    if (!user.name) {
      return { valid: false, error: 'Name required' }
    }
  }

  return { valid: true }
}
```

### 7.9 RegExp 생성 호이스팅

**영향: LOW-MEDIUM (재생성 방지)**

렌더 내부에서 RegExp를 생성하지 마세요. 모듈 스코프로 호이스팅하거나 `useMemo()`로 메모이제이션합니다.

**잘못된 예: 매 렌더마다 새 RegExp**

```tsx
function Highlighter({ text, query }: Props) {
  const regex = new RegExp(`(${query})`, 'gi')
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

**올바른 예: 메모이제이션 또는 호이스팅**

```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Highlighter({ text, query }: Props) {
  const regex = useMemo(
    () => new RegExp(`(${escapeRegex(query)})`, 'gi'),
    [query]
  )
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

**경고: 전역 정규식은 가변 상태를 가짐**

```typescript
const regex = /foo/g
regex.test('foo')  // true, lastIndex = 3
regex.test('foo')  // false, lastIndex = 0
```

전역 정규식(`/g`)은 가변 `lastIndex` 상태를 가집니다:

### 7.10 정렬 대신 루프로 Min/Max 찾기

**영향: LOW (O(n log n) 대신 O(n))**

가장 작거나 큰 요소를 찾는 데는 배열을 한 번만 순회하면 됩니다. 정렬은 낭비적이고 느립니다.

**잘못된 예 (O(n log n) - 최신 항목을 찾기 위해 정렬):**

```typescript
interface Project {
  id: string
  name: string
  updatedAt: number
}

function getLatestProject(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted[0]
}
```

최대값을 찾기 위해 전체 배열을 정렬합니다.

**잘못된 예 (O(n log n) - 가장 오래된 것과 최신 것을 위해 정렬):**

```typescript
function getOldestAndNewest(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => a.updatedAt - b.updatedAt)
  return { oldest: sorted[0], newest: sorted[sorted.length - 1] }
}
```

min/max만 필요할 때 여전히 불필요하게 정렬합니다.

**올바른 예 (O(n) - 단일 루프):**

```typescript
function getLatestProject(projects: Project[]) {
  if (projects.length === 0) return null

  let latest = projects[0]

  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt > latest.updatedAt) {
      latest = projects[i]
    }
  }

  return latest
}

function getOldestAndNewest(projects: Project[]) {
  if (projects.length === 0) return { oldest: null, newest: null }

  let oldest = projects[0]
  let newest = projects[0]

  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt < oldest.updatedAt) oldest = projects[i]
    if (projects[i].updatedAt > newest.updatedAt) newest = projects[i]
  }

  return { oldest, newest }
}
```

배열을 한 번 순회, 복사 없음, 정렬 없음.

**대안: 작은 배열에 Math.min/Math.max**

```typescript
const numbers = [5, 2, 8, 1, 9]
const min = Math.min(...numbers)
const max = Math.max(...numbers)
```

이것은 작은 배열에서는 동작하지만, 스프레드 연산자 제한으로 인해 매우 큰 배열에서는 느리거나 에러를 발생시킬 수 있습니다. 최대 배열 길이는 Chrome 143에서 약 124000, Safari 18에서 약 638000입니다; 정확한 숫자는 다를 수 있습니다 - [피들](https://jsfiddle.net/qw1jabsx/4/)을 참조하세요. 안정성을 위해 루프 접근 방식을 사용하세요.

### 7.11 O(1) 조회를 위한 Set/Map 사용

**영향: LOW-MEDIUM (O(n)에서 O(1)로)**

반복 멤버십 검사를 위해 배열을 Set/Map으로 변환합니다.

**잘못된 예 (검사당 O(n)):**

```typescript
const allowedIds = ['a', 'b', 'c', ...]
items.filter(item => allowedIds.includes(item.id))
```

**올바른 예 (검사당 O(1)):**

```typescript
const allowedIds = new Set(['a', 'b', 'c', ...])
items.filter(item => allowedIds.has(item.id))
```

### 7.12 불변성을 위해 sort() 대신 toSorted() 사용

**영향: MEDIUM-HIGH (React 상태의 변이 버그 방지)**

`.sort()`는 배열을 원본에서 직접 변이시키며, React 상태와 props에 버그를 유발할 수 있습니다. `.toSorted()`를 사용하여 변이 없이 새로운 정렬된 배열을 생성합니다.

**잘못된 예: 원본 배열을 변이**

```typescript
function UserList({ users }: { users: User[] }) {
  // users prop 배열을 변이시킴!
  const sorted = useMemo(
    () => users.sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

**올바른 예: 새 배열을 생성**

```typescript
function UserList({ users }: { users: User[] }) {
  // 새 정렬된 배열을 생성, 원본은 변경되지 않음
  const sorted = useMemo(
    () => users.toSorted((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

**React에서 이것이 중요한 이유:**

1. Props/상태 변이는 React의 불변성 모델을 위반 - React는 props와 상태가 읽기 전용으로 취급되기를 기대

2. 오래된 클로저 버그 유발 - 클로저(콜백, effect) 내에서 배열을 변이시키면 예상치 못한 동작이 발생할 수 있음

**브라우저 지원: 이전 브라우저를 위한 폴백**

```typescript
// 이전 브라우저를 위한 폴백
const sorted = [...items].sort((a, b) => a.value - b.value)
```

`.toSorted()`는 모든 최신 브라우저에서 사용 가능합니다(Chrome 110+, Safari 16+, Firefox 115+, Node.js 20+). 이전 환경에서는 스프레드 연산자를 사용하세요:

**기타 불변 배열 메서드:**

- `.toSorted()` - 불변 정렬

- `.toReversed()` - 불변 역순

- `.toSpliced()` - 불변 splice

- `.with()` - 불변 요소 교체

---
