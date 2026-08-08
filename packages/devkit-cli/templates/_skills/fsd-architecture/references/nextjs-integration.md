# Next.js App Router × FSD 통합

FSD를 Next.js에 적용할 때 **모두가 부딪히는 지점**: Next.js의 라우팅 디렉토리(`app/`, `pages/`)와 FSD의 레이어(`app`, `pages`)가 **이름은 같지만 역할이 완전히 다르다**. 이 문서는 그 충돌을 실제 폴더 배치로 해소한다.

## 목차

- [이름 충돌의 본질](#이름-충돌의-본질)
- [핵심 원칙: 라우트는 얇게, 화면은 FSD로](#핵심-원칙-라우트는-얇게-화면은-fsd로)
- [App Router 권장 폴더 구조](#app-router-권장-폴더-구조)
- [FSD app 레이어는 어디로 가나](#fsd-app-레이어는-어디로-가나)
- [route group으로 FSD pages 매핑](#route-group으로-fsd-pages-매핑)
- [서버/클라이언트 컴포넌트와 세그먼트](#서버클라이언트-컴포넌트와-세그먼트)
- [Pages Router(구버전) 대응](#pages-router구버전-대응)

## 이름 충돌의 본질

| 이름 | Next.js에서 | FSD에서 |
|------|-------------|---------|
| `app/` | **라우팅 디렉토리** (`page.tsx`, `layout.tsx`, `route.ts`) — 프레임워크가 파일 규칙으로 라우트를 생성 | **최상위 레이어** — 프로바이더·전역 조립 |
| `pages/` | (Pages Router의) **라우팅 디렉토리** | **레이어** — 라우트별 완성 화면 |

Next.js가 `app/`·`pages/` 디렉토리의 **소유권**을 가진다(파일 이름이 곧 URL). 그래서 FSD 레이어를 그 안에 그대로 넣을 수 없다. **해결책은 FSD 전체를 `src/` 안으로 넣고, Next 라우팅 디렉토리를 그와 분리하는 것.**

## 핵심 원칙: 라우트는 얇게, 화면은 FSD로

Next의 `app/**/page.tsx`는 **라우트 진입점**일 뿐이다. 실제 화면은 FSD의 `pages` 레이어 슬라이스에 만들고, `page.tsx`는 그것을 **re-export만** 한다.

```tsx
// app/products/[id]/page.tsx  ← Next 라우트 진입점 (얇게)
export { ProductDetailsPage as default } from "@/pages/product-details";

// 필요하면 여기서 params → props 어댑팅만
```

```tsx
// src/pages/product-details/ui/ProductDetailsPage.tsx  ← 실제 화면(FSD)
import { ProductGallery } from "@/widgets/product-gallery";
import { AddToCartButton } from "@/features/add-to-cart";
import { getProduct } from "@/entities/product";

export async function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next.js 15부터 params는 Promise다
  const product = await getProduct(id);
  return ( /* widgets/features/entities 조합 */ );
}
```

이렇게 하면 라우팅 규칙(프레임워크 소유)과 화면 아키텍처(FSD 소유)가 깔끔히 분리된다.

## App Router 권장 폴더 구조

```text
project-root/
├── app/                      # Next.js 라우팅 (프레임워크 소유) — 얇은 진입점
│   ├── layout.tsx            # RootLayout: src/app 레이어의 Providers를 감쌈
│   ├── page.tsx              # → export { HomePage as default } from "@/pages/home"
│   ├── products/
│   │   └── [id]/
│   │       └── page.tsx      # → @/pages/product-details
│   └── api/                  # 라우트 핸들러는 Next 관례대로 여기
│
└── src/                      # FSD 레이어 전체 (우리 코드)
    ├── app/                  # FSD app 레이어 (Next app/ 과 이름만 같음, 별개)
    │   ├── providers/
    │   └── styles/
    ├── pages/                # FSD pages 레이어 = 실제 화면
    │   ├── home/
    │   └── product-details/
    ├── widgets/
    ├── features/
    ├── entities/
    └── shared/
```

> **혼동 방지 규칙**: 라우팅 `app/`은 프로젝트 루트, FSD `src/app/`은 `src/` 안. 둘을 물리적으로 다른 위치에 두어 이름 충돌을 실체적으로 분리한다. `tsconfig`의 `baseUrl`을 `./src`로 두면 `@/pages/...`가 항상 FSD 레이어를 가리킨다.

## FSD app 레이어는 어디로 가나

FSD `app` 레이어(프로바이더·전역 스타일)는 `src/app/`에 두고, Next의 루트 `app/layout.tsx`가 이를 소비한다.

```tsx
// src/app/providers/index.tsx  (FSD app 레이어)
"use client";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryProvider>
  );
}
```

```tsx
// app/layout.tsx  (Next 라우팅)
import { Providers } from "@/app/providers";   // = src/app/providers
import "@/app/styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
```

## route group으로 FSD pages 매핑

여러 라우트가 한 페이지 그룹을 이룰 때 Next의 route group `(...)`으로 URL에 영향 없이 묶는다. FSD `pages` 슬라이스와 1:1로 대응시키면 추적이 쉽다.

```text
app/
├── (marketing)/
│   ├── page.tsx          → @/pages/home
│   └── about/page.tsx    → @/pages/about
└── (shop)/
    └── products/[id]/page.tsx → @/pages/product-details
```

## 서버/클라이언트 컴포넌트와 세그먼트

FSD 세그먼트와 RSC(React Server Components)는 충돌하지 않는다 — 오히려 잘 맞는다.

- `entities/*/api`, `features/*/api` — 서버에서 데이터 페칭(서버 컴포넌트/서버 액션)에 자연스럽게 대응.
- `"use client"`는 상호작용이 필요한 **리프 UI**에만 — 대개 `features/*/ui`, `widgets/*/ui`의 특정 컴포넌트.
- `pages` 레이어의 화면 컴포넌트는 기본 서버 컴포넌트로 두고, 클라이언트 경계는 아래 feature/widget에서 긋는다.

> 컴포넌트 단위의 서버/클라이언트 경계 최적화 자체는 `react-best-practices` 스킬이 다룬다. FSD는 "그 경계를 어느 폴더에 두느냐"를 정한다.

## Pages Router(구버전) 대응

레거시 Pages Router를 쓴다면 라우팅 `pages/`(루트)와 FSD `pages` 레이어(`src/pages`)가 더 헷갈린다. 이때는 **FSD pages 레이어의 이름을 `screens` 또는 `views`로 바꿔** 충돌을 피하는 관행이 흔하다.

```text
pages/                 # Next Pages Router (라우팅)
└── products/[id].tsx  → export { default } from "@/screens/product-details"
src/
└── screens/           # FSD "pages" 레이어를 rename
    └── product-details/
```

App Router로 신규 구축한다면 위 `app/`+`src/` 분리로 충분하므로 rename이 필요 없다.
