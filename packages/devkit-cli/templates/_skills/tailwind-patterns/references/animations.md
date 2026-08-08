# Tailwind 애니메이션 패턴 레퍼런스

## 의사결정 트리

```
마운트 시 단순한 fade/slide가 필요한가?
├── 예 → globals.css에 CSS 애니메이션 정의
└── 아니오 ↓

페이지/라우트 전환이 필요한가?
├── 예 → View Transitions API 또는 template.tsx 사용
└── 아니오 ↓

인터랙티브 호버/탭 상태가 필요한가?
├── 예 → Tailwind transitions + Motion
└── 아니오 ↓

스크롤 기반 시퀀스가 필요한가?
├── 예 → GSAP + ScrollTrigger
└── 아니오 → 애니메이션이 정말 필요한지 재검토
```

---

## 1. Tailwind 내장 전환 효과

### 호버/포커스 전환

```tsx
// 색상 전환
<button className="transition-colors duration-200 hover:bg-accent" />

// 호버 시 확대
<div className="transition-transform duration-200 hover:scale-105" />

// 여러 속성 동시 전환
<div className="transition-all duration-300 hover:shadow-lg hover:scale-[1.02]" />

// 투명도
<div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
```

### 내장 애니메이션

```tsx
<div className="animate-pulse" />   // 스켈레톤 로딩
<div className="animate-spin" />    // 로딩 스피너
<div className="animate-ping" />    // 알림 점
<div className="animate-bounce" />  // 주의 끌기
```

---

## 2. CSS 애니메이션 (globals.css)

### 페이지 진입 효과

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

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* v4: @utility로 커스텀 애니메이션 유틸리티 정의 (구 @layer utilities 대체) */
@utility animate-page-in {
  animation: page-in 0.6s ease-out both;
}
@utility animate-fade-in {
  animation: fade-in 0.3s ease-out both;
}
@utility animate-slide-up {
  animation: slide-up 0.5s ease-out both;
}
@utility animate-slide-in-right {
  animation: slide-in-right 0.4s ease-out both;
}
```

> 또는 `@theme { --animate-fade-in: fade-in 0.3s ease-out both; }`처럼 테마 토큰으로 등록하면 `animate-fade-in`이 자동 생성됩니다(키프레임을 `@theme` 안에 함께 선언). 둘 중 하나만 사용하세요.

### template.tsx를 활용한 사용법

```tsx
// app/template.tsx — 모든 네비게이션에서 애니메이션 실행
export default function Template({ children }: { children: React.ReactNode }) {
  return <main className="animate-page-in">{children}</main>
}
```

### 순차적 자식 요소 애니메이션

```css
.stagger-children > * {
  animation: slide-up 0.5s ease-out both;
}

.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 100ms; }
.stagger-children > *:nth-child(3) { animation-delay: 200ms; }
.stagger-children > *:nth-child(4) { animation-delay: 300ms; }
.stagger-children > *:nth-child(5) { animation-delay: 400ms; }
```

---

## 3. View Transitions API

```ts
// next.config.ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    viewTransition: true,
  },
}

export default config
```

`<Link>`와 함께 자동으로 동작합니다:

```tsx
import Link from 'next/link'
<Link href="/about">About</Link>  // 전환 효과가 자동으로 적용됨
```

---

## 4. Motion 라이브러리 (motion/react)

```bash
pnpm add motion
```

### FadeIn 컴포넌트

```tsx
'use client'

import { motion, type HTMLMotionProps } from 'motion/react'

interface FadeInProps extends HTMLMotionProps<'div'> {
  delay?: number
  duration?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
}

export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 0.5,
  direction = 'up',
  ...props
}: FadeInProps) {
  const offsets = {
    up: { y: 20, x: 0 },
    down: { y: -20, x: 0 },
    left: { x: 20, y: 0 },
    right: { x: -20, y: 0 },
    none: { x: 0, y: 0 },
  }

  return (
    <motion.div
      initial={{ opacity: 0, ...offsets[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration, delay, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
```

### 순차적 리스트 애니메이션

```tsx
'use client'

import { motion } from 'motion/react'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export function StaggeredList({ children }: { children: React.ReactNode[] }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {children.map((child, i) => (
        <motion.div key={i} variants={item}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}
```

### Motion 지연 로딩

```tsx
import dynamic from 'next/dynamic'

const MotionDiv = dynamic(
  () => import('motion/react').then(mod => mod.motion.div),
  { ssr: false }
)
```

---

## 5. GSAP + ScrollTrigger

```bash
pnpm add gsap @gsap/react
```

### 스크롤 시 나타나기

```tsx
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.from(ref.current, {
      opacity: 0,
      y: 50,
      duration: 0.8,
      scrollTrigger: {
        trigger: ref.current,
        start: 'top 80%',
        end: 'top 50%',
        toggleActions: 'play none none none',
      },
    })
  }, [])

  return <div ref={ref}>{children}</div>
}
```

### 패럴랙스 효과

```tsx
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function Parallax({ children, speed = 0.5 }: { children: React.ReactNode; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.to(ref.current, {
      yPercent: -50 * speed,
      ease: 'none',
      scrollTrigger: {
        trigger: ref.current,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    })
  }, [speed])

  return <div ref={ref}>{children}</div>
}
```

---

## 6. 부드러운 스크롤 (Lenis)

```bash
pnpm add lenis
```

```tsx
'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis()

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)
    return () => lenis.destroy()
  }, [])

  return <>{children}</>
}
```

---

## 성능 팁

1. **CSS 애니메이션을 우선 사용** -- GPU 가속이 적용되며, JS 번들 비용이 없음
2. **`transform`과 `opacity`만 애니메이션 적용** -- 레이아웃 속성(`width`, `height`, `padding`) 애니메이션은 피할 것
3. **`will-change`는 신중하게 사용** -- 곧 애니메이션될 요소에만 적용
4. **애니메이션 라이브러리는 지연 로딩** -- Motion/GSAP에 동적 import 사용
5. **`viewport: { once: true }` 사용** -- 스크롤 복귀 시 재실행 방지
6. **`transition-all` 대신 `transition-*` 사용** -- 더 나은 성능 제공

---

## 관련 라이브러리

- [Motion](https://motion.dev) -- 선언적 React 애니메이션
- [GSAP](https://gsap.com) -- 타임라인 및 스크롤 기반 애니메이션
- [Lenis](https://lenis.darkroom.engineering) -- 부드러운 스크롤
- [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) -- v4용 애니메이션 유틸리티(`@import "tw-animate-css";`), 구 `tailwindcss-animate` 대체
