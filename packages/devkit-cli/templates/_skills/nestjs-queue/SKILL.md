---
name: nestjs-queue
description: "NestJS 큐·백그라운드 작업 패턴. @nestjs/bullmq(BullMQ+Redis) Producer/Consumer, 잡 옵션(재시도·backoff·delay), 동시성, 실패 처리, @nestjs/schedule(cron·interval) 반복 작업.\nAPPLIES: NestJS에서 BullMQ 잡·워커·재시도·`@nestjs/schedule` 반복 작업을 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"큐\", \"BullMQ\", \"Bull\", \"백그라운드 작업\", \"비동기 작업 처리\", \"잡 큐\", \"워커\", \"스케줄러\", \"cron\", \"예약 작업\", \"주기적 작업\", NestJS에서 비동기/예약 작업 구현 시.\nSKIP: Redis 캐싱은 nestjs-caching. 배포 시 워커 프로세스 구성은 nestjs-deployment. DB 트랜잭션/마이그레이션은 nestjs-database."
version: 1.0.0
---

# NestJS 큐 & 백그라운드 작업 (Queue)

> 참조:
> - [references/bullmq.md](references/bullmq.md) - @nestjs/bullmq Producer/Consumer 전체 예시, 잡 옵션·재시도·backoff, 동시성·rate limit, 이벤트·진행률, 실패·DLQ, 멱등성 **CRITICAL**
> - [references/scheduler.md](references/scheduler.md) - @nestjs/schedule cron·interval·timeout, CronExpression, SchedulerRegistry 동적 제어, 큐와 조합

## 핵심: 왜 큐인가

HTTP 요청 핸들러는 **빠르게 응답을 돌려주고 끝나야** 한다. 그런데 이미지 변환, 이메일 발송, 외부 API 대량 호출, 리포트 생성처럼 **오래 걸리거나 실패할 수 있는 작업**을 요청 흐름 안에서 동기로 처리하면 응답이 늦어지고, 실패 시 사용자 요청 전체가 무너진다.

> **해법: 무거운 작업은 큐에 잡(job)으로 넣고 즉시 응답한다. 별도 워커가 큐를 소비하며 재시도·동시성·백오프를 책임진다.**

- **Producer**(생산자): 요청 핸들러/서비스에서 `queue.add()`로 잡을 밀어넣고 곧장 반환.
- **Consumer**(소비자/워커): 큐에서 잡을 꺼내 실제 작업을 수행. 실패하면 정책에 따라 재시도.
- **저장소**: BullMQ는 **Redis**에 잡 상태(대기·활성·완료·실패)를 보관한다. 프로세스가 죽어도 잡은 Redis에 남아 유실되지 않는다.

반복(예약) 작업은 성격이 다르다. "매일 03시 정산"처럼 **시간 트리거**가 필요하면 @nestjs/schedule의 cron을 쓰고, 그 안에서 실제 무거운 처리는 다시 큐로 위임한다. 상세는 scheduler 참조.

## 설치와 Redis 연결

```bash
pnpm add @nestjs/bullmq bullmq
```

```typescript
// app.module.ts — 전역 Redis 연결 1회 등록
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 }, // 환경변수는 nestjs-config 참조
    }),
    BullModule.registerQueue({ name: 'email' }),      // 큐 등록(모듈마다 반복 가능)
  ],
})
export class AppModule {}
```

- `forRoot`는 **연결만** 잡는다(앱에 1회). 실제 큐는 `registerQueue({ name })`로 등록하며, 이름이 Producer/Consumer를 잇는 키다.
- 큐가 여러 모듈에 흩어지면 각 기능 모듈에서 `registerQueue`를 호출하되 연결(`forRoot`)은 루트에서 한 번만. **Redis 연결을 잡마다/모듈마다 새로 만들지 않는다.**

