---
title: 안정적인 콜백 Ref를 위한 useEffectEvent
impact: LOW
impactDescription: effect 재실행 방지
tags: advanced, hooks, useEffectEvent, refs, optimization
---

## 안정적인 콜백 Ref를 위한 useEffectEvent

의존성 배열에 추가하지 않고도 콜백에서 최신 값에 접근할 수 있습니다. 오래된 클로저를 방지하면서 effect의 재실행을 막습니다.

**잘못된 예 (콜백이 변경될 때마다 effect가 재실행됨):**

```tsx
function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => onSearch(query), 300)
    return () => clearTimeout(timeout)
  }, [query, onSearch])
}
```

**올바른 예 (React의 useEffectEvent 사용):**

```tsx
import { useEffectEvent } from 'react';

function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')
  const onSearchEvent = useEffectEvent(onSearch)

  useEffect(() => {
    const timeout = setTimeout(() => onSearchEvent(query), 300)
    return () => clearTimeout(timeout)
  }, [query])
}
```
