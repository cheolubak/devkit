---
title: 불변성을 위해 sort() 대신 toSorted() 사용
impact: MEDIUM-HIGH
impactDescription: React 상태에서 변이 버그를 방지합니다
tags: javascript, arrays, immutability, react, state, mutation
---

## 불변성을 위해 sort() 대신 toSorted() 사용

`.sort()`는 배열을 제자리에서 변이시키므로 React 상태 및 props에서 버그를 유발할 수 있습니다. 변이 없이 새로운 정렬된 배열을 만들려면 `.toSorted()`를 사용하세요.

**잘못된 방법 (원본 배열을 변이):**

```typescript
function UserList({ users }: { users: User[] }) {
  // users prop 배열을 변이시킴!
  const sorted = useMemo(
    () => users.sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

**올바른 방법 (새 배열 생성):**

```typescript
function UserList({ users }: { users: User[] }) {
  // 새로운 정렬된 배열을 생성하고, 원본은 변경되지 않음
  const sorted = useMemo(
    () => users.toSorted((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

**React에서 이것이 중요한 이유:**

1. Props/state 변이는 React의 불변성 모델을 깨뜨립니다 - React는 props와 state가 읽기 전용으로 다뤄지기를 기대합니다
2. 오래된 클로저 버그를 유발합니다 - 클로저(콜백, effect) 내부에서 배열을 변이하면 예기치 않은 동작이 발생할 수 있습니다

**브라우저 지원 (이전 브라우저를 위한 대체 방법):**

`.toSorted()`는 모든 최신 브라우저에서 사용 가능합니다 (Chrome 110+, Safari 16+, Firefox 115+, Node.js 20+). 이전 환경에서는 스프레드 연산자를 사용하세요:

```typescript
// 이전 브라우저를 위한 대체 방법
const sorted = [...items].sort((a, b) => a.value - b.value)
```

**기타 불변 배열 메서드:**

- `.toSorted()` - 불변 정렬
- `.toReversed()` - 불변 역순
- `.toSpliced()` - 불변 splice
- `.with()` - 불변 요소 교체
