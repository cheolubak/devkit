---
title: 조건부 모듈 로딩
impact: HIGH
impactDescription: 필요할 때만 대용량 데이터 로드
tags: bundle, conditional-loading, lazy-loading
---

## 조건부 모듈 로딩

기능이 활성화될 때만 대용량 데이터 또는 모듈을 로드합니다.

**예시 (애니메이션 프레임 지연 로딩):**

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

`typeof window !== 'undefined'` 검사는 SSR에서 이 모듈이 번들되는 것을 방지하여 서버 번들 크기와 빌드 속도를 최적화합니다.
