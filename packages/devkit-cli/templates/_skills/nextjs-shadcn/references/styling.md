# 스타일링

## 테마 시스템

### globals.css 구조

shadcn CLI(`pnpm dlx shadcn@latest init`)는 **Tailwind v4** 기준으로 `globals.css`에 OKLCH 토큰과 `@theme inline` 매핑을 자동 생성합니다. 프로젝트에 맞게 커스터마이즈하세요:

```css
@import "tailwindcss";

/* 다크모드를 .dark 클래스 기반으로 (next-themes와 함께) */
@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  /* ... 나머지 토큰 (전체 목록은 tailwind-patterns 참조) */

  /* 필요에 따라 자체 변수를 추가하세요 */
  --brand: oklch(0.62 0.19 260);
  --brand-foreground: oklch(1 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ... 다크 값으로 재정의 */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-brand: var(--brand);
  --radius-lg: var(--radius);
  /* ... */
}
```

> **테마 토큰 전체 목록·OKLCH 값·v3→v4 마이그레이션**은 **tailwind-patterns** 스킬의 `references/theme-system.md`에 정리돼 있습니다. 여기서는 shadcn 컴포넌트 사용에 집중합니다.

**프리셋 선택**: [ui.shadcn.com/create](https://ui.shadcn.com/create)에서 테마(vega, nova, maia, lyra, mira)와 색상을 선택하세요.

### 테마 커스터마이징

`globals.css`에서 빠르게 커스터마이즈할 수 있습니다:

```css
:root {
  /* 타이포그래피 - 폰트 변경 */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: "Fira Code", ui-monospace, monospace;

  /* 테두리 반경 - 모든 둥근 모서리에 영향 */
  --radius: 0.5rem;       /* 기본값 */
  /* --radius: 0.25rem;   /* 날카로운 스타일 */
  /* --radius: 0.75rem;   /* 더 둥근 스타일 */
  /* --radius: 1rem;      /* 매우 둥근 스타일 */
  /* --radius: 1.3rem;    /* 알약 형태 버튼 */
}
```

| 변수 | 효과 |
|----------|--------|
| `--font-sans` | 본문 텍스트, 버튼, 입력 필드 |
| `--font-mono` | 코드 블록, 기술 콘텐츠 |
| `--radius` | 모든 둥근 모서리 (버튼, 카드, 입력 필드) |

**팁**: `--radius` 값이 클수록(1rem+) 부드럽고 모던한 느낌을 줍니다. 작은 값(0.25rem)은 날카롭고 기술적인 느낌을 줍니다.

### 테마 색상 사용

```tsx
// ✅ CSS 변수 사용
<div className="bg-primary text-primary-foreground" />
<div className="border-border" />
<div className="text-muted-foreground" />

// ❌ 색상을 하드코딩하지 마세요
<div className="bg-blue-500" />
<div className="text-[#1a1a1a]" />
```

## shadcn/ui 프리셋

ui.shadcn.com/create에서 사용 가능한 스타일:

| 프리셋 | 특징 |
|--------|-----------|
| vega | 클래식한 shadcn/ui 스타일. 깔끔하고, 중립적이며, 익숙한 느낌 |
| nova | 줄어든 패딩과 마진으로 컴팩트한 레이아웃 |
| maia | 부드럽고 둥글며, 넉넉한 여백 |
| lyra | 각지고 날카로운 스타일. 모노 폰트와 잘 어울림 |
| mira | 컴팩트. 밀도 높은 인터페이스에 적합 |

### 폰트

`shadcn create` 프리셋 URL을 통해 사용 가능한 폰트:

| 폰트 | 유형 | 특징 |
|------|------|-----------|
| geist-sans | Sans | Vercel의 모던한 기하학적 산세리프 |
| inter | Sans | 깔끔하고 다용도 (기존 기본값) |
| figtree | Sans | 친근하고 기하학적 |
| dm-sans | Sans | 개성 있는 컴팩트 기하학 |
| outfit | Sans | 모던하고 부드러운 |
| noto-sans | Sans | 범용 다국어 지원 |
| nunito-sans | Sans | 둥글고 친근한 |
| roboto | Sans | Google의 다용도 산세리프 |
| raleway | Sans | 우아하고 얇은 디스플레이 |
| public-sans | Sans | 미국 정부 표준, 중립적 |
| jetbrains-mono | Mono | 개발자 중심 모노스페이스 |

## 아이콘 라이브러리

우선순위 순서 (먼저 사용 가능한 것을 사용):

1. **lucide** (기본값) - `pnpm add lucide-react`
2. **tabler** - `pnpm add @tabler/icons-react`
3. **hugeicons** - `pnpm add hugeicons-react`
4. **phosphor** - `pnpm add @phosphor-icons/react`

```tsx
// lucide 예시
import { ChevronRight, Menu, X } from "lucide-react"

<Button>
  Next <ChevronRight className="ml-2 h-4 w-4" />
</Button>
```

## 애니메이션

### CSS 페이지 전환

`globals.css`에 추가하세요:

```css
@keyframes page-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@layer utilities {
  .animate-page-in {
    animation: page-in 0.6s ease-out both;
  }
}
```

layout 또는 template에서 사용:

```tsx
// template.tsx - 매 네비게이션마다 애니메이션 실행
export default function Template({ children }: { children: React.ReactNode }) {
  return <main className="animate-page-in">{children}</main>
}
```

### View Transitions API

Next.js 내장 지원 (`<Link>`와 함께 동작):

```ts
// next.config.ts
import type { NextConfig } from "next"

const config: NextConfig = {
  experimental: {
    viewTransition: true
  }
}

export default config
```

`<Link>`를 평소처럼 사용하세요 - 전환이 자동으로 적용됩니다:

```tsx
import Link from "next/link"

<Link href="/about">About</Link>
```

### Motion 라이브러리

복잡한 애니메이션에 사용:

```bash
pnpm add motion
```

```tsx
"use client"

import { motion, HTMLMotionProps } from "motion/react"

interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number
  duration?: number
  direction?: "up" | "down" | "left" | "right" | "none"
}

export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.5,
  direction = "up",
  ...props
}: FadeInProps) {
  const directions = {
    up: { y: 20, x: 0 },
    down: { y: -20, x: 0 },
    left: { x: 20, y: 0 },
    right: { x: -20, y: 0 },
    none: { x: 0, y: 0 },
  }

  return (
    <motion.div
      initial={{ opacity: 0, ...directions[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
```

### GSAP

스크롤 트리거 및 복잡한 시퀀스에 사용:

```bash
pnpm add gsap @gsap/react
```

```tsx
"use client"

import { useRef } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function ScrollReveal({ children }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.from(containerRef.current, {
      opacity: 0,
      y: 50,
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top 80%",
      },
    })
  }, [])

  return <div ref={containerRef}>{children}</div>
}
```

## 애니메이션 결정 트리

```text
마운트 시 간단한 페이드/슬라이드?
├── 예 → globals.css의 CSS 애니메이션
└── 아니오 ↓

페이지/라우트 전환?
├── 예 → View Transitions API 또는 template.tsx
└── 아니오 ↓

인터랙티브 호버/탭 상태?
├── 예 → Tailwind 트랜지션 + Motion
└── 아니오 ↓

스크롤 트리거 시퀀스?
├── 예 → GSAP + ScrollTrigger
└── 아니오 → 애니메이션이 필요한지 재검토
```

## 성능 팁

1. **CSS 우선 사용** - GPU 가속, JS 번들 없음
2. **`will-change`는 아껴서 사용** - 확실한 애니메이션에만 적용
3. **레이아웃 스래싱 방지** - `transform`과 `opacity`를 애니메이션화하세요
4. **Motion/GSAP 지연 로드** - 중요하지 않은 애니메이션에는 동적 임포트 사용

```tsx
// 애니메이션 라이브러리 지연 로드
const MotionDiv = dynamic(
  () => import("motion/react").then((mod) => mod.motion.div),
  { ssr: false }
)
```

## 장식적 배경

시각적 분위기와 섹션 계층 구조를 위한 재사용 가능한 패턴입니다.

### 그리드 패턴

```tsx
import { cn } from "@/lib/utils"

export function GridBackground({
  children,
  className,
  size = 20
}: {
  children: React.ReactNode
  className?: string
  size?: number
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "absolute inset-0 -z-10",
          "[background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)]"
        )}
        style={{ backgroundSize: `${size}px ${size}px` }}
      />
      {children}
    </div>
  )
}
```

### 도트 패턴

```tsx
export function DotBackground({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "absolute inset-0 -z-10",
          "[background-size:20px_20px]",
          "[background-image:radial-gradient(color-mix(in_oklch,var(--muted-foreground)_30%,transparent)_1px,transparent_1px)]"
        )}
      />
      {children}
    </div>
  )
}
```

### 방사형 그래디언트 히어로

```tsx
export function GradientHero({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background: "radial-gradient(125% 125% at 50% 10%, var(--background) 40%, var(--primary) 100%)"
        }}
      />
      {children}
    </div>
  )
}
```

### 페이드 엣지 효과

비네팅을 위해 그리드/도트와 결합하세요:

```tsx
<div className="relative">
  <GridBackground className="absolute inset-0" />
  <div className="pointer-events-none absolute inset-0 bg-background [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
  {/* 콘텐츠 */}
</div>
```

### 섹션 래퍼

다른 테마 컨텍스트가 필요한 섹션에 사용:

```tsx
type SectionProps = {
  children: React.ReactNode
  variant?: "default" | "muted" | "inverted"
  className?: string
}

export function Section({ children, variant = "default", className }: SectionProps) {
  return (
    <section
      className={cn(
        "relative py-24",
        variant === "muted" && "bg-muted",
        variant === "inverted" && "bg-foreground text-background [&_*]:border-background/20",
        className
      )}
    >
      {children}
    </section>
  )
}
```

### 배경 결정 트리

```text
전체 페이지 앰비언트 효과?
├── 예 → 고정 방사형 그래디언트 (GradientHero)
└── 아니오 ↓

깊이감을 위한 미묘한 텍스처?
├── 그리드 → 기술적/대시보드 느낌
├── 도트 → 부드러운/유기적 느낌
└── 아니오 ↓

섹션 대비가 필요한가?
├── 예 → variant가 있는 섹션 래퍼
└── 아니오 → 기본 bg-background
```

### 파일 구성

```text
components/
├── ui/           # shadcn 프리미티브
├── backgrounds/  # Grid, Dot, Gradient 패턴
└── animations/   # FadeIn, ScrollReveal
```

## 선택적 유틸리티

### 스크롤바 숨기기

스크롤 기능을 유지하면서 스크롤바를 숨기세요. v4에서는 플러그인 없이 `@utility`로 정의합니다:

```css
/* globals.css */
@utility scrollbar-hide {
  &::-webkit-scrollbar { display: none; }
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

```tsx
<div className="overflow-y-auto scrollbar-hide">
  {/* 스크롤바가 보이지 않는 스크롤 가능한 콘텐츠 */}
</div>
```
