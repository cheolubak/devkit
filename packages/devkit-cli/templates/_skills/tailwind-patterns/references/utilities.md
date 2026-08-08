# Tailwind 유틸리티 & 컴포넌트 레퍼런스

## cn() 유틸리티

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 사용법

```tsx
import { cn } from '@/lib/utils'

// 조건부 클래스
<div className={cn('base-class', isActive && 'active-class')} />

// 변형 패턴
function Badge({ variant, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
      variant === 'success' && 'bg-success text-success-foreground',
      variant === 'warning' && 'bg-warning text-warning-foreground',
      variant === 'error' && 'bg-destructive text-destructive-foreground',
      className  // 오버라이드 허용
    )} />
  )
}
```

---

## class-variance-authority (cva)

```bash
pnpm add class-variance-authority
```

```tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
```

---

## 자주 사용하는 유틸리티 패턴

### 텍스트

```text
# 말줄임
truncate                     # 한 줄 말줄임표
line-clamp-2                 # 여러 줄 (2줄)
line-clamp-3                 # 여러 줄 (3줄)

# 텍스트 균형 맞추기
text-balance                 # 줄 바꿈 균형 (제목에 적합)
text-pretty                  # 과부 방지 (문단에 적합)

# 텍스트 선택
select-none                  # 텍스트 선택 방지
select-all                   # 클릭 시 전체 선택
```

### 가시성 & 표시

```text
# 반응형 표시/숨기기
hidden md:block              # 모바일에서 숨기고, md 이상에서 표시
md:hidden                    # 모바일에서 표시하고, md 이상에서 숨기기
sr-only                      # 스크린 리더 전용

# 콘텐츠 가시성 (성능 최적화)
content-visibility-auto      # 화면 밖 콘텐츠 지연 렌더링
```

### 인터랙티브 상태

```text
# 포커스
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring

# 비활성화
disabled:pointer-events-none disabled:opacity-50

# 그룹 호버
group                        # 부모 요소
group-hover:opacity-100      # 자식 요소

# Peer (형제 요소)
peer                         # 형제 트리거
peer-focus:ring-2            # 형제 대상
```

### 스크롤

```css
/* globals.css — v4에서는 @utility로 직접 정의 (플러그인 불필요) */
@utility scrollbar-hide {
  &::-webkit-scrollbar { display: none; }
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

```text
# 스크롤 가능 영역
overflow-y-auto scrollbar-hide

# 스냅 스크롤
snap-x snap-mandatory overflow-x-auto
snap-start                   # 자식 아이템에 적용
```

### 이미지

```text
# 종횡비를 가진 반응형 이미지
aspect-video relative overflow-hidden rounded-lg
object-cover                 # 컨테이너 채우기
object-contain               # 컨테이너 안에 맞추기

# 아바타
h-10 w-10 rounded-full overflow-hidden
```

### 구분선

```text
# 가로선
h-px bg-border

# 세로선 (flex row 내부)
w-px self-stretch bg-border

# 점선
border-t border-dashed border-border
```

### 오버레이 / 배경 흐림

```text
# 모달 오버레이
fixed inset-0 z-50 bg-background/80 backdrop-blur-sm

# 이미지 오버레이 그라디언트
absolute inset-0 bg-gradient-to-t from-black/60 to-transparent
```

---

## 장식용 배경 패턴

### 그리드 배경

```tsx
function GridBackground({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <div
        className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)]"
        style={{ backgroundSize: '20px 20px' }}
      />
      {children}
    </div>
  )
}
```

### 도트 배경

```tsx
function DotBackground({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-0 -z-10 [background-size:20px_20px] [background-image:radial-gradient(color-mix(in_oklch,var(--muted-foreground)_30%,transparent)_1px,transparent_1px)]" />
      {children}
    </div>
  )
}
```

### 방사형 그라디언트 히어로

```tsx
function GradientHero({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          background: 'radial-gradient(125% 125% at 50% 10%, var(--background) 40%, var(--primary) 100%)',
        }}
      />
      {children}
    </div>
  )
}
```

### 섹션 래퍼 (변형 배경)

```tsx
function Section({ children, variant = 'default', className }: {
  children: React.ReactNode
  variant?: 'default' | 'muted' | 'inverted'
  className?: string
}) {
  return (
    <section className={cn(
      'relative py-24',
      variant === 'muted' && 'bg-muted',
      variant === 'inverted' && 'bg-foreground text-background [&_*]:border-background/20',
      className,
    )}>
      {children}
    </section>
  )
}
```

---

## 커스텀 유틸리티 (v4 @utility)

v4는 `@layer utilities { .x {} }` 대신 `@utility` 지시자로 커스텀 유틸리티를 정의합니다. variant(`hover:`, `dark:` 등)와 자동으로 조합됩니다.

```css
/* globals.css */
@utility tap-highlight-none {
  -webkit-tap-highlight-color: transparent;
}

/* 값을 받는 함수형 유틸리티 (예: content-auto) */
@utility content-auto {
  content-visibility: auto;
}
```

```tsx
<button className="tap-highlight-none hover:tap-highlight-none" />
```

> v4에는 `text-balance`, `line-clamp-*`, `field-sizing-content` 등이 내장되어 별도 플러그인이 필요 없습니다. `cn()`/`cva` 사용법은 위 참조.

---

## 파일 구조

```text
components/
├── ui/              # shadcn 프리미티브 컴포넌트
├── backgrounds/     # Grid, Dot, Gradient 패턴
├── animations/      # FadeIn, ScrollReveal
└── shared/          # 비즈니스 컴포넌트
```

---

## 관련 라이브러리

- [tailwind-merge](https://github.com/dcastil/tailwind-merge) -- 클래스 충돌 해결 (v3.x가 v4 대응)
- [clsx](https://github.com/lukeed/clsx) -- 조건부 클래스 결합
- [class-variance-authority](https://cva.style/docs) -- 컴포넌트 변형 관리
- [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css) -- v4용 애니메이션 유틸리티(구 `tailwindcss-animate` 대체). `@import "tw-animate-css";`로 사용
- 스크롤바 숨김은 v4에서 `@utility`로 직접 정의 (위 커스텀 유틸리티 참조)