## Producer: 잡 넣기

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SignupService {
  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  async register(dto: RegisterDto): Promise<void> {
    const user = await this.users.create(dto);
    // ✕ 나쁨: 요청 핸들러에서 동기로 발송 — 느리고, 실패 시 회원가입까지 롤백
    // await this.mailer.send(user.email, welcomeTemplate);

    // ○ 좋음: 큐에 위임하고 즉시 반환
    await this.emailQueue.add(
      'welcome',                              // 잡 이름(타입 분기 키)
      { userId: user.id, email: user.email }, // 직렬화 가능한 데이터만
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }
}
```

- `add(name, data, opts)` — `data`는 **JSON 직렬화 가능**해야 한다(클래스 인스턴스·함수·Date 원본 X). 엔티티 전체가 아니라 **ID만** 넣고 워커가 다시 조회하는 편이 안전하다.
- 옵션(`attempts`·`backoff`·`delay`·`priority`·`removeOnComplete`·`repeat`) 전체는 bullmq 참조.

## Consumer: 잡 처리

```typescript
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('email', { concurrency: 5 })          // 동시 5개까지 병렬 처리
export class EmailConsumer extends WorkerHost {
  async process(job: Job): Promise<void> {
    switch (job.name) {                          // 잡 이름으로 타입 분기
      case 'welcome':
        await this.mailer.send(job.data.email, welcomeTemplate);
        return;
      case 'digest':
        await this.sendDigest(job.data.userId);
        return;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(`job ${job.id} failed: ${err.message}`); // ✕ 실패를 무시하지 말 것
  }
}
```

- `@Processor(name)` + `WorkerHost.process(job)`가 최신 방식이다. 구버전의 `@Process()` 메서드 데코레이터는 사용하지 않는다.
- 하나의 프로세스가 여러 잡을 병렬 처리하려면 `concurrency`를, 외부 API rate limit을 지키려면 `limiter`를 설정한다(bullmq 참조).
- Consumer는 반드시 **providers에 등록**해야 워커가 뜬다.

## 멱등성: 큐의 필수 규율

BullMQ는 **at-least-once**를 보장한다 — 재시도·중복 전달로 **같은 잡이 두 번 이상 실행될 수 있다.** 따라서 처리 로직은 멱등(idempotent)해야 한다.

```typescript
// ✕ 나쁨: 재시도 시 결제/발송이 중복된다
async process(job: Job): Promise<void> {
  await this.payments.charge(job.data.orderId, job.data.amount);
}

// ○ 좋음: 멱등키로 중복 실행을 흡수한다
async process(job: Job): Promise<void> {
  const key = `charge:${job.data.orderId}`;
  if (await this.processed.has(key)) return;     // 이미 처리됨 → 스킵
  await this.payments.charge(job.data.orderId, job.data.amount);
  await this.processed.set(key);
}
```

멱등키(주문 ID·요청 ID)를 두거나, 잡 자체에 고정 `jobId`를 부여해 큐 진입 단계에서 중복을 막는다(bullmq 참조).

## 반복 작업: @nestjs/schedule

```bash
pnpm add @nestjs/schedule
```

```typescript
import { Cron, CronExpression, Interval } from '@nestjs/schedule';

@Injectable()
export class ReportTasks {
  @Cron(CronExpression.EVERY_DAY_AT_3AM)   // 시각 트리거
  async nightlyReport(): Promise<void> {
    // ○ cron은 트리거만 — 무거운 처리는 큐로 위임
    await this.reportQueue.add('daily', { date: today() });
  }

  @Interval(30_000)                        // 30초마다
  heartbeat(): void { /* 가벼운 폴링 */ }
}
```

`ScheduleModule.forRoot()` 등록, `@Cron`/`@Interval`/`@Timeout`, `CronExpression`, 그리고 런타임에 잡을 추가·삭제하는 `SchedulerRegistry`는 scheduler 참조.

## 큐 vs 스케줄러 — 무엇을 쓸까

| 상황 | 선택 | 이유 |
|------|------|------|
| 요청 중 발생한 무거운 단발 작업 | BullMQ 큐 | 재시도·동시성·유실 방지 필요 |
| "매일/매시" 시간 트리거 | @nestjs/schedule cron | 시각 기반 실행 |
| 시간 트리거 + 무거운 처리 | schedule → 큐 | cron이 트리거, 큐가 실행 책임 |
| N초 후 1회 실행 | 큐 `delay` 옵션 | Redis에 예약, 프로세스 재시작에도 유지 |
| 짧고 실패해도 되는 인메모리 타이머 | `@Interval`/`@Timeout` | 상태 보존 불필요 |

> schedule의 cron은 **프로세스 메모리** 타이머다. 앱 인스턴스가 여러 개면 **모든 인스턴스에서 동시에 발화**한다. 다중 인스턴스 환경의 예약 작업은 잡을 큐로 위임하고 `jobId`로 중복을 막거나, 리더 선출/분산 락으로 단일 실행을 보장한다(scheduler 참조).

## 흔한 실수

| 실수 | 문제 | 올바른 방법 |
|------|------|-------------|
| 무거운 작업을 요청 핸들러에서 동기 처리 | 응답 지연, 실패가 요청 전체로 전파 | `queue.add()`로 위임 후 즉시 응답 |
| 멱등성 없는 Consumer | 재시도·중복 전달 시 결제/발송 중복 | 멱등키·고정 jobId로 중복 실행 흡수 |
| 잡 데이터에 엔티티/거대 객체 통째로 | 직렬화 실패, Redis 비대 | ID만 넣고 워커가 재조회 |
| `attempts` 없이 등록 | 일시 오류에도 잡이 즉시 유실 | `attempts` + `backoff`로 재시도 |
| `failed` 이벤트 무시 | 실패가 조용히 사라짐 | `@OnWorkerEvent('failed')` 로깅/알림, DLQ 보존 |
| Redis 연결을 큐마다 새로 생성 | 커넥션 폭증 | `forRoot` 연결 재사용, `registerQueue`만 반복 |
| Consumer를 providers에 미등록 | 워커가 뜨지 않아 잡이 쌓이기만 | Consumer를 providers에 등록 |
| 다중 인스턴스에서 cron 중복 발화 | 정산/집계 N회 실행 | 큐 위임 + jobId, 또는 분산 락 |
