# Next.js SEO 감사 체크리스트

## 필수 (반드시 필요)

### 기술적 기반

- [ ] 루트 layout에 `metadataBase` 설정
- [ ] 모든 페이지에 고유한 `<title>` (50-60자 권장)
- [ ] 모든 페이지에 고유한 `meta description` (150-160자 권장)
- [ ] `robots.txt` 파일이 존재하고 크롤링을 허용하는지 확인
- [ ] `sitemap.xml` 파일이 존재하고 유효한지 확인
- [ ] Google Search Console에 Sitemap 제출 완료
- [ ] 색인이 필요한 페이지에 `noindex`가 설정되지 않았는지 확인
- [ ] 모든 페이지에 Canonical URL 설정
- [ ] `viewport`를 별도로 export (Next.js 14 이상)

### 렌더링

- [ ] SEO 페이지에 SSG 또는 SSR 사용 (CSR이 아닌)
- [ ] JavaScript 없이도 콘텐츠가 보이는지 확인 (JS 비활성화 상태에서 테스트)
- [ ] SEO에 중요한 텍스트가 클라이언트 사이드에서만 렌더링되지 않는지 확인

### Core Web Vitals (핵심 웹 지표)

- [ ] LCP (Largest Contentful Paint, 최대 콘텐츠풀 페인트) < 2.5초
- [ ] INP (Interaction to Next Paint, 다음 페인트까지의 상호작용) < 200ms
- [ ] CLS (Cumulative Layout Shift, 누적 레이아웃 이동) < 0.1

## 중요 (권장)

### Structured Data (구조화된 데이터)

- [ ] 홈페이지에 WebSite schema 적용
- [ ] Organization schema 적용
- [ ] 페이지별 관련 schema 적용 (Article, Product, FAQ)
- [ ] JSON-LD가 실제 표시되는 콘텐츠와 일치하는지 확인
- [ ] Rich Results Test로 검증 완료

### Open Graph 및 소셜 미디어

- [ ] Open Graph title과 description 설정
- [ ] OG 이미지 설정 (1200x630 권장)
- [ ] Twitter Card 설정
- [ ] Facebook Debugger로 이미지 테스트 완료

### 링크 및 내비게이션

- [ ] 내부 링크에 `<Link>` 컴포넌트 사용
- [ ] 깨진 내부 링크 없음
- [ ] 논리적인 URL 구조
- [ ] Breadcrumbs (탐색 경로) 구현 (해당되는 경우)

### 이미지

- [ ] 모든 이미지에 `alt` 텍스트 설정
- [ ] 이미지에 `next/image` 컴포넌트 사용
- [ ] Sitemap에 이미지 포함 (Next.js 16)
- [ ] 적절한 이미지 크기 (과도하게 큰 이미지 없음)

## 선택 사항 (최적화)

### 성능

- [ ] JavaScript 번들 최적화
- [ ] 폰트에 `next/font` 사용
- [ ] Critical CSS 인라인 처리
- [ ] 서드파티 스크립트 지연 로딩(defer)

### 다국어 지원 (해당되는 경우)

- [ ] 언어 버전별 `hreflang` 태그 설정
- [ ] 다국어 Sitemap 생성
- [ ] 언어별 메타데이터 설정

### 고급 설정

- [ ] Video sitemap (비디오 콘텐츠가 있는 경우)
- [ ] News sitemap (뉴스 사이트인 경우)
- [ ] App links 설정 (모바일 앱이 있는 경우)

## 감사 도구

| 도구 | 용도 | URL |
|------|------|-----|
| Google Search Console | 색인 상태, 오류 확인 | search.google.com/search-console |
| PageSpeed Insights | Core Web Vitals 측정 | pagespeed.web.dev |
| Rich Results Test | Structured Data 검증 | search.google.com/test/rich-results |
| Lighthouse | 종합 감사 | Chrome DevTools |
| Mobile-Friendly Test | 모바일 사용성 확인 | search.google.com/test/mobile-friendly |
| Ahrefs/Semrush | 백링크, 검색 순위 분석 | ahrefs.com / semrush.com |

## 빠른 명령어

```bash
# robots.txt 확인
curl https://your-site.com/robots.txt

# sitemap 확인
curl https://your-site.com/sitemap.xml

# 색인 여부 확인
# Google에서 검색: site:your-site.com

# 모바일 렌더링 테스트
# Chrome DevTools 기기 에뮬레이션 사용
```

## 주의해야 할 위험 신호

1. **Google Search Console에서 "발견됨 - 현재 색인이 생성되지 않음"**
2. **여러 페이지에 중복된 title 태그**
3. **Canonical URL 누락**
4. **robots.txt에서 리소스 차단**
5. **느린 LCP (4초 초과)**
6. **높은 CLS (0.25 초과)**
7. **Structured Data 없음**
8. **이미지에 alt 텍스트 누락**
