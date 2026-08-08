# Next.js에서 Sitemap과 Robots.txt 설정하기

## Sitemap 설정

### 기본 정적 Sitemap

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://your-site.com',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://your-site.com/about',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
```

### 데이터베이스 기반 동적 Sitemap

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://your-site.com';
  const posts = await getAllPosts();

  const postUrls = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...postUrls,
  ];
}
```

### Image Sitemap (이미지 사이트맵, Next.js 16)

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://your-site.com';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
      images: [
        `${baseUrl}/og-image.png`,
        `${baseUrl}/hero-image.jpg`,
      ],
    },
  ];
}
```

### Video Sitemap (비디오 사이트맵)

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://your-site.com/video-page',
      lastModified: new Date(),
      videos: [
        {
          title: 'Video Title',
          thumbnail_loc: 'https://your-site.com/thumbnail.jpg',
          description: 'Video description',
        },
      ],
    },
  ];
}
```

### 대규모 사이트를 위한 다중 Sitemap

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export async function generateSitemaps() {
  // sitemap ID 배열을 반환합니다
  return [{ id: 0 }, { id: 1 }, { id: 2 }];
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;
  const start = Number(id) * 50000;
  const end = start + 50000;

  const products = await getProducts(start, end);

  return products.map((product) => ({
    url: `https://your-site.com/products/${product.id}`,
    lastModified: product.updatedAt,
  }));
}
// 생성 결과: /sitemap/0.xml, /sitemap/1.xml, /sitemap/2.xml
```

### 다국어 Sitemap

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://your-site.com',
      lastModified: new Date(),
      alternates: {
        languages: {
          en: 'https://your-site.com/en',
          fi: 'https://your-site.com/fi',
          sv: 'https://your-site.com/sv',
        },
      },
    },
  ];
}
```

## Robots.txt 설정

### 기본 Robots.txt

```typescript
// app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/_next/'],
    },
    sitemap: 'https://your-site.com/sitemap.xml',
  };
}
```

### 다중 User Agent 설정

```typescript
// app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: '/admin/',
      },
      {
        userAgent: 'GPTBot',
        disallow: '/', // AI 크롤러 차단
      },
    ],
    sitemap: 'https://your-site.com/sitemap.xml',
    host: 'https://your-site.com',
  };
}
```

### 환경 기반 Robots 설정

```typescript
// app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-site.com';

  // 프로덕션이 아닌 환경에서는 색인 차단
  if (process.env.NODE_ENV !== 'production') {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

## Sitemap 모범 사례

| 가이드라인 | 권장 사항 |
|-----------|----------|
| Sitemap당 최대 URL 수 | 50,000개 |
| 최대 파일 크기 | 50 MB |
| 업데이트 빈도 | 실제 콘텐츠 변경 주기에 맞추기 |
| Priority 값 | 0.0에서 1.0 (홈페이지 = 1.0) |
| 포함 대상 | Canonical URL이며 200 상태 코드를 반환하는 페이지만 |

## Robots.txt 모범 사례

1. **CSS/JS를 차단하지 않기** - Google이 렌더링에 필요합니다
2. **Sitemap을 차단하지 않기** - `/sitemap.xml`을 절대 disallow하지 않습니다
3. **구체적인 경로 사용하기** - 광범위한 차단 대신 `/admin/`처럼 구체적으로 지정합니다
4. **배포 전 테스트하기** - Google Search Console의 robots.txt 테스터를 사용합니다
