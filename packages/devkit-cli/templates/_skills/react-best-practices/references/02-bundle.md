## 2. 번들 크기 최적화

**영향: CRITICAL**

초기 번들 크기를 줄이면 Time to Interactive와 Largest Contentful Paint가 개선됩니다.

### 2.1 배럴 파일 임포트 지양

**영향: CRITICAL (200~800ms 임포트 비용, 느린 빌드)**

사용하지 않는 수천 개의 모듈 로드를 방지하기 위해, 배럴 파일 대신 소스 파일에서 직접 임포트합니다. **배럴 파일**은 여러 모듈을 재내보내는 진입점입니다 (예: `export * from './module'`을 수행하는 `index.js`).

인기 있는 아이콘 및 컴포넌트 라이브러리는 진입 파일에 **최대 10,000개의 재내보내기**가 있을 수 있습니다. 많은 React 패키지에서 **임포트하는 데만 200~800ms가 소요**되어, 개발 속도와 프로덕션 콜드 스타트 모두에 영향을 줍니다.

**트리 쉐이킹이 도움이 되지 않는 이유:** 라이브러리가 external로 표시되면(번들되지 않으면), 번들러가 최적화할 수 없습니다. 트리 쉐이킹을 활성화하기 위해 번들하면, 전체 모듈 그래프를 분석하느라 빌드가 상당히 느려집니다.

**잘못된 예: 전체 라이브러리를 임포트**

```tsx
import { Check, X, Menu } from 'lucide-react'
// 1,583개의 모듈을 로드, 개발 환경에서 ~2.8초 추가
// 런타임 비용: 매 콜드 스타트마다 200~800ms

import { Button, TextField } from '@mui/material'
// 2,225개의 모듈을 로드, 개발 환경에서 ~4.2초 추가
```

**올바른 예: 필요한 것만 임포트**

```tsx
import Check from 'lucide-react/dist/esm/icons/check'
import X from 'lucide-react/dist/esm/icons/x'
import Menu from 'lucide-react/dist/esm/icons/menu'
// 3개의 모듈만 로드 (~2KB vs ~1MB)

import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
// 사용하는 것만 로드
```

**대안: Next.js 13.5+**

```js
// next.config.js - optimizePackageImports 사용
module.exports = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@mui/material']
  }
}

// 그러면 편리한 배럴 임포트를 유지할 수 있습니다:
import { Check, X, Menu } from 'lucide-react'
// 빌드 시 자동으로 직접 임포트로 변환됨
```

직접 임포트는 개발 부팅 15~70% 빠르게, 빌드 28% 빠르게, 콜드 스타트 40% 빠르게, 그리고 HMR을 크게 빠르게 만듭니다.

주로 영향 받는 라이브러리: `lucide-react`, `@mui/material`, `@mui/icons-material`, `@tabler/icons-react`, `react-icons`, `@headlessui/react`, `@radix-ui/react-*`, `lodash`, `ramda`, `date-fns`, `rxjs`, `react-use`.

참조: [https://vercel.com/blog/how-we-optimized-package-imports-in-next-js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)

### 2.2 조건부 모듈 로딩

**영향: HIGH (필요할 때만 대용량 데이터 로드)**

기능이 활성화될 때만 대용량 데이터나 모듈을 로드합니다.

**예: 애니메이션 프레임 지연 로딩**

```tsx
function AnimationPlayer({ enabled, setEnabled }: { enabled: boolean; setEnabled: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [frames, setFrames] = useState<Frame[] | null>(null)

  useEffect(() => {
    if (enabled && !frames && typeof window !== 'undefined') {
      import('./animation-frames.js')
        .then(mod => setFrames(mod.frames))
        .catch(() => setEnabled(false))
    }
  }, [enabled, frames, setEnabled])

  if (!frames) return <Skeleton />
  return <Canvas frames={frames} />
}
```

`typeof window !== 'undefined'` 검사는 SSR을 위해 이 모듈이 번들되는 것을 방지하여, 서버 번들 크기와 빌드 속도를 최적화합니다.

### 2.3 비핵심 서드파티 라이브러리 지연 로딩

**영향: MEDIUM (하이드레이션 후 로드)**

분석, 로깅, 에러 추적은 사용자 상호작용을 블로킹하지 않습니다. 하이드레이션 후에 로드합니다.

**잘못된 예: 초기 번들을 블로킹**

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**올바른 예: 하이드레이션 후 로드**

```tsx
import dynamic from 'next/dynamic'

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
)

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### 2.4 무거운 컴포넌트의 동적 임포트

**영향: CRITICAL (TTI와 LCP에 직접 영향)**

초기 렌더링에 필요하지 않은 대형 컴포넌트를 `next/dynamic`으로 지연 로딩합니다.

**잘못된 예: Monaco가 메인 청크와 함께 번들됨 ~300KB**

```tsx
import { MonacoEditor } from './monaco-editor'

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

**올바른 예: Monaco가 필요 시 로드됨**

```tsx
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('./monaco-editor').then(m => m.MonacoEditor),
  { ssr: false }
)

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

### 2.5 사용자 의도 기반 프리로드

**영향: MEDIUM (체감 지연 시간 감소)**

무거운 번들을 필요하기 전에 미리 로드하여 체감 지연 시간을 줄입니다.

**예: 호버/포커스 시 프리로드**

```tsx
function EditorButton({ onClick }: { onClick: () => void }) {
  const preload = () => {
    if (typeof window !== 'undefined') {
      void import('./monaco-editor')
    }
  }

  return (
    <button
      onMouseEnter={preload}
      onFocus={preload}
      onClick={onClick}
    >
      Open Editor
    </button>
  )
}
```

**예: 기능 플래그 활성화 시 프리로드**

```tsx
function FlagsProvider({ children, flags }: Props) {
  useEffect(() => {
    if (flags.editorEnabled && typeof window !== 'undefined') {
      void import('./monaco-editor').then(mod => mod.init())
    }
  }, [flags.editorEnabled])

  return <FlagsContext.Provider value={flags}>
    {children}
  </FlagsContext.Provider>
}
```

`typeof window !== 'undefined'` 검사는 SSR을 위해 프리로드된 모듈이 번들되는 것을 방지하여, 서버 번들 크기와 빌드 속도를 최적화합니다.

---
