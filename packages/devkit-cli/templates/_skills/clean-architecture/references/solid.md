# SOLID: OCP · LSP · ISP · DIP

SOLID는 클린 아키텍처를 떠받치는 객체지향 설계 원칙이다. 이 문서는 **아키텍처·의존성 방향과 직결되는 네 원칙**을 다룬다.

> **SRP(단일 책임)와 DRY는 clean-code 소관**이다. SRP는 클린 아키텍처에서 "계층별 책임 분리"로도 나타나지만, 코드 응집도 관점의 기본기는 clean-code에서 익힌다. 여기서는 OCP·LSP·ISP·DIP에 집중한다.

## 목차
- [OCP — 개방-폐쇄 원칙](#ocp--개방-폐쇄-원칙)
- [LSP — 리스코프 치환 원칙](#lsp--리스코프-치환-원칙)
- [ISP — 인터페이스 분리 원칙](#isp--인터페이스-분리-원칙)
- [DIP — 의존성 역전 원칙](#dip--의존성-역전-원칙)
- [SOLID와 클린 아키텍처의 연결](#solid와-클린-아키텍처의-연결)

## OCP — 개방-폐쇄 원칙

> 소프트웨어 개체는 **확장에는 열려 있고, 수정에는 닫혀** 있어야 한다.

새 기능을 추가할 때 **기존 코드를 고치는 대신 새 코드를 더하는** 구조를 지향한다. 타입 기반 분기(`switch`)가 여기저기 흩어지면, 종류가 하나 늘 때마다 모든 분기를 찾아 고쳐야 한다(수정에 열림 = OCP 위반).

```typescript
// ✕ 결제 수단이 늘 때마다 이 switch를 수정해야 한다 (여러 곳에 복제되면 더 위험)
function fee(method: string, amount: number): number {
  switch (method) {
    case 'card': return amount * 0.03;
    case 'bank': return 0;
    // 새 수단 추가 = 이 함수(그리고 비슷한 다른 switch들) 수정
  }
}

// ○ 다형성 — 새 수단은 새 클래스 하나로 끝. 기존 코드는 손대지 않는다
interface PaymentMethod { fee(amount: number): number; }
class Card implements PaymentMethod { fee(a: number) { return a * 0.03; } }
class Bank implements PaymentMethod { fee(_: number) { return 0; } }
// 새 수단: class Crypto implements PaymentMethod { ... } 추가만
```

- 확장 지점을 **추상(인터페이스)** 으로 열어두고, 구체 구현을 플러그인처럼 더한다.
- 단, **모든 곳에 미리 확장점을 만들지 않는다.** 변할 축을 예측해 그 축에만 OCP를 적용한다(예측 못 한 확장까지 대비하면 과설계). 실제 두 번째 변형이 나타날 때 추상화하는 것이 안전하다.

## LSP — 리스코프 치환 원칙

> 서브타입은 그 기반 타입을 **대체해도 프로그램의 정확성이 깨지지 않아야** 한다.

`B`가 `A`의 하위 타입이면, `A`를 기대하는 모든 자리에 `B`를 넣어도 놀라움이 없어야 한다. 위반의 전형은 **하위 타입이 상위의 계약을 약화**시키는 경우다.

```typescript
// ✕ 고전적 위반: 정사각형 is-a 직사각형?
class Rectangle { setWidth(w: number) {} setHeight(h: number) {} }
class Square extends Rectangle {
  setWidth(w: number) { /* height도 강제로 같게 */ }  // 상위의 기대(폭/높이 독립)를 깬다
}
// setWidth(5)+setHeight(4) 후 area가 20이길 기대한 코드가 Square에서 깨진다

// ○ is-a 대신 공통 계약으로 모델링
interface Shape { area(): number; }
class Rectangle implements Shape { /* ... */ area() { /* ... */ return 0; } }
class Square implements Shape { /* ... */ area() { /* ... */ return 0; } }
```

- 하위 타입이 상위 메서드에서 **예외를 더 던지거나, 사전조건을 강화하거나, 사후조건을 약화**하면 LSP 위반이다.
- "throw new Error('not supported')"로 상속받은 메서드를 무력화하는 것도 위반 신호 → 인터페이스를 잘못 잡은 것. ISP로 이어진다.
- LSP는 **포트/어댑터의 신뢰성 근거**다. 여러 어댑터가 한 포트를 구현할 때, 코어는 어느 구현이 오든 동일하게 동작한다고 믿을 수 있어야 한다.

## ISP — 인터페이스 분리 원칙

> 클라이언트는 **자신이 쓰지 않는 메서드에 의존하도록 강요받지 않아야** 한다.

거대한 인터페이스는 그것을 구현하는 쪽에 불필요한 부담(빈 구현, `not supported` 예외)을 지운다. **역할별로 작게 쪼갠다.**

```typescript
// ✕ 뚱뚱한 인터페이스 — 읽기만 필요한 클라이언트도 쓰기·삭제에 묶인다
interface OrderStore {
  save(o: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
  delete(id: OrderId): Promise<void>;
  exportCsv(): Promise<string>;
}

// ○ 역할별 분리 — 각 유스케이스는 필요한 계약에만 의존
interface OrderReader { findById(id: OrderId): Promise<Order | null>; }
interface OrderWriter { save(o: Order): Promise<void>; }
// 조회 유스케이스는 OrderReader에만 의존 → 테스트 목도 작아진다
```

- 포트를 **소비자 관점**에서 정의한다("이 유스케이스가 필요로 하는 최소 계약은?"). 이는 헥사고날의 outbound 포트 설계 원칙과 같다.
- 인터페이스가 커지면 목/스텁도 커지고, LSP 위반(빈 구현) 유혹도 커진다.

## DIP — 의존성 역전 원칙

> 고수준 모듈은 저수준 모듈에 의존하면 안 된다. **둘 다 추상에 의존**해야 한다. 추상은 세부에 의존하지 않고, 세부가 추상에 의존한다.

DIP는 클린 아키텍처의 심장이다. 유스케이스(고수준)가 DB(저수준)를 직접 알지 않고, **양쪽이 유스케이스 쪽이 소유한 인터페이스에 의존**하게 만들어 소스 의존성 방향을 뒤집는다.

```typescript
// 고수준(애플리케이션)이 추상(포트)을 소유하고 그것에만 의존
export interface NotificationPort { notify(userId: UserId, msg: string): Promise<void>; }

export class ApproveOrder {                       // 고수준 정책
  constructor(private readonly notifier: NotificationPort) {}  // 추상에 의존
}

// 저수준(인프라)이 추상을 향해 의존 — 방향이 역전됨
export class SlackNotification implements NotificationPort { /* Slack SDK */ }
export class EmailNotification implements NotificationPort { /* SMTP */ }
```

**의존성 방향과 제어 흐름은 반대다.** 런타임에는 유스케이스 → Slack으로 호출이 흐르지만, 소스 코드에서는 Slack이 유스케이스의 인터페이스에 의존한다. 이 역전이 "프레임워크·DB를 세부사항으로 밀어내기"를 가능하게 한다.

NestJS에서 DIP를 실현하는 DI 토큰·`@Inject` 배선은 → [nestjs-application.md](nestjs-application.md).

## SOLID와 클린 아키텍처의 연결

| 원칙 | 클린 아키텍처에서의 역할 |
|------|--------------------------|
| **OCP** | 어댑터를 플러그인처럼 추가 — 새 전송/저장소를 기존 코어 수정 없이 |
| **LSP** | 한 포트의 여러 어댑터가 상호 치환 가능하다는 보장 |
| **ISP** | 포트를 소비자 관점의 작은 계약으로 — outbound 포트 설계 원칙 |
| **DIP** | 의존성 규칙 그 자체 — 세부가 정책에 의존하게 방향 역전 |

> 이 네 원칙은 따로 노는 규칙이 아니라 **"세부사항으로부터 비즈니스 규칙을 지킨다"** 는 하나의 목표를 각도만 달리해 표현한 것이다. 규칙을 위한 규칙으로 오남용하지 말고, 변경을 흡수하려는 **목적**에 비추어 적용한다.
