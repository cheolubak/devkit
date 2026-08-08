# 아키텍처

## 모범 사례

- `useEffect` 사용을 피하세요 - Server Components, Server Actions, 또는 이벤트 핸들러를 사용하세요
- `"use client"`는 리프 컴포넌트(가장 작은 경계)에서만 사용하세요
- Props는 직렬화 가능해야 합니다 (데이터 또는 Server Actions만 가능, 함수/클래스는 불가)
- 하드코딩된 값 대신 Tailwind v4 `globals.css` 테마 변수를 사용하세요

## 컴포넌트 패턴

### Server vs Client 결정 트리

```
상태/이펙트/브라우저 API가 필요한가?
├── 예 → 가장 작은 경계에서 "use client" 사용
└── 아니오 → Server Component (기본값)

클라이언트에 데이터를 전달하는가?
├── 함수/클래스 → ❌ 직렬화 불가
├── 일반 객체/배열 → ✅ Props
└── 서버 로직 → ✅ Server Actions
```

### 컴포넌트 배치

```
app/
├── (protected)/             # 인증 필요 라우트
│   ├── dashboard/
│   ├── settings/
│   ├── components/          # 라우트 전용 컴포넌트
│   └── lib/                 # 라우트 전용 타입/유틸리티
├── (public)/                # 공개 라우트
│   ├── login/
│   └── register/
├── actions/                 # Server Actions (전역)
├── api/                     # API 라우트
components/                  # 라우트 간 공유
├── ui/                      # shadcn 프리미티브
└── shared/                  # 비즈니스 컴포넌트
hooks/                       # 커스텀 React 훅
lib/                         # 공유 유틸리티
data/                        # 데이터베이스 쿼리
ai/                          # AI 로직 (도구, 에이전트, 프롬프트)
```

### AI 디렉터리 구조

AI 애플리케이션을 구축할 때 `ai/` 디렉터리를 다음과 같이 구성하세요:

```
ai/
├── model-names.ts      # 모델 정의 및 DEFAULT_MODEL_NAME
├── actions/            # AI 관련 서버 액션
│   ├── model.ts        # saveModelId, getModelId (쿠키 기반)
│   └── chat.ts         # 채팅 관련 액션
├── utils.ts            # findSources, getLastUserMessageText 등
├── agents/             # 에이전트 정의 (에이전트 사용 시)
│   └── assistant.ts
└── tools/              # 도구 정의 (도구 사용 시)
```

**model-names.ts 예시:**

```ts
export interface Model {
  id: string
  label: string
  description: string
}

export const models: Model[] = [
  { id: "gpt-4o-mini", label: "GPT 4o mini", description: "빠르고 가벼운 작업" },
  { id: "gpt-4o", label: "GPT 4o", description: "복잡한 다단계 작업" },
]

export const DEFAULT_MODEL_NAME = "gpt-4o-mini"
```

**쿠키 기반 모델 저장:**

```ts
// ai/actions/model.ts - 변경(MUTATION)에만 사용하는 Server Action
"use server"
import { cookies } from "next/headers"

export async function saveModelId(model: string) {
  const cookieStore = await cookies()
  cookieStore.set("model-id", model)
}

// ❌ 잘못된 방법: 데이터 읽기에 Server Action을 사용하지 마세요
// export async function getModelId() { ... }

// ✅ 올바른 방법: Server Component에서 직접 쿠키를 읽으세요
// page.tsx
import { cookies } from "next/headers"

export default async function Page() {
  const cookieStore = await cookies()
  const modelId = cookieStore.get("model-id")?.value ?? DEFAULT_MODEL_NAME
  return <Chat modelId={modelId} />
}
```

### className 패턴

항상 `className`을 받아서 병합하세요:

```tsx
import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outline"
}

export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg p-4",
        variant === "outline" && "border",
        className
      )}
      {...props}
    />
  )
}
```

## 데이터 페칭 패턴

### Server Component (기본값)

Server Components에서 직접 데이터를 가져오세요:

```tsx
export default async function Page() {
  const data = await fetchData()
  return <Component data={data} />
}
```

