---
title: 긴 목록을 위한 CSS content-visibility
impact: HIGH
impactDescription: 더 빠른 초기 렌더링
tags: rendering, css, content-visibility, long-lists
---

## 긴 목록을 위한 CSS content-visibility

화면 밖 렌더링을 지연시키려면 `content-visibility: auto`를 적용하세요.

**CSS:**

```css
.message-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
```

**예제:**

```tsx
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="overflow-y-auto h-screen">
      {messages.map(msg => (
        <div key={msg.id} className="message-item">
          <Avatar user={msg.author} />
          <div>{msg.content}</div>
        </div>
      ))}
    </div>
  )
}
```

1000개의 메시지의 경우, 브라우저가 화면 밖의 약 990개 항목에 대한 레이아웃/페인트를 건너뜁니다 (10배 빠른 초기 렌더링).
