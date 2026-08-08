## 4. 클라이언트 사이드 데이터 페칭

**영향: MEDIUM-HIGH**

자동 중복 제거와 효율적인 데이터 페칭 패턴으로 불필요한 네트워크 요청을 줄입니다.

### 4.1 글로벌 이벤트 리스너 중복 제거

**영향: LOW (N개 컴포넌트에 하나의 리스너)**

`useSWRSubscription()`을 사용하여 컴포넌트 인스턴스 간에 글로벌 이벤트 리스너를 공유합니다.

**잘못된 예: N개 인스턴스 = N개 리스너**

```tsx
function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === key) {
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback])
}
```

`useKeyboardShortcut` 훅을 여러 번 사용하면, 각 인스턴스가 새 리스너를 등록합니다.

**올바른 예: N개 인스턴스 = 1개 리스너**

```tsx
import useSWRSubscription from 'swr/subscription'

// 키별 콜백을 추적하는 모듈 수준 Map
const keyCallbacks = new Map<string, Set<() => void>>()

function useKeyboardShortcut(key: string, callback: () => void) {
  // Map에 이 콜백 등록
  useEffect(() => {
    if (!keyCallbacks.has(key)) {
      keyCallbacks.set(key, new Set())
    }
    keyCallbacks.get(key)!.add(callback)

    return () => {
      const set = keyCallbacks.get(key)
      if (set) {
        set.delete(callback)
        if (set.size === 0) {
          keyCallbacks.delete(key)
        }
      }
    }
  }, [key, callback])

  useSWRSubscription('global-keydown', () => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && keyCallbacks.has(e.key)) {
        keyCallbacks.get(e.key)!.forEach(cb => cb())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
}

function Profile() {
  // 여러 단축키가 같은 리스너를 공유
  useKeyboardShortcut('p', () => { /* ... */ })
  useKeyboardShortcut('k', () => { /* ... */ })
  // ...
}
```

### 4.2 스크롤 성능을 위한 패시브 이벤트 리스너 사용

**영향: MEDIUM (이벤트 리스너로 인한 스크롤 지연 제거)**

터치 및 휠 이벤트 리스너에 `{ passive: true }`를 추가하여 즉각적인 스크롤을 활성화합니다. 브라우저는 보통 `preventDefault()`가 호출되는지 확인하기 위해 리스너 실행이 끝날 때까지 기다리며, 이로 인해 스크롤이 지연됩니다.

**잘못된 예:**

```typescript
useEffect(() => {
  const handleTouch = (e: TouchEvent) => console.log(e.touches[0].clientX)
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)

  document.addEventListener('touchstart', handleTouch)
  document.addEventListener('wheel', handleWheel)

  return () => {
    document.removeEventListener('touchstart', handleTouch)
    document.removeEventListener('wheel', handleWheel)
  }
}, [])
```

**올바른 예:**

```typescript
useEffect(() => {
  const handleTouch = (e: TouchEvent) => console.log(e.touches[0].clientX)
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)

  document.addEventListener('touchstart', handleTouch, { passive: true })
  document.addEventListener('wheel', handleWheel, { passive: true })

  return () => {
    document.removeEventListener('touchstart', handleTouch)
    document.removeEventListener('wheel', handleWheel)
  }
}, [])
```

**패시브를 사용할 때:** 추적/분석, 로깅, `preventDefault()`를 호출하지 않는 모든 리스너.

**패시브를 사용하지 말아야 할 때:** 커스텀 스와이프 제스처, 커스텀 줌 컨트롤 구현, 또는 `preventDefault()`가 필요한 모든 리스너.

### 4.3 자동 중복 제거를 위한 SWR 사용

**영향: MEDIUM-HIGH (자동 중복 제거)**

SWR은 컴포넌트 인스턴스 간에 요청 중복 제거, 캐싱, 재검증을 활성화합니다.

**잘못된 예: 중복 제거 없음, 각 인스턴스가 페칭**

```tsx
function UserList() {
  const [users, setUsers] = useState([])
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
  }, [])
}
```

**올바른 예: 여러 인스턴스가 하나의 요청을 공유**

```tsx
import useSWR from 'swr'

function UserList() {
  const { data: users } = useSWR('/api/users', fetcher)
}
```

**불변 데이터의 경우:**

```tsx
import { useImmutableSWR } from '@/lib/swr'

function StaticContent() {
  const { data } = useImmutableSWR('/api/config', fetcher)
}
```

**변이의 경우:**

```tsx
import { useSWRMutation } from 'swr/mutation'

function UpdateButton() {
  const { trigger } = useSWRMutation('/api/user', updateUser)
  return <button onClick={() => trigger()}>Update</button>
}
```

참조: [https://swr.vercel.app](https://swr.vercel.app)

### 4.4 localStorage 데이터 버전 관리 및 최소화

**영향: MEDIUM (스키마 충돌 방지, 저장 크기 감소)**

키에 버전 접두사를 추가하고 필요한 필드만 저장합니다. 스키마 충돌과 민감한 데이터의 우발적 저장을 방지합니다.

**잘못된 예:**

```typescript
// 버전 없음, 모든 것을 저장, 에러 처리 없음
localStorage.setItem('userConfig', JSON.stringify(fullUserObject))
const data = localStorage.getItem('userConfig')
```

**올바른 예:**

```typescript
const VERSION = 'v2'

function saveConfig(config: { theme: string; language: string }) {
  try {
    localStorage.setItem(`userConfig:${VERSION}`, JSON.stringify(config))
  } catch {
    // 시크릿/프라이빗 브라우징, 용량 초과, 비활성화 시 예외 발생
  }
}

function loadConfig() {
  try {
    const data = localStorage.getItem(`userConfig:${VERSION}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

// v1에서 v2로 마이그레이션
function migrate() {
  try {
    const v1 = localStorage.getItem('userConfig:v1')
    if (v1) {
      const old = JSON.parse(v1)
      saveConfig({ theme: old.darkMode ? 'dark' : 'light', language: old.lang })
      localStorage.removeItem('userConfig:v1')
    }
  } catch {}
}
```

**서버 응답에서 최소 필드만 저장:**

```typescript
// User 객체에 20개 이상의 필드가 있지만, UI에 필요한 것만 저장
function cachePrefs(user: FullUser) {
  try {
    localStorage.setItem('prefs:v1', JSON.stringify({
      theme: user.preferences.theme,
      notifications: user.preferences.notifications
    }))
  } catch {}
}
```

**항상 try-catch로 감싸세요:** `getItem()`과 `setItem()`은 시크릿/프라이빗 브라우징(Safari, Firefox), 용량 초과, 비활성화 시 예외를 발생시킵니다.

**장점:** 버전 관리를 통한 스키마 진화, 저장 크기 감소, 토큰/PII/내부 플래그 저장 방지.

---
