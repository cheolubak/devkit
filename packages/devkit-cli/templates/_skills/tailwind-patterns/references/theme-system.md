# Tailwind v4 테마 시스템 레퍼런스

> Tailwind CSS **v4** 기준. 색상은 **OKLCH**, 설정은 **CSS-first**(`@theme`). `tailwind.config.js`와 `hsl(var(--x))` 패턴은 쓰지 않습니다. v3 프로젝트라면 맨 아래 [마이그레이션](#v3--v4-마이그레이션) 참조.

## 구조 개요

v4 + shadcn/ui의 테마는 세 부분으로 나뉩니다.

1. **원본 색상 변수** — `:root`(라이트) / `.dark`(다크)에 OKLCH로 정의
2. **`@theme inline` 매핑** — `--color-*` 토큰이 위 변수를 인라인 참조 → `bg-*`/`text-*` 유틸리티 생성
3. **다크모드 variant** — `@custom-variant dark`로 `.dark` 클래스 기반 전환

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  /* 2. 원본 변수 (light) */
}
.dark {
  /* 2. 원본 변수 (dark) */
}

@theme inline {
  /* 3. Tailwind 토큰 매핑 */
}
```

---

## shadcn/ui v4 표준 토큰 (전체)

### :root (라이트)

```css
:root {
  --radius: 0.625rem;

  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
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

  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);

  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

### .dark (다크)

```css
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);

  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);

  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}
```

### @theme inline 매핑

```css
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
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

  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}
```

> **왜 `@theme inline`인가?** `inline`을 붙이면 유틸리티가 `--color-primary` 대신 그 값(`var(--primary)`)을 인라인으로 사용합니다. 덕분에 `.dark`에서 `--primary`만 재정의해도 `bg-primary`가 즉시 다크값으로 전환됩니다. `inline` 없이 매핑하면 `.dark`의 재정의가 유틸리티에 반영되지 않습니다.

---

## 변수 사용 맵

| 변수 | Tailwind 클래스 | 용도 |
|----------|---------------|---------|
| `--background` | `bg-background` | 페이지 배경 |
| `--foreground` | `text-foreground` | 기본 텍스트 |
| `--primary` | `bg-primary`, `text-primary` | 버튼, CTA, 링크 |
| `--primary-foreground` | `text-primary-foreground` | primary 배경 위 텍스트 |
| `--secondary` | `bg-secondary` | 보조 버튼 |
| `--muted` | `bg-muted` | 은은한 배경 |
| `--muted-foreground` | `text-muted-foreground` | 보조 텍스트, 라벨 |
| `--accent` | `bg-accent` | 호버 상태, 하이라이트 |
| `--destructive` | `bg-destructive` | 삭제, 위험 동작 |
| `--border` | `border-border` | 모든 테두리 |
| `--input` | `border-input` | 입력 필드 테두리 |
| `--ring` | `ring-ring` | 포커스 링 |
| `--radius` | `rounded-sm/md/lg/xl` | 테두리 반경 스케일 |
| `--card` | `bg-card` | 카드 배경 |
| `--popover` | `bg-popover` | 팝오버/드롭다운 배경 |
| `--chart-1`~`5` | `fill-chart-1`, `stroke-chart-2` | 차트 색상 |
| `--sidebar` | `bg-sidebar` | 사이드바 배경 |

---

## 커스텀 색상 추가

v4에서는 `@theme`에 `--color-*`를 추가하는 순간 유틸리티가 생성됩니다. JS 등록 단계가 없습니다.

```css
:root {
  --brand: oklch(0.62 0.19 260);
  --brand-foreground: oklch(1 0 0);
  --success: oklch(0.65 0.17 150);
  --success-foreground: oklch(1 0 0);
  --warning: oklch(0.8 0.16 85);
  --warning-foreground: oklch(0.2 0 0);
  --info: oklch(0.68 0.15 230);
  --info-foreground: oklch(1 0 0);
}

.dark {
  --brand: oklch(0.7 0.19 260);
  --success: oklch(0.72 0.17 150);
  --warning: oklch(0.85 0.16 85);
  --info: oklch(0.74 0.15 230);
}

@theme inline {
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
}
```

```tsx
<div className="bg-brand text-brand-foreground" />
<Badge className="bg-success text-success-foreground">Active</Badge>
<Alert className="bg-warning text-warning-foreground">Warning</Alert>
```

