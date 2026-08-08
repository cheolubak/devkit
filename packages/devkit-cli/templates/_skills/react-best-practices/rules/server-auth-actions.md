---
title: Server Actions를 API 라우트처럼 인증
impact: CRITICAL
impactDescription: 서버 변경에 대한 무단 접근 방지
tags: server, server-actions, authentication, security, authorization
---

## Server Actions를 API 라우트처럼 인증

**영향: CRITICAL (서버 변경에 대한 무단 접근 방지)**

Server Actions (`"use server"` 함수)는 API 라우트와 마찬가지로 공개 엔드포인트로 노출됩니다. Server Actions는 직접 호출될 수 있으므로, 미들웨어, 레이아웃 가드 또는 페이지 수준 검사에만 의존하지 말고 **각 Server Action 내부에서** 항상 인증 및 권한을 확인하세요.

Next.js 문서에 명시적으로 다음과 같이 기술되어 있습니다: "Server Actions를 공개 API 엔드포인트와 동일한 보안 고려사항으로 처리하고, 사용자가 변경을 수행할 권한이 있는지 확인하세요."

**잘못된 예 (인증 검사 없음):**

```typescript
'use server'

export async function deleteUser(userId: string) {
  // 누구나 호출할 수 있음! 인증 검사 없음
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

**올바른 예 (액션 내부에서 인증):**

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { unauthorized } from '@/lib/errors'

export async function deleteUser(userId: string) {
  // 항상 액션 내부에서 인증 확인
  const session = await verifySession()

  if (!session) {
    throw unauthorized('Must be logged in')
  }

  // 권한도 확인
  if (session.user.role !== 'admin' && session.user.id !== userId) {
    throw unauthorized('Cannot delete other users')
  }

  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

**입력 유효성 검사 포함:**

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  userId: z.uuid(),
  name: z.string().min(1).max(100),
  email: z.email()
})

export async function updateProfile(data: unknown) {
  // 먼저 입력 유효성 검사
  const validated = updateProfileSchema.parse(data)

  // 그 다음 인증
  const session = await verifySession()
  if (!session) {
    throw new Error('Unauthorized')
  }

  // 그 다음 권한 확인
  if (session.user.id !== validated.userId) {
    throw new Error('Can only update own profile')
  }

  // 마지막으로 변경 수행
  await db.user.update({
    where: { id: validated.userId },
    data: {
      name: validated.name,
      email: validated.email
    }
  })

  return { success: true }
}
```

참고: [https://nextjs.org/docs/app/guides/authentication](https://nextjs.org/docs/app/guides/authentication)
