---
title: 레이아웃 스래싱 방지
impact: MEDIUM
impactDescription: 강제 동기 레이아웃을 방지하고 성능 병목을 줄입니다
tags: javascript, dom, css, performance, reflow, layout-thrashing
---

## 레이아웃 스래싱 방지

스타일 쓰기와 레이아웃 읽기를 번갈아 사용하지 마세요. 스타일 변경 사이에 레이아웃 속성(`offsetWidth`, `getBoundingClientRect()`, `getComputedStyle()` 등)을 읽으면 브라우저가 동기 리플로우를 강제로 트리거합니다.

**이 코드는 괜찮습니다 (브라우저가 스타일 변경을 일괄 처리):**
```typescript
function updateElementStyles(element: HTMLElement) {
  // 각 줄이 스타일을 무효화하지만, 브라우저가 재계산을 일괄 처리합니다
  element.style.width = '100px'
  element.style.height = '200px'
  element.style.backgroundColor = 'blue'
  element.style.border = '1px solid black'
}
```

**잘못된 방법 (읽기와 쓰기를 번갈아 하면 리플로우가 강제됩니다):**
```typescript
function layoutThrashing(element: HTMLElement) {
  element.style.width = '100px'
  const width = element.offsetWidth  // 리플로우 강제
  element.style.height = '200px'
  const height = element.offsetHeight  // 또 다른 리플로우 강제
}
```

**올바른 방법 (쓰기를 일괄 처리한 후 한 번 읽기):**
```typescript
function updateElementStyles(element: HTMLElement) {
  // 모든 쓰기를 함께 일괄 처리
  element.style.width = '100px'
  element.style.height = '200px'
  element.style.backgroundColor = 'blue'
  element.style.border = '1px solid black'

  // 모든 쓰기가 완료된 후 읽기 (단일 리플로우)
  const { width, height } = element.getBoundingClientRect()
}
```

**올바른 방법 (읽기를 일괄 처리한 후 쓰기):**
```typescript
function avoidThrashing(element: HTMLElement) {
  // 읽기 단계 - 모든 레이아웃 쿼리를 먼저 수행
  const rect1 = element.getBoundingClientRect()
  const offsetWidth = element.offsetWidth
  const offsetHeight = element.offsetHeight

  // 쓰기 단계 - 모든 스타일 변경을 나중에 수행
  element.style.width = '100px'
  element.style.height = '200px'
}
```

**더 나은 방법: CSS 클래스 사용**
```css
.highlighted-box {
  width: 100px;
  height: 200px;
  background-color: blue;
  border: 1px solid black;
}
```
```typescript
function updateElementStyles(element: HTMLElement) {
  element.classList.add('highlighted-box')

  const { width, height } = element.getBoundingClientRect()
}
```

**React 예제:**
```tsx
// 잘못된 방법: 스타일 변경과 레이아웃 쿼리를 번갈아 사용
function Box({ isHighlighted }: { isHighlighted: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current && isHighlighted) {
      ref.current.style.width = '100px'
      const width = ref.current.offsetWidth // 레이아웃 강제
      ref.current.style.height = '200px'
    }
  }, [isHighlighted])

  return <div ref={ref}>Content</div>
}

// 올바른 방법: 클래스 토글
function Box({ isHighlighted }: { isHighlighted: boolean }) {
  return (
    <div className={isHighlighted ? 'highlighted-box' : ''}>
      Content
    </div>
  )
}
```

가능하면 인라인 스타일보다 CSS 클래스를 사용하세요. CSS 파일은 브라우저에 의해 캐시되며, 클래스는 관심사 분리를 더 잘 제공하고 유지보수가 더 쉽습니다.

레이아웃을 강제하는 작업에 대한 자세한 정보는 [이 gist](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)와 [CSS Triggers](https://csstriggers.com/)를 참조하세요.
