---
title: 루프에서 속성 접근 캐싱
impact: LOW-MEDIUM
impactDescription: 조회 횟수를 줄입니다
tags: javascript, loops, optimization, caching
---

## 루프에서 속성 접근 캐싱

핫 경로에서 객체 속성 조회를 캐싱하세요.

**잘못된 방법 (반복마다 3번의 조회):**

```typescript
for (let i = 0; i < arr.length; i++) {
  process(obj.config.settings.value)
}
```

**올바른 방법 (총 1번의 조회):**

```typescript
const value = obj.config.settings.value
const len = arr.length
for (let i = 0; i < len; i++) {
  process(value)
}
```
