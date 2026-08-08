---
name: clean-code
description: "코드 장인 정신(Clean Code) 가이드. 의도를 드러내는 네이밍, 작은 단일책임 함수, why 주석, 방어적 에러 처리, SRP·DRY, 코드 스멜 탐지와 리팩터링 레시피. TypeScript/NestJS/Next.js 실전 예시.\nAPPLIES: 이미 있는 함수·변수·모듈을 읽기 좋게 다듬을 때, 길거나 중첩이 깊거나 이름이 모호한 코드를 마주쳤을 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"클린 코드\", \"clean code\", \"코드 정리해줘\", \"리팩터링\", \"가독성\", \"네이밍\", \"변수명 지어줘\", \"함수가 너무 길어\", \"함수 쪼개\", \"코드 스멜\", \"매직 넘버\", \"중복 제거\", \"DRY\", \"이 코드 개선\", \"주석 어떻게\", \"중첩이 깊어\", 코드 자체의 가독성·구조·이름·중복을 다듬을 때.\nSKIP: 계층·의존성 방향·유스케이스 등 아키텍처 구조는 clean-architecture. 프론트 폴더/슬라이스 배치는 fsd-architecture. 타입 설계(제네릭·유니온·추론)는 typescript-patterns. 린트/포맷 규칙 설정은 eslint/prettier. 테스트 우선 작성은 tdd. NestJS 예외 필터·계층별 예외 매핑 구현은 nestjs-error-handling."
version: 1.0.0
---

# 클린 코드 (Clean Code)

> 참조:
> - [references/naming.md](references/naming.md) - 의도를 드러내는 네이밍: 도메인 용어, 불리언·함수 동사, 흔한 안티패턴
> - [references/functions.md](references/functions.md) - 함수 설계: 크기, 단일 추상화 레벨, 인자 수, 부수효과, 명령-조회 분리
> - [references/comments-errors.md](references/comments-errors.md) - why 주석, 가드 절(early return), 예외 vs Result, null/optional 처리
> - [references/code-smells.md](references/code-smells.md) - 코드 스멜 카탈로그와 리팩터링 레시피(추출·인라인·치환)

## 핵심 원칙

코드는 **쓰는 시간보다 읽히는 시간이 압도적으로 길다.** 클린 코드의 목표는 "동작하는 코드"를 넘어 **다음 사람(=미래의 나)이 오해 없이 빠르게 이해하고 안전하게 고칠 수 있는 코드**를 만드는 것이다. 영리함이 아니라 **명료함**이 척도다.

이 스킬은 **코드 그 자체의 결**을 다룬다. 계층·의존성 방향·모듈 경계 같은 **구조** 문제는 clean-architecture, 프론트 폴더 배치는 fsd-architecture로 간다.

## 4대 축

| 축 | 한 줄 원칙 | 상세 |
|----|-----------|------|
| **네이밍** | 이름만 읽어도 의도가 보이게 | [references/naming.md](references/naming.md) |
| **함수** | 한 가지 일을, 한 추상화 레벨에서 | [references/functions.md](references/functions.md) |
| **주석·에러** | 주석은 why, 실패는 명시적으로 | [references/comments-errors.md](references/comments-errors.md) |
| **스멜 제거** | 중복·거대함·모호함을 리팩터링으로 | [references/code-smells.md](references/code-smells.md) |

## 네이밍: 의도를 드러낸다

이름은 **왜 존재하고, 무엇을 하고, 어떻게 쓰이는지**를 답해야 한다. 주석으로 이름을 변명해야 한다면 이름이 틀린 것이다.

```typescript
// ✕ 의도가 숨겨짐 — 주석이 없으면 무엇인지 모른다
const d = 30; // 만료 일수
const list = users.filter((u) => u.a);

// ○ 이름이 스스로 설명한다
const EXPIRATION_DAYS = 30;
const activeUsers = users.filter((user) => user.isActive);
```

- **검색 가능한 이름**을 쓴다. `86400` 대신 `SECONDS_PER_DAY`. 매직 넘버·매직 스트링은 명명 상수로.
- 불리언은 `is/has/can/should` 접두. 함수는 **동사**로 시작(`fetchUser`, `calculateTotal`), 값 반환자는 명사구.
- 한 개념엔 한 단어. `fetch`/`get`/`retrieve`를 섞지 않는다.

도메인 용어 사용, 축약어 규칙, 흔한 안티패턴(`data`, `info`, `manager`, `flag`) → [references/naming.md](references/naming.md).

## 함수: 작게, 한 가지만

함수는 **하나의 일**만 하고, 그 일을 **한 추상화 레벨**에서 서술해야 한다. 스크롤해야 다 보이는 함수, `if/for`가 3중으로 중첩된 함수는 쪼갤 신호다.

```typescript
// ✕ 검증·계산·부수효과·포맷이 한 함수에 뒤섞임 (추상화 레벨 혼재)
async function checkout(cart: Cart) {
  if (!cart.items.length) throw new Error('empty');
  let total = 0;
  for (const item of cart.items) total += item.price * item.qty;
  if (cart.coupon) total *= 1 - cart.coupon.rate;
  await db.orders.insert({ total });
  return `$${total.toFixed(2)}`;
}

// ○ 각 단계가 이름을 갖고, 최상위는 "이야기"만 읽힌다
async function checkout(cart: Cart): Promise<Order> {
  assertCartNotEmpty(cart);
  const total = applyCoupon(subtotal(cart), cart.coupon);
  return orderRepository.create({ total });
}
```

