---
title: 스크롤 성능을 위한 패시브 이벤트 리스너 사용
impact: MEDIUM
impactDescription: 이벤트 리스너로 인한 스크롤 지연 제거
tags: client, event-listeners, scrolling, performance, touch, wheel
---

## 스크롤 성능을 위한 패시브 이벤트 리스너 사용

터치 및 휠 이벤트 리스너에 `{ passive: true }`를 추가하여 즉각적인 스크롤을 가능하게 합니다. 브라우저는 일반적으로 `preventDefault()` 호출 여부를 확인하기 위해 리스너가 완료될 때까지 대기하므로 스크롤 지연이 발생합니다.

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

**패시브를 사용할 때:** 추적/애널리틱스, 로깅, `preventDefault()`를 호출하지 않는 모든 리스너.

**패시브를 사용하지 말아야 할 때:** 커스텀 스와이프 제스처, 커스텀 줌 컨트롤 구현, 또는 `preventDefault()`가 필요한 모든 리스너.
