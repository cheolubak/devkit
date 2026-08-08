---
title: React.cache()를 사용한 요청별 중복 제거
impact: MEDIUM
impactDescription: 요청 내 중복 제거
tags: server, cache, react-cache, deduplication
---

## React.cache()를 사용한 요청별 중복 제거

서버 측 요청 중복 제거를 위해 `React.cache()`를 사용하세요. 인증 및 데이터베이스 쿼리에서 가장 큰 이점을 얻습니다.

**사용법:**

```typescript
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  return await db.user.findUnique({
    where: { id: session.user.id }
  })
})
```

단일 요청 내에서 `getCurrentUser()`를 여러 번 호출해도 쿼리는 한 번만 실행됩니다.

**인라인 객체를 인자로 사용하지 마세요:**

`React.cache()`는 얕은 동등성(`Object.is`)을 사용하여 캐시 히트를 판단합니다. 인라인 객체는 호출할 때마다 새로운 참조를 생성하여 캐시 히트를 방지합니다.

**잘못된 예 (항상 캐시 미스):**

```typescript
const getUser = cache(async (params: { uid: number }) => {
  return await db.user.findUnique({ where: { id: params.uid } })
})

// 각 호출이 새 객체를 생성하여 캐시 히트 불가
getUser({ uid: 1 })
getUser({ uid: 1 })  // 캐시 미스, 쿼리 다시 실행
```

**올바른 예 (캐시 히트):**

```typescript
const getUser = cache(async (uid: number) => {
  return await db.user.findUnique({ where: { id: uid } })
})

// 원시 인자는 값 동등성을 사용
getUser(1)
getUser(1)  // 캐시 히트, 캐시된 결과 반환
```

객체를 전달해야 하는 경우 동일한 참조를 전달하세요:

```typescript
const params = { uid: 1 }
getUser(params)  // 쿼리 실행
getUser(params)  // 캐시 히트 (동일한 참조)
```

**Next.js 관련 참고사항:**

Next.js에서 `fetch` API는 요청 메모이제이션으로 자동 확장됩니다. 동일한 URL과 옵션을 가진 요청은 단일 요청 내에서 자동으로 중복 제거되므로, `fetch` 호출에는 `React.cache()`가 필요하지 않습니다. 하지만 `React.cache()`는 다른 비동기 작업에서 여전히 필수적입니다:

- 데이터베이스 쿼리 (Prisma, Drizzle 등)
- 무거운 연산
- 인증 검사
- 파일 시스템 작업
- fetch가 아닌 모든 비동기 작업

컴포넌트 트리 전반에서 이러한 작업의 중복을 제거하기 위해 `React.cache()`를 사용하세요.

참고: [React.cache 문서](https://react.dev/reference/react/cache)
