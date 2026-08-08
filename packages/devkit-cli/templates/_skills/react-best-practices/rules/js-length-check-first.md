---
title: 배열 비교 시 길이 먼저 확인
impact: MEDIUM-HIGH
impactDescription: 길이가 다를 때 비용이 높은 연산을 방지합니다
tags: javascript, arrays, performance, optimization, comparison
---

## 배열 비교 시 길이 먼저 확인

비용이 높은 연산(정렬, 깊은 동등성 비교, 직렬화)으로 배열을 비교할 때, 먼저 길이를 확인하세요. 길이가 다르면 배열은 같을 수 없습니다.

실제 애플리케이션에서 이 최적화는 비교가 핫 경로(이벤트 핸들러, 렌더 루프)에서 실행될 때 특히 유용합니다.

**잘못된 방법 (항상 비용이 높은 비교를 실행):**

```typescript
function hasChanges(current: string[], original: string[]) {
  // 길이가 달라도 항상 정렬하고 결합함
  return current.sort().join() !== original.sort().join()
}
```

`current.length`가 5이고 `original.length`가 100인 경우에도 두 번의 O(n log n) 정렬이 실행됩니다. 배열을 결합하고 문자열을 비교하는 오버헤드도 있습니다.

**올바른 방법 (O(1) 길이 확인 먼저):**

```typescript
function hasChanges(current: string[], original: string[]) {
  // 길이가 다르면 조기 반환
  if (current.length !== original.length) {
    return true
  }
  // 길이가 같을 때만 정렬
  const currentSorted = current.toSorted()
  const originalSorted = original.toSorted()
  for (let i = 0; i < currentSorted.length; i++) {
    if (currentSorted[i] !== originalSorted[i]) {
      return true
    }
  }
  return false
}
```

이 새로운 접근 방식이 더 효율적인 이유:
- 길이가 다를 때 정렬과 결합의 오버헤드를 방지합니다
- 결합된 문자열에 대한 메모리 소비를 방지합니다 (큰 배열에서 특히 중요)
- 원본 배열의 변이를 방지합니다
- 차이점이 발견되면 조기 반환합니다
