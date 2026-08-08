## 8. 고급 패턴

**영향: LOW**

세심한 구현이 필요한 특정 경우를 위한 고급 패턴입니다.

### 8.1 Ref에 이벤트 핸들러 저장

**영향: LOW (안정적인 구독)**

콜백 변경 시 다시 구독하지 않아야 하는 effect에서 사용되는 콜백을 ref에 저장합니다.

**잘못된 예: 매 렌더마다 다시 구독**

```tsx
function useWindowEvent(event: string, handler: (e) => void) {
  useEffect(() => {
    window.addEventListener(event, handler)
    return () => window.removeEventListener(event, handler)
  }, [event, handler])
}
```

**올바른 예: 안정적인 구독**

```tsx
import { useEffectEvent } from 'react'

function useWindowEvent(event: string, handler: (e) => void) {
  const onEvent = useEffectEvent(handler)

  useEffect(() => {
    window.addEventListener(event, onEvent)
    return () => window.removeEventListener(event, onEvent)
  }, [event])
}
```

**대안: 최신 React를 사용 중이라면 `useEffectEvent` 사용:**

`useEffectEvent`는 같은 패턴에 대해 더 깔끔한 API를 제공합니다: 항상 핸들러의 최신 버전을 호출하는 안정적인 함수 참조를 생성합니다.

### 8.2 안정적 콜백 참조를 위한 useLatest

**영향: LOW (effect 재실행 방지)**

의존성 배열에 추가하지 않고 콜백에서 최신 값에 접근합니다. 오래된 클로저를 방지하면서 effect 재실행을 방지합니다.

**구현:**

```typescript
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
```

**잘못된 예: 콜백 변경마다 effect가 재실행**

```tsx
function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => onSearch(query), 300)
    return () => clearTimeout(timeout)
  }, [query, onSearch])
}
```

**올바른 예: 안정적인 effect, 최신 콜백**

```tsx
function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')
  const onSearchRef = useLatest(onSearch)

  useEffect(() => {
    const timeout = setTimeout(() => onSearchRef.current(query), 300)
    return () => clearTimeout(timeout)
  }, [query])
}
```

---

## 참고 자료

1. [https://react.dev](https://react.dev)
2. [https://nextjs.org](https://nextjs.org)
3. [https://swr.vercel.app](https://swr.vercel.app)
4. [https://github.com/shuding/better-all](https://github.com/shuding/better-all)
5. [https://github.com/isaacs/node-lru-cache](https://github.com/isaacs/node-lru-cache)
6. [https://vercel.com/blog/how-we-optimized-package-imports-in-next-js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
7. [https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
