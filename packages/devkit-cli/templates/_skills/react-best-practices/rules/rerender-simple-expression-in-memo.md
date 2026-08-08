---
title: 원시 결과 타입의 단순 표현식을 useMemo로 감싸지 마세요
impact: LOW-MEDIUM
impactDescription: 매 렌더링마다 낭비되는 연산
tags: rerender, useMemo, optimization
---

## 원시 결과 타입의 단순 표현식을 useMemo로 감싸지 마세요

표현식이 단순하고(논리적 또는 산술적 연산자가 적고) 결과 타입이 원시 타입(boolean, number, string)인 경우, `useMemo`로 감싸지 마세요.
`useMemo`를 호출하고 Hook 의존성을 비교하는 것이 표현식 자체보다 더 많은 리소스를 소비할 수 있습니다.

**잘못된 예:**

```tsx
function Header({ user, notifications }: Props) {
  const isLoading = useMemo(() => {
    return user.isLoading || notifications.isLoading
  }, [user.isLoading, notifications.isLoading])

  if (isLoading) return <Skeleton />
  // 마크업 반환
}
```

**올바른 예:**

```tsx
function Header({ user, notifications }: Props) {
  const isLoading = user.isLoading || notifications.isLoading

  if (isLoading) return <Skeleton />
  // 마크업 반환
}
```
