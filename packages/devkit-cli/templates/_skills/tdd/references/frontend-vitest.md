# 프론트엔드 TDD: Vitest + Testing Library

Vitest와 `@testing-library/react`로 프론트엔드 코드를 **test-first**로 만든다. 여기서는 방법론(RED→GREEN→REFACTOR)에 집중한다. 도구 설치·`vitest.config.ts`·`jsdom` 셋업은 **nextjs-testing** 스킬을 참조한다.

```bash
pnpm vitest --watch   # 저장할 때마다 자동 재실행
```

## 원칙: 구현이 아니라 사용자 행동을 테스트한다

- 사용자가 화면에서 보고 조작하는 것을 기준으로 검증한다. 내부 상태(useState 값)나 함수 호출 여부를 검증하지 않는다.
- 쿼리 우선순위: **`getByRole` > `getByLabelText` > `getByText`**. `data-testid`는 다른 방법이 없을 때만 쓰는 최후 수단이다.
- 상호작용은 `fireEvent`가 아니라 `userEvent`로 한다(실제 사용자 입력에 가깝다).

---

## 예시 1. 순수 유틸 함수 — `formatPrice`

### RED — 실패하는 테스트 먼저

```typescript
// src/lib/format-price.test.ts
import { describe, it, expect } from 'vitest';
import { formatPrice } from './format-price';

describe('formatPrice', () => {
  it('정수 금액을 원화 형식으로 포맷한다', () => {
    expect(formatPrice(1000)).toBe('₩1,000');
  });
});
```

`format-price.ts`가 없으니 **import부터 컴파일 실패** — 이것도 RED다.

### GREEN — 통과할 최소 코드

```typescript
// src/lib/format-price.ts
export function formatPrice(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}
```

### 삼각측량 — 두 번째 케이스로 일반화

```typescript
// RED: 음수 케이스 추가
it('음수 금액은 부호를 앞에 붙인다', () => {
  expect(formatPrice(-1000)).toBe('-₩1,000');
});
```

```typescript
// GREEN: 음수를 처리하도록 일반화
export function formatPrice(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}₩${Math.abs(amount).toLocaleString('ko-KR')}`;
}
```

### REFACTOR — 초록 유지하며 정리

```typescript
export function formatPrice(amount: number, currency = '₩'): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currency}${Math.abs(amount).toLocaleString('ko-KR')}`;
}
```

테스트는 계속 초록이어야 한다. 초록이 깨지면 리팩터가 아니라 동작 변경이다.

---

## 예시 2. 커스텀 훅 — `useCounter`

`renderHook`으로 훅을 렌더링하고, 상태를 바꾸는 호출은 `act`로 감싼다.

### RED

```typescript
// src/hooks/use-counter.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './use-counter';

describe('useCounter', () => {
  it('초기값 0에서 시작한다', () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
  });

  it('increment로 1 증가한다', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

### GREEN

```typescript
// src/hooks/use-counter.ts
import { useState, useCallback } from 'react';

export function useCounter(initial = 0) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  return { count, increment };
}
```

### 다음 케이스

`decrement`, `reset`, 초기값 인자 등은 테스트 리스트에 적어두고 각각 RED→GREEN으로 하나씩 추가한다.

---

## 예시 3. 컴포넌트 — `Counter`

사용자 관점 쿼리(`getByRole`)와 `userEvent` 상호작용으로 검증한다.

### RED

```typescript
// src/components/counter.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Counter } from './counter';

describe('<Counter />', () => {
  it('증가 버튼을 누르면 카운트가 올라간다', async () => {
    const user = userEvent.setup();
    render(<Counter />);

    // 접근성 우선 쿼리: 역할(role)과 접근 가능한 이름으로 찾는다
    expect(screen.getByRole('status')).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: '증가' }));

    expect(screen.getByRole('status')).toHaveTextContent('1');
  });
});
```

### GREEN

```tsx
// src/components/counter.tsx
'use client';

import { useCounter } from '@/hooks/use-counter';

export function Counter() {
  const { count, increment } = useCounter();
  return (
    <div>
      <output role="status">{count}</output>
      <button type="button" onClick={increment}>
        증가
      </button>
    </div>
  );
}
```

### REFACTOR

컴포넌트에서 카운팅 로직을 `useCounter` 훅으로 이미 뽑아냈다. 마크업/스타일을 정리하되 테스트가 검증하는 **역할과 텍스트**는 유지한다.

---

## 요약

- import 컴파일 실패도 RED다. 먼저 실패를 보고 구현한다.
- 유틸·훅·컴포넌트 모두 **관찰 가능한 결과**(반환값, `result.current`, 렌더링된 DOM)를 검증한다.
- `getByRole` 우선, `data-testid` 최소화. 상호작용은 `userEvent`.
- 도구/설정은 nextjs-testing 스킬.
