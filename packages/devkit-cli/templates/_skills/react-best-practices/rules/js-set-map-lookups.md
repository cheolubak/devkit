---
title: O(1) 조회를 위한 Set/Map 사용
impact: LOW-MEDIUM
impactDescription: O(n)에서 O(1)로
tags: javascript, set, map, data-structures, performance
---

## O(1) 조회를 위한 Set/Map 사용

반복적인 멤버십 확인을 위해 배열을 Set/Map으로 변환하세요.

**잘못된 방법 (확인당 O(n)):**

```typescript
const allowedIds = ['a', 'b', 'c', ...]
items.filter(item => allowedIds.includes(item.id))
```

**올바른 방법 (확인당 O(1)):**

```typescript
const allowedIds = new Set(['a', 'b', 'c', ...])
items.filter(item => allowedIds.has(item.id))
```