- **인자는 3개 이하.** 늘어나면 객체로 묶는다(파라미터 객체). 불리언 인자는 함수가 두 가지 일을 한다는 신호 → 둘로 나눈다.
- **부수효과를 숨기지 않는다.** `getUser()`가 내부에서 세션을 초기화하면 배신이다. 이름이 약속한 것만 한다.
- **명령(command)과 조회(query)를 분리한다.** 값을 반환하면서 상태를 바꾸지 않는다.

인자 처리, 가드 절, 중첩 평탄화 상세 → [references/functions.md](references/functions.md).

## 주석: why를 남기고 what을 지운다

코드가 **무엇을** 하는지는 코드가 말한다. 주석은 코드가 말할 수 없는 **왜**(설계 의도, 트레이드오프, 외부 제약)를 남긴다.

```typescript
// ✕ 코드를 그대로 옮긴 주석 — 유지보수 부채
// user가 active이면 true 반환
return user.isActive;

// ○ 코드로는 알 수 없는 배경
// 결제사 A는 음수 금액을 415로 거절하므로 0으로 클램프한다 (2026-03 인시던트)
const amount = Math.max(0, rawAmount);
```

주석보다 **좋은 이름과 작은 함수**가 먼저다. 주석 유형(설명 주석 제거, TODO 규칙, JSDoc은 언제) → [references/comments-errors.md](references/comments-errors.md).

## 에러 처리: 실패를 명시적으로

에러 처리 로직이 정상 로직을 가리면 안 된다. **가드 절로 예외 케이스를 위에서 걷어내고**, 핵심 경로는 평탄하게 둔다.

```typescript
// ✕ 중첩된 성공 경로 — 핵심 로직이 깊이 파묻힘
function priceFor(user: User | null) {
  if (user) {
    if (user.subscription) {
      if (user.subscription.isActive) {
        return user.subscription.price;
      }
    }
  }
  return DEFAULT_PRICE;
}

// ○ 가드 절로 예외를 먼저 제거, 핵심은 마지막 한 줄
function priceFor(user: User | null): number {
  if (!user?.subscription?.isActive) return DEFAULT_PRICE;
  return user.subscription.price;
}
```

- **에러를 삼키지 않는다.** 빈 `catch {}`는 버그를 침묵시킨다. 복구 못 할 실패는 던지고, 로깅만 하고 넘길지 다시 던질지 의식적으로 정한다.
- `null` 반환 대신 **의미 있는 부재**(빈 배열, Optional, Result 타입, 또는 예외)를 선택한다.

예외 vs Result 타입 판단, 커스텀 예외, NestJS 예외 필터 연계 → [references/comments-errors.md](references/comments-errors.md).

## SRP (단일 책임 원칙) — 코드 레벨

> 하나의 함수/클래스/모듈은 **바뀌는 이유가 하나여야 한다.**

"할 수 있다"가 아니라 "**왜 바뀌는가**"로 나눈다. 아래 `User` 클래스는 도메인 규칙·영속성·포맷이 한데 묶여, 서로 무관한 세 가지 이유로 수정된다.

```typescript
// ✕ 책임 3개 — DB 스키마 변경, 표시 형식 변경, 검증 규칙 변경이 모두 이 클래스를 건드린다
class User {
  validate() { /* 검증 규칙 */ }
  save() { /* SQL 저장 */ }
  toCSVRow() { /* 표시 포맷 */ }
}

// ○ 이유별로 분리 — 각자 독립적으로 진화한다
class User { /* 상태 + 도메인 규칙 */ }
class UserRepository { save(user: User) {} }   // 영속성
class UserCsvPresenter { toRow(user: User) {} } // 표현
```

> SRP는 여기서 **코드 응집도** 관점으로 다룬다. 계층 간 책임 배치(도메인 vs 애플리케이션 vs 인프라)로서의 SRP와 나머지 SOLID(OCP·LSP·ISP·DIP)는 clean-architecture 소관이다.

## DRY — 지식의 중복을 제거한다 (성급한 추상화는 경계)

DRY는 "**같은 지식**을 두 곳에 두지 말라"는 것이지, "비슷해 보이는 코드를 무조건 합치라"는 게 아니다.

```typescript
// ✕ 세율이라는 하나의 지식이 세 곳에 복제 — 바뀌면 다 찾아 고쳐야 한다
const a = price * 1.1;
const b = subtotal * 1.1;

// ○ 지식을 한 곳에
const TAX_RATE = 0.1;
const withTax = (amount: number) => amount * (1 + TAX_RATE);
```

**과잉 DRY 경고:** 지금 우연히 같아 보이는 두 코드가 **다른 이유로 변한다면** 억지로 합치지 마라. 잘못된 추상화는 중복보다 비싸다("성급한 추상화보다 약간의 중복이 낫다"). **세 번째 반복에서** 추상화를 고민하는 게 안전하다(rule of three).

## 워크플로: 코드를 다듬을 때

1. **동작 고정** — 리팩터링 전 테스트가 초록인지 확인한다. 안전망 없이 구조를 바꾸지 않는다(tdd 참조).
2. **스멜 식별** — [references/code-smells.md](references/code-smells.md)의 카탈로그로 무엇이 문제인지 이름 붙인다("긴 함수", "기능 욕심", "데이터 뭉치").
3. **작게 치환** — 이름 변경 → 함수 추출 → 중첩 평탄화 순으로, 한 번에 하나씩. 각 단계 후 테스트를 돌린다.
4. **멈출 때를 안다** — 더 나눠도 이해가 나아지지 않으면 멈춘다. 클린 코드는 목적이 아니라 **가독성이라는 목적의 수단**이다.

> 리팩터링과 기능 추가를 **같은 커밋에 섞지 않는다.** 리뷰어가 무엇이 행동 변경이고 무엇이 구조 변경인지 구분할 수 있어야 한다.
