## 5. 리렌더 최적화

**영향: MEDIUM**

불필요한 리렌더를 줄이면 낭비되는 연산을 최소화하고 UI 반응성을 향상시킵니다.

### 5.1 상태 읽기를 사용 시점으로 지연

**영향: MEDIUM (불필요한 구독 방지)**

콜백 내부에서만 읽는다면 동적 상태(searchParams, localStorage)를 구독하지 마세요.

**잘못된 예: 모든 searchParams 변경을 구독**

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  const searchParams = useSearchParams()

  const handleShare = () => {
    const ref = searchParams.get('ref')
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```

**올바른 예: 요청 시 읽기, 구독 없음**

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  const handleShare = () => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```

### 5.2 메모이제이션된 컴포넌트로 추출

**영향: MEDIUM (조기 반환 가능)**

비용이 큰 작업을 메모이제이션된 컴포넌트로 추출하여 계산 전에 조기 반환을 가능하게 합니다.

**잘못된 예: 로딩 중에도 아바타를 계산**

```tsx
function Profile({ user, loading }: Props) {
  const avatar = useMemo(() => {
    const id = computeAvatarId(user)
    return <Avatar id={id} />
  }, [user])

  if (loading) return <Skeleton />
  return <div>{avatar}</div>
}
```

**올바른 예: 로딩 시 계산을 건너뜀**

```tsx
const UserAvatar = memo(function UserAvatar({ user }: { user: User }) {
  const id = useMemo(() => computeAvatarId(user), [user])
  return <Avatar id={id} />
})

function Profile({ user, loading }: Props) {
  if (loading) return <Skeleton />
  return (
    <div>
      <UserAvatar user={user} />
    </div>
  )
}
```

**참고:** 프로젝트에 [React Compiler](https://react.dev/learn/react-compiler)가 활성화되어 있다면, `memo()`와 `useMemo()`를 사용한 수동 메모이제이션이 필요하지 않습니다. 컴파일러가 자동으로 리렌더를 최적화합니다.

### 5.3 Effect 의존성 좁히기

**영향: LOW (effect 재실행 최소화)**

객체 대신 프리미티브 의존성을 지정하여 effect 재실행을 최소화합니다.

**잘못된 예: user의 모든 필드 변경 시 재실행**

```tsx
useEffect(() => {
  console.log(user.id)
}, [user])
```

**올바른 예: id가 변경될 때만 재실행**

```tsx
useEffect(() => {
  console.log(user.id)
}, [user.id])
```

**파생 상태의 경우, effect 외부에서 계산:**

```tsx
// 잘못된 예: width=767, 766, 765...에서 실행
useEffect(() => {
  if (width < 768) {
    enableMobileMode()
  }
}, [width])

// 올바른 예: boolean 전환 시에만 실행
const isMobile = width < 768
useEffect(() => {
  if (isMobile) {
    enableMobileMode()
  }
}, [isMobile])
```

### 5.4 파생 상태 구독

**영향: MEDIUM (리렌더 빈도 감소)**

리렌더 빈도를 줄이기 위해 연속 값 대신 파생된 boolean 상태를 구독합니다.

**잘못된 예: 픽셀 변경마다 리렌더**

```tsx
function Sidebar() {
  const width = useWindowWidth()  // 지속적으로 업데이트
  const isMobile = width < 768
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

**올바른 예: boolean이 변경될 때만 리렌더**

```tsx
function Sidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

### 5.5 함수형 setState 업데이트 사용

**영향: MEDIUM (오래된 클로저와 불필요한 콜백 재생성 방지)**

현재 상태 값에 기반하여 상태를 업데이트할 때, 상태 변수를 직접 참조하는 대신 setState의 함수형 업데이트 형태를 사용합니다. 이는 오래된 클로저를 방지하고, 불필요한 의존성을 제거하며, 안정적인 콜백 참조를 생성합니다.

**잘못된 예: 상태를 의존성으로 필요**

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)

  // 콜백이 items에 의존해야 하므로, items가 변경될 때마다 재생성됨
  const addItems = useCallback((newItems: Item[]) => {
    setItems([...items, ...newItems])
  }, [items])  // ❌ items 의존성으로 인한 재생성

  // 의존성을 빠뜨리면 오래된 클로저 위험
  const removeItem = useCallback((id: string) => {
    setItems(items.filter(item => item.id !== id))
  }, [])  // ❌ items 의존성 누락 - 오래된 items를 사용함!

  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

첫 번째 콜백은 `items`가 변경될 때마다 재생성되어, 자식 컴포넌트의 불필요한 리렌더를 유발할 수 있습니다. 두 번째 콜백은 오래된 클로저 버그가 있어, 항상 초기 `items` 값을 참조합니다.

**올바른 예: 안정적인 콜백, 오래된 클로저 없음**

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)

  // 안정적인 콜백, 재생성되지 않음
  const addItems = useCallback((newItems: Item[]) => {
    setItems(curr => [...curr, ...newItems])
  }, [])  // ✅ 의존성 불필요

  // 항상 최신 상태를 사용, 오래된 클로저 위험 없음
  const removeItem = useCallback((id: string) => {
    setItems(curr => curr.filter(item => item.id !== id))
  }, [])  // ✅ 안전하고 안정적

  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

