---
name: nextjs-i18n
argument-hint: "[번역 키 추가 / 새 언어 추가 / i18n 설정]"
description: "Next.js i18n 다국어 지원 가이드. i18next + react-i18next 설정, 번역 리소스 관리, useTranslateText 훅, I18nProvider, 언어 감지, 번역 키 추가 패턴.\nAPPLIES: 화면 문자열을 번역 리소스로 빼거나 언어 전환·locale 라우팅을 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"다국어\", \"번역\", \"i18n\", \"영어 지원\", \"언어 전환\", \"국제화\", \"locale\", \"다국어 지원해줘\", 다국어/번역 기능 구현 시.\nSKIP: SEO용 hreflang 태그만 필요하면 nextjs-seo."
---

> 참조:
> - [references/i18next-config.md](references/i18next-config.md) - i18next 초기화 옵션, 네임스페이스, 플러그인, 인스턴스 API
> - [references/react-i18next-hooks.md](references/react-i18next-hooks.md) - useTranslation, t() 함수, Trans 컴포넌트, useTranslateText 훅
> - [references/translation-keys.md](references/translation-keys.md) - 키 네이밍 컨벤션, 추가/삭제 절차, interpolation, 동적 키 패턴
> - [references/troubleshooting.md](references/troubleshooting.md) - 번역 미표시, 언어 초기화, hydration mismatch, lint 에러 해결

# Next.js i18n (i18next + react-i18next)

Next.js App Router + i18next 기반 클라이언트 사이드 다국어 지원 가이드.

> **스택:** i18next v25 + react-i18next v15, Next.js 16 App Router

## 아키텍처 개요

```
i18n.ts                  ← i18next 초기화 + 번역 리소스 (en/ko)
providers/I18nProvider   ← 언어 감지 (localStorage → browser → fallback)
hooks/useTranslateText   ← t() 래퍼 훅
components/*             ← translateText('key') 로 번역 텍스트 사용
```

## 핵심 파일

### 1. i18n.ts — 초기화 및 번역 리소스

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export const FALLBACK_LANGUAGE = 'en';
export const I18N_STORAGE_KEY = 'i18nextLng';

i18n.use(initReactI18next).init({
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
  lng: FALLBACK_LANGUAGE,
  resources: {
    en: {
      translation: {
        'common.login': 'LOGIN',
        'myPage.greeting': 'Hello, {{nickname}}!',
        // ... 번역 키는 알파벳 순 정렬 (perfectionist/sort-objects)
      },
    },
    ko: {
      translation: {
        'common.login': '로그인',
        'myPage.greeting': '안녕하세요, {{nickname}}님!',
        // ... en과 동일한 키 세트
      },
    },
  },
  supportedLngs: SUPPORTED_LANGUAGES,
});

export default i18n;
```

### 2. I18nProvider — 언어 감지 및 영속화

```typescript
'use client';

import 'i18n';

import type { ReactNode } from 'react';

import i18n, {
  FALLBACK_LANGUAGE,
  I18N_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from 'i18n';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

function detectLanguage(): string {
  // 1순위: localStorage
  const stored = localStorage.getItem(I18N_STORAGE_KEY);
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored;
  }
  // 2순위: 브라우저 언어
  const browserLang = navigator.language?.split('-')[0];
  if (browserLang && (SUPPORTED_LANGUAGES as readonly string[]).includes(browserLang)) {
    return browserLang;
  }
  // 3순위: fallback
  return FALLBACK_LANGUAGE;
}

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    const detected = detectLanguage();
    if (i18n.language !== detected) {
      i18n.changeLanguage(detected);
    }

    const handleLanguageChanged = (lng: string) => {
      localStorage.setItem(I18N_STORAGE_KEY, lng);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => { i18n.off('languageChanged', handleLanguageChanged); };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};
```

### 3. useTranslateText — 번역 훅

```typescript
'use client';

import { useTranslation } from 'react-i18next';