### 캐시된 데이터 함수

재사용 가능한 캐시 쿼리에 `'use cache'`를 사용하세요:

```tsx
// data/products.ts
export async function getProducts() {
  "use cache"
  cacheTag("products")
  cacheLife("hours")
  return await db.products.findMany()
}
```

### 클라이언트로 스트리밍 (React `use` 훅)

스트리밍을 위해 Client Components에 프로미스를 전달하세요:

```tsx
// Server Component
export default function Page() {
  const dataPromise = fetchData() // await 하지 않음
  return (
    <Suspense fallback={<Loading />}>
      <ClientDisplay dataPromise={dataPromise} />
    </Suspense>
  )
}

// Client Component
"use client"
import { use } from "react"

export function ClientDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // 해결될 때까지 일시 중단
  return <Chart data={data} />
}
```

### connection()을 사용한 명시적 요청 시점 지정

런타임 API에 접근하지 않고 명시적으로 요청 시점으로 연기하려면 `connection()`을 사용하세요:

```tsx
import { connection } from "next/server"
import { Suspense } from "react"

async function UniqueContent() {
  await connection() // 요청 시점으로 연기
  const uuid = crypto.randomUUID()
  const timestamp = Date.now()
  return <div>{uuid} - {timestamp}</div>
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <UniqueContent />
    </Suspense>
  )
}
```

**`connection()` 사용 시기:**

| 시나리오 | connection() 사용 여부 |
|----------|-------------------|
| 요청마다 고유한 값이 필요한 경우 | ✅ 예 |
| `Math.random()`, `Date.now()`, `crypto.randomUUID()` 사용 시 | ✅ 예 |
| 이미 `cookies()` 또는 `headers()`를 사용 중인 경우 | ❌ 아니오 (불필요) |
| 데이터가 캐시 가능한 경우 | ❌ 아니오 (`'use cache'` 사용) |

## 라우팅

### 라우트 그룹

URL에 영향을 주지 않고 라우트를 그룹화하세요:

```
app/
├── (protected)/         # 인증 필요 - /dashboard, /settings
│   ├── dashboard/
│   ├── settings/
│   └── layout.tsx       # 공유 크롬 (사이드바, 인증 확인)
├── (public)/            # 공개 - /login, /register, /about
│   ├── login/
│   ├── register/
│   └── about/
└── (marketing)/         # 마케팅 - /pricing, /features
    ├── pricing/
    └── features/
```

### Layout vs Template

| 측면 | layout.tsx | template.tsx |
|--------|------------|--------------|
| 상태 | 네비게이션 간 유지됨 | 네비게이션 시 초기화됨 |
| 이펙트 | 한 번만 실행 | 매 네비게이션마다 실행 |
| 사용 시점 | 공유 크롬 (내비게이션, 푸터) | 분석, 초기화가 필요한 애니메이션 |

**결정 트리:**
```
네비게이션 시 상태/이펙트가 초기화되어야 하는가?
├── 예 → template.tsx
└── 아니오 → layout.tsx (기본값)
```

### 비동기 Params (Next.js 16)

```tsx
// params와 searchParams는 항상 await 하세요
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { slug } = await params
  const { page = "1" } = await searchParams

  const data = await fetchData(slug, parseInt(page))
  return <Content data={data} />
}
```

## Suspense 전략

### Suspense 사용 시점

```
Server Component에서 느린 데이터 페칭이 있는가?
├── 예 → <Suspense>로 감싸기
└── 아니오 → 직접 렌더링

독립적인 느린 섹션이 여러 개인가?
├── 예 → 별도의 <Suspense> 경계 사용
└── 아니오 → 단일 경계 또는 loading.tsx
```

### 패턴

**loading.tsx** - 전체 라우트 폴백:
```tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return <DashboardSkeleton />
}
```

**Suspense** - 세분화된 스트리밍:
```tsx
export default function Page() {
  return (
    <>
      <Header />  {/* 즉시 렌더링 */}
      <Suspense fallback={<StatsSkeleton />}>
        <SlowStats />  {/* 준비되면 스트리밍 */}
      </Suspense>
      <Suspense fallback={<ChartSkeleton />}>
        <SlowChart />  {/* 독립적으로 스트리밍 */}
      </Suspense>
    </>
  )
}
```

