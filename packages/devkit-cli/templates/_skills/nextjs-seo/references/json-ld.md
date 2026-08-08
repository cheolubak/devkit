# Next.js에서 JSON-LD Structured Data (구조화된 데이터) 사용하기

Structured Data(구조화된 데이터)는 검색 엔진이 콘텐츠를 이해하고 리치 결과(Rich Results)를 표시하는 데 도움을 줍니다.

## 구현 패턴

```typescript
// components/seo/json-ld.tsx
type JsonLdProps = {
  data: Record<string, unknown>;
};

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'), // XSS 보호
      }}
    />
  );
}
```

## 주요 Schema 종류

### WebSite Schema

```typescript
const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Site Name',
  url: 'https://your-site.com',
  description: 'Site description',
  inLanguage: 'en',
  publisher: {
    '@type': 'Organization',
    name: 'Organization Name',
  },
};
```

### Organization Schema

```typescript
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Company Name',
  url: 'https://your-site.com',
  logo: {
    '@type': 'ImageObject',
    url: 'https://your-site.com/logo.png',
    width: 512,
    height: 512,
  },
  sameAs: [
    'https://twitter.com/company',
    'https://linkedin.com/company/company',
    'https://github.com/company',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'contact@company.com',
    contactType: 'customer service',
  },
  foundingDate: '2024',
  areaServed: {
    '@type': 'Country',
    name: 'Finland',
  },
};
```

### WebApplication Schema

```typescript
const webAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'App Name',
  url: 'https://your-site.com',
  description: 'App description',
  applicationCategory: 'UtilityApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'EUR',
  },
  featureList: [
    'Feature 1',
    'Feature 2',
    'Feature 3',
  ],
};
```

### FAQPage Schema

```typescript
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is your product?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our product is a tool that helps you...',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does it cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our service is completely free to use.',
      },
    },
  ],
};
```

**중요:** FAQPage schema는 페이지에 표시되는 실제 FAQ 콘텐츠와 반드시 일치해야 합니다. JSON-LD가 실제 표시되는 콘텐츠와 일치하지 않으면 Google이 Rich Results(리치 결과)를 거부합니다.

### Product Schema

```typescript
const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Product Name',
  image: ['https://your-site.com/product.jpg'],
  description: 'Product description',
  sku: 'SKU123',
  brand: {
    '@type': 'Brand',
    name: 'Brand Name',
  },
  offers: {
    '@type': 'Offer',
    url: 'https://your-site.com/product',
    priceCurrency: 'EUR',
    price: '99.99',
    priceValidUntil: '2025-12-31',
    availability: 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/NewCondition',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.5',
    reviewCount: '89',
  },
};
```

### Article Schema

```typescript
const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Article Title',
  description: 'Article description',
  image: 'https://your-site.com/article-image.jpg',
  datePublished: '2024-01-15T08:00:00+00:00',
  dateModified: '2024-01-16T10:00:00+00:00',
  author: {
    '@type': 'Person',
    name: 'Author Name',
    url: 'https://author-website.com',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Publisher Name',
    logo: {
      '@type': 'ImageObject',
      url: 'https://your-site.com/logo.png',
    },
  },
};
```

### BreadcrumbList Schema

```typescript
const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://your-site.com',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Products',
      item: 'https://your-site.com/products',
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Product Name',
      item: 'https://your-site.com/products/product-slug',
    },
  ],
};
```

## Next.js에서 사용하기

```typescript
// app/layout.tsx
import { JsonLd } from '@/components/seo/json-ld';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <JsonLd data={websiteSchema} />
        <JsonLd data={organizationSchema} />
        {children}
      </body>
    </html>
  );
}
```

## 테스트 도구

1. **Google Rich Results Test**: https://search.google.com/test/rich-results
2. **Schema.org Validator**: https://validator.schema.org/
3. **JSON-LD Playground**: https://json-ld.org/playground/

## 모범 사례

1. **실제 표시되는 콘텐츠와 일치시키기** - JSON-LD는 사용자가 실제로 보는 내용을 반영해야 합니다
2. **XSS 보호 적용** - `<` 문자를 항상 이스케이프 처리해야 합니다
3. **중복 금지** - 페이지당 하나의 schema 타입만 사용합니다 (@graph 제외)
4. **최신 상태 유지** - 콘텐츠가 변경되면 dateModified를 업데이트합니다
5. **정기적으로 테스트** - 변경 후 반드시 유효성 검사를 수행합니다
