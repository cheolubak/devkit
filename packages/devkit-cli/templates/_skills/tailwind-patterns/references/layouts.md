# Tailwind 레이아웃 패턴 레퍼런스

## 브레이크포인트

| 접두사 | 최소 너비 | 대상 |
|--------|-----------|--------|
| `sm` | 640px | 가로 모드 모바일 |
| `md` | 768px | 태블릿 |
| `lg` | 1024px | 노트북 |
| `xl` | 1280px | 데스크톱 |
| `2xl` | 1536px | 대형 모니터 |

> **v4 커스텀 브레이크포인트**는 `@theme`에서 정의합니다. `@theme { --breakpoint-3xl: 120rem; }` → `3xl:` variant 생성. 컨테이너 쿼리도 내장: `@container` + `@md:`/`@min-[475px]:` 사용.

### 모바일 우선 접근

```tsx
<div className="
  text-sm           // 모바일 (기본값)
  sm:text-base      // >= 640px
  md:text-lg        // >= 768px
  lg:text-xl        // >= 1024px
" />
```

---

## Flexbox 패턴

### 중앙 정렬 (가로 + 세로)

```tsx
<div className="flex items-center justify-center min-h-screen" />
```

### 양쪽 정렬

```tsx
<div className="flex items-center justify-between" />
```

### 세로 스택

```tsx
<div className="flex flex-col gap-4" />
```

### 가로 스크롤

```tsx
<div className="flex gap-4 overflow-x-auto scrollbar-hide">
  {items.map(item => <Card key={item.id} className="min-w-[250px] shrink-0" />)}
</div>
```

### 줄 바꿈

```tsx
<div className="flex flex-wrap gap-2">
  {tags.map(tag => <Badge key={tag}>{tag}</Badge>)}
</div>
```

---

## Grid 패턴

### 반응형 열

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" />
```

### auto-fill (브레이크포인트 없이 반응형)

```tsx
<div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4" />
```

### 사이드바 레이아웃

```tsx
<div className="grid grid-cols-[250px_1fr] gap-6" />
```

### 대시보드 그리드

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <Card className="lg:col-span-2">넓은 카드</Card>
  <Card>기본</Card>
  <Card>기본</Card>
</div>
```

### 홀리 그레일 레이아웃

```tsx
<div className="grid grid-rows-[auto_1fr_auto] min-h-screen">
  <header />
  <main />
  <footer />
</div>
```

---

## 컨테이너 패턴

### 최대 너비 컨테이너

```tsx
<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
  {children}
</div>
```

### Tailwind 컨테이너

```tsx
<div className="container mx-auto px-4">
  {children}
</div>
```

### 좁은 콘텐츠 (산문 형태)

```tsx
<div className="mx-auto max-w-2xl px-4">
  {/* 블로그 콘텐츠, 폼 */}
</div>
```

---

## 간격 패턴

### 섹션 간격

```tsx
<section className="py-16 md:py-24 lg:py-32" />
```

### 카드 패딩

```tsx
<div className="p-4 sm:p-6" />
```

### 일관된 간격

```tsx
<div className="space-y-4">   {/* 자식 요소 간 세로 간격 */}
<div className="space-x-2">   {/* 가로 간격 */}
<div className="gap-4">       {/* Flex/Grid 간격 */}
```

---

## 위치 지정 패턴

### 고정 헤더

```tsx
<header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm" />
```

### 고정 오버레이

```tsx
<div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
```

### 상대 부모 내에서 절대 위치 지정

```tsx
<div className="relative">
  <img src={src} alt={alt} />
  <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-1 text-xs">
    New
  </span>
</div>
```

### 종횡비 이미지

```tsx
<div className="relative aspect-video overflow-hidden rounded-lg">
  <Image src={src} alt={alt} fill className="object-cover" />
</div>
```

---

## 반응형 타이포그래피

```tsx
// 제목
<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight" />
<h2 className="text-xl sm:text-2xl md:text-3xl font-semibold" />
<h3 className="text-lg md:text-xl font-semibold" />

// 본문
<p className="text-sm md:text-base text-muted-foreground" />

// 작은 텍스트
<span className="text-xs text-muted-foreground" />
```

---

## 일반적인 레이아웃 조합

### 사이드바가 있는 페이지

```tsx
<div className="flex min-h-screen">
  <aside className="hidden md:flex w-64 flex-col border-r">
    <nav />
  </aside>
  <main className="flex-1 p-6">{children}</main>
</div>
```

### 분할 화면 (인증 페이지)

```tsx
<div className="grid min-h-screen lg:grid-cols-2">
  <div className="hidden lg:flex items-center justify-center bg-muted">
    <BrandImage />
  </div>
  <div className="flex items-center justify-center p-8">
    <LoginForm />
  </div>
</div>
```

### 히어로 섹션

```tsx
<section className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-4 text-center">
  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
    Title
  </h1>
  <p className="max-w-2xl text-lg text-muted-foreground">
    Description
  </p>
  <div className="flex gap-4">
    <Button size="lg">Get Started</Button>
    <Button variant="outline" size="lg">Learn More</Button>
  </div>
</section>
```

---

## 공식 문서

- [Flexbox](https://tailwindcss.com/docs/display#flex)
- [Grid](https://tailwindcss.com/docs/display#grid)
- [반응형 디자인](https://tailwindcss.com/docs/responsive-design)
- [Container](https://tailwindcss.com/docs/container)
- [간격](https://tailwindcss.com/docs/customizing-spacing)