export const useTranslateText = () => {
  const { t } = useTranslation();
  return (key: string, args?: Record<string, string>) => t(key, args);
};
```

## 번역 키 추가 패턴

### 새로운 번역 문자열 추가 시

1. `i18n.ts`의 `resources.en.translation`과 `resources.ko.translation`에 키 추가
2. **키 정렬**: `perfectionist/sort-objects` 규칙에 따라 알파벳 순 정렬 필수
3. **키 네이밍**: `'컴포넌트명.용도'` 형식 (예: `'loginModal.title'`, `'common.login'`)
4. **en/ko 키 동일**: 양쪽 언어에 동일한 키 세트 유지

```typescript
// i18n.ts resources에 추가
en: { translation: { 'newComponent.title': 'Title' } },
ko: { translation: { 'newComponent.title': '제목' } },
```

### 컴포넌트에서 사용

```tsx
'use client';

import { useTranslateText } from 'hooks/useTranslateText';

export const MyComponent = () => {
  const translateText = useTranslateText();

  return <h1>{translateText('newComponent.title')}</h1>;
};
```

### interpolation (변수 삽입)

```typescript
// i18n.ts
'myPage.greeting': 'Hello, {{nickname}}!'     // en
'myPage.greeting': '안녕하세요, {{nickname}}님!'  // ko

// 컴포넌트
translateText('myPage.greeting', { nickname: user.nickname })
```

### 동적 키 (enum/type 기반)

```tsx
// 필터 값 등 동적 키를 번역할 때
// i18n.ts
'postFilter.region.ALL': 'All',
'postFilter.region.KOREA': 'Korean',
'postFilter.region.FOREIGN': 'English',

// 컴포넌트
{filters.map((item) => (
  <Radio key={item.value} value={item.value}>
    {translateText(`postFilter.region.${item.value}`)}
  </Radio>
))}
```

## 언어 전환 UI

```tsx
'use client';

import { useTranslation } from 'react-i18next';
import { useTranslateText } from 'hooks/useTranslateText';

export const LanguageToggle = () => {
  const { i18n } = useTranslation();
  const translateText = useTranslateText();

  const handleToggle = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'ko' : 'en');
  };

  return (
    <button onClick={handleToggle}>
      {translateText('common.language')}
    </button>
  );
};
```

## 주의사항

1. **서버 컴포넌트에서 사용 불가**: i18next는 클라이언트 전용. 서버 컴포넌트에서 번역이 필요하면 props로 전달
2. **`useTranslation` 직접 사용 가능**: `useTranslateText`는 편의 래퍼. `i18n.language` 접근이 필요하면 `useTranslation()` 직접 사용
3. **키 누락 시**: fallback으로 키 자체가 표시됨 (`'common.login'` → `common.login`)
4. **빈 리소스 금지**: `translation: {}`는 안티패턴. 반드시 번역 문자열 포함
5. **린트**: 번역 객체의 키는 알파벳 순 정렬 (`perfectionist/sort-objects`)

## 테스트

```typescript
import { describe, expect, it } from 'vitest';
import i18n from './i18n';

describe('i18n', () => {
  it('en과 ko의 번역 키가 동일하다', () => {
    const enKeys = Object.keys(i18n.store.data.en?.translation ?? {}).sort();
    const koKeys = Object.keys(i18n.store.data.ko?.translation ?? {}).sort();
    expect(enKeys).toEqual(koKeys);
    expect(enKeys.length).toBeGreaterThan(0);
  });

  it('번역 리소스에 빈 값이 없다', () => {
    for (const lng of ['en', 'ko']) {
      const translations = i18n.store.data[lng]?.translation;
      if (translations) {
        for (const [key, value] of Object.entries(translations)) {
          expect(value, `${lng}.${key}`).not.toBe('');
        }
      }
    }
  });
});
```

## 새 언어 추가

1. `SUPPORTED_LANGUAGES`에 언어 코드 추가: `['ko', 'en', 'ja'] as const`
2. `resources`에 해당 언어 번역 추가
3. 언어 전환 UI 업데이트

## 안티패턴

```tsx
// ❌ isKorean 삼항 연산자 패턴 — 사용 금지
const isKorean = i18n.language === 'ko';
return <h1>{isKorean ? '제목' : 'Title'}</h1>;

// ✅ t() 기반 번역 — 올바른 패턴
const translateText = useTranslateText();
return <h1>{translateText('component.title')}</h1>;
```
