# Server Actions 유효성 검사 참조 문서

## Zod 스키마 빠른 참조

### 문자열 유효성 검사 (String Validations)

```tsx
import { z } from 'zod'

// 기본
z.string()
z.string().min(1, 'Required')
z.string().min(1).max(100)
z.string().length(10)

// 형식
z.email('Invalid email')
z.url('Invalid URL')
z.uuid('Invalid UUID')
z.string().cuid()
z.string().ulid()
z.string().datetime()
z.string().ip()

// 패턴
z.string().regex(/^[a-zA-Z0-9_]+$/, 'Alphanumeric and underscore only')
z.string().startsWith('https://')
z.string().endsWith('.com')
z.string().includes('@')

// 변환
z.string().trim()
z.string().toLowerCase()
z.string().toUpperCase()
```

### 숫자 유효성 검사 (Number Validations)

```tsx
z.number()
z.number().int()
z.number().positive()
z.number().negative()
z.number().nonnegative()
z.number().min(0)
z.number().max(100)
z.number().multipleOf(5)
z.number().finite()
z.number().safe()

// FormData에서 변환 (문자열 → 숫자 강제 변환)
z.coerce.number()
z.coerce.number().int().positive()
z.coerce.number().min(0).max(100)
```

### Boolean, Date, Enum

```tsx
// Boolean
z.boolean()
z.coerce.boolean()  // "true"/"false" → boolean으로 변환

// Date
z.date()
z.coerce.date()  // 문자열 → Date로 변환
z.coerce.date().min(new Date('2020-01-01'))

// Enum
z.enum(['admin', 'user', 'guest'])
z.nativeEnum(UserRole)  // TypeScript enum 사용
```

### Optional과 Nullable

```tsx
z.string().optional()           // string | undefined
z.string().nullable()           // string | null
z.string().nullish()            // string | null | undefined
z.string().optional().default('fallback')
```

### 배열과 객체 (Arrays & Objects)

```tsx
// 배열
z.array(z.string())
z.array(z.string()).min(1).max(10)
z.array(z.string()).nonempty()

// 객체
z.object({
  name: z.string(),
  age: z.number(),
})

// Partial (모든 필드를 선택적으로 만듦)
schema.partial()

// Pick / Omit (특정 필드 선택 / 제외)
schema.pick({ name: true })
schema.omit({ password: true })

// Extend (필드 추가)
schema.extend({ newField: z.string() })

// Merge (스키마 병합)
schema1.merge(schema2)
```

### 파일 유효성 검사 (File Validation)

```tsx
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

z.instanceof(File)
  .refine(f => f.size > 0, 'File is required')
  .refine(f => f.size <= MAX_SIZE, `Max size is ${MAX_SIZE / 1024 / 1024}MB`)
  .refine(
    f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type),
    'Only .jpg, .png, .webp accepted'
  )
```

### 커스텀 유효성 검사 (Custom Validations)

```tsx
// refine (단일 필드)
z.string().refine(val => val !== 'admin', 'Cannot use "admin"')

// superRefine (필드 간 교차 검증)
z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    })
  }
})

// transform (값 변환)
z.string().transform(val => val.split(',').map(s => s.trim()))
```

---

## FormData 파싱 패턴

### 직접 파싱 (Direct parsing)

```tsx
'use server'

const schema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  published: z.coerce.boolean(),
  priority: z.coerce.number().int().min(1).max(5),
})

export async function createPost(formData: FormData) {
  const result = schema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published'),
    priority: formData.get('priority'),
  })

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  // result.data는 완전한 타입과 유효성 검사가 적용됩니다
  await db.posts.create({ data: result.data })
}
```

### Object.fromEntries 축약법

```tsx
export async function createPost(formData: FormData) {
  const result = schema.safeParse(Object.fromEntries(formData))
  // 단순한 평면 구조의 폼에서 작동합니다
}
```

### 다중 값 필드 (체크박스, 다중 선택)

```tsx
const schema = z.object({
  name: z.string().min(1),
  tags: z.array(z.string()).min(1, 'Select at least one tag'),
})

export async function createPost(formData: FormData) {
  const result = schema.safeParse({
    name: formData.get('name'),
    tags: formData.getAll('tags'),  // string[] 배열을 반환합니다
  })
}
```

---

## 오류 처리 패턴 (Error Handling Patterns)

### 폼 표시를 위한 오류 평탄화 (Flatten errors)

```tsx
if (!result.success) {
  const errors = result.error.flatten()

  // errors.formErrors → string[] (최상위 수준 오류)
  // errors.fieldErrors → Record<string, string[]>

  return { error: errors.fieldErrors }
}
```

### API 응답을 위한 오류 포맷팅 (Format errors)

```tsx
if (!result.success) {
  const errors = result.error.format()

  // errors.title?._errors → string[]
  // 스키마 형태와 일치하는 중첩 구조

  return { error: errors }
}
```

### 데이터베이스 오류를 위한 try/catch

```tsx
export async function createUser(formData: FormData) {
  const result = schema.safeParse(Object.fromEntries(formData))
  if (!result.success) return { error: result.error.flatten().fieldErrors }

  try {
    const user = await db.users.create({ data: result.data })
    updateTag('users')
    return { data: { id: user.id } }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        return { error: { email: ['Email already exists'] } }
      }
    }
    return { error: 'An unexpected error occurred' }
  }
}
```

---

## Next.js 앱을 위한 일반적인 스키마

### 인증 (Auth)

```tsx
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

export const registerSchema = loginSchema.extend({
  name: z.string().min(1).max(100),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
```

### 검색/필터 (Search/Filter)

```tsx
export const searchSchema = z.object({
  q: z.string().optional().default(''),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sort: z.enum(['newest', 'oldest', 'popular']).optional().default('newest'),
})
```

### 설정 (Settings)

```tsx
export const settingsSchema = z.object({
  displayName: z.string().min(1).max(50),
  bio: z.string().max(500).optional(),
  website: z.url().optional().or(z.literal('')),
  notifications: z.coerce.boolean().default(true),
  language: z.enum(['en', 'ko', 'ja']).default('en'),
})
```

---

## 관련 라이브러리

- [Zod](https://zod.dev) - 스키마 유효성 검사 라이브러리
- [React Hook Form](https://react-hook-form.com) - 클라이언트 폼 관리 라이브러리
- [@hookform/resolvers](https://github.com/react-hook-form/resolvers) - Zod와 React Hook Form 통합
