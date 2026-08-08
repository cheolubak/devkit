---
name: clean-architecture
description: "클린 아키텍처(Clean Architecture) 가이드. 의존성 규칙(안쪽으로만), 4계층 동심원(엔티티·유스케이스·인터페이스 어댑터·프레임워크), 포트&어댑터(헥사고날), 경계 넘기(DTO·매퍼), SOLID 중 OCP·LSP·ISP·DIP. NestJS 실전 적용.\nAPPLIES: 백엔드/도메인 코드에서 계층 간 의존 방향, 유스케이스 경계, 인프라 분리를 정하거나 무너진 경계를 되돌릴 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"클린 아키텍처\", \"clean architecture\", \"헥사고날\", \"hexagonal\", \"포트 어댑터\", \"ports and adapters\", \"의존성 규칙\", \"의존성 역전\", \"DIP\", \"계층 분리\", \"레이어드 아키텍처\", \"유스케이스\", \"use case\", \"도메인 계층 분리\", \"비즈니스 로직 분리\", \"인프라 분리\", \"프레임워크 독립\", \"OCP\", \"개방 폐쇄\", 백엔드/도메인 코드의 계층·의존성 방향·경계를 설계할 때.\nSKIP: 프론트엔드 폴더/슬라이스(app·pages·widgets·features·entities·shared) 배치는 fsd-architecture. NestJS 모듈·모노레포 물리 배치는 nestjs-monorepo. 코드 레벨 네이밍·함수·SRP·DRY는 clean-code. 타입 설계는 typescript-patterns."
version: 1.0.0
---

# 클린 아키텍처 (Clean Architecture)

> 참조:
> - [references/dependency-rule.md](references/dependency-rule.md) - 의존성 규칙, 4계층 동심원, 경계 넘기(DTO·매퍼·DIP로 방향 역전) **CRITICAL**
> - [references/hexagonal-ports-adapters.md](references/hexagonal-ports-adapters.md) - 포트&어댑터(헥사고날): inbound/outbound 포트, 어댑터 교체
> - [references/solid.md](references/solid.md) - OCP·LSP·ISP·DIP 상세 (SRP·DRY는 clean-code 소관)
> - [references/nestjs-application.md](references/nestjs-application.md) - NestJS로 클린 아키텍처 구현: 폴더 구조, DI 토큰, 리포지토리 포트, 매퍼

## 핵심: 의존성 규칙

클린 아키텍처의 전부는 한 문장으로 압축된다:

> **소스 코드 의존성은 항상 안쪽(고수준 정책)을 향한다. 안쪽은 바깥쪽(저수준 세부)을 절대 알지 못한다.**

바깥은 DB·웹·UI·프레임워크 같은 **변덕스러운 세부사항**이고, 안쪽은 **비즈니스 규칙**이다. 규칙이 세부사항에 의존하면, DB를 바꾸거나 프레임워크를 올릴 때 비즈니스 로직이 함께 흔들린다. 방향을 뒤집어 **세부사항이 규칙에 의존하게** 만들면, 비즈니스 로직은 프레임워크·DB·전송 방식과 무관하게 독립적으로 진화하고 테스트된다.

이 스킬은 **백엔드/도메인 코드의 계층과 의존성 방향**을 다룬다. 프론트엔드 폴더 구조는 fsd-architecture, 코드 자체의 결(이름·함수·중복)은 clean-code로 간다.

## 4계층 동심원

```
        ┌─────────────────────────────────────────┐
        │  Frameworks & Drivers (가장 바깥)         │  DB, 웹 프레임워크, UI, 외부 API
        │   ┌─────────────────────────────────┐    │
        │   │  Interface Adapters              │    │  Controller, Presenter, Repository 구현, Mapper
        │   │   ┌─────────────────────────┐    │    │
        │   │   │  Application (Use Cases) │    │    │  유스케이스, 애플리케이션 서비스, 포트 정의
        │   │   │   ┌─────────────────┐    │    │    │
        │   │   │   │  Entities        │    │    │    │  도메인 모델, 엔터프라이즈 규칙
        │   │   │   └─────────────────┘    │    │    │
        │   │   └─────────────────────────┘    │    │
        │   └─────────────────────────────────┘    │
        └─────────────────────────────────────────┘
                의존성 방향:  바깥 ───────▶ 안쪽
```

| 계층 | 담는 것 | 아는 것 / 모르는 것 |
|------|---------|---------------------|
| **Entities** (도메인) | 핵심 비즈니스 개념·불변식·규칙(`Order`, `Money`) | 아무것도 몰라야 한다. 프레임워크·DB·유스케이스 모름 |
| **Application** (유스케이스) | 앱 고유 시나리오(`PlaceOrder`), 오케스트레이션, **포트 인터페이스** | 엔티티는 알지만, DB·웹은 모름(포트로 추상화) |
| **Interface Adapters** | Controller, Repository **구현**, Presenter, Mapper | 유스케이스·엔티티를 알고, 바깥 세부와 안쪽을 **번역** |
| **Frameworks & Drivers** | NestJS, TypeORM, Express, 외부 SDK | 세부사항. 안쪽은 이들을 몰라야 함 |

