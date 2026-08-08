---
title: 비핵심 서드파티 라이브러리 지연 로딩
impact: MEDIUM
impactDescription: 하이드레이션 후 로드
tags: bundle, third-party, analytics, defer
---

## 비핵심 서드파티 라이브러리 지연 로딩

애널리틱스, 로깅, 에러 추적은 사용자 인터랙션을 차단하지 않습니다. 하이드레이션 후에 로드하세요.

**잘못된 예 (초기 번들을 차단):**

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**올바른 예 (하이드레이션 후 로드):**

```tsx
import dynamic from 'next/dynamic'

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
)

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```
