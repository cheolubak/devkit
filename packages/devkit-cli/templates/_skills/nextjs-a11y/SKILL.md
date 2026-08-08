---
name: nextjs-a11y
description: "Next.js 웹 접근성(a11y) 가이드. WCAG 2.2 기준, 시맨틱 HTML, ARIA, 키보드 네비게이션, 스크린 리더, 색상 대비, 폼 접근성 패턴.\nAPPLIES: 화면에 폼·모달·메뉴·키보드 조작이 들어갈 때, 스크린 리더·대비·포커스 순서를 고려해야 할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"접근성\", \"a11y\", \"ARIA\", \"키보드 네비게이션\", \"스크린 리더\", \"색상 대비\", \"시맨틱 HTML\", \"웹 접근성\", \"장애인 접근\", WCAG 관련 질문 시.\nSKIP: 일반 UI 컴포넌트 구조는 nextjs-shadcn 또는 react-best-practices."
---

> 참조:
> - [references/patterns.md](references/patterns.md) - 컴포넌트별 접근성 패턴 (모달, 폼, 네비게이션, 토스트 등)
> - [references/checklist.md](references/checklist.md) - WCAG 2.2 체크리스트, 테스트 도구, 자동화
> - [references/aria-roles.md](references/aria-roles.md) - ARIA 사용 규칙, 랜드마크/위젯/문서구조 역할
> - [references/aria-states-properties.md](references/aria-states-properties.md) - ARIA 상태 및 속성 레퍼런스

# Next.js 웹 접근성 (a11y) 가이드

## 핵심 원칙

1. **시맨틱 HTML 우선** - ARIA보다 네이티브 HTML 요소 사용
2. **키보드 접근성** - 모든 인터랙티브 요소에 키보드 도달 가능
3. **스크린 리더 호환** - 의미 있는 텍스트 대안 제공
4. **색상 대비** - WCAG AA 기준 4.5:1 이상
5. **포커스 관리** - 명확한 포커스 표시 및 논리적 순서

## 시맨틱 HTML

```tsx
// ❌ 나쁨 - div 남용
<div onClick={handleClick}>클릭</div>
<div className="header">
  <div className="nav">...</div>
</div>

// ✅ 좋음 - 시맨틱 요소
<button onClick={handleClick}>클릭</button>
<header>
  <nav aria-label="주 메뉴">...</nav>
</header>
```

### 시맨틱 요소 선택

| 용도 | 요소 | div 대신 |
|------|------|----------|
| 페이지 헤더 | `<header>` | `<div class="header">` |
| 네비게이션 | `<nav>` | `<div class="nav">` |
| 주요 콘텐츠 | `<main>` | `<div class="content">` |
| 섹션 | `<section>` | `<div class="section">` |
| 독립 콘텐츠 | `<article>` | `<div class="article">` |
| 부가 정보 | `<aside>` | `<div class="sidebar">` |
| 푸터 | `<footer>` | `<div class="footer">` |
| 버튼 | `<button>` | `<div onClick>` |
| 링크 | `<a href>` | `<span onClick>` |

## 이미지 접근성

```tsx
import Image from 'next/image'

// 정보 이미지 - alt 필수
<Image src="/product.jpg" alt="빨간색 나이키 에어맥스 90 운동화" width={400} height={300} />

// 장식 이미지 - alt 빈 문자열 + aria-hidden
<Image src="/decorative-line.svg" alt="" aria-hidden="true" width={100} height={2} />

// 복잡한 이미지 (차트, 그래프)
<figure>
  <Image src="/sales-chart.png" alt="2024년 월별 매출 추이 차트" width={600} height={400} />
  <figcaption>
    2024년 매출은 1월 100만원에서 12월 500만원으로 꾸준히 증가했습니다.
  </figcaption>
</figure>
```

## 키보드 네비게이션

### 포커스 스타일 (절대 제거하지 않기)

```tsx
// ❌ 절대 금지
<button className="outline-none focus:outline-none" />

// ✅ 좋음 - focus-visible 사용
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
```

### Skip Navigation

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          본문으로 건너뛰기
        </a>
        <header>
          <nav aria-label="주 메뉴">...</nav>
        </header>
        <main id="main-content">{children}</main>
        <footer>...</footer>
      </body>
    </html>
  )
}
```

### 키보드 트랩 방지 (모달)

```tsx
'use client'

import { useEffect, useRef } from 'react'

