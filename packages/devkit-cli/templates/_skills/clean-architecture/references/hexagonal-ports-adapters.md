# 포트 & 어댑터 (헥사고날 아키텍처)

헥사고날 아키텍처(Alistair Cockburn)는 클린 아키텍처와 같은 의존성 규칙을 **애플리케이션 코어를 중심에 두고, 바깥과의 모든 소통을 포트/어댑터로** 표현한다. "안/밖" 대신 "**애플리케이션이 무엇을 제공하고(inbound), 무엇을 요구하는가(outbound)**"로 보는 관점이 유용하다.

## 목차
- [핵심 그림](#핵심-그림)
- [포트: 애플리케이션의 계약](#포트-애플리케이션의-계약)
- [Inbound(주도) 포트와 어댑터](#inbound주도-포트와-어댑터)
- [Outbound(피주도) 포트와 어댑터](#outbound피주도-포트와-어댑터)
- [어댑터 교체의 실익](#어댑터-교체의-실익)
- [테스트에서의 힘](#테스트에서의-힘)

## 핵심 그림

```
   주도(driving) 측                애플리케이션 코어              피주도(driven) 측
   외부가 앱을 호출               (유스케이스 + 도메인)          앱이 외부를 호출

   HTTP Controller ─┐                                    ┌─▶ TypeORM Repository
   GraphQL Resolver ─┼─▶ [inbound port] ── 코어 ── [outbound port] ─┼─▶ HTTP PaymentGateway
   CLI / Consumer  ─┘                                    └─▶ 인메모리(테스트)

              어댑터        포트(인터페이스)      포트(인터페이스)     어댑터
```

- **코어는 포트(인터페이스)만 안다.** 어느 쪽에도 구체 기술이 없다.
- 왼쪽 어댑터는 코어를 **호출**하고, 오른쪽 어댑터는 코어에 의해 **호출된다**. 양쪽 모두 소스 의존성은 코어(포트)를 향한다.

## 포트: 애플리케이션의 계약

포트는 애플리케이션 경계에 있는 **인터페이스**다. 두 종류로 나뉜다.

| 종류 | 의미 | 누가 정의 | 누가 구현 |
|------|------|-----------|-----------|
| **Inbound(주도) 포트** | 앱이 외부에 제공하는 기능 | 애플리케이션 | 애플리케이션(유스케이스) |
| **Outbound(피주도) 포트** | 앱이 외부에 요구하는 기능 | 애플리케이션 | 어댑터(인프라) |

핵심: **양쪽 포트 모두 애플리케이션이 소유한다.** 앱이 "나는 이런 걸 제공하고, 이런 걸 필요로 한다"고 선언하고, 바깥 세계가 거기에 맞춘다.

## Inbound(주도) 포트와 어댑터

Inbound 포트는 유스케이스의 진입 계약이다. 여러 전송 방식이 같은 유스케이스를 공유할 수 있다.

```typescript
// inbound 포트 — 애플리케이션이 제공하는 것
export interface PlaceOrderUseCase {
  execute(cmd: PlaceOrderCommand): Promise<OrderId>;
}

// 유스케이스가 포트를 구현
export class PlaceOrder implements PlaceOrderUseCase { /* ... */ }

// 어댑터 1: HTTP — 요청을 Command로 번역해 포트를 호출
@Controller('orders')
class OrderController {
  constructor(private readonly placeOrder: PlaceOrderUseCase) {}
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.placeOrder.execute(dto.toCommand());
  }
}

// 어댑터 2: 메시지 컨슈머 — 같은 유스케이스, 다른 전송
class OrderConsumer {
  constructor(private readonly placeOrder: PlaceOrderUseCase) {}
  onMessage(msg: QueueMessage) { return this.placeOrder.execute(msg.toCommand()); }
}
```

## Outbound(피주도) 포트와 어댑터

Outbound 포트는 앱이 외부 세계에 요구하는 계약이다. 애플리케이션 안쪽에 정의하고, 인프라 어댑터가 구현한다(DIP).

```typescript
// outbound 포트 — 애플리케이션 안쪽에서 선언
export interface PaymentGateway {
  charge(amount: Money, token: string): Promise<PaymentReceipt>;
}

// 어댑터: 실제 결제사 SDK를 감싼다 (인프라)
export class StripePaymentGateway implements PaymentGateway {
  async charge(amount: Money, token: string): Promise<PaymentReceipt> {
    const res = await this.stripe.charges.create({ amount: amount.cents, source: token });
    return PaymentReceipt.from(res);   // 외부 형태 → 도메인 형태로 번역
  }
}
```

어댑터의 또 다른 책임: **외부 데이터 형태를 도메인 형태로 번역**한다. Stripe 응답 JSON이 도메인 안으로 그대로 새어들지 않게 어댑터 경계에서 매핑한다.

## 어댑터 교체의 실익

포트로 분리하면 어댑터는 **끼웠다 뺐다** 할 수 있는 플러그인이 된다.

- 전송 교체: 같은 유스케이스를 REST → GraphQL → gRPC로 노출.
- 저장소 교체: `TypeOrmOrderRepository` → `PrismaOrderRepository`로 코어 변경 없이 교체.
- 외부 서비스 교체: `StripePaymentGateway` → `TossPaymentGateway`.
- **코어는 한 줄도 바뀌지 않는다.** 바뀌는 건 바깥 어댑터와 DI 와이어링뿐.

## 테스트에서의 힘

헥사고날의 가장 즉각적인 보상은 **테스트 용이성**이다. Outbound 포트를 인메모리/페이크 어댑터로 대체하면, 유스케이스를 DB·네트워크 없이 순수하게 테스트할 수 있다.

```typescript
// 테스트용 인메모리 어댑터 — DB 없이 유스케이스 검증
class InMemoryOrderRepository implements OrderRepository {
  private store = new Map<string, Order>();
  async save(o: Order) { this.store.set(o.id.value, o); }
  async findById(id: OrderId) { return this.store.get(id.value) ?? null; }
}

// 빠르고 결정적인 유스케이스 테스트
const repo = new InMemoryOrderRepository();
const placeOrder = new PlaceOrder(repo, new FakePaymentGateway());
const id = await placeOrder.execute(command);
expect(await repo.findById(id)).not.toBeNull();
```

> 이 test-first 흐름(포트를 페이크로 두고 유스케이스부터 빨간 테스트로 모는 것)은 tdd 스킬의 백엔드 유닛 test-first와 자연스럽게 맞물린다. 실제 DB를 쓰는 통합 테스트는 어댑터 계층에서 별도로 검증한다.
