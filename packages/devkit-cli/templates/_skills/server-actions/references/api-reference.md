# Server Actions API 참조 문서

## 'use server' 지시어 (Directive)

함수를 Server Action으로 표시합니다. 파일 또는 함수 본문의 첫 번째 구문이어야 합니다.

### 파일 수준 (File-level)

```tsx
// app/actions/posts.ts
'use server'

export async function createPost(formData: FormData) { /* ... */ }
export async function updatePost(id: string, formData: FormData) { /* ... */ }
export async function deletePost(id: string) { /* ... */ }
```

### 인라인 (함수 수준)

```tsx
export async function Page() {
  async function handleSubmit(formData: FormData) {
    'use server'
    await db.posts.create({ data: formData })
  }

  return <form action={handleSubmit}>...</form>
}
```

---

## 캐시 무효화 API (Cache Invalidation APIs)

### updateTag(tag: string)

**Server Actions 전용.** read-your-own-writes 의미론(자신이 쓴 데이터를 즉시 읽을 수 있음)을 갖춘 즉각적인 무효화입니다.

```tsx
'use server'
import { updateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.posts.create({ data: formData })
  updateTag('posts')  // 사용자가 즉시 최신 데이터를 봅니다
}
```

### revalidateTag(tag: string, duration?: string)

**Server Actions + Route Handlers 사용 가능.** stale-while-revalidate 패턴(오래된 데이터를 먼저 제공하고 백그라운드에서 갱신)입니다.

```tsx
'use server'
import { revalidateTag } from 'next/cache'

export async function trackView(postId: string) {
  await db.posts.update({ where: { id: postId }, data: { views: { increment: 1 } } })
  revalidateTag(`post-${postId}`, 'max')  // 백그라운드에서 갱신, 오래된 데이터를 먼저 제공
}
```

### revalidatePath(path: string, type?: 'page' | 'layout')

**Server Actions + Route Handlers 사용 가능.** 경로 기반 무효화입니다.

```tsx
'use server'
import { revalidatePath } from 'next/cache'

export async function updateSettings(formData: FormData) {
  await db.settings.update({ data: formData })
  revalidatePath('/settings')       // 특정 페이지
  revalidatePath('/dashboard', 'layout')  // 레이아웃 및 모든 하위 페이지
}
```

### refresh()

**Server Actions 전용.** 캐시되지 않은 데이터에 대해 클라이언트 라우터 새로고침을 트리거합니다.

```tsx
'use server'
import { refresh } from 'next/cache'

export async function updateTheme(theme: string) {
  const cookieStore = await cookies()
  cookieStore.set('theme', theme)
  refresh()  // 클라이언트에서 업데이트된 테마가 반영됩니다
}
```

### redirect(path: string, type?: RedirectType)

변경(mutation) 후 페이지를 이동합니다. try/catch 블록 외부에서 호출해야 합니다 (내부적으로 throw를 사용합니다).

```tsx
'use server'
import { redirect } from 'next/navigation'
import { updateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({ data: formData })
  updateTag('posts')
  redirect(`/posts/${post.id}`)  // 새 게시물로 이동
}
```

---

## 무효화 결정 트리 (Invalidation Decision Tree)

```
변경(Mutation)이 완료되었습니다. 어떻게 무효화할까요?

Server Action인가요?
├── 예 → 즉각적인 일관성이 필요한가요?
│   ├── 예 → updateTag('tag')
│   └── 아니오 → revalidateTag('tag')
└── 아니오 (Route Handler) → revalidateTag('tag')

캐시되지 않은 데이터(쿠키 등)를 UI에 반영해야 하나요?
├── 예 → refresh()
└── 아니오 → updateTag/revalidateTag로 충분합니다

사용자를 새 페이지로 이동시켜야 하나요?
├── 예 → redirect('/path')
└── 아니오 → 결과를 클라이언트에 반환
```

---

## Server Actions용 React Hooks

### useActionState

폼 상태와 대기(pending) 상태를 관리합니다:

```tsx
'use client'
import { useActionState } from 'react'

const [state, formAction, isPending] = useActionState(serverAction, initialState)
```

| 매개변수 | 타입 | 설명 |
|-----------|------|-------------|
| `state` | `T` | 현재 액션 결과 |
| `formAction` | `(formData: FormData) => void` | `<form action>`에 사용할 래핑된 액션 |
| `isPending` | `boolean` | 액션이 진행 중인지 여부 |

### useOptimistic

서버 확인 전에 UI를 낙관적으로 업데이트합니다:

```tsx
'use client'
import { useOptimistic } from 'react'

const [optimisticItems, addOptimistic] = useOptimistic(
  items,
  (state, newItem) => [...state, { ...newItem, pending: true }]
)
```

### useFormStatus

자식 컴포넌트에서 폼 제출 상태에 접근합니다:

```tsx
'use client'
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()
  return <button disabled={pending}>{pending ? 'Saving...' : 'Save'}</button>
}
```

**중요**: `<form>` 내부에서 렌더링되어야 합니다. 폼을 렌더링하는 동일한 컴포넌트에서는 사용할 수 없습니다.

### useTransition

Server Action 호출을 비차단(non-blocking) 업데이트로 래핑합니다:

```tsx
'use client'
import { useTransition } from 'react'

function DeleteButton({ id, deleteAction }: { id: string; deleteAction: (id: string) => Promise<void> }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => deleteAction(id))}
    >
      {isPending ? 'Deleting...' : 'Delete'}
    </button>
  )
}
```

---

## Server Action과 Route Handler 비교

| 기능 | Server Action | Route Handler |
|---------|--------------|---------------|
| 용도 | 변경 작업 (생성, 수정, 삭제) | Webhooks, REST API, 외부 서비스 |
| HTTP 메서드 | POST (자동) | GET, POST, PUT, PATCH, DELETE |
| Progressive Enhancement (점진적 향상) | 작동함 (JS 없이도 가능) | JS 필요 |
| `updateTag()` | 사용 가능 | 사용 불가 (`revalidateTag()` 사용) |
| `refresh()` | 사용 가능 | 사용 불가 (오류 발생) |
| `redirect()` | 사용 가능 | 사용 가능 |
| `cookies()` set | 사용 가능 | 사용 가능 |
| Streaming 응답 | 불가 | 가능 |
| 커스텀 상태 코드 | 불가 | 가능 |
| CORS 헤더 | 불가 | 가능 |

---

## 직렬화 규칙 (Serialization Rules)

Server Action의 인수와 반환 값은 직렬화 가능해야 합니다:

| 직렬화 가능 | 직렬화 불가능 |
|-----------------|---------------------|
| Primitives (string, number, boolean) | Functions |
| 일반 객체 (Plain objects) | Class 인스턴스 |
| Arrays | Map, Set |
| Date | Symbol |
| FormData | DOM 노드 |
| null, undefined | Streams |
| Server Actions (props로 전달) | RegExp |

---

## 공식 문서

- [데이터 업데이트 (Server Actions)](https://nextjs.org/docs/app/getting-started/updating-data)
- ['use server' 지시어](https://nextjs.org/docs/app/api-reference/directives/use-server)
- [updateTag](https://nextjs.org/docs/app/api-reference/functions/updateTag)
- [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- [redirect](https://nextjs.org/docs/app/api-reference/functions/redirect)
- [refresh](https://nextjs.org/docs/app/api-reference/functions/refresh)
- [cookies](https://nextjs.org/docs/app/api-reference/functions/cookies)

### React API

- [useActionState](https://react.dev/reference/react/useActionState)
- [useOptimistic](https://react.dev/reference/react/useOptimistic)
- [useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
