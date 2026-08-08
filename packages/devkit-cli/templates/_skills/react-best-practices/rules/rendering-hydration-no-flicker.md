---
title: 깜빡임 없이 하이드레이션 불일치 방지
impact: MEDIUM
impactDescription: 시각적 깜빡임과 하이드레이션 오류를 방지합니다
tags: rendering, ssr, hydration, localStorage, flicker
---

## 깜빡임 없이 하이드레이션 불일치 방지

클라이언트 측 스토리지(localStorage, 쿠키)에 의존하는 콘텐츠를 렌더링할 때, React가 하이드레이션하기 전에 DOM을 업데이트하는 동기 스크립트를 삽입하여 SSR 오류와 하이드레이션 후 깜빡임을 모두 방지하세요.

**잘못된 방법 (SSR이 깨짐):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  // localStorage는 서버에서 사용할 수 없음 - 오류 발생
  const theme = localStorage.getItem('theme') || 'light'

  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

서버 사이드 렌더링은 `localStorage`가 정의되지 않았기 때문에 실패합니다.

**잘못된 방법 (시각적 깜빡임):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    // 하이드레이션 후에 실행됨 - 눈에 보이는 깜빡임 발생
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored)
    }
  }, [])

  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

컴포넌트가 먼저 기본값(`light`)으로 렌더링된 후 하이드레이션 후에 업데이트되어, 잘못된 콘텐츠가 눈에 보이게 깜빡입니다.

**올바른 방법 (깜빡임 없음, 하이드레이션 불일치 없음):**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <div id="theme-wrapper">
        {children}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var theme = localStorage.getItem('theme') || 'light';
                var el = document.getElementById('theme-wrapper');
                if (el) el.className = theme;
              } catch (e) {}
            })();
          `,
        }}
      />
    </>
  )
}
```

인라인 스크립트는 요소가 표시되기 전에 동기적으로 실행되어, DOM이 이미 올바른 값을 가지고 있도록 보장합니다. 깜빡임도 없고, 하이드레이션 불일치도 없습니다.

이 패턴은 테마 토글, 사용자 설정, 인증 상태, 그리고 기본값이 깜빡이지 않고 즉시 렌더링되어야 하는 모든 클라이언트 전용 데이터에 특히 유용합니다.
