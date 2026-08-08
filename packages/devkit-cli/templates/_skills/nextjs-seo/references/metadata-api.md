# Next.js Metadata API

Next.js 16 이상 App Router에서 SEO 메타데이터를 구현하기 위한 완전 가이드입니다.

## Static Metadata(정적 메타데이터) vs Dynamic Metadata(동적 메타데이터)

### Static Metadata (metadata 객체)

빌드 시점에 메타데이터가 확정되어 있을 때 사용합니다:

```typescript
// app/layout.tsx 또는 app/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title',
  description: 'Page description',
};
```

### Dynamic Metadata (generateMetadata)

메타데이터가 라우트 파라미터나 외부 데이터에 의존할 때 사용합니다:

```typescript
// app/products/[id]/page.tsx
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params; // Next.js 16: params는 Promise입니다
  const product = await getProduct(id);

  return {
    title: product.name,
    description: product.description,
    openGraph: {
      images: [product.image],
    },
  };
}
```

## 전체 Metadata 객체

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // 상대 경로의 기본 URL
  metadataBase: new URL('https://your-site.com'),

  // Title 설정
  title: {
    default: 'Default Title',        // 페이지 title이 없을 때 사용
    template: '%s | Site Name',      // 하위 페이지용 템플릿
    absolute: 'Override All',        // 템플릿을 무시
  },

  // Description (150-160자 권장)
  description: 'Compelling meta description with target keywords',

  // Keywords (현재는 중요도가 낮지만 여전히 사용됨)
  keywords: ['keyword1', 'keyword2', 'long-tail keyword'],

  // 저자 정보
  authors: [{ name: 'Author Name', url: 'https://author.com' }],
  creator: 'Creator Name',
  publisher: 'Publisher Name',

  // Robots 지시문
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Canonical URL 및 대체 URL
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/en-US',
      'fi-FI': '/fi-FI',
    },
  },

  // Open Graph (Facebook, LinkedIn)
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://your-site.com',
    siteName: 'Site Name',
    title: 'Open Graph Title',
    description: 'Open Graph description',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Image alt text',
        type: 'image/png',
      },
    ],
  },

  // Twitter Cards
  twitter: {
    card: 'summary_large_image',  // 정사각형 이미지의 경우 'summary' 사용
    site: '@username',
    creator: '@creator',
    title: 'Twitter Title',
    description: 'Twitter description',
    images: ['/twitter-image.png'],
  },

  // Icons (아이콘)
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },

  // 인증 태그
  verification: {
    google: 'google-verification-code',
    yandex: 'yandex-verification-code',
  },

  // App links (앱 링크)
  appLinks: {
    ios: {
      url: 'https://app.example.com/ios',
      app_store_id: 'app_store_id',
    },
    android: {
      package: 'com.example.app',
      app_name: 'App Name',
    },
  },

  // Format detection (자동 링크 변환 비활성화)
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  // 카테고리
  category: 'technology',
};
```

## Viewport 설정

**중요:** Next.js 14 이상에서는 viewport를 별도의 export로 분리해야 합니다:

```typescript
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  colorScheme: 'light dark',
};
```

## Metadata 병합

Metadata는 루트에서 리프(최하위)로 병합됩니다. 하위 메타데이터가 상위 메타데이터를 덮어씁니다:

```
app/layout.tsx (기본 metadata)
  └── app/blog/layout.tsx (추가/덮어쓰기)
        └── app/blog/[slug]/page.tsx (최종 metadata)
```

## Open Graph 이미지 크기

| 플랫폼 | 권장 크기 |
|--------|----------|
| Facebook | 1200 x 630 px |
| Twitter (large) | 1200 x 628 px |
| Twitter (summary) | 512 x 512 px |
| LinkedIn | 1200 x 627 px |

## Twitter Card 유형

| Card 유형 | 이미지 크기 | 사용 사례 |
|-----------|------------|----------|
| `summary` | 1:1 (최소 144x144) | 정사각형 로고, 아이콘 |
| `summary_large_image` | 2:1 (최소 300x157) | 기사, 제품 |
| `player` | 동영상 임베드 | 비디오 콘텐츠 |
| `app` | 앱 스토어 링크 | 모바일 앱 |

## Streaming Metadata (Next.js 15.2 이상)

Next.js는 초기 UI를 전송한 후 metadata를 스트리밍할 수 있습니다. 이를 통해 TTFB와 LCP가 개선됩니다.

```typescript
// next.config.ts - 어떤 봇이 블로킹 metadata를 받을지 제어
import type { NextConfig } from 'next';

const config: NextConfig = {
  // 이 정규식과 일치하는 봇은 블로킹(비스트리밍) metadata를 받습니다
  // 기본값: facebookexternalhit, linkedinbot 등
  htmlLimitedBots: /facebookexternalhit|linkedinbot/,

  // 스트리밍을 완전히 비활성화하려면 (모든 봇이 블로킹 metadata를 받음):
  // htmlLimitedBots: /.*/,
};

export default config;
```

**동작 방식:**

- JavaScript를 실행할 수 있는 봇 (Googlebot): Metadata가 스트리밍되며, 봇이 JS를 실행하여 읽습니다
- HTML만 읽는 봇 (Facebook): Metadata가 블로킹되어 초기 `<head>`에 포함됩니다
- 사용자: 더 빠른 페이지 로딩, metadata가 스트리밍으로 전달됩니다

## 모범 사례

1. **항상 metadataBase를 설정하기** - 상대 URL에 필수입니다
2. **title 템플릿 사용하기** - 페이지 전체에서 일관된 브랜딩을 유지합니다
3. **고유한 description 작성하기** - 각 페이지에 고유한 설명이 필요합니다
4. **Canonical URL 포함하기** - 중복 콘텐츠 문제를 방지합니다
5. **검증 도구로 테스트하기** - Facebook Debugger, Twitter Card Validator를 사용합니다
6. **Static과 Dynamic을 혼합하지 않기** - `metadata` 객체 또는 `generateMetadata` 중 하나만 사용하고, 둘 다 사용하지 않습니다
