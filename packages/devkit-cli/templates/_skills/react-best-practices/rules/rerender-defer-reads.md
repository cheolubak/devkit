---
title: 상태 읽기를 사용 시점으로 지연
impact: MEDIUM
impactDescription: 불필요한 구독 방지
tags: rerender, searchParams, localStorage, optimization
---

## 상태 읽기를 사용 시점으로 지연

콜백 내부에서만 읽는 동적 상태(searchParams, localStorage)를 구독하지 마세요.

**잘못된 예 (모든 searchParams 변경을 구독):**

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

**올바른 예 (필요할 때 읽기, 구독 없음):**

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
