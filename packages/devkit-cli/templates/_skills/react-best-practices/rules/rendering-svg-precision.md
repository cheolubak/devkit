---
title: SVG 정밀도 최적화
impact: LOW
impactDescription: 파일 크기 감소
tags: rendering, svg, optimization, svgo
---

## SVG 정밀도 최적화

SVG 좌표 정밀도를 줄여 파일 크기를 줄이세요. 최적의 정밀도는 viewBox 크기에 따라 다르지만, 일반적으로 정밀도를 줄이는 것을 고려해야 합니다.

**잘못된 예 (과도한 정밀도):**

```svg
<path d="M 10.293847 20.847362 L 30.938472 40.192837" />
```

**올바른 예 (소수점 1자리):**

```svg
<path d="M 10.3 20.8 L 30.9 40.2" />
```

**SVGO로 자동화:**

```bash
npx svgo --precision=1 --multipass icon.svg
```
