# i18next 설정 레퍼런스

## 초기화 옵션

```typescript
i18n.use(initReactI18next).init({
  // 기본 언어 (초기 로드 시 사용)
  lng: 'en',

  // 번역 키 누락 시 폴백 언어
  fallbackLng: 'en',

  // 지원 언어 목록 (이 외의 언어는 fallbackLng으로 폴백)
  supportedLngs: ['ko', 'en'],

  // 보간(interpolation) 설정
  interpolation: {
    escapeValue: false, // React는 자체 XSS 방어가 있으므로 비활성화
  },

  // 번역 리소스
  resources: {
    en: { translation: { /* ... */ } },
    ko: { translation: { /* ... */ } },
  },
});
```

## 자주 사용하는 init 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `lng` | `string` | `undefined` | 초기 언어 |
| `fallbackLng` | `string \| string[]` | `'dev'` | 폴백 언어 |
| `supportedLngs` | `string[]` | `false` | 허용 언어 목록 |
| `ns` | `string \| string[]` | `'translation'` | 네임스페이스 |
| `defaultNS` | `string` | `'translation'` | 기본 네임스페이스 |
| `debug` | `boolean` | `false` | 콘솔 로그 출력 |
| `keySeparator` | `string \| false` | `'.'` | 중첩 키 구분자 |
| `nsSeparator` | `string \| false` | `':'` | 네임스페이스 구분자 |
| `interpolation.escapeValue` | `boolean` | `true` | HTML 이스케이프 |
| `interpolation.prefix` | `string` | `'{{'` | 변수 시작 구분자 |
| `interpolation.suffix` | `string` | `'}}'` | 변수 끝 구분자 |

## 네임스페이스 분리 (대규모 프로젝트)

```typescript
i18n.init({
  ns: ['common', 'login', 'mypage'],
  defaultNS: 'common',
  resources: {
    en: {
      common: { login: 'LOGIN', logout: 'LOGOUT' },
      login: { title: 'Sign In', kakao: 'Kakao Login' },
      mypage: { title: 'My Page' },
    },
    ko: {
      common: { login: '로그인', logout: '로그아웃' },
      login: { title: '로그인', kakao: '카카오 로그인' },
      mypage: { title: '마이페이지' },
    },
  },
});

// 사용: t('login:title') 또는 t('title', { ns: 'login' })
```

## 중첩 키 vs 플랫 키

```typescript
// 플랫 키 (현재 프로젝트 방식) — 단순, perfectionist/sort-objects 친화적
{
  'myPage.title': 'My Page',
  'myPage.greeting': 'Hello, {{nickname}}!',
}

// 중첩 키 — 구조적이지만 정렬 규칙 적용이 복잡
{
  myPage: {
    title: 'My Page',
    greeting: 'Hello, {{nickname}}!',
  },
}
```

> **프로젝트 규칙:** 플랫 키(`'component.key'`) 방식 사용. `keySeparator`를 `false`로 설정하지 않음 (기본값 `.` 유지).

## 플러그인

### 현재 사용 중

- **react-i18next** (`initReactI18next`): React 바인딩 (useTranslation, I18nextProvider)

### 유용한 플러그인

| 플러그인 | 용도 |
|----------|------|
| `i18next-browser-languagedetector` | 브라우저 언어 자동 감지 |
| `i18next-http-backend` | 번역 파일 비동기 로딩 |
| `i18next-localstorage-backend` | localStorage 캐싱 |

> **참고:** 현재 프로젝트는 `I18nProvider`에서 직접 언어 감지를 구현하므로 `i18next-browser-languagedetector`를 사용하지 않음.

## i18n 인스턴스 API

```typescript
import i18n from 'i18next';

// 언어 변경
await i18n.changeLanguage('ko');

// 현재 언어
i18n.language; // 'ko'

// 번역
i18n.t('common.login'); // '로그인'
i18n.t('myPage.greeting', { nickname: '홍길동' }); // '안녕하세요, 홍길동님!'

// 번역 키 존재 여부
i18n.exists('common.login'); // true

// 리소스 동적 추가
i18n.addResource('en', 'translation', 'new.key', 'New Value');
i18n.addResources('en', 'translation', { 'new.key1': 'V1', 'new.key2': 'V2' });

// 이벤트
i18n.on('languageChanged', (lng) => { /* ... */ });
i18n.off('languageChanged', handler);

// 리소스 스토어 접근
i18n.store.data; // { en: { translation: {...} }, ko: { translation: {...} } }
```
