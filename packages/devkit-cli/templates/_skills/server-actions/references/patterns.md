# Server Actions 패턴 및 레시피

## 패턴 1: Zod 유효성 검사를 활용한 기본 CRUD

```tsx
// app/actions/posts.ts
'use server'

import { z } from 'zod'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  categoryId: z.uuid('Invalid category'),
})

const updatePostSchema = createPostSchema.partial().extend({
  id: z.uuid(),
})

// 생성 (CREATE)
export async function createPost(formData: FormData) {
  const result = createPostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    categoryId: formData.get('categoryId'),
  })

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  const post = await db.posts.create({ data: result.data })
  updateTag('posts')
  redirect(`/posts/${post.id}`)
}

// 수정 (UPDATE)
export async function updatePost(formData: FormData) {
  const result = updatePostSchema.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
    content: formData.get('content'),
    categoryId: formData.get('categoryId'),
  })

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  const { id, ...data } = result.data
  await db.posts.update({ where: { id }, data })
  updateTag(`post-${id}`)
  updateTag('posts')
}

// 삭제 (DELETE)
export async function deletePost(id: string) {
  const parsed = z.uuid().safeParse(id)
  if (!parsed.success) return { error: 'Invalid ID' }

  await db.posts.delete({ where: { id: parsed.data } })
  updateTag('posts')
  redirect('/posts')
}
```

---

## 패턴 2: 반환 타입 규칙 (Return Type Convention)

모든 액션에 대해 일관된 결과 타입을 사용합니다:

```tsx
// lib/action-types.ts
type ActionResult<T = void> =
  | { data: T; error?: never }
  | { data?: never; error: string | Record<string, string[]> }

// 사용법
'use server'

export async function updateProfile(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const result = profileSchema.safeParse(Object.fromEntries(formData))

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  try {
    const profile = await db.profiles.update({ data: result.data })
    updateTag('profile')
    return { data: { id: profile.id } }
  } catch {
    return { error: 'Failed to update profile' }
  }
}
```

---

## 패턴 3: useActionState와 폼 연동

```tsx
// app/actions/contact.ts
'use server'

import { z } from 'zod'

const contactSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  message: z.string().min(10).max(1000),
})

type ContactState = {
  error?: Record<string, string[]>
  success?: boolean
} | null

export async function submitContact(
  _prevState: ContactState,
  formData: FormData
): Promise<ContactState> {
  const result = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
  })

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  await sendEmail(result.data)
  return { success: true }
}

// components/contact-form.tsx
'use client'

import { useActionState } from 'react'
import { submitContact } from '@/app/actions/contact'

export function ContactForm() {
  const [state, action, isPending] = useActionState(submitContact, null)

  if (state?.success) {
    return <p>Message sent successfully!</p>
  }

  return (
    <form action={action}>
      <div>
        <input name="name" placeholder="Name" />
        {state?.error?.name && <p className="text-destructive text-sm">{state.error.name[0]}</p>}
      </div>

      <div>
        <input name="email" type="email" placeholder="Email" />
        {state?.error?.email && <p className="text-destructive text-sm">{state.error.email[0]}</p>}
      </div>

      <div>
        <textarea name="message" placeholder="Message" />
        {state?.error?.message && <p className="text-destructive text-sm">{state.error.message[0]}</p>}
      </div>

      <button type="submit" disabled={isPending}>
        {isPending ? 'Sending...' : 'Send'}
      </button>
    </form>
  )
}
```

---

## 패턴 4: 낙관적 업데이트 (Optimistic Updates)

```tsx
'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleLike } from '@/app/actions/likes'

export function LikeButton({ postId, initialLiked, initialCount }: {
  postId: string
  initialLiked: boolean
  initialCount: number
}) {
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(
    { liked: initialLiked, count: initialCount },
    (state, newLiked: boolean) => ({
      liked: newLiked,
      count: state.count + (newLiked ? 1 : -1),
    })
  )

  function handleClick() {
    startTransition(async () => {
      setOptimistic(!optimistic.liked)
      await toggleLike(postId)
    })
  }

  return (
    <button onClick={handleClick} disabled={isPending}>
      {optimistic.liked ? '❤️' : '🤍'} {optimistic.count}
    </button>
  )
}
```

---

## 패턴 5: 유효성 검사를 포함한 파일 업로드

```tsx
'use server'

import { z } from 'zod'
import { updateTag } from 'next/cache'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const uploadSchema = z.object({
  file: z.instanceof(File)
    .refine(f => f.size > 0, 'File is required')
    .refine(f => f.size <= MAX_FILE_SIZE, 'Max file size is 5MB')
    .refine(f => ACCEPTED_TYPES.includes(f.type), 'Only .jpg, .png, .webp accepted'),
  alt: z.string().min(1).max(200).optional(),
})

export async function uploadImage(formData: FormData) {
  const result = uploadSchema.safeParse({
    file: formData.get('file'),
    alt: formData.get('alt'),
  })

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  const { file, alt } = result.data
  const buffer = Buffer.from(await file.arrayBuffer())

  // 스토리지에 업로드 (S3, Cloudflare R2 등)
  const url = await storage.upload(buffer, {
    contentType: file.type,
    filename: file.name,
  })

  await db.images.create({ data: { url, alt: alt ?? file.name } })
  updateTag('images')

  return { data: { url } }
}
```

