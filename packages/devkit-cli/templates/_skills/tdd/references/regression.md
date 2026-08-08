# 버그 재현 회귀 TDD

버그를 고치기 전에 **그 버그를 재현하는 실패 테스트를 먼저 쓴다.** 이 테스트는 고친 뒤에도 지워지지 않고 **영구 회귀 가드**로 남아, 같은 버그가 다시 기어들어오면 즉시 빨간불이 켜지게 한다.

## 왜 고치기 전에 테스트부터인가

- 재현 테스트 없이 바로 고치면 **정말 그 버그였는지** 증명할 수 없다. 먼저 RED를 봐야 "이 테스트가 빨갛다 → 고치니 초록" 인과가 성립한다.
- 급하게 고친 코드는 **원인이 아니라 증상**만 덮는 경우가 많다. 재현 테스트가 있으면 증상이 사라졌는지 코드가 아니라 테스트로 확인한다.
- 이 테스트는 커밋에 남아 **같은 회귀의 재발을 막는다**. 버그 하나 = 회귀 테스트 하나.

## 절차

```
1. 버그 재현 → 실패하는 테스트를 쓴다 (RED, 실제로 빨간 것을 확인)
2. 원인을 찾아 고친다 → 그 테스트가 초록이 된다 (GREEN)
3. 리팩터 (초록 유지)
4. 재현 테스트를 지우지 않고 커밋한다 (회귀 가드로 영구 보존)
```

핵심은 **1번을 건너뛰지 않는 것**이다. 고칠 방법이 먼저 떠올라도, 재현 테스트를 빨갛게 만들기 전에는 프로덕션 코드를 건드리지 않는다.

## 예시: 할인 계산 버그

> 신고: "쿠폰 할인이 100%를 넘으면 결제 금액이 **음수**가 된다."

### 1. RED — 버그를 재현하는 테스트 먼저

정상 케이스는 이미 초록이다. 신고된 **깨지는 입력**을 그대로 테스트로 옮긴다.

```typescript
// src/lib/apply-discount.test.ts
import { describe, it, expect } from 'vitest';
import { applyDiscount } from './apply-discount';

describe('applyDiscount 회귀', () => {
  // 이슈 #142: 할인율이 100%를 넘으면 음수 금액이 나오던 버그
  it('할인율이 원금을 초과해도 0 밑으로 내려가지 않는다', () => {
    // 원금 10000, 할인 12000 → 기존엔 -2000이 나왔다
    expect(applyDiscount(10000, 12000)).toBe(0);
  });
});
```

실행해서 `-2000`이 나와 **실패하는 것을 눈으로 확인**한다. 이 빨간불이 "버그를 정확히 집었다"는 증거다.

### 2. GREEN — 원인을 고친다

```typescript
// src/lib/apply-discount.ts
export function applyDiscount(price: number, discount: number): number {
  // 버그: return price - discount  ← 음수로 내려갔다
  return Math.max(0, price - discount);
}
```

### 3. 커밋 — 재현 테스트를 남긴다

```bash
pnpm vitest run src/lib/apply-discount.test.ts   # GREEN 확인
git add src/lib/apply-discount.ts src/lib/apply-discount.test.ts
git commit -m "fix: 할인이 원금 초과 시 결제금액 음수 방지 (#142)"
```

테스트를 지우지 않는다. 다음에 누군가 `Math.max`를 실수로 되돌리면 이 테스트가 바로 빨개진다.

## 백엔드도 동일하다

Service 버그도 재현 테스트를 먼저 빨갛게 만든다. 예) "이미 탈퇴한 사용자에게도 알림이 발송된다":

```typescript
it('탈퇴한 사용자에게는 알림을 발송하지 않는다', async () => {
  // 이슈 #88: deletedAt이 있어도 send가 호출되던 회귀
  repository.findOne!.mockResolvedValue({ id: 1, deletedAt: new Date() });

  await service.notify(1);

  expect(mailer.send).not.toHaveBeenCalled();
});
```

먼저 이 테스트가 **실패(send가 불림)** 하는 걸 본 뒤 가드를 추가한다.

## 규율

- 재현 테스트가 **한 번이라도 빨갰던 것**을 확인하기 전에 고치지 않는다. 처음부터 초록이면 버그를 못 집은 것이다.
- 테스트 이름·주석에 **이슈 번호**를 남긴다. 나중에 "이 이상한 테스트 왜 있지?" 를 막는다.
- 버그가 여러 입력에서 나면 [테스트 리스트](workflow.md)로 쪼개 하나씩 재현→수정한다.
- 재현 테스트는 **관찰 가능한 증상**(반환값·발송 여부)을 검증한다. 내부 구현을 검증하면 리팩터할 때 또 깨진다.
