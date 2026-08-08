---
title: 전역 이벤트 리스너 중복 제거
impact: LOW
impactDescription: N개의 컴포넌트에 하나의 리스너
tags: client, swr, event-listeners, subscription
---

## 전역 이벤트 리스너 중복 제거

`useSWRSubscription()`을 사용하여 컴포넌트 인스턴스 간에 전역 이벤트 리스너를 공유합니다.

**잘못된 예 (N개의 인스턴스 = N개의 리스너):**

```tsx
function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === key) {
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback])
}
```

`useKeyboardShortcut` 훅을 여러 번 사용하면 각 인스턴스가 새로운 리스너를 등록합니다.

**올바른 예 (N개의 인스턴스 = 1개의 리스너):**

```tsx
import useSWRSubscription from 'swr/subscription'

// 키별 콜백을 추적하는 모듈 수준 Map
const keyCallbacks = new Map<string, Set<() => void>>()

function useKeyboardShortcut(key: string, callback: () => void) {
  // 이 콜백을 Map에 등록
  useEffect(() => {
    if (!keyCallbacks.has(key)) {
      keyCallbacks.set(key, new Set())
    }
    keyCallbacks.get(key)!.add(callback)

    return () => {
      const set = keyCallbacks.get(key)
      if (set) {
        set.delete(callback)
        if (set.size === 0) {
          keyCallbacks.delete(key)
        }
      }
    }
  }, [key, callback])

  useSWRSubscription('global-keydown', () => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && keyCallbacks.has(e.key)) {
        keyCallbacks.get(e.key)!.forEach(cb => cb())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
}

function Profile() {
  // 여러 단축키가 동일한 리스너를 공유
  useKeyboardShortcut('p', () => { /* ... */ })
  useKeyboardShortcut('k', () => { /* ... */ })
  // ...
}
```