> **OKLCH 팁**: `oklch(L C H)` — L(명도 0~1), C(채도), H(색상각 0~360). 같은 색조에서 명도만 조절하면 라이트/다크 쌍을 만들기 쉽습니다. 투명도는 `oklch(0.62 0.19 260 / 50%)`.

---

## 다크 모드 설정

### @custom-variant

`.dark` 클래스 기반 전환을 위해 CSS 상단에 선언합니다(next-themes의 `attribute="class"`와 짝).

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
```

### next-themes

```bash
pnpm add next-themes
```

```tsx
// app/layout.tsx
import { ThemeProvider } from 'next-themes'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

```tsx
// components/theme-toggle.tsx
'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    >
      <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </Button>
  )
}
```

---

## 하드코딩된 색상: 절대 사용 금지

```tsx
// ❌ 절대 사용 금지
<div className="bg-blue-500 text-white" />
<div className="bg-[#1a1a1a]" />
<div className="text-gray-600" />

// ✅ 항상 테마 토큰 사용 (다크모드 자동 대응)
<div className="bg-primary text-primary-foreground" />
<div className="bg-background text-foreground" />
<div className="text-muted-foreground" />
<div className="border-border" />
```

---

## 폰트 커스터마이징 (@theme)

v4는 `@theme`의 `--font-*`로 폰트 패밀리 유틸리티를 만듭니다. `next/font` 변수와 함께 쓸 때는 `@theme inline`으로 연결합니다.

```tsx
// app/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

// <body className={`${inter.variable} ${mono.variable}`}>
```

```css
@theme inline {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
}
```

`font-sans`, `font-mono` 유틸리티로 사용합니다.

---

## 테두리 반경 커스터마이징

`--radius` 하나만 바꾸면 `rounded-sm/md/lg/xl`이 함께 스케일됩니다(위 `@theme inline`의 `calc()` 매핑 덕분).

```css
:root {
  --radius: 0.625rem;  /* 기본값 */
  /* --radius: 0.3rem;  날카로운, 기술적 느낌 */
  /* --radius: 1rem;    둥근 느낌 */
}
```

---

## v3 → v4 마이그레이션

가장 확실한 방법은 공식 업그레이드 도구입니다.

```bash
pnpm dlx @tailwindcss/upgrade
```

수동 변경 시 핵심 차이:

| v3 | v4 |
|----|----|
| `@tailwind base; @tailwind components; @tailwind utilities;` | `@import "tailwindcss";` |
| `tailwind.config.js`의 `theme.extend` | CSS의 `@theme { ... }` |
| `content: [...]` 배열 | 자동 콘텐츠 감지(설정 불필요) |
| `hsl(var(--primary))` + HSL 채널(`0 0% 100%`) | OKLCH 값 + `@theme inline` 매핑 |
| `darkMode: 'class'` | `@custom-variant dark (&:is(.dark *));` |
| PostCSS `tailwindcss` + `autoprefixer` | `@tailwindcss/postcss` 하나 |
| `@layer utilities { .x {} }` 커스텀 유틸 | `@utility x { ... }` |

### 색상 값 변환 (HSL 채널 → OKLCH)

v3 shadcn은 `--primary: 240 5.9% 10%` 같은 **HSL 채널**을 저장하고 `hsl(var(--primary))`로 감쌌습니다. v4는 완성된 색상값을 저장합니다. 기존 HSL을 유지하고 싶다면 `hsl(...)`로 감싼 값을 그대로 넣어도 됩니다.

```css
/* v3 유지형 (그대로 두고 최소 이전) */
:root { --primary: hsl(240 5.9% 10%); }
@theme inline { --color-primary: var(--primary); }

/* v4 권장형 (OKLCH) */
:root { --primary: oklch(0.205 0 0); }
@theme inline { --color-primary: var(--primary); }
```

> shadcn/ui를 쓰는 경우 CLI(`pnpm dlx shadcn@latest init`)가 v4용 OKLCH 토큰을 자동 생성합니다. 컴포넌트 구조·CLI는 **nextjs-shadcn** 스킬 참조.

---

## 공식 문서

- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [v4 업그레이드 가이드](https://tailwindcss.com/docs/upgrade-guide)
- [`@theme` 레퍼런스](https://tailwindcss.com/docs/theme)
- [shadcn/ui 테마(v4)](https://ui.shadcn.com/docs/theming)
- [next-themes](https://github.com/pacocoursey/next-themes)
