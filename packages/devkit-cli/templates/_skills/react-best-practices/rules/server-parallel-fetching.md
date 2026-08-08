---
title: 컴포넌트 합성을 통한 병렬 데이터 페칭
impact: CRITICAL
impactDescription: 서버 측 워터폴 제거
tags: server, rsc, parallel-fetching, composition
---

## 컴포넌트 합성을 통한 병렬 데이터 페칭

React Server Components는 트리 내에서 순차적으로 실행됩니다. 데이터 페칭을 병렬화하기 위해 합성으로 구조를 재구성하세요.

**잘못된 예 (Sidebar가 Page의 fetch 완료를 대기):**

```tsx
export default async function Page() {
  const header = await fetchHeader()
  return (
    <div>
      <div>{header}</div>
      <Sidebar />
    </div>
  )
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}
```

**올바른 예 (둘 다 동시에 페칭):**

```tsx
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

export default function Page() {
  return (
    <div>
      <Header />
      <Sidebar />
    </div>
  )
}
```

**children prop을 사용한 대안:**

```tsx
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <Header />
      {children}
    </div>
  )
}

export default function Page() {
  return (
    <Layout>
      <Sidebar />
    </Layout>
  )
}
```
