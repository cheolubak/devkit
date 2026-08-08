---
name: nextjs-seo
argument-hint: "[질문 또는 URL]"
description: "Next.js SEO 최적화 가이드. Metadata API, 사이트맵, robots.txt, JSON-LD, Open Graph, 캐노니컬 URL, Core Web Vitals 최적화.\nAPPLIES: `generateMetadata`·사이트맵·`robots.txt`·JSON-LD·OG 태그를 다룰 때, 검색/공유 미리보기가 필요할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"SEO 설정\", \"검색 노출\", \"메타태그\", \"사이트맵\", \"오픈그래프\", \"og 태그\", \"robots.txt\", \"검색엔진 최적화\", \"공유 미리보기\", generateMetadata 사용 시.\nSKIP: 성능 최적화(번들 크기, 렌더링)는 react-best-practices. 배포/CDN 설정은 nextjs-deployment."
---

> 참조:
> - [references/metadata-api.md](references/metadata-api.md) - Metadata API 상세 (정적/동적 메타데이터, generateMetadata, 템플릿)
> - [references/sitemap-robots.md](references/sitemap-robots.md) - sitemap.xml 및 robots.txt 생성
> - [references/json-ld.md](references/json-ld.md) - JSON-LD 구조화 데이터
> - [references/checklist.md](references/checklist.md) - SEO 체크리스트 및 감사 도구
> - [references/troubleshooting.md](references/troubleshooting.md) - 일반적인 SEO 문제 해결

# Next.js SEO 최적화

Next.js 16+ App Router 기반 종합 SEO 가이드.

> **버전:** Next.js 16.1.3 기준 (2026년 1월)

## 빠른 SEO 감사

Next.js 프로젝트 점검 체크리스트:

1. **robots.txt 확인**: `curl https://your-site.com/robots.txt`
2. **사이트맵 확인**: `curl https://your-site.com/sitemap.xml`
3. **메타데이터 확인**: 페이지 소스에서 `<title>` 및 `<meta name="description">` 검색
4. **JSON-LD 확인**: 페이지 소스에서 `application/ld+json` 검색
5. **Core Web Vitals 확인**: Chrome DevTools에서 Lighthouse 실행

## 필수 파일

### app/layout.tsx - 루트 메타데이터

```typescript
import type { Metadata, Viewport } from 'next';

// Viewport (Next.js 14+에서 별도 export 필수)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://your-site.com'),
  title: {
    default: '사이트 제목 - 주요 키워드',
    template: '%s | 사이트명',
  },
  description: '키워드를 포함한 매력적인 설명 (150-160자)',
  keywords: ['키워드1', '키워드2', '키워드3'],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://your-site.com',
    siteName: '사이트명',
    title: '사이트 제목',
    description: '소셜 공유용 설명',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '사이트 미리보기' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '사이트 제목',
    description: 'Twitter용 설명',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
};
```

### app/sitemap.ts - 동적 사이트맵

```typescript
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://your-site.com';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
      images: [`${baseUrl}/og-image.png`], // Next.js 16 이미지 사이트맵
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
```

### app/robots.ts - Robots 설정

```typescript
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://your-site.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/', '/admin/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
```

## 핵심 원칙

### SEO를 위한 렌더링 전략

| 전략 | 사용 시점 | SEO 영향 |
|------|----------|----------|
| SSG (정적) | 콘텐츠 변경이 드문 경우 | 최상 - 사전 렌더링 HTML |
| SSR | 요청마다 동적 콘텐츠 | 우수 - 서버 렌더링 |
| ISR | 대규모 사이트, 주기적 업데이트 | 우수 - 캐시 + 최신 |
| CSR | 대시보드, 인증 영역 | 나쁨 - SEO 페이지 사용 금지 |

### Core Web Vitals 목표

| 지표 | 목표 | 영향 |
|------|------|------|
| LCP (Largest Contentful Paint) | < 2.5초 | 로딩 속도 |
| INP (Interaction to Next Paint) | < 200ms | 상호작용 |
| CLS (Cumulative Layout Shift) | < 0.1 | 시각적 안정성 |

## 자주 하는 실수

1. **next-seo와 Metadata API 혼용** - App Router에서는 Metadata API만 사용
2. **캐노니컬 URL 누락** - 항상 `alternates.canonical` 설정
3. **SEO 페이지에 CSR 사용** - 인덱싱 대상 콘텐츠는 SSG/SSR 사용
4. **robots.txt에서 에셋 차단** - 렌더링에 필요한 CSS/JS 차단 금지
5. **metadataBase 누락** - 메타데이터의 상대 URL에 필수
6. **metadata에 viewport 포함** - Next.js 14+에서 별도 export 필수
7. **metadata 객체와 generateMetadata 혼용** - 둘 중 하나만 사용

## 빠른 수정

### 페이지에 noindex 추가

```typescript
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};
```

### 페이지별 동적 메타데이터

```typescript
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params; // Next.js 15부터 params는 Promise다
  const product = await getProduct(id);
  return {
    title: product.name,
    description: product.description,
  };
}
```

### 동적 라우트의 캐노니컬 URL

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  return {
    alternates: {
      canonical: `/products/${params.slug}`,
    },
  };
}
```
