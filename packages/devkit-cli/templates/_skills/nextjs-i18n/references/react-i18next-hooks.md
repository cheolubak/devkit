# react-i18next 훅 레퍼런스

## useTranslation

가장 핵심적인 훅. 번역 함수 `t()`와 i18n 인스턴스에 접근.

```typescript
import { useTranslation } from 'react-i18next';

const { t, i18n, ready } = useTranslation();

// 네임스페이스 지정
const { t } = useTranslation('mypage');

// 복수 네임스페이스
const { t } = useTranslation(['common', 'mypage']);
```

### t() 함수 사용법

```typescript
// 기본
t('common.login') // 'LOGIN' 또는 '로그인'

// interpolation (변수 삽입)
t('myPage.greeting', { nickname: 'John' }) // 'Hello, John!'

// 기본값 (키 없을 때)
t('unknown.key', 'Default Value') // 'Default Value'

// 옵션 객체로 기본값
t('unknown.key', { defaultValue: 'Default' })

// 네임스페이스 지정
t('title', { ns: 'mypage' })

// 복수형 (count 기반)
// en: { 'item': 'item', 'item_other': 'items' }
t('item', { count: 5 }) // 'items'

// 중첩 키 접근
// { deep: { nested: { key: 'value' } } }
t('deep.nested.key') // 'value'

// 컨텍스트
// { greeting_male: 'Mr.', greeting_female: 'Ms.' }
t('greeting', { context: 'female' }) // 'Ms.'

// 배열 반환
// { items: ['Apple', 'Banana'] }
t('items', { returnObjects: true }) // ['Apple', 'Banana']
```

### i18n 인스턴스

```typescript
const { i18n } = useTranslation();

// 현재 언어
i18n.language // 'ko' | 'en'

// 언어 변경
i18n.changeLanguage('en')

// 해결된 언어 (fallback 포함)
i18n.resolvedLanguage // 'en'
```

## I18nextProvider

앱 루트에서 i18n 인스턴스를 주입.

```tsx
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';

export const I18nProvider = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    {children}
  </I18nextProvider>
);
```

## Trans 컴포넌트

JSX를 포함하는 번역에 사용.

```tsx
import { Trans } from 'react-i18next';

// i18n 리소스: 'welcome': 'Hello <1>{{name}}</1>, go to <3>profile</3>'
<Trans i18nKey='welcome' values={{ name: 'John' }}>
  Hello <strong>{'{{name}}'}</strong>, go to <Link to='/profile'>profile</Link>
</Trans>

// 단순 HTML 태그
// 리소스: 'bold': 'This is <strong>bold</strong>'
<Trans i18nKey='bold' />
```

> **프로젝트 참고:** 현재 프로젝트에서는 `Trans` 미사용. 대부분 단순 텍스트 번역이므로 `t()` 함수로 충분.

## useTranslateText (프로젝트 커스텀 훅)

`useTranslation`의 `t()` 래퍼. 컴포넌트에서 더 간결하게 사용.

```typescript
// hooks/useTranslateText.ts
'use client';

import { useTranslation } from 'react-i18next';

export const useTranslateText = () => {
  const { t } = useTranslation();
  return (key: string, args?: Record<string, string>) => t(key, args);
};

// 사용
const translateText = useTranslateText();
translateText('common.login')
translateText('myPage.greeting', { nickname: user.nickname })
```

### useTranslation vs useTranslateText 사용 기준

| 상황 | 사용할 훅 |
|------|-----------|
| 번역 텍스트만 필요 | `useTranslateText` |
| `i18n.language` 접근 필요 | `useTranslation` |
| 언어 변경 (`changeLanguage`) | `useTranslation` |
| 네임스페이스 지정 필요 | `useTranslation` |

## 서버 컴포넌트 제한

react-i18next 훅은 **클라이언트 컴포넌트 전용**.

```tsx
// ❌ 서버 컴포넌트에서 사용 불가
export default async function Page() {
  const { t } = useTranslation(); // Error!
}

// ✅ 클라이언트 컴포넌트로 분리
'use client';
export function PageContent() {
  const translateText = useTranslateText();
  return <h1>{translateText('page.title')}</h1>;
}

// 서버 컴포넌트에서 사용
export default function Page() {
  return <PageContent />;
}
```