- **안쪽 계층은 바깥 계층의 이름을 import하지 않는다.** 도메인 코드에 `@nestjs/*`, `typeorm`, `axios` import가 있으면 규칙 위반이다.
- 계층 수는 4개가 법이 아니다. 핵심은 **동심원과 의존성 방향**이지 개수가 아니다. 작은 서비스는 도메인/애플리케이션/인프라 3계층으로 시작해도 된다.

각 계층 책임과 경계 넘기(DTO·매퍼) 상세 → [references/dependency-rule.md](references/dependency-rule.md).

## 의존성 역전으로 방향 뒤집기 (DIP)

문제: 유스케이스(`PlaceOrder`)는 주문을 저장해야 하지만, **DB를 알면 안 된다.** 그런데 실행 흐름은 유스케이스 → DB로 흐른다. 어떻게 소스 의존성을 반대로(DB → 유스케이스) 만들까?

**해법: 유스케이스가 필요로 하는 인터페이스(포트)를 안쪽에 선언하고, 바깥의 구현이 그것을 만족시킨다.**

```typescript
// application/ (안쪽) — 유스케이스가 자기가 원하는 계약을 소유한다
export interface OrderRepository {          // 포트 (인터페이스)
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
}

export class PlaceOrder {
  constructor(private readonly orders: OrderRepository) {} // 추상에만 의존
  async execute(cmd: PlaceOrderCommand): Promise<OrderId> {
    const order = Order.create(cmd.items);   // 엔티티 규칙
    await this.orders.save(order);            // 포트 호출 — TypeORM을 모른다
    return order.id;
  }
}

// infrastructure/ (바깥) — 구현이 안쪽 인터페이스를 향해 의존한다
export class TypeOrmOrderRepository implements OrderRepository {
  async save(order: Order): Promise<void> { /* TypeORM 세부 */ }
  async findById(id: OrderId): Promise<Order | null> { /* ... */ }
}
```

런타임 흐름은 `PlaceOrder → TypeOrmOrderRepository`지만, **소스 의존성은 `TypeOrmOrderRepository → OrderRepository`(안쪽)** 로 뒤집혔다. 이것이 의존성 역전(DIP)이며 클린 아키텍처를 가능케 하는 핵심 장치다. DIP를 포함한 SOLID(OCP·LSP·ISP·DIP)는 → [references/solid.md](references/solid.md).

## 포트 & 어댑터 (헥사고날)

클린 아키텍처와 사실상 같은 아이디어를 "안/밖"이 아니라 **"주도(driving) 측 / 피주도(driven) 측"** 으로 표현한 것이 헥사고날 아키텍처다.

- **Inbound(주도) 포트**: 애플리케이션이 외부에 제공하는 진입점 계약. 어댑터 = Controller, CLI, 메시지 컨슈머.
- **Outbound(피주도) 포트**: 애플리케이션이 외부에 요구하는 계약(위 `OrderRepository`). 어댑터 = DB·HTTP·큐 구현.

핵심 이득: **어댑터는 교체 가능**하다. 같은 유스케이스를 REST·GraphQL·gRPC로 노출하고, 저장소를 TypeORM·Prisma·인메모리(테스트용)로 갈아끼워도 애플리케이션 코어는 그대로다. 상세 → [references/hexagonal-ports-adapters.md](references/hexagonal-ports-adapters.md).

## 경계를 넘을 때는 번역한다

계층 경계를 넘는 데이터는 **그 계층에 맞는 형태**로 변환한다. 안쪽 모델을 바깥 형태(ORM 엔티티, HTTP JSON)로 그대로 흘리면 세부사항이 안쪽으로 새어 들어온다.

- 도메인 모델 ↔ ORM 엔티티: **매퍼**로 분리(도메인 `Order`는 `@Entity` 데코레이터를 몰라야 함).
- 유스케이스 입출력: 원시 요청 대신 **Command/DTO**로 받고, 결과는 **View/Response DTO**로 돌려준다.
- 규칙: **DTO는 바깥으로, 도메인 객체는 안쪽에만.** 컨트롤러가 도메인 객체를 직접 JSON으로 뱉지 않는다.

## 실용 판단: 언제 이 계층화를 적용하나

클린 아키텍처는 공짜가 아니다. 포트·매퍼·DTO는 **간접성 비용**을 만든다.

| 적용할 때 | 과할 때 |
|-----------|---------|
| 복잡한 도메인 규칙이 오래 진화한다 | CRUD가 거의 전부인 얇은 서비스 |
| 인프라(DB·외부 API)를 갈아끼울 가능성 | 프로토타입·수명 짧은 스크립트 |
| 도메인 로직을 프레임워크 없이 빠르게 테스트해야 함 | 도메인 규칙이 거의 없는 게이트웨이 |

> 작게 시작해서 **도메인 복잡도가 커질 때 계층을 도입**한다. 처음부터 모든 CRUD에 4계층+매퍼를 강제하면 배보다 배꼽이 커진다. 핵심은 형식이 아니라 **"비즈니스 규칙을 세부사항으로부터 지킨다"** 는 목적이다.

NestJS에서의 구체적 폴더 배치·DI 토큰·모듈 와이어링 → [references/nestjs-application.md](references/nestjs-application.md).
