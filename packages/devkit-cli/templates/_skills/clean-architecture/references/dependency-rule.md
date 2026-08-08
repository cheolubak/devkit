# 의존성 규칙과 계층 상세

클린 아키텍처의 모든 규칙은 **의존성 규칙** 하나에서 파생된다. 이 문서는 각 계층의 책임과, 경계를 넘을 때의 번역(DTO·매퍼) 방법을 상세히 다룬다.

## 목차
- [의존성 규칙 재확인](#의존성-규칙-재확인)
- [Entities (도메인 계층)](#entities-도메인-계층)
- [Application (유스케이스 계층)](#application-유스케이스-계층)
- [Interface Adapters](#interface-adapters)
- [Frameworks & Drivers](#frameworks--drivers)
- [경계 넘기: DTO와 매퍼](#경계-넘기-dto와-매퍼)
- [폴더 구조 예시](#폴더-구조-예시)
- [흔한 위반](#흔한-위반)

## 의존성 규칙 재확인

> 소스 의존성은 안쪽으로만. 안쪽 원의 어떤 것도 바깥 원의 이름(클래스·함수·변수)을 언급하지 않는다.

**검사법:** 파일 맨 위 import 문을 본다. 도메인 파일이 `typeorm`, `@nestjs/common`, `express`, `axios` 같은 걸 import하면 위반이다. 안쪽으로 갈수록 import 목록은 순수 언어/표준 라이브러리에 가까워야 한다.

## Entities (도메인 계층)

**가장 안쪽. 앱이 여러 개여도 공유될 수 있는 기업 전역 비즈니스 규칙.**

- 담는 것: 도메인 모델(`Order`, `Customer`), 값 객체(`Money`, `Email`), 도메인 서비스, 불변식.
- 규칙: 어떤 프레임워크·DB·유스케이스도 몰라야 한다. 순수 TypeScript.
- 불변식은 **생성/변경 지점에서 강제**한다 — 잘못된 상태의 객체가 애초에 만들어질 수 없게.

```typescript
// domain/order.ts — 프레임워크 zero import
export class Order {
  private constructor(
    readonly id: OrderId,
    private readonly lines: OrderLine[],
    private status: OrderStatus,
  ) {}

  static create(lines: OrderLine[]): Order {
    if (lines.length === 0) throw new EmptyOrderError();   // 불변식
    return new Order(OrderId.next(), lines, 'PENDING');
  }

  markPaid(): void {
    if (this.status !== 'PENDING') throw new IllegalTransitionError();
    this.status = 'PAID';
  }

  total(): Money {
    return this.lines.reduce((sum, l) => sum.add(l.amount), Money.zero());
  }
}
```

## Application (유스케이스 계층)

**앱 고유의 시나리오. "이 애플리케이션이 무엇을 하는가"를 오케스트레이션한다.**

- 담는 것: 유스케이스/인터랙터(`PlaceOrder`, `CancelOrder`), 애플리케이션 서비스, **포트 인터페이스**(outbound), Command/Result DTO.
- 아는 것: 엔티티. 모르는 것: DB·웹·프레임워크(포트로 추상화).
- 한 유스케이스 = 한 사용자 의도. 엔티티에서 객체를 꺼내 규칙을 실행시키고 결과를 포트로 내보낸다. **비즈니스 규칙 자체는 엔티티에**, 유스케이스는 **흐름 조립**만.

```typescript
// application/place-order.ts
export class PlaceOrder {
  constructor(
    private readonly orders: OrderRepository,   // outbound 포트
    private readonly payments: PaymentGateway,  // outbound 포트
  ) {}

  async execute(cmd: PlaceOrderCommand): Promise<OrderId> {
    const order = Order.create(cmd.toLines());
    await this.payments.charge(order.total(), cmd.paymentToken);
    order.markPaid();
    await this.orders.save(order);
    return order.id;
  }
}
```

## Interface Adapters

**안쪽 모델과 바깥 세부 사이의 번역 계층.**

- 담는 것: Controller(HTTP → Command), Presenter(Result → 응답), Repository **구현**, Mapper(도메인 ↔ ORM).
- 컨트롤러는 **얇게**: 요청을 Command로 바꿔 유스케이스를 호출하고 결과를 응답 형태로 변환할 뿐, 비즈니스 로직을 담지 않는다(프로젝트 규칙의 "Controller는 thin"과 일치).

## Frameworks & Drivers

**가장 바깥. 세부사항.** NestJS, TypeORM, Express, Redis, 외부 SDK. 여기 코드는 안쪽을 향해 의존하며, 안쪽은 이들의 존재를 모른다. 이상적으로는 "플러그인"처럼 교체 가능해야 한다.

## 경계 넘기: DTO와 매퍼

경계를 넘는 데이터는 받는 계층의 언어로 번역한다. 번역을 생략하면 세부사항이 안쪽으로 샌다.

```typescript
// ✕ ORM 엔티티가 도메인이자 API 응답 — 세 관심사가 한 클래스에 결합
@Entity()
class Order { @Column() status: string; @Column() total: number; }
// TypeORM 스키마 변경, 도메인 규칙 변경, API 형태 변경이 모두 이 파일을 건드린다

// ○ 세 모델을 분리하고 매퍼로 잇는다
class Order { /* 도메인: 규칙, 데코레이터 없음 */ }
@Entity() class OrderOrm { /* 영속성 스키마 */ }
class OrderResponse { /* API 계약 */ }

class OrderMapper {
  static toDomain(row: OrderOrm): Order { /* ... */ }
  static toOrm(order: Order): OrderOrm { /* ... */ }
  static toResponse(order: Order): OrderResponse { /* ... */ }
}
```

**규칙 요약**
- 유스케이스 입력: **Command DTO**(원시 HTTP 바디가 아님).
- 유스케이스 출력: **Result/View DTO**(도메인 객체를 그대로 반환하지 않음).
- 영속성: 도메인 ↔ ORM은 매퍼로. 도메인 클래스에 `@Entity`/`@Column`을 달지 않는다.

## 폴더 구조 예시

```text
src/
├── domain/                 # Entities — 프레임워크 zero
│   ├── order.ts
│   ├── money.ts
│   └── order-repository.ts # 포트(인터페이스)를 도메인/애플리케이션 안쪽에 둔다
├── application/            # Use Cases
│   ├── place-order.ts
│   ├── cancel-order.ts
│   └── dto/place-order.command.ts
├── adapters/               # Interface Adapters
│   ├── http/order.controller.ts
│   ├── persistence/typeorm-order.repository.ts
│   └── persistence/order.mapper.ts
└── infrastructure/         # Frameworks & Drivers 설정·와이어링
    └── order.module.ts
```

> 포트 인터페이스(`OrderRepository`)를 어디 둘지: 도메인이 요구하는 저장 계약이면 `domain/`, 유스케이스 오케스트레이션에만 쓰이면 `application/`. 중요한 건 **구현(`adapters/`)이 인터페이스(`domain`/`application`)를 향해 의존**한다는 점.

## 흔한 위반

- **도메인에 프레임워크 import** — `@Entity`, `@Injectable`이 도메인 클래스에. → 매퍼로 분리.
- **유스케이스가 Request/Response 객체를 직접 다룸** — Express `req`/`res`가 유스케이스 시그니처에. → Command/Result DTO로.
- **빈약한 도메인 모델(Anemic Domain Model)** — 엔티티는 getter/setter뿐이고 모든 규칙이 서비스에. → 규칙을 데이터가 있는 엔티티로(기능 욕심, clean-code 참조).
- **리포지토리가 도메인이 아니라 ORM 엔티티를 반환** — 안쪽이 ORM 형태를 알게 됨. → 매퍼로 도메인 반환.
- **계층을 관통하는 순환/역방향 import** — eslint-plugin-boundaries나 dependency-cruiser로 방향을 자동 강제(설정 접근은 eslint 스킬 참조).
