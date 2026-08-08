---
title: 표시/숨김에 Activity 컴포넌트 사용
impact: MEDIUM
impactDescription: 상태/DOM을 보존합니다
tags: rendering, activity, visibility, state-preservation
---

## 표시/숨김에 Activity 컴포넌트 사용

자주 가시성이 전환되는 비용이 높은 컴포넌트의 상태/DOM을 보존하려면 React의 `<Activity>`를 사용하세요.

**사용법:**

```tsx
import { Activity } from 'react'

function Dropdown({ isOpen }: Props) {
  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ExpensiveMenu />
    </Activity>
  )
}
```

비용이 높은 재렌더링과 상태 손실을 방지합니다.
