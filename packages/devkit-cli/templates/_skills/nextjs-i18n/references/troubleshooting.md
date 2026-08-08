# i18n 트러블슈팅

## 번역이 표시되지 않고 키가 그대로 출력됨

**증상:** `common.login`이 텍스트로 표시됨

**원인 및 해결:**

1. **키 오타 확인**
   ```typescript
   // ❌ 오타
   translateText('commo.login')
   // ✅ 올바른 키
   translateText('common.login')
   ```

2. **리소스에 키가 없음**
   ```typescript
   // i18n.ts에 키가 추가되었는지 확인
   // en과 ko 양쪽 모두에 추가했는지 확인
   ```

3. **I18nProvider가 감싸고 있지 않음**
   ```tsx
   // layout.tsx에서 I18nProvider가 컴포넌트를 감싸는지 확인
   <I18nProvider>
     <QueryProvider>{children}</QueryProvider>
   </I18nProvider>
   ```

4. **`import 'i18n'`이 누락됨**
   ```typescript
   // I18nProvider.tsx 상단에 import 확인
   import 'i18n';
   ```

## 언어 변경이 작동하지 않음

**증상:** 토글 버튼 클릭 후 언어가 바뀌지 않음

**원인 및 해결:**

1. **changeLanguage 호출 확인**
   ```typescript
   const { i18n } = useTranslation();
   i18n.changeLanguage('ko'); // Promise 반환
   ```

2. **supportedLngs에 포함되지 않은 언어**
   ```typescript
   // i18n.ts
   supportedLngs: ['ko', 'en'], // 여기에 없는 언어는 폴백됨
   ```

3. **localStorage 충돌**
   ```javascript
   // 브라우저 콘솔에서 확인
   localStorage.getItem('i18nextLng')
   // 수동 초기화
   localStorage.removeItem('i18nextLng')
   ```

## 새로고침 시 언어가 초기화됨

**증상:** 한국어로 변경 후 새로고침하면 영어로 돌아감

**원인:** I18nProvider의 언어 감지 로직 문제

**확인 사항:**
1. `localStorage.setItem(I18N_STORAGE_KEY, lng)`이 `languageChanged` 이벤트에서 호출되는지 확인
2. `detectLanguage()`가 localStorage를 1순위로 확인하는지 확인
3. `I18N_STORAGE_KEY`가 `'i18nextLng'`인지 확인

```typescript
// 브라우저 콘솔에서 디버깅
localStorage.getItem('i18nextLng') // 'ko' 여야 함
```

## hydration mismatch 경고

**증상:** 서버/클라이언트 HTML 불일치 경고

**원인:** i18n은 클라이언트에서만 초기화되므로 서버 렌더링 시 기본 언어(en)로 렌더링 후, 클라이언트에서 감지된 언어(ko)로 다시 렌더링됨

**해결:**
- 번역 텍스트를 포함하는 컴포넌트에 `'use client'` 지시문 확인
- `suppressHydrationWarning` 사용은 비권장 (근본적 해결이 아님)
- SSR에서 언어 정보가 필요하면 쿠키 기반 서버 사이드 감지 도입 고려

## lint 에러: perfectionist/sort-objects

**증상:** i18n.ts에서 정렬 관련 lint 에러

**해결:**
```bash
pnpm lint --fix
```

자동 정렬이 적용됨. 수동 정렬 시 알파벳 순서 확인:
- `bookmarkPostList.*` < `channelList.*` < `common.*` < `loginModal.*` < `myPage.*` < `postFilter.*` < `postListFilter.*`

## en/ko 키 불일치

**증상:** 테스트 실패: `en과 ko의 번역 키가 동일하다`

**해결:**
```typescript
// i18n.test.ts에서 어떤 키가 누락되었는지 확인
const enKeys = Object.keys(i18n.store.data.en?.translation ?? {}).sort();
const koKeys = Object.keys(i18n.store.data.ko?.translation ?? {}).sort();

// 차이 찾기
const missingInKo = enKeys.filter(k => !koKeys.includes(k));
const missingInEn = koKeys.filter(k => !enKeys.includes(k));
console.log({ missingInEn, missingInKo });
```

## interpolation 변수가 표시되지 않음

**증상:** `Hello, {{nickname}}!`이 그대로 표시됨

**원인:**
1. 변수명 불일치
   ```typescript
   // 리소스: 'greeting': 'Hello, {{nickname}}!'
   // ❌
   translateText('greeting', { name: 'John' })
   // ✅
   translateText('greeting', { nickname: 'John' })
   ```

2. interpolation 비활성화 확인
   ```typescript
   // i18n.ts에서 escapeValue가 false인지 확인
   interpolation: { escapeValue: false }
   ```

## 서버 컴포넌트에서 useTranslation 에러

**증상:** `React hooks can only be called inside of the body of a function component`

**해결:** 번역이 필요한 부분을 클라이언트 컴포넌트로 분리

```tsx
// ❌ page.tsx (서버 컴포넌트)에서 직접 사용
export default function Page() {
  const translateText = useTranslateText(); // Error!
}

// ✅ 클라이언트 컴포넌트로 분리
// components/PageTitle.tsx
'use client';
export function PageTitle() {
  const translateText = useTranslateText();
  return <h1>{translateText('page.title')}</h1>;
}

// page.tsx
export default function Page() {
  return <PageTitle />;
}
```
