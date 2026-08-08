# NestJS로 클린 아키텍처 구현

NestJS의 DI 컨테이너는 클린 아키텍처의 의존성 역전을 자연스럽게 실현한다. 다만 NestJS의 데코레이터·모듈이 **안쪽 계층으로 새어들지 않도록** 배선하는 규율이 필요하다. 이 문서는 폴더 구조, DI 토큰, 리포지토리 포트, 매퍼, 모듈 와이어링을 다룬다.

> 물리적 모듈 분할·모노레포 배치는 nestjs-monorepo, DB 연결·마이그레이션은 nestjs-database 스킬 참조. 여기서는 **계층 경계와 의존성 방향**에 집중한다.

## 목차
- [폴더 구조](#폴더-구조)
- [도메인: 프레임워크 zero](#도메인-프레임워크-zero)
- [포트를 DI 토큰으로 주입](#포트를-di-토큰으로-주입)
- [리포지토리 어댑터와 매퍼](#리포지토리-어댑터와-매퍼)
- [얇은 컨트롤러](#얇은-컨트롤러)
- [모듈 와이어링](#모듈-와이어링)
- [NestJS 특유의 함정](#nestjs-특유의-함정)

## 폴더 구조

기능(모듈) 단위로 계층을 접는 배치가 NestJS와 잘 맞는다.

```text
src/orders/
├── domain/                         # Entities — @nestjs import 금지
│   ├── order.ts
│   ├── order-id.ts
│   └── order.repository.ts         # 포트(인터페이스)
├── application/                    # Use Cases
│   ├── place-order.usecase.ts
│   └── dto/place-order.command.ts
├── adapters/                       # Interface Adapters
│   ├── order.controller.ts
│   ├── order-typeorm.repository.ts # 포트 구현
│   ├── order.orm-entity.ts         # @Entity
│   └── order.mapper.ts
└── orders.module.ts                # 와이어링(Frameworks & Drivers)
```

## 도메인: 프레임워크 zero

도메인 클래스는 순수 TypeScript다. `@Injectable`, `@Entity`, `class-validator` 데코레이터를 달지 않는다 — 이들이 붙는 순간 도메인이 프레임워크에 의존하게 된다.

```typescript
// domain/order.ts — import 문에 @nestjs/*, typeorm 이 없어야 한다
export class Order {
  private constructor(readonly id: OrderId, private status: OrderStatus) {}
  static create(): Order { return new Order(OrderId.next(), 'PENDING'); }
  markPaid(): void {
    if (this.status !== 'PENDING') throw new IllegalTransitionError();
    this.status = 'PAID';
  }
}

// domain/order.repository.ts — 포트(계약)를 도메인 안쪽에 둔다
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: OrderId): Promise<Order | null>;
}
```

## 포트를 DI 토큰으로 주입

인터페이스는 런타임에 존재하지 않으므로, NestJS DI에 **주입 토큰**이 필요하다. `Symbol`이나 문자열 토큰을 쓰고 `@Inject`로 연결한다.

```typescript
// domain/order.repository.ts
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

// application/place-order.usecase.ts
@Injectable()
export class PlaceOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)                 // 추상(포트)에 의존
    private readonly orders: OrderRepository,
  ) {}
  async execute(cmd: PlaceOrderCommand): Promise<OrderId> {
    const order = Order.create();
    order.markPaid();
    await this.orders.save(order);
    return order.id;
  }
}
```

> 유스케이스에는 `@Injectable`을 허용한다(애플리케이션 계층은 프레임워크와 맞닿는 배선 지점). 하지만 **도메인 엔티티에는 절대 붙이지 않는다.** 순수성을 지키려면 유스케이스도 순수 클래스로 두고 팩토리 provider로 등록하는 방법도 있으나, 실용적으로는 유스케이스까지가 `@Injectable` 허용선이다.

## 리포지토리 어댑터와 매퍼

어댑터가 포트를 구현하고, 도메인 ↔ ORM 변환을 매퍼로 격리한다.

```typescript
// adapters/order.orm-entity.ts — 영속성 스키마 (도메인과 분리)
@Entity('orders')
export class OrderOrm {
  @PrimaryColumn() id: string;
  @Column() status: string;
}

// adapters/order.mapper.ts
export class OrderMapper {
  static toDomain(row: OrderOrm): Order { /* 재구성 */ return Order.create(); }
  static toOrm(order: Order): OrderOrm { /* ... */ return new OrderOrm(); }
}

// adapters/order-typeorm.repository.ts — 포트 구현
@Injectable()
export class OrderTypeOrmRepository implements OrderRepository {
  constructor(@InjectRepository(OrderOrm) private readonly repo: Repository<OrderOrm>) {}
  async save(order: Order): Promise<void> {
    await this.repo.save(OrderMapper.toOrm(order));   // 도메인 → ORM
  }
  async findById(id: OrderId): Promise<Order | null> {
    const row = await this.repo.findOneBy({ id: id.value });
    return row ? OrderMapper.toDomain(row) : null;    // ORM → 도메인
  }
}
```

## 얇은 컨트롤러

컨트롤러는 어댑터 계층 — HTTP를 Command로 번역하고 유스케이스를 호출할 뿐, 비즈니스 로직을 담지 않는다(프로젝트 규칙 "Controller는 thin"과 일치).

```typescript
@Controller('orders')
export class OrderController {
  constructor(private readonly placeOrder: PlaceOrderUseCase) {}

  @Post()
  async create(@Body() dto: CreateOrderDto): Promise<OrderResponse> {
    const id = await this.placeOrder.execute(dto.toCommand()); // 번역 → 위임
    return { orderId: id.value };                              // 도메인 → 응답 DTO
  }
}
```

- 입력 검증(`class-validator`)은 **DTO에서** 한다(nestjs-validation 참조). 도메인 불변식과는 별개 — DTO 검증은 "형식", 도메인 검증은 "규칙".
- 컨트롤러가 도메인 객체를 직접 반환하지 않는다. 항상 응답 DTO로 번역.

## 모듈 와이어링

모듈에서 **토큰 ↔ 구현**을 연결한다. 이 파일이 "어느 어댑터를 꽂을지" 결정하는 유일한 지점이다.

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([OrderOrm])],
  controllers: [OrderController],
  providers: [
    PlaceOrderUseCase,
    { provide: ORDER_REPOSITORY, useClass: OrderTypeOrmRepository }, // 포트 → 어댑터
  ],
})
export class OrdersModule {}
```

어댑터 교체는 이 한 줄만 바꾸면 된다: `useClass: OrderPrismaRepository`. 테스트 모듈에서는 `useClass: InMemoryOrderRepository`로 갈아끼워 DB 없이 유스케이스를 검증한다([hexagonal-ports-adapters.md](hexagonal-ports-adapters.md)의 인메모리 어댑터).

## NestJS 특유의 함정

- **도메인에 `@Injectable`/`@Entity` 침투** — 가장 흔한 위반. 도메인은 순수하게, 데코레이터는 어댑터/유스케이스 계층에만.
- **인터페이스를 그냥 주입하려 함** — TS 인터페이스는 런타임에 사라진다. 반드시 토큰(`Symbol`/문자열) + `@Inject`.
- **TypeORM 엔티티를 도메인으로 재사용** — 스키마·규칙·표현이 한 클래스에 결합. 매퍼로 분리.
- **유스케이스가 `Repository<T>`(TypeORM)를 직접 주입** — 인프라가 애플리케이션으로 새어듬. 포트 인터페이스를 거친다.
- **모듈 경계 = 아키텍처 경계로 착각** — NestJS 모듈은 물리적 배선 단위이지 의존성 규칙의 계층이 아니다. 계층 방향은 import로 지키고, 자동 강제는 eslint-plugin-boundaries/dependency-cruiser로(eslint 스킬 참조).