**장점:**

1. **안정적인 콜백 참조** - 상태 변경 시 콜백을 재생성할 필요 없음

2. **오래된 클로저 없음** - 항상 최신 상태 값으로 작동

3. **적은 의존성** - 의존성 배열을 단순화하고 메모리 누수를 감소

4. **버그 방지** - React 클로저 버그의 가장 흔한 원인을 제거

**함수형 업데이트를 사용할 때:**

- 현재 상태 값에 의존하는 모든 setState

- 상태가 필요한 useCallback/useMemo 내부

- 상태를 참조하는 이벤트 핸들러

- 상태를 업데이트하는 비동기 작업

**직접 업데이트가 괜찮은 경우:**

- 정적 값으로 상태 설정: `setCount(0)`

- props/인수에서만 상태 설정: `setName(newName)`

- 상태가 이전 값에 의존하지 않는 경우

**참고:** 프로젝트에 [React Compiler](https://react.dev/learn/react-compiler)가 활성화되어 있다면, 컴파일러가 일부 경우를 자동으로 최적화할 수 있지만, 정확성과 오래된 클로저 버그 방지를 위해 함수형 업데이트가 여전히 권장됩니다.

### 5.6 지연 상태 초기화 사용

**영향: MEDIUM (매 렌더마다 낭비되는 계산)**

비용이 큰 초기값에는 `useState`에 함수를 전달합니다. 함수 형태가 없으면, 값이 한 번만 사용되더라도 초기화 코드가 매 렌더마다 실행됩니다.

**잘못된 예: 매 렌더마다 실행**

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // buildSearchIndex()가 초기화 후에도 매 렌더마다 실행됨
  const [searchIndex, setSearchIndex] = useState(buildSearchIndex(items))
  const [query, setQuery] = useState('')

  // query가 변경되면, buildSearchIndex가 불필요하게 다시 실행됨
  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // JSON.parse가 매 렌더마다 실행됨
  const [settings, setSettings] = useState(
    JSON.parse(localStorage.getItem('settings') || '{}')
  )

  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

**올바른 예: 한 번만 실행**

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // buildSearchIndex()가 초기 렌더 시에만 실행됨
  const [searchIndex, setSearchIndex] = useState(() => buildSearchIndex(items))
  const [query, setQuery] = useState('')

  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // JSON.parse가 초기 렌더 시에만 실행됨
  const [settings, setSettings] = useState(() => {
    const stored = localStorage.getItem('settings')
    return stored ? JSON.parse(stored) : {}
  })

  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

localStorage/sessionStorage에서 초기값을 계산할 때, 데이터 구조(인덱스, 맵)를 구축할 때, DOM에서 읽을 때, 무거운 변환을 수행할 때 지연 초기화를 사용합니다.

단순 프리미티브(`useState(0)`), 직접 참조(`useState(props.value)`), 저렴한 리터럴(`useState({})`)에는 함수 형태가 불필요합니다.

### 5.7 긴급하지 않은 업데이트에 Transitions 사용

**영향: MEDIUM (UI 반응성 유지)**

빈번하고 긴급하지 않은 상태 업데이트를 Transition으로 표시하여 UI 반응성을 유지합니다.

**잘못된 예: 스크롤할 때마다 UI 블로킹**

```tsx
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```

**올바른 예: 논블로킹 업데이트**

```tsx
import { startTransition } from 'react'

function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => {
      startTransition(() => setScrollY(window.scrollY))
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```

---
