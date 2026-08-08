---
title: 필요할 때까지 Await 지연
impact: HIGH
impactDescription: 사용하지 않는 코드 경로의 블로킹 방지
tags: async, await, conditional, optimization
---

## 필요할 때까지 Await 지연

`await` 작업을 실제로 사용되는 분기로 이동하여 필요하지 않은 코드 경로를 블로킹하지 않도록 합니다.

**잘못된 예 (두 분기 모두 블로킹):**

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  const userData = await fetchUserData(userId)

  if (skipProcessing) {
    // 즉시 반환하지만 여전히 userData를 기다림
    return { skipped: true }
  }

  // 이 분기만 userData를 사용함
  return processUserData(userData)
}
```

**올바른 예 (필요할 때만 블로킹):**

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  if (skipProcessing) {
    // 대기 없이 즉시 반환
    return { skipped: true }
  }

  // 필요할 때만 페칭
  const userData = await fetchUserData(userId)
  return processUserData(userData)
}
```

**또 다른 예시 (조기 반환 최적화):**

```typescript
// 잘못된 예: 항상 권한을 페칭
async function updateResource(resourceId: string, userId: string) {
  const permissions = await fetchPermissions(userId)
  const resource = await getResource(resourceId)

  if (!resource) {
    return { error: 'Not found' }
  }

  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }

  return await updateResourceData(resource, permissions)
}

// 올바른 예: 필요할 때만 페칭
async function updateResource(resourceId: string, userId: string) {
  const resource = await getResource(resourceId)

  if (!resource) {
    return { error: 'Not found' }
  }

  const permissions = await fetchPermissions(userId)

  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }

  return await updateResourceData(resource, permissions)
}
```

이 최적화는 건너뛰는 분기가 자주 사용되거나 지연된 작업이 비용이 많이 드는 경우에 특히 유용합니다.
