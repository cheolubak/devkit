---
name: tailwind-patterns
description: "Tailwind CSS v4 + CSS 변수 패턴. CSS-first(@theme) 테마 시스템, 반응형 디자인, 다크모드, 애니메이션 가이드.\nAPPLIES: Tailwind 클래스나 `@theme`·CSS 변수로 스타일·테마·다크모드·반응형을 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"스타일 입혀줘\", \"디자인 적용\", \"다크모드\", \"반응형\", \"테마 설정\", \"tailwind\", \"tailwind v4\", \"CSS 변수\", \"색상 시스템\", \"모바일 대응\", 스타일링/테마/반응형 디자인 작업 시.\nSKIP: 컴포넌트 구조는 nextjs-shadcn. JS 기반 복잡한 애니메이션은 framer-motion. 클래스 정렬(prettier-plugin-tailwindcss)은 prettier."
---

> **Tailwind CSS v4 기준** — CSS-first 설정(`@import "tailwindcss"` + `@theme`). `tailwind.config.js`와 `@tailwind` 지시자는 더 이상 쓰지 않습니다. v3에서 올라오는 경우 [references/theme-system.md](references/theme-system.md#v3--v4-마이그레이션)의 마이그레이션 섹션 참조.

> 참조:
> - [references/theme-system.md](references/theme-system.md) - v4 @theme 토큰, OKLCH 색상 변수, 다크모드, v3→v4 마이그레이션
> - [references/layouts.md](references/layouts.md) - 브레이크포인트(@theme 커스텀), Flex/Grid 패턴, 컨테이너, 반응형 타이포그래피
> - [references/animations.md](references/animations.md) - @utility/@keyframes 애니메이션, View Transitions, Motion, GSAP, Lenis
> - [references/utilities.md](references/utilities.md) - cn(), cva, 배경 패턴, 스크롤, 오버레이 등 유틸리티

# Tailwind CSS v4 패턴 가이드

## 0. 설치 (v4)

```bash
pnpm add tailwindcss @tailwindcss/postcss
```

```js
// postcss.config.mjs — v4는 플러그인 하나면 충분 (autoprefixer 불필요)
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

Next.js는 위 PostCSS 설정 + `globals.css`의 `@import "tailwindcss"`만으로 동작합니다. Vite는 `@tailwindcss/vite` 플러그인 사용. `tailwind.config.js`·`content` 배열·`@tailwind` 지시자는 v4에서 제거됐습니다(콘텐츠 자동 감지).

## 1. CSS-first 테마 시스템 (@theme)

v4는 JS 설정 파일 없이 CSS에서 직접 테마를 정의합니다. shadcn/ui v4 표준 패턴은 **OKLCH 색상 변수**를 `:root`/`.dark`에 두고, `@theme inline`으로 Tailwind 토큰(`--color-*`)에 매핑합니다.

### globals.css 설정

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
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
  /* ... 나머지 토큰도 다크값으로 재정의 */
}

/* CSS 변수 → Tailwind 토큰 매핑 (inline: 변수 값을 그대로 사용) */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
}
```

> `@theme inline`을 쓰면 `--color-primary`가 `var(--primary)`를 **인라인 참조**하므로, `.dark`에서 `--primary`만 바꿔도 `bg-primary`가 자동 전환됩니다. shadcn/ui v4의 기본 방식입니다.

### 커스텀 브랜드 색상 추가

v4에서는 `@theme`에 `--color-*` 변수를 추가하면 그 즉시 `bg-*`/`text-*` 유틸리티가 생성됩니다. JS 설정 불필요.

```css
:root {
  --brand: oklch(0.62 0.19 260);
  --brand-foreground: oklch(1 0 0);
  --success: oklch(0.65 0.17 150);
  --success-foreground: oklch(1 0 0);
  --warning: oklch(0.8 0.16 85);
  --warning-foreground: oklch(0.2 0 0);
}

.dark {
  --brand: oklch(0.7 0.19 260);
  --success: oklch(0.72 0.17 150);
  --warning: oklch(0.85 0.16 85);
}

@theme inline {
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

```tsx
// 바로 사용 가능 — tailwind.config.ts 등록 불필요
<div className="bg-brand text-brand-foreground" />
<Badge className="bg-success text-success-foreground">Active</Badge>
```

## 2. 하드코딩 색상 금지

```tsx
// ✅ 좋음 - 테마 변수
<div className="bg-primary text-primary-foreground" />
<div className="bg-muted text-muted-foreground" />
<div className="border-border" />
<div className="bg-brand text-brand-foreground" />

// ❌ 나쁨 - 하드코딩
<div className="bg-blue-500 text-white" />
<div className="bg-[#1a1a1a]" />
<div className="text-gray-600" />
```

## 3. 반응형 디자인

### 모바일 퍼스트

```tsx
<div className="
  grid grid-cols-1        // 모바일: 1열
  md:grid-cols-2          // 태블릿: 2열
  lg:grid-cols-3          // 데스크톱: 3열
  gap-4 md:gap-6 lg:gap-8
">
```

### 컨테이너 패턴

```tsx
// 좋음 - 일관된 컨테이너
<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">

// 또는 Tailwind container
<div className="container mx-auto px-4">
```

### 반응형 타이포그래피

```tsx
<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold" />
<p className="text-sm md:text-base" />
```

## 4. 다크모드

```tsx
// next-themes 사용
import { ThemeProvider } from "next-themes";

// layout.tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>

// 컴포넌트에서 (CSS 변수로 자동 전환)
<div className="bg-background text-foreground" />

// 명시적 다크모드 스타일이 필요한 경우
<div className="bg-white dark:bg-gray-900" />
```

## 5. 애니메이션

### Tailwind 내장

```tsx
<div className="transition-colors duration-200 hover:bg-accent" />
<div className="transition-transform hover:scale-105" />
<div className="animate-pulse" />  // 스켈레톤
<div className="animate-spin" />   // 로딩 스피너
```

### 커스텀 애니메이션 (v4)

v4에서는 `@theme`에 `--animate-*`를 정의하고 `@keyframes`를 함께 선언하면 `animate-*` 유틸리티가 생성됩니다. JS 설정 불필요.

```css
/* globals.css */
@theme {
  --animate-slide-up: slide-up 0.3s ease-out both;
  --animate-fade-in: fade-in 0.2s ease-out both;

  @keyframes slide-up {
    from { transform: translateY(10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
```

```tsx
<div className="animate-slide-up" />
<div className="animate-fade-in" />
```

## 6. 레이아웃 패턴

### Flexbox

```tsx
// 중앙 정렬
<div className="flex items-center justify-center" />

// 양쪽 정렬
<div className="flex items-center justify-between" />

// 세로 스택
<div className="flex flex-col gap-4" />
```

### Grid

```tsx
// 자동 채우기
<div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4" />

// 사이드바 레이아웃
<div className="grid grid-cols-[250px_1fr] gap-6" />
```

## 7. cn() 유틸리티

```tsx
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 사용
function Badge({ variant, className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
      variant === "success" && "bg-success text-success-foreground",
      variant === "warning" && "bg-warning text-warning-foreground",
      variant === "error" && "bg-destructive text-destructive-foreground",
      className // 외부에서 오버라이드 가능
    )} />
  );
}
```

## 8. 스크롤바 숨기기 (v4 @utility)

v4에서는 플러그인 없이 `@utility`로 직접 정의합니다.

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
  {/* 스크롤 가능하지만 스크롤바 숨김 */}
</div>
```

## 9. 자주 쓰는 패턴

```tsx
// 텍스트 줄임
<p className="truncate" />              // 한 줄
<p className="line-clamp-2" />          // 두 줄

// 비율 유지 이미지
<div className="aspect-video relative">
  <Image src={src} alt={alt} fill className="object-cover" />
</div>

// 구분선
<div className="h-px bg-border" />

// 오버레이
<div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />

// 포커스 링
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
```
