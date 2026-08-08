# 완결형 TDD 세션 walkthrough

하나의 기능을 **테스트 리스트 → 사이클 반복 → 커밋 누적**으로 처음부터 끝까지 도는 모습을 보여준다. 사이클 각 단계의 의미는 [workflow.md](workflow.md)에서 이미 다뤘으니, 여기서는 **여러 사이클이 어떻게 이어지는지**에 집중한다.

> 대상: `calcCartSummary(items, coupon?)` — 장바구니 합계를 계산한다. 소계, 무료배송 임계값(3만원↑ 무료, 아니면 3천원), 쿠폰 할인까지.

## 0. 테스트 리스트부터

코드를 짜기 전에 만들 동작을 나열한다. 이 리스트가 세션 전체의 지도다.

```
[ ] 빈 장바구니 → 소계 0, 배송비 0, 합계 0
[ ] 단일 상품 → 소계 = 가격 × 수량
[ ] 여러 상품 → 소계 합산
[ ] 소계 3만원 미만 → 배송비 3000
[ ] 소계 3만원 이상 → 배송비 0
[ ] 쿠폰(정액) → 합계에서 차감
[ ] 쿠폰 할인이 소계 초과 → 합계 0 밑으로 안 감
```

위에서부터 **하나씩만** 꺼내 돈다. 도중에 떠오른 케이스는 리스트에 추가만 하고 하던 걸 끝낸다.

## 사이클 1 — 빈 장바구니 `[ ] → [x]`

```typescript
// src/lib/cart.test.ts
import { describe, it, expect } from 'vitest';
import { calcCartSummary } from './cart';

describe('calcCartSummary', () => {
  it('빈 장바구니는 모든 금액이 0이다', () => {
    expect(calcCartSummary([])).toEqual({ subtotal: 0, shipping: 0, total: 0 });
  });
});
```

import부터 컴파일 실패(RED). 통과할 **최소 코드**만:

```typescript
// src/lib/cart.ts
export type CartItem = { price: number; qty: number };

export function calcCartSummary(items: CartItem[]) {
  return { subtotal: 0, shipping: 0, total: 0 }; // 하드코딩. 지금은 이걸로 충분
}
```

```bash
git commit -m "feat: 빈 장바구니 합계 계산"
```

빈 케이스는 하드코딩 반환으로 넘어간다. **다음 케이스가 이 하드코딩을 깨뜨릴 것이다** — 삼각측량.

## 사이클 2 — 소계 합산 `[ ] → [x]`

```typescript
it('여러 상품의 소계를 합산한다', () => {
  const items = [
    { price: 10000, qty: 2 },
    { price: 5000, qty: 1 },
  ];
  expect(calcCartSummary(items).subtotal).toBe(25000);
});
```

`subtotal: 0` 하드코딩이 깨진다(RED). 이제서야 일반화한다:

```typescript
const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
return { subtotal, shipping: 0, total: subtotal };
```

두 테스트 모두 초록. `git commit -m "feat: 장바구니 소계 합산"`.

## 사이클 3~4 — 배송비 규칙 (경계값 두 개)

임계값은 **경계 양쪽**을 각각 테스트로 박는다. 리스트의 두 항목을 연달아 소비한다.

```typescript
it('소계 3만원 미만이면 배송비 3000원', () => {
  const items = [{ price: 29999, qty: 1 }];
  expect(calcCartSummary(items).shipping).toBe(3000);
});

it('소계 3만원 이상이면 무료배송', () => {
  const items = [{ price: 30000, qty: 1 }];
  expect(calcCartSummary(items).shipping).toBe(0);
});
```

GREEN:

```typescript
const shipping = subtotal >= 30000 || subtotal === 0 ? 0 : 3000;
return { subtotal, shipping, total: subtotal + shipping };
```

> 사이클 1의 "빈 장바구니 배송비 0" 테스트가 여기서 **안전망**이 됐다. `subtotal === 0` 조건을 빠뜨리면 그 오래된 테스트가 빨개져 알려준다. 이게 리스트를 쌓아온 이유다.

`git commit -m "feat: 3만원 무료배송 임계값"`.

## 사이클 5~6 — 쿠폰 (정상 + 경계)

```typescript
it('정액 쿠폰을 합계에서 차감한다', () => {
  const items = [{ price: 30000, qty: 1 }];
  expect(calcCartSummary(items, { amount: 5000 }).total).toBe(25000);
});

it('쿠폰이 소계를 초과해도 합계는 0 밑으로 안 간다', () => {
  const items = [{ price: 10000, qty: 1 }];
  // 소계 10000 + 배송 3000 = 13000, 쿠폰 99999
  expect(calcCartSummary(items, { amount: 99999 }).total).toBe(0);
});
```

GREEN:

```typescript
export function calcCartSummary(items: CartItem[], coupon?: { amount: number }) {
  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
  const shipping = subtotal >= 30000 || subtotal === 0 ? 0 : 3000;
  const discount = coupon?.amount ?? 0;
  const total = Math.max(0, subtotal + shipping - discount);
  return { subtotal, shipping, total };
}
```

`git commit -m "feat: 정액 쿠폰 할인 및 하한 처리"`.

## REFACTOR — 리스트가 빈 뒤에

일곱 케이스가 모두 `[x]`. 초록을 유지하며 매직넘버를 정리한다:

```typescript
const FREE_SHIPPING_THRESHOLD = 30000;
const SHIPPING_FEE = 3000;
```

테스트는 한 줄도 안 바꾸고 초록. 이건 **구조 변경**이므로 별도 커밋: `git commit -m "refactor: 배송 상수 추출"`.

## 세션이 남긴 것

- 커밋 6개 + 리팩터 1개 = **작고 되돌리기 쉬운 히스토리**. 각 커밋은 테스트가 초록인 지점.
- 테스트 7개가 **살아있는 명세**로 남는다. 요구사항을 코드가 아니라 테스트로 읽을 수 있다.
- 리스트를 위에서부터 정직하게 소비했더니, 이전 사이클의 테스트가 다음 사이클의 **안전망**이 됐다.

> 스택별 문법·쿼리 상세는 [frontend-vitest.md](frontend-vitest.md) / [backend-vitest.md](backend-vitest.md). 이 문서는 그 사이클들을 **하나의 기능으로 엮는 흐름**만 보여준다.