export function Modal({ isOpen, onClose, children }: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const modal = modalRef.current
    if (!modal) return

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    firstElement?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" aria-hidden="true" onClick={onClose} />
      <div className="relative z-10 rounded-lg bg-card p-6 shadow-lg">
        {children}
      </div>
    </div>
  )
}
```

## 폼 접근성

```tsx
// ✅ 접근 가능한 폼
<form aria-labelledby="form-title">
  <h2 id="form-title">회원가입</h2>

  <div>
    <label htmlFor="email">이메일 *</label>
    <input
      id="email"
      name="email"
      type="email"
      required
      aria-required="true"
      aria-describedby="email-hint email-error"
      aria-invalid={!!errors.email}
      autoComplete="email"
    />
    <p id="email-hint" className="text-sm text-muted-foreground">
      업무용 이메일을 입력해주세요
    </p>
    {errors.email && (
      <p id="email-error" role="alert" className="text-sm text-destructive">
        {errors.email}
      </p>
    )}
  </div>

  <button type="submit">가입하기</button>
</form>
```

## 색상 대비

### WCAG 기준

| 수준 | 일반 텍스트 | 큰 텍스트 (18px+) |
|------|-----------|-------------------|
| AA | 4.5:1 | 3:1 |
| AAA | 7:1 | 4.5:1 |

### shadcn/ui 테마 변수 활용

```tsx
// ✅ 좋음 - 테마 변수 (대비 보장)
<p className="text-foreground">주요 텍스트</p>
<p className="text-muted-foreground">보조 텍스트</p>

// ❌ 나쁨 - 대비가 낮은 커스텀 색상
<p className="text-gray-300">읽기 어려움</p>
```

### 색상만으로 정보 전달 금지

```tsx
// ❌ 나쁨 - 색상만으로 상태 표시
<span className="text-green-500">성공</span>
<span className="text-red-500">실패</span>

// ✅ 좋음 - 아이콘 + 텍스트로 보완
<span className="text-success flex items-center gap-1">
  <CheckCircle className="h-4 w-4" aria-hidden="true" />
  성공
</span>
<span className="text-destructive flex items-center gap-1">
  <XCircle className="h-4 w-4" aria-hidden="true" />
  실패
</span>
```

## 동적 콘텐츠

### 라이브 리전

```tsx
// 상태 메시지 (스크린 리더가 자동으로 읽음)
<div role="status" aria-live="polite">
  {isLoading && '로딩 중...'}
  {successMessage && successMessage}
</div>

// 긴급 알림
<div role="alert" aria-live="assertive">
  {errorMessage && `오류: ${errorMessage}`}
</div>
```

### 로딩 상태

```tsx
<button disabled={isPending} aria-busy={isPending}>
  {isPending ? (
    <>
      <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>저장 중...</span>
    </>
  ) : (
    '저장'
  )}
</button>
```

## Next.js 특화 패턴

### lang 속성

```tsx
// app/layout.tsx
<html lang="ko">  {/* 반드시 설정 */}
```

### 페이지 제목

```tsx
// 각 page.tsx에서 고유한 제목 제공
export const metadata: Metadata = {
  title: '회원가입',  // template: '%s | 사이트명'으로 조합
}
```

### next/link 접근성

```tsx
import Link from 'next/link'

// 외부 링크
<Link href="https://example.com" target="_blank" rel="noopener noreferrer">
  외부 사이트
  <span className="sr-only">(새 탭에서 열림)</span>
</Link>

// 아이콘 링크
<Link href="/settings" aria-label="설정">
  <Settings className="h-5 w-5" aria-hidden="true" />
</Link>
```

### 라우트 변경 알림

```tsx
'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export function RouteAnnouncer() {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Next.js는 내장 route announcer가 있지만, 커스텀이 필요한 경우
    if (ref.current) {
      ref.current.textContent = `${document.title} 페이지로 이동했습니다`
    }
  }, [pathname])

  return (
    <div
      ref={ref}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
    />
  )
}
```

## 빠른 감사

```bash
# Lighthouse 접근성 점수 확인
# Chrome DevTools → Lighthouse → Accessibility

# axe DevTools (브라우저 확장)
# https://www.deque.com/axe/devtools/

# eslint-plugin-jsx-a11y 설치
pnpm add -D eslint-plugin-jsx-a11y
```

## 자주 하는 실수

| 실수 | 해결 |
|------|------|
| `outline-none`으로 포커스 제거 | `focus-visible:ring-2` 사용 |
| `<div onClick>` 사용 | `<button>` 사용 |
| alt 텍스트 누락 | 모든 정보 이미지에 alt 제공 |
| `lang` 속성 누락 | `<html lang="ko">` 설정 |
| 색상만으로 정보 전달 | 아이콘/텍스트 보완 |
| `aria-label` 없는 아이콘 버튼 | `aria-label` 또는 sr-only 텍스트 |
| 자동 재생 미디어 | 일시정지 컨트롤 제공 |
| 낮은 색상 대비 | AA 기준 4.5:1 이상 유지 |
