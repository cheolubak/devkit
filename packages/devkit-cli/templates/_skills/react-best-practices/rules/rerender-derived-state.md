---
title: 파생 상태 구독
impact: MEDIUM
impactDescription: 리렌더링 빈도 감소
tags: rerender, derived-state, media-query, optimization
---

## 파생 상태 구독

리렌더링 빈도를 줄이기 위해 연속적인 값 대신 파생된 boolean 상태를 구독하세요.

**잘못된 예 (픽셀이 변경될 때마다 리렌더링):**

```tsx
function Sidebar() {
  const width = useWindowWidth()  // 지속적으로 업데이트
  const isMobile = width < 768
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

**올바른 예 (boolean이 변경될 때만 리렌더링):**

```tsx
function Sidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```
