## 6. 렌더링 성능

**영향: MEDIUM**

렌더링 프로세스를 최적화하면 브라우저가 수행해야 하는 작업이 줄어듭니다.

### 6.1 SVG 요소 대신 래퍼에 애니메이션 적용

**영향: LOW (하드웨어 가속 활성화)**

많은 브라우저에서 SVG 요소에 대한 CSS3 애니메이션의 하드웨어 가속이 없습니다. SVG를 `<div>`로 감싸고 래퍼에 애니메이션을 적용하세요.

**잘못된 예: SVG에 직접 애니메이션 - 하드웨어 가속 없음**

```tsx
function LoadingSpinner() {
  return (
    <svg
      className="animate-spin"
      width="24"
      height="24"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" />
    </svg>
  )
}
```

**올바른 예: 래퍼 div에 애니메이션 - 하드웨어 가속**

```tsx
function LoadingSpinner() {
  return (
    <div className="animate-spin">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" />
      </svg>
    </div>
  )
}
```

이것은 모든 CSS transform과 transition(`transform`, `opacity`, `translate`, `scale`, `rotate`)에 적용됩니다. 래퍼 div는 브라우저가 더 부드러운 애니메이션을 위해 GPU 가속을 사용할 수 있게 합니다.

### 6.2 긴 목록에 CSS content-visibility 적용

**영향: HIGH (더 빠른 초기 렌더)**

`content-visibility: auto`를 적용하여 화면 밖 렌더링을 지연시킵니다.

**CSS:**

```css
.message-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
```

**예:**

```tsx
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="overflow-y-auto h-screen">
      {messages.map(msg => (
        <div key={msg.id} className="message-item">
          <Avatar user={msg.author} />
          <div>{msg.content}</div>
        </div>
      ))}
    </div>
  )
}
```

1000개 메시지의 경우, 브라우저가 ~990개 화면 밖 항목의 레이아웃/페인트를 건너뜁니다 (10배 빠른 초기 렌더).

### 6.3 정적 JSX 요소 호이스팅

**영향: LOW (재생성 방지)**

정적 JSX를 컴포넌트 외부로 추출하여 재생성을 방지합니다.

**잘못된 예: 매 렌더마다 요소를 재생성**

```tsx
function LoadingSkeleton() {
  return <div className="animate-pulse h-20 bg-gray-200" />
}

function Container() {
  return (
    <div>
      {loading && <LoadingSkeleton />}
    </div>
  )
}
```

**올바른 예: 같은 요소를 재사용**

```tsx
const loadingSkeleton = (
  <div className="animate-pulse h-20 bg-gray-200" />
)

function Container() {
  return (
    <div>
      {loading && loadingSkeleton}
    </div>
  )
}
```

이것은 특히 매 렌더마다 재생성하기에 비용이 큰 대형 정적 SVG 노드에 유용합니다.

**참고:** 프로젝트에 [React Compiler](https://react.dev/learn/react-compiler)가 활성화되어 있다면, 컴파일러가 자동으로 정적 JSX 요소를 호이스팅하고 컴포넌트 리렌더를 최적화하므로, 수동 호이스팅이 불필요합니다.

### 6.4 SVG 정밀도 최적화

**영향: LOW (파일 크기 감소)**

SVG 좌표 정밀도를 줄여 파일 크기를 줄입니다. 최적 정밀도는 viewBox 크기에 따라 다르지만, 일반적으로 정밀도를 줄이는 것을 고려해야 합니다.

**잘못된 예: 과도한 정밀도**

```svg
<path d="M 10.293847 20.847362 L 30.938472 40.192837" />
```

**올바른 예: 소수점 1자리**

```svg
<path d="M 10.3 20.8 L 30.9 40.2" />
```

**SVGO로 자동화:**

```bash
npx svgo --precision=1 --multipass icon.svg
```

### 6.5 깜빡임 없이 하이드레이션 불일치 방지

**영향: MEDIUM (시각적 깜빡임과 하이드레이션 에러 방지)**

클라이언트 사이드 저장소(localStorage, 쿠키)에 의존하는 콘텐츠를 렌더링할 때, React가 하이드레이션하기 전에 DOM을 업데이트하는 동기 스크립트를 삽입하여 SSR 문제와 하이드레이션 후 깜빡임을 모두 방지합니다.

**잘못된 예: SSR을 깨뜨림**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  // localStorage는 서버에서 사용할 수 없음 - 에러 발생
  const theme = localStorage.getItem('theme') || 'light'

  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

`localStorage`가 정의되지 않아 서버 사이드 렌더링이 실패합니다.

**잘못된 예: 시각적 깜빡임**

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    // 하이드레이션 후 실행 - 눈에 보이는 깜빡임 유발
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

컴포넌트가 먼저 기본값(`light`)으로 렌더링한 후 하이드레이션 후 업데이트되어, 잘못된 콘텐츠가 눈에 보이게 깜빡입니다.

**올바른 예: 깜빡임 없음, 하이드레이션 불일치 없음**

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

인라인 스크립트가 요소를 표시하기 전에 동기적으로 실행되어, DOM이 이미 올바른 값을 가지게 합니다. 깜빡임 없음, 하이드레이션 불일치 없음.

이 패턴은 테마 토글, 사용자 설정, 인증 상태, 기본값의 깜빡임 없이 즉시 렌더링해야 하는 모든 클라이언트 전용 데이터에 특히 유용합니다.

### 6.6 표시/숨김에 Activity 컴포넌트 사용

**영향: MEDIUM (상태/DOM 보존)**

자주 가시성이 전환되는 비용이 큰 컴포넌트에 React의 `<Activity>`를 사용하여 상태/DOM을 보존합니다.

**사용법:**

```tsx
import { Activity } from 'react'

function Dropdown({ isOpen }: Props) {
  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ExpensiveMenu />
    </Activity>
  )
}
```

비용이 큰 리렌더와 상태 손실을 방지합니다.

### 6.7 명시적 조건부 렌더링 사용

**영향: LOW (0 또는 NaN 렌더링 방지)**

조건이 `0`, `NaN` 또는 렌더링되는 기타 falsy 값이 될 수 있을 때, 조건부 렌더링에 `&&` 대신 명시적 삼항 연산자(`? :`)를 사용합니다.

**잘못된 예: count가 0일 때 "0"을 렌더링**

```tsx
function Badge({ count }: { count: number }) {
  return (
    <div>
      {count && <span className="badge">{count}</span>}
    </div>
  )
}

// count = 0일 때 렌더링: <div>0</div>
// count = 5일 때 렌더링: <div><span class="badge">5</span></div>
```

**올바른 예: count가 0일 때 아무것도 렌더링하지 않음**

```tsx
function Badge({ count }: { count: number }) {
  return (
    <div>
      {count > 0 ? <span className="badge">{count}</span> : null}
    </div>
  )
}

// count = 0일 때 렌더링: <div></div>
// count = 5일 때 렌더링: <div><span class="badge">5</span></div>
```

---
