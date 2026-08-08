---
title: 이벤트 핸들러를 Ref에 저장하기
impact: LOW
impactDescription: 안정적인 구독
tags: advanced, hooks, refs, event-handlers, optimization
---

## 이벤트 핸들러를 Ref에 저장하기

콜백 변경 시 재구독하지 않아야 하는 effect에서 사용되는 콜백을 ref에 저장합니다.

**잘못된 예 (매 렌더링마다 재구독):**

```tsx
function useWindowEvent(event: string, handler: (e) => void) {
  useEffect(() => {
    window.addEventListener(event, handler)
    return () => window.removeEventListener(event, handler)
  }, [event, handler])
}
```

**올바른 예 (안정적인 구독):**

```tsx
function useWindowEvent(event: string, handler: (e) => void) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    const listener = (e) => handlerRef.current(e)
    window.addEventListener(event, listener)
    return () => window.removeEventListener(event, listener)
  }, [event])
}
```

**대안: 최신 React를 사용 중이라면 `useEffectEvent` 사용:**

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

`useEffectEvent`는 동일한 패턴에 대해 더 깔끔한 API를 제공합니다: 항상 최신 버전의 핸들러를 호출하는 안정적인 함수 참조를 생성합니다.
