---
title: 정적 JSX 요소 호이스팅
impact: LOW
impactDescription: 재생성을 방지합니다
tags: rendering, jsx, static, optimization
---

## 정적 JSX 요소 호이스팅

재생성을 방지하기 위해 정적 JSX를 컴포넌트 외부로 추출하세요.

**잘못된 방법 (매 렌더마다 요소를 재생성):**

```tsx
function LoadingSkeleton() {
  return <div className="animate-pulse h-20 bg-gray-200" />
}

function Container() {
  return (
    <div>
      {loading && <LoadingSkeleton />}
    </div>
  )
}
```

**올바른 방법 (같은 요소를 재사용):**

```tsx
const loadingSkeleton = (
  <div className="animate-pulse h-20 bg-gray-200" />
)

function Container() {
  return (
    <div>
      {loading && loadingSkeleton}
    </div>
  )
}
```

이것은 특히 크고 정적인 SVG 노드에 유용합니다. 매 렌더마다 재생성하는 것은 비용이 높을 수 있습니다.

**참고:** 프로젝트에 [React Compiler](https://react.dev/learn/react-compiler)가 활성화되어 있다면, 컴파일러가 자동으로 정적 JSX 요소를 호이스팅하고 컴포넌트 재렌더링을 최적화하므로 수동 호이스팅이 불필요합니다.
