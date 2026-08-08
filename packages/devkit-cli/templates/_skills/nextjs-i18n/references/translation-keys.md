# 번역 키 관리 가이드

## 키 네이밍 컨벤션

### 구조: `'컴포넌트명.용도'`

```typescript
// 공통 (여러 컴포넌트에서 재사용)
'common.login'
'common.privacyPolicy'
'common.servicePolicy'
'common.language'

// 컴포넌트별
'loginModal.title'
'loginModal.kakaoLogin'
'myPage.title'
'myPage.greeting'

// 동적 키 (enum/상수 값 매핑)
'postFilter.region.ALL'
'postFilter.region.KOREA'
'postFilter.type.BLOG'
'channelList.blog'
'channelList.youtube'
```

### 네이밍 규칙

| 규칙 | 예시 |
|------|------|
| camelCase 사용 | `'myPage.title'` (O), `'my-page.title'` (X) |
| 컴포넌트 → 용도 순서 | `'loginModal.kakaoLogin'` |
| 공통 키는 `common.*` | `'common.login'` |
| 확인/취소는 컴포넌트에 | `'myPage.leaveConfirmYes'` |
| 동적 값은 대문자 유지 | `'postFilter.region.KOREA'` |

## 키 추가 절차

### 1. 번역 문자열 정의

```typescript
// apps/client/src/i18n.ts
resources: {
  en: {
    translation: {
      // ... 기존 키들
      'newFeature.title': 'New Feature',
      'newFeature.description': 'This is a new feature',
    },
  },
  ko: {
    translation: {
      // ... 기존 키들
      'newFeature.title': '새 기능',
      'newFeature.description': '이것은 새 기능입니다',
    },
  },
},
```

### 2. 정렬 확인

`perfectionist/sort-objects` 규칙으로 인해 **알파벳 순** 정렬 필수:

```typescript
// ✅ 올바른 순서
{
  'common.language': 'English',
  'common.login': 'LOGIN',          // c < l
  'common.privacyPolicy': '...',    // l < p
  'loginModal.githubLogin': '...',  // common < loginModal
  'myPage.title': '...',            // loginModal < myPage
}

// ❌ 정렬 오류 (lint fail)
{
  'common.login': 'LOGIN',
  'common.language': 'English',     // language < login 이므로 위에 와야 함
}
```

> **팁:** `pnpm lint --fix`로 자동 정렬 가능

### 3. 컴포넌트에서 사용

```tsx
import { useTranslateText } from 'hooks/useTranslateText';

const translateText = useTranslateText();
translateText('newFeature.title')
```

### 4. 테스트 자동 검증

`i18n.test.ts`에서 en/ko 키 동일성과 빈 값을 자동 검증:

```typescript
it('en과 ko의 번역 키가 동일하다', () => {
  const enKeys = Object.keys(i18n.store.data.en?.translation ?? {}).sort();
  const koKeys = Object.keys(i18n.store.data.ko?.translation ?? {}).sort();
  expect(enKeys).toEqual(koKeys);
});
```

## interpolation 패턴

### 단순 변수

```typescript
// 리소스
'greeting': 'Hello, {{name}}!'

// 사용
translateText('greeting', { name: 'John' }) // 'Hello, John!'
```

### 복수 변수

```typescript
// 리소스
'transfer': '{{from}} sent {{amount}} to {{to}}'

// 사용
translateText('transfer', { amount: '$100', from: 'Alice', to: 'Bob' })
```

### 중첩 interpolation

```typescript
// 리소스
'nested': '{{author}} wrote "{{title}}"'

// 사용
translateText('nested', { author: user.name, title: post.title })
```

## 동적 키 패턴

### enum 기반 매핑

```typescript
// 상수
const FILTERS = [
  { value: 'ALL' },
  { value: 'KOREA' },
  { value: 'FOREIGN' },
] as const;

// 리소스
'filter.ALL': '전체',
'filter.KOREA': '국내',
'filter.FOREIGN': '국외',

// 사용
{FILTERS.map((item) => (
  <span key={item.value}>
    {translateText(`filter.${item.value}`)}
  </span>
))}
```

### 타입 기반 매핑

```typescript
// 컴포넌트 props의 타입으로 키 결정
interface ChannelListProps {
  type: 'blog' | 'youtube';
}

// 리소스
'channelList.blog': '기술블로그',
'channelList.youtube': '유튜브',

// 사용
translateText(`channelList.${type}`)
```

## 키 삭제 시

1. `i18n.ts`에서 en/ko 양쪽 키 제거
2. 사용처 검색: `grep -r "해당.키" apps/client/src/`
3. 테스트 실행으로 en/ko 키 동일성 확인

## 키 리네이밍 시

1. `i18n.ts`에서 en/ko 양쪽 키 변경
2. 사용처 전체 치환
3. `pnpm lint --fix`로 정렬 재적용