**스켈레톤 패턴** - 각 로드 가능한 콘텐츠에 대한 스켈레톤 컴포넌트를 만드세요:
```tsx
// components/skeletons.tsx
export function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-muted rounded w-3/4 mb-2" />
      <div className="h-4 bg-muted rounded w-1/2" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-muted rounded animate-pulse" />
      ))}
    </div>
  )
}
```

**클라이언트에 프로미스 전달**:
```tsx
// Server Component
export default function Page() {
  const dataPromise = fetchData()  // 페칭 시작, await 하지 않음
  return <ClientChart dataPromise={dataPromise} />
}

// Client Component
"use client"
import { use } from "react"

export function ClientChart({ dataPromise }) {
  const data = use(dataPromise)  // 해결될 때까지 일시 중단
  return <Chart data={data} />
}
```

## 상태 관리

### useTransition 패턴

긴급하지 않은 UI 업데이트를 래핑하여 상호작용을 부드럽게 유지하세요:

```tsx
"use client"
import { useTransition } from "react"

function SubmitButton({ action }: { action: () => Promise<void> }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => action())}
      disabled={isPending}
    >
      {isPending ? "저장 중..." : "저장"}
    </button>
  )
}
```

**가이드라인:**
- `isPending`을 피드백에 사용하세요 (버튼 비활성화, 스피너 표시)
- 제어된 입력 상태를 트랜지션으로 감싸지 마세요
- 트랜지션 내부에서 `await` 이후에는 후속 `setState`를 또 다른 `startTransition`으로 감싸세요

## 데이터 패턴

### "use cache" (Next.js 16)

함수 수준 캐싱:

```tsx
"use cache"

export async function getProducts() {
  const products = await db.query.products.findMany()
  return products
}

// 캐시 태그와 함께 사용
import { cacheTag } from "next/cache"

export async function getProduct(id: string) {
  "use cache"
  cacheTag(`product-${id}`)
  return db.query.products.findFirst({ where: eq(products.id, id) })
}
```

### Server Actions

```tsx
"use server"

import { updateTag, revalidateTag } from "next/cache"
import { z } from "zod"

const schema = z.object({
  title: z.string().min(1),
  content: z.string(),
})

export async function createPost(formData: FormData) {
  const parsed = schema.parse({
    title: formData.get("title"),
    content: formData.get("content"),
  })

  await db.insert(posts).values(parsed)

  // 쓰기 후 즉시 읽기 (즉각 반영)
  updateTag("posts")

  // 또는 SWR 스타일 재검증
  // revalidateTag("posts", "max")
}

// 캐시되지 않은 데이터 새로고침
import { refresh } from "next/cache"

export async function updateProfile(data: FormData) {
  await db.update(...)
  refresh() // 클라이언트 라우터 새로고침 트리거
}
```

### Proxy API (Next.js 16)

미들웨어를 대체하여 요청을 가로챕니다. 프로젝트 루트(`app/`와 같은 레벨)에 배치하세요:

```tsx
// proxy.ts (프로젝트 루트)
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { cookies } from "next/headers"

export async function proxy(request: NextRequest) {
  const cookieStore = await cookies()
  const session = cookieStore.get("session")

  if (!session && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

### 요청 API

Next.js 16에서 모든 요청 API는 비동기입니다:

```tsx
import { cookies, headers, draftMode } from "next/headers"

export default async function Page() {
  const cookieStore = await cookies()
  const headersList = await headers()
  const { isEnabled } = await draftMode()
}
```

## 에러 처리

커스텀 UX가 필요한 경우에만 정의하세요:

```
app/
├── error.tsx           # 라우트 수준 에러
├── global-error.tsx    # 루트 레이아웃 에러
├── not-found.tsx       # 404 페이지
└── loading.tsx         # 로딩 상태
```

그 외에는 부모 세그먼트에서 상속합니다.
