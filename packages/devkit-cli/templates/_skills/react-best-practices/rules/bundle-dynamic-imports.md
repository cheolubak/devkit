---
title: 무거운 컴포넌트의 동적 임포트
impact: CRITICAL
impactDescription: TTI와 LCP에 직접적인 영향
tags: bundle, dynamic-import, code-splitting, next-dynamic
---

## 무거운 컴포넌트의 동적 임포트

`next/dynamic`을 사용하여 초기 렌더링에 필요하지 않은 대용량 컴포넌트를 지연 로딩합니다.

**잘못된 예 (Monaco가 메인 청크와 함께 번들됨 ~300KB):**

```tsx
import { MonacoEditor } from './monaco-editor'

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

**올바른 예 (Monaco가 필요할 때 로드):**

```tsx
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('./monaco-editor').then(m => m.MonacoEditor),
  { ssr: false }
)

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```
