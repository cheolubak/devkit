# @nestjs/bullmq: 큐 완전 예시

BullMQ는 Redis 기반의 잡 큐다. Producer가 잡을 넣고, Worker가 소비하며, Redis가 잡의 상태(waiting·active·completed·failed·delayed)를 보관한다. 이 문서는 Producer/Consumer 전체 구현, 잡 옵션, 재시도·backoff, 동시성·rate limit, 이벤트·진행률, 실패·DLQ, 멱등성을 다룬다.

> Redis 연결 자체·환경변수 관리는 nestjs-config, 배포 시 워커 프로세스 분리는 nestjs-deployment 참조. 여기서는 **큐 코드 패턴**에 집중한다.

## 목차
- [모듈 구성](#모듈-구성)
- [Producer 상세](#producer-상세)
- [Consumer 상세](#consumer-상세)
- [잡 옵션 전체](#잡-옵션-전체)
- [재시도와 backoff](#재시도와-backoff)
- [동시성과 rate limiting](#동시성과-rate-limiting)
- [이벤트와 진행률](#이벤트와-진행률)
- [실패 처리와 DLQ](#실패-처리와-dlq)
- [멱등성](#멱등성)
- [흔한 함정](#흔한-함정)

## 모듈 구성

```typescript
// app.module.ts — 연결은 루트에서 1회
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: process.env.REDIS_HOST, port: 6379 },
      defaultJobOptions: {                 // 모든 큐/잡의 기본 옵션
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,            // 완료 잡은 최근 1000개만 보존
        removeOnFail: false,               // 실패 잡은 보존(DLQ 역할)
      },
    }),
  ],
})
export class AppModule {}

// email.module.ts — 기능 모듈에서 큐 등록 + Consumer 제공
@Module({
  imports: [BullModule.registerQueue({ name: 'email' })],
  providers: [EmailConsumer, EmailService], // Consumer를 반드시 등록
  exports: [BullModule],                    // 다른 모듈이 이 큐에 넣으려면 export
})
export class EmailModule {}
```

- `forRoot`(연결)는 루트 1회, `registerQueue`(큐 등록)는 큐가 필요한 각 모듈에서. `forRootAsync`/`registerQueueAsync`로 ConfigService 주입도 가능(nestjs-config 참조).
- `defaultJobOptions`로 재시도·정리 정책을 전역 기본값으로 두면 Producer마다 반복하지 않아도 된다.

## Producer 상세

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';

@Injectable()
export class EmailService {
  constructor(@InjectQueue('email') private readonly queue: Queue) {}

  // 단건 추가
  async enqueueWelcome(userId: string, email: string): Promise<void> {
    await this.queue.add('welcome', { userId, email });
  }

  // 옵션과 함께
  async enqueueDigest(userId: string): Promise<void> {
    await this.queue.add(
      'digest',
      { userId },
      { delay: 60_000, priority: 5, jobId: `digest:${userId}` },
    );
  }

  // 대량 추가 — addBulk가 개별 add 반복보다 왕복이 적다
  async enqueueMany(userIds: string[]): Promise<void> {
    await this.queue.addBulk(
      userIds.map((userId) => ({ name: 'digest', data: { userId } })),
    );
  }
}
```

- `data`는 **JSON 직렬화 가능**해야 한다. Date는 ISO 문자열로, 엔티티는 ID로 축약한다.
- `Queue`는 `bullmq`에서, 데코레이터는 `@nestjs/bullmq`에서 import한다. 혼동 주의.

## Consumer 상세

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('email')
export class EmailConsumer extends WorkerHost {
  private readonly logger = new Logger(EmailConsumer.name);

  constructor(private readonly mailer: MailerService) {
    super();
  }

  async process(job: Job): Promise<{ sent: boolean }> {
    switch (job.name) {
      case 'welcome':
        await this.mailer.send(job.data.email, 'welcome');
        return { sent: true };            // 반환값은 completed 이벤트로 전달
      case 'digest':
        await this.sendDigest(job.data.userId);
        return { sent: true };
      default:
        throw new Error(`unknown job: ${job.name}`); // 알 수 없는 잡은 실패시킴
    }
  }
}
```

- `process`가 **throw하면 실패**로 기록되고 `attempts`에 따라 재시도된다. 정상 반환하면 완료.
- `process`가 반환한 값은 `@OnWorkerEvent('completed')`의 `job.returnvalue`로 접근 가능.
- Consumer는 하나의 워커다. 여러 큐를 처리하려면 큐마다 별도 `@Processor` 클래스를 만든다.

## 잡 옵션 전체

`queue.add(name, data, options)`의 주요 옵션:

| 옵션 | 의미 | 예시 |
|------|------|------|
| `attempts` | 총 시도 횟수(최초 1 + 재시도) | `attempts: 5` |
| `backoff` | 재시도 간 대기 전략 | `{ type: 'exponential', delay: 2000 }` |
| `delay` | 지정 ms 후 처리(예약) | `delay: 60_000` |
| `priority` | 우선순위(1이 가장 높음) | `priority: 1` |
| `removeOnComplete` | 완료 후 제거(true/개수) | `removeOnComplete: 1000` |
| `removeOnFail` | 실패 후 제거(false면 보존) | `removeOnFail: false` |
| `jobId` | 고정 잡 ID(중복 방지) | `jobId: 'charge:42'` |
| `repeat` | 반복 스케줄 | `{ pattern: '0 3 * * *' }` |
| `lifo` | 스택처럼 뒤에서 처리 | `lifo: true` |

```typescript
await this.queue.add('report', { day }, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: true,
  removeOnFail: false,   // 실패 잡 보존 → 조사/재처리(DLQ)
});
```

### repeat: 큐 내장 반복

```typescript
// 매일 03시 반복 잡 등록(등록은 1회, 이후 BullMQ가 자동 재생성)
await this.queue.add('daily-cleanup', {}, {
  repeat: { pattern: '0 3 * * *' },  // cron 표현식
});

// N ms 간격 반복
await this.queue.add('poll', {}, { repeat: { every: 30_000 } });
```

`repeat`는 BullMQ가 Redis에 반복 스케줄을 보존하므로 다중 인스턴스에서도 **한 번만** 발화한다. @nestjs/schedule의 인메모리 cron과 이 점이 다르다(scheduler 참조).

## 재시도와 backoff

```typescript
// exponential: delay * 2^(attempt-1) → 1s, 2s, 4s, 8s ...
{ attempts: 5, backoff: { type: 'exponential', delay: 1000 } }

// fixed: 매 재시도 동일 간격
{ attempts: 3, backoff: { type: 'fixed', delay: 5000 } }
```

- 외부 API 호출처럼 **일시적 장애**가 예상되면 exponential이 기본 선택 — 폭주를 피하며 회복을 기다린다.
- 재시도해도 소용없는 **영구 오류**(검증 실패 등)는 재시도 낭비다. `UnrecoverableError`를 throw하면 남은 시도를 건너뛰고 즉시 실패 처리한다.

```typescript
import { UnrecoverableError } from 'bullmq';

async process(job: Job): Promise<void> {
  if (!isValid(job.data)) {
    throw new UnrecoverableError('malformed payload'); // 재시도 안 함
  }
  await this.callExternal(job.data); // 여기서 throw는 재시도됨
}
```

## 동시성과 rate limiting

```typescript
@Processor('email', {
  concurrency: 10,                       // 이 워커가 동시에 처리하는 잡 수
  limiter: { max: 100, duration: 60_000 }, // 60초당 최대 100건 처리
})
export class EmailConsumer extends WorkerHost {
  async process(job: Job): Promise<void> { /* ... */ }
}
```

- `concurrency`: 한 워커 프로세스가 병렬로 여는 잡 수. I/O 대기가 많은 작업일수록 올릴 여지가 크다. CPU 바운드면 코어 수를 넘기지 않는다.
- `limiter`: 외부 API의 rate limit(예: 분당 100회)을 넘지 않도록 큐 전체 처리 속도를 제한한다. `max`건을 `duration` ms 안에서만 처리.
- 처리량을 더 늘리려면 **워커 프로세스를 여러 개** 띄운다(같은 큐 이름을 소비하면 잡이 자동 분배). 프로세스 분리는 nestjs-deployment 참조.

## 이벤트와 진행률

```typescript
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video')
export class VideoConsumer extends WorkerHost {
  async process(job: Job): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await this.encodeChunk(job.data, i);
      await job.updateProgress(i + 1);   // 진행률 보고(0~100 또는 객체)
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job): void { this.logger.log(`start ${job.id}`); }

  @OnWorkerEvent('progress')
  onProgress(job: Job, progress: number): void { /* WebSocket 등으로 중계 */ }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void { this.logger.log(`done ${job.id}`); }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(`fail ${job.id} (attempt ${job.attemptsMade}): ${err.message}`);
  }
}
```

- 워커 레벨 이벤트는 `@OnWorkerEvent(event)`를 Consumer 클래스 안에서 쓴다: `active`·`progress`·`completed`·`failed`·`stalled` 등.
- 큐 레벨 이벤트(다른 프로세스에서 큐 상태만 구독)는 `QueueEventsHost`를 상속한 별도 리스너 클래스에 `@OnQueueEvent`를 쓴다.

```typescript
import { QueueEventsHost, QueueEventsListener, OnQueueEvent } from '@nestjs/bullmq';

@QueueEventsListener('video')
export class VideoQueueEvents extends QueueEventsHost {
  @OnQueueEvent('completed')
  onCompleted({ jobId }: { jobId: string }): void { /* ... */ }
}
```

## 실패 처리와 DLQ

BullMQ는 실패한 잡을 **failed 상태로 Redis에 보존**한다(`removeOnFail: false`). 이 보존된 잡 집합이 사실상 DLQ(Dead Letter Queue) 역할을 한다 — 원인을 조사하고 필요하면 재처리한다.

```typescript
// 실패 잡 조회와 재처리
@Injectable()
export class QueueAdminService {
  constructor(@InjectQueue('email') private readonly queue: Queue) {}

  async inspectFailures(): Promise<void> {
    const failed = await this.queue.getFailed(0, 50);
    for (const job of failed) {
      this.logger.warn(`${job.id} ${job.name}: ${job.failedReason}`);
    }
  }

  async retry(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    await job?.retry();               // 실패 잡을 다시 waiting으로
  }
}
```

- 실패를 **조용히 삼키지 않는다.** `@OnWorkerEvent('failed')`에서 로깅/알림(그라파나·Sentry)을 걸어 가시성을 확보한다(grafana-observability 참조).
- 모든 시도를 소진한 잡만 최종 failed가 된다. `job.attemptsMade`로 몇 번째 실패인지 구분한다.
- 별도의 명시적 DLQ가 필요하면, 최종 실패 시 `deadLetterQueue.add(...)`로 다른 큐에 옮겨 담는 패턴도 쓴다.

## 멱등성

at-least-once 전달이므로 **같은 잡이 두 번 실행될 수 있다.** 부작용이 있는 처리는 반드시 멱등하게 만든다.

```typescript
// 방법 1: 고정 jobId로 큐 진입 단계에서 중복 차단
await this.queue.add('charge', { orderId }, { jobId: `charge:${orderId}` });
// 같은 jobId는 이미 존재하면 추가되지 않음(중복 enqueue 방지)

// 방법 2: 처리 단계에서 멱등키로 중복 실행 흡수
async process(job: Job): Promise<void> {
  const key = `done:charge:${job.data.orderId}`;
  const first = await this.redis.set(key, '1', 'NX', 'EX', 86400); // 최초만 성공
  if (!first) return;                        // 이미 처리됨 → 무시
  await this.payments.charge(job.data.orderId);
}
```

- `jobId`는 **enqueue 중복**을, 멱등키는 **실행 중복**(재시도·재전달)을 막는다. 결제·발송처럼 부작용이 큰 작업은 둘 다 쓴다.
- 외부 시스템이 멱등키(idempotency key)를 지원하면 그것을 잡 데이터에 실어 전달한다.

## 흔한 함정

- **`Queue`/`Job`을 @nestjs/bullmq에서 import** — 이 타입들은 `bullmq`에서 온다. 데코레이터(`InjectQueue`·`Processor`)만 @nestjs/bullmq.
- **Consumer를 providers에 미등록** — 워커가 뜨지 않아 잡이 쌓이기만 하고 처리되지 않는다.
- **`process`에서 예외를 try/catch로 삼킴** — 삼키면 잡이 completed로 기록돼 재시도가 동작하지 않는다. 재시도를 원하면 throw해야 한다.
- **거대 payload** — 잡 데이터가 크면 Redis 메모리를 잡아먹는다. ID만 넣고 워커가 재조회.
- **`removeOnComplete` 미설정** — 완료 잡이 무한정 쌓여 Redis가 비대해진다. 개수 제한 또는 true.
- **CPU 바운드 작업에 과도한 concurrency** — 이벤트 루프가 막힌다. 무거운 CPU 작업은 별도 프로세스/스레드로.