---

## 패턴 6: Progressive Enhancement를 적용한 다단계 폼

```tsx
// Server Component 페이지
export default function CheckoutPage() {
  return (
    <form action={processCheckout}>
      {/* 1단계: 배송 정보 */}
      <fieldset>
        <legend>Shipping</legend>
        <input name="address" required />
        <input name="city" required />
        <input name="zip" required />
      </fieldset>

      {/* 2단계: 결제 정보 */}
      <fieldset>
        <legend>Payment</legend>
        <input name="cardNumber" required />
        <input name="expiry" required />
        <input name="cvv" required />
      </fieldset>

      <SubmitButton />
    </form>
  )
}

// 상태를 표시하는 클라이언트 제출 버튼
'use client'
import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Processing...' : 'Place Order'}
    </button>
  )
}
```

---

## 패턴 7: 일괄 작업 (Batch Operations)

```tsx
'use server'

import { z } from 'zod'
import { updateTag } from 'next/cache'

const batchDeleteSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
})

export async function batchDeletePosts(ids: string[]) {
  const result = batchDeleteSchema.safeParse({ ids })

  if (!result.success) {
    return { error: 'Invalid selection' }
  }

  await db.posts.deleteMany({
    where: { id: { in: result.data.ids } },
  })

  updateTag('posts')
  return { data: { deleted: result.data.ids.length } }
}
```

---

## 패턴 8: Cookie 기반 변경 (Cookie-based Mutations)

```tsx
'use server'

import { cookies } from 'next/headers'
import { refresh } from 'next/cache'

export async function setTheme(theme: 'light' | 'dark' | 'system') {
  const cookieStore = await cookies()
  cookieStore.set('theme', theme, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1년
  })
  refresh()
}

export async function setLocale(locale: string) {
  const cookieStore = await cookies()
  cookieStore.set('locale', locale)
  refresh()
}
```

---

## 패턴 9: Toast 피드백을 활용한 Server Action

```tsx
'use client'

import { toast } from 'sonner'
import { useTransition } from 'react'

export function DeleteButton({ id, deleteAction }: {
  id: string
  deleteAction: (id: string) => Promise<{ error?: string }>
}) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAction(id)
      if (result?.error) {
        toast.error('Delete failed', { description: result.error })
      } else {
        toast.success('Deleted successfully')
      }
    })
  }

  return (
    <button onClick={handleDelete} disabled={isPending}>
      {isPending ? 'Deleting...' : 'Delete'}
    </button>
  )
}
```

---

## 안티 패턴 (Anti-Patterns)

### 데이터 조회에 Server Action 사용하기 (잘못된 방법)

```tsx
// 잘못된 방법: Server Action에서 데이터를 읽는 것
'use server'
export async function getUsers() {
  return await db.users.findMany()
}

// 올바른 방법: Server Component에서 읽기
export default async function Page() {
  const users = await db.users.findMany()
  return <UserList users={users} />
}
```

### 유효성 검사 없음 (잘못된 방법)

```tsx
// 잘못된 방법: 클라이언트 입력을 신뢰하는 것
'use server'
export async function createUser(formData: FormData) {
  await db.users.create({
    data: {
      name: formData.get('name') as string,  // 안전하지 않음!
      role: formData.get('role') as string,   // 조작될 수 있음!
    }
  })
}

// 올바른 방법: 항상 유효성 검사를 수행
'use server'
const schema = z.object({
  name: z.string().min(1).max(100),
  role: z.enum(['user', 'editor']),  // 허용 값을 제한
})

export async function createUser(formData: FormData) {
  const result = schema.safeParse(Object.fromEntries(formData))
  if (!result.success) return { error: result.error.flatten().fieldErrors }
  await db.users.create({ data: result.data })
  updateTag('users')
}
```

### 캐시 무효화 누락 (잘못된 방법)

```tsx
// 잘못된 방법: 변경 후 무효화를 하지 않는 것
'use server'
export async function updatePost(id: string, formData: FormData) {
  await db.posts.update({ where: { id }, data: formData })
  // 사용자가 오래된 데이터를 보게 됩니다!
}

// 올바른 방법: 항상 무효화를 수행
'use server'
export async function updatePost(id: string, formData: FormData) {
  await db.posts.update({ where: { id }, data: formData })
  updateTag(`post-${id}`)
  updateTag('posts')
}
```

### Server Actions 외부에서 refresh() 사용하기 (잘못된 방법)

```tsx
// 잘못된 방법: Route Handler에서 refresh() 사용
import { refresh } from 'next/cache'

export async function POST() {
  refresh()  // 오류가 발생합니다!
}

// 올바른 방법: Route Handler에서는 revalidateTag 사용
import { revalidateTag } from 'next/cache'

export async function POST() {
  revalidateTag('data')
  return Response.json({ ok: true })
}
```
