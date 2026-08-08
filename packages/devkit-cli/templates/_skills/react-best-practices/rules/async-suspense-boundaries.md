---
title: 전략적 Suspense 경계
impact: HIGH
impactDescription: 더 빠른 초기 페인트
tags: async, suspense, streaming, layout-shift
---

## 전략적 Suspense 경계

비동기 컴포넌트에서 JSX를 반환하기 전에 데이터를 await하는 대신, Suspense 경계를 사용하여 데이터가 로드되는 동안 래퍼 UI를 먼저 표시합니다.

**잘못된 예 (래퍼가 데이터 페칭에 의해 블로킹됨):**

```tsx
async function Page() {
  const data = await fetchData() // 전체 페이지를 블로킹

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <DataDisplay data={data} />
      </div>
      <div>Footer</div>
    </div>
  )
}
```

중간 섹션만 데이터가 필요한데도 전체 레이아웃이 데이터를 기다립니다.

**올바른 예 (래퍼가 즉시 표시되고, 데이터가 스트리밍됨):**

```tsx
function Page() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <Suspense fallback={<Skeleton />}>
          <DataDisplay />
        </Suspense>
      </div>
      <div>Footer</div>
    </div>
  )
}

async function DataDisplay() {
  const data = await fetchData() // 이 컴포넌트만 블로킹
  return <div>{data.content}</div>
}
```

Sidebar, Header, Footer는 즉시 렌더링됩니다. DataDisplay만 데이터를 기다립니다.

**대안 (컴포넌트 간 프로미스 공유):**

```tsx
function Page() {
  // 페칭을 즉시 시작하지만 await하지 않음
  const dataPromise = fetchData()

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay dataPromise={dataPromise} />
        <DataSummary dataPromise={dataPromise} />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

function DataDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // 프로미스를 언래핑
  return <div>{data.content}</div>
}

function DataSummary({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // 동일한 프로미스를 재사용
  return <div>{data.summary}</div>
}
```

두 컴포넌트가 동일한 프로미스를 공유하므로 페칭은 한 번만 발생합니다. 레이아웃은 즉시 렌더링되고 두 컴포넌트가 함께 기다립니다.

**이 패턴을 사용하지 말아야 할 때:**

- 레이아웃 결정에 필요한 중요한 데이터 (위치에 영향을 미치는 경우)
- 스크롤 없이 볼 수 있는 영역의 SEO에 중요한 콘텐츠
- suspense 오버헤드가 가치 없는 작고 빠른 쿼리
- 레이아웃 시프트를 방지하고 싶을 때 (로딩 -> 콘텐츠 점프)

**트레이드오프:** 더 빠른 초기 페인트 vs 잠재적인 레이아웃 시프트. UX 우선순위에 따라 선택하세요.
