# SEO 문제 해결 가이드

## Google 색인 문제

### "발견됨 - 현재 색인이 생성되지 않음" (Discovered - currently not indexed)

**의미:** Google이 해당 URL을 발견했지만 아직 크롤링하지 않은 상태입니다.

**원인:**
- 새로운 웹사이트 (크롤링 우선순위가 낮음)
- 품질 신호 부족
- 크롤링 예산(Crawl Budget) 소진

**해결 방법:**
1. URL Inspection 도구를 통해 색인 요청
2. 양질의 백링크(Backlink) 구축
3. 내부 링크 구조 개선
4. 대기 (새 사이트의 경우 수 주가 걸릴 수 있음)

### "크롤링됨 - 현재 색인이 생성되지 않음" (Crawled - currently not indexed)

**의미:** Google이 크롤링했지만 색인에 포함하지 않기로 결정한 상태입니다.

**원인:**
- 빈약한 콘텐츠 (Thin Content)
- 중복 콘텐츠
- 저품질 콘텐츠
- 기술적 문제

**해결 방법:**
1. 더 많은 고유하고 가치 있는 콘텐츠 추가
2. 중복 콘텐츠 문제 확인
3. Canonical URL이 올바른지 확인
4. E-E-A-T 신호 개선 (Experience, Expertise, Authoritativeness, Trust - 경험, 전문성, 권위성, 신뢰성)

### "URL이 Google에 없음" (URL is not on Google)

**의미:** 해당 페이지가 Google 색인에 포함되지 않은 상태입니다.

**확인 단계:**
1. robots.txt가 차단하고 있지 않은지 확인
2. `noindex` 메타 태그가 있는지 확인
3. Canonical URL이 올바른 페이지를 가리키는지 확인
4. Google Search Console(GSC)에서 색인 요청

### "robots.txt에 의해 차단됨" (Blocked by robots.txt)

**해결 방법:** `app/robots.ts`를 수정합니다:

```typescript
// 차단 규칙 제거
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // disallow 규칙을 제거하거나 수정
    },
  };
}
```

## Google Search Console 사용법

### URL Inspection 도구

1. Google Search Console로 이동
2. 상단 검색창에 URL 입력
3. 확인할 항목:
   - "URL이 Google에 있음" 상태
   - "페이지 가져오기" 성공 여부
   - "색인 생성 허용됨" 상태
   - "사용자가 선언한 Canonical"
   - "Google이 선택한 Canonical"

### 색인 요청

1. URL Inspection 도구 사용
2. "색인 생성 요청" 클릭
3. 대기 (반복 요청하지 않기 - 한 번이면 충분합니다)
4. 1-2주 후 다시 확인

### 페이지 보고서

이동 경로: **색인 생성 > 페이지**

| 상태 | 의미 | 조치 |
|------|------|------|
| 색인 안 됨 | 다양한 원인 | 구체적인 원인 확인 |
| 색인됨 | Google에 포함됨 | 모니터링 |
| 오류 | 기술적 문제 | 즉시 수정 |

## 일반적인 기술 문제

### JavaScript 렌더링 문제

**증상:** Google의 캐시된 버전에서 콘텐츠가 누락됨.

**해결 방법:**
1. SEO 콘텐츠에는 CSR 대신 SSR/SSG 사용
2. URL Inspection의 "크롤링된 페이지 보기"로 확인
3. 핵심 콘텐츠가 초기 HTML에 포함되어 있는지 확인

### 중복 콘텐츠

**증상:** 동일한 콘텐츠가 여러 URL에 존재함.

**해결 방법:**

```typescript
// Canonical URL 설정
export const metadata: Metadata = {
  alternates: {
    canonical: '/correct-url',
  },
};
```

### Redirect Chain (리다이렉트 체인)

**증상:** 여러 단계의 리다이렉트 발생 (A -> B -> C).

**해결 방법:** 최종 URL로 직접 리다이렉트합니다:

```typescript
// next.config.ts
export default {
  async redirects() {
    return [
      {
        source: '/old-url',
        destination: '/final-url', // 최종 URL로 직접 연결
        permanent: true,
      },
    ];
  },
};
```

### 느린 페이지 속도

**증상:** 높은 LCP, Core Web Vitals 저하.

**해결 방법:**
1. 이미지에 `next/image` 사용
2. 폰트에 `next/font` 사용
3. Lazy Loading(지연 로딩) 구현
4. JavaScript 번들 크기 줄이기
5. 가능한 경우 SSG 사용

## 권위(Authority) 구축

### 새 사이트의 경우

1. **GSC에 등록** - Sitemap 추가
2. **백링크 구축** - 양이 아닌 질이 중요
3. **소셜 신호** - 콘텐츠 공유
4. **디렉토리 등록** - 관련 디렉토리에 등록
5. **게스트 포스트** - 업계 블로그에 기고

### 백링크 출처

| 유형 | 예시 |
|------|------|
| 디렉토리 | 업종별 디렉토리 |
| 소셜 프로필 | LinkedIn, Twitter, GitHub |
| 게스트 포스트 | 관련 블로그 |
| PR | 뉴스 보도 |
| 파트너 | 비즈니스 파트너 |

## 예상 소요 시간

| 시나리오 | 예상 기간 |
|----------|----------|
| 새 사이트 색인 | 4일 - 4주 |
| 새 페이지 색인 | 1일 - 2주 |
| 검색 순위 개선 | 2-6개월 |
| 권위 구축 | 6-12개월 |

## 디버그 체크리스트

페이지가 색인되지 않을 때:

1. [ ] robots.txt가 크롤링을 허용하는지 확인
2. [ ] `noindex` 태그가 없는지 확인
3. [ ] Canonical URL이 올바른지 확인
4. [ ] 페이지가 200 상태 코드를 반환하는지 확인
5. [ ] 콘텐츠가 가치 있고 고유한지 확인
6. [ ] 페이지가 다른 페이지에서 링크되어 있는지 확인
7. [ ] URL Inspection 도구 사용
8. [ ] 색인 요청 (한 번만)
9. [ ] 대기하며 모니터링

## 도구

| 도구 | 용도 |
|------|------|
| Google Search Console | 주요 색인 관리 도구 |
| Bing Webmaster Tools | Bing 색인 관리 |
| Screaming Frog | 사이트 크롤링 감사 |
| Ahrefs/Semrush | 백링크 분석 |
