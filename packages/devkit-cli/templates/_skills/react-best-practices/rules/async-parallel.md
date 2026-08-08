---
title: 독립적인 작업에 Promise.all() 사용
impact: CRITICAL
impactDescription: 2-10배 개선
tags: async, parallelization, promises, waterfalls
---

## 독립적인 작업에 Promise.all() 사용

비동기 작업 간에 상호 의존성이 없을 때, `Promise.all()`을 사용하여 동시에 실행합니다.

**잘못된 예 (순차 실행, 3번의 왕복):**

```typescript
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()
```

**올바른 예 (병렬 실행, 1번의 왕복):**

```typescript
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```
