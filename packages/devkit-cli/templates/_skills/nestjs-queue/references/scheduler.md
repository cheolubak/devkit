# @nestjs/schedule: 반복·예약 작업

@nestjs/schedule은 선언적 cron·interval·timeout으로 **시간 기반 작업**을 실행한다. 내부적으로 프로세스 메모리 타이머(cron 라이브러리)를 쓴다. 이 문서는 데코레이터 방식, CronExpression, 런타임 동적 제어(SchedulerRegistry), 다중 인스턴스 주의점, 그리고 큐와의 조합을 다룬다.

> 시간 트리거 자체는 여기서, 트리거 후 실제 무거운 처리는 BullMQ 큐로 위임한다(bullmq 참조). 배포 시 워커/스케줄러 프로세스 분리는 nestjs-deployment 참조.

## 목차
- [설치와 등록](#설치와-등록)
- [선언적 데코레이터](#선언적-데코레이터)
- [CronExpression](#cronexpression)
- [SchedulerRegistry로 동적 제어](#schedulerregistry로-동적-제어)
- [다중 인스턴스 주의](#다중-인스턴스-주의)
- [큐와 조합](#큐와-조합)
- [흔한 함정](#흔한-함정)

## 설치와 등록

```bash
pnpm add @nestjs/schedule
```

```typescript
// app.module.ts
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],  // 스케줄러 활성화(1회)
})
export class AppModule {}
```

`forRoot()`가 데코레이터 스캔을 켠다. 이걸 빼면 `@Cron`·`@Interval`이 조용히 동작하지 않는다.

## 선언적 데코레이터

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval, Timeout, CronExpression } from '@nestjs/schedule';

@Injectable()
export class Tasks {
  private readonly logger = new Logger(Tasks.name);

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)  // cron 표현식/프리셋
  handleMidnight(): void {
    this.logger.log('자정 배치');
  }

  @Cron('45 * * * * *', { name: 'every-min-45s', timeZone: 'Asia/Seoul' })
  handleEverySecond45(): void { /* 이름·타임존 지정 */ }

  @Interval(10_000)                             // 앱 시작 후 10초마다
  handleInterval(): void { /* 가벼운 폴링 */ }

  @Timeout(5_000)                               // 앱 시작 5초 후 1회
  handleTimeout(): void { /* 초기화 작업 */ }
}
```

- `@Cron(expr, opts)`: cron 표현식(6필드면 초 단위 포함) 또는 `CronExpression` 프리셋. `name`을 주면 SchedulerRegistry로 제어 가능, `timeZone`으로 타임존 고정.
- `@Interval(ms)`: 고정 간격 반복. `@Timeout(ms)`: 1회 지연 실행.
- 이 데코레이터가 붙는 메서드는 **가볍고 빠르게** 끝나야 한다. 오래 걸리는 작업은 큐로 위임.

## CronExpression

자주 쓰는 프리셋(전체는 enum 참조):

| 프리셋 | 의미 |
|--------|------|
| `EVERY_SECOND` | 매초 |
| `EVERY_10_SECONDS` | 10초마다 |
| `EVERY_30_SECONDS` | 30초마다 |
| `EVERY_MINUTE` | 매분 |
| `EVERY_5_MINUTES` | 5분마다 |
| `EVERY_HOUR` | 매시 정각 |
| `EVERY_DAY_AT_MIDNIGHT` | 매일 00:00 |
| `EVERY_DAY_AT_3AM` | 매일 03:00 |
| `EVERY_WEEK` | 매주 |
| `EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT` | 매월 1일 00:00 |

직접 표현식을 쓸 때 필드 순서: `초 분 시 일 월 요일`(초 필드는 선택). 예: `'0 0 3 * * *'` = 매일 03:00:00.

## SchedulerRegistry로 동적 제어

런타임에 잡을 추가·조회·삭제한다. 설정에 따라 잡을 켜고 끄거나, 사용자 입력으로 예약을 만들 때 쓴다.

```typescript
import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class DynamicSchedule {
  constructor(private readonly registry: SchedulerRegistry) {}

  // 동적 cron 잡 추가
  addCron(name: string, expr: string): void {
    const job = new CronJob(expr, () => {
      this.logger.log(`${name} 실행`);
    });
    this.registry.addCronJob(name, job);
    job.start();
  }

  // 조회·중지·삭제
  stopCron(name: string): void {
    this.registry.getCronJob(name).stop();
  }
  deleteCron(name: string): void {
    this.registry.deleteCronJob(name);   // 등록 해제
  }

  // 동적 interval / timeout
  addInterval(name: string, ms: number): void {
    const id = setInterval(() => this.logger.log(name), ms);
    this.registry.addInterval(name, id);
  }
  clearInterval(name: string): void {
    this.registry.deleteInterval(name);
  }
}
```

- `CronJob`은 `cron` 패키지에서 import한다(@nestjs/schedule이 재노출하기도 함).
- `getCronJobs()`/`getIntervals()`/`getTimeouts()`로 전체 목록을 얻어 관리 화면에 노출할 수 있다.
- 선언적 `@Cron(..., { name })`으로 등록한 잡도 `name`으로 `getCronJob`을 통해 제어 가능하다.

## 다중 인스턴스 주의

@nestjs/schedule의 타이머는 **각 프로세스 메모리**에 산다. 앱을 N개 인스턴스로 스케일아웃하면 `@Cron`이 **N번 동시에 발화**한다 — 정산·집계·발송이 중복 실행된다.

대응:

1. **큐로 위임 + 고정 jobId**: cron은 트리거만, 실제 작업은 `queue.add(name, data, { jobId })`로 넣어 BullMQ가 중복을 흡수(bullmq 참조).
2. **BullMQ repeat 잡 사용**: 반복 스케줄을 Redis에 두면 다중 인스턴스에서도 한 번만 발화한다. 순수 시간 트리거라면 schedule 대신 이 방식이 더 안전하다.
3. **분산 락/리더 선출**: cron 콜백 진입 시 Redis 락(`SET NX EX`)을 잡아 한 인스턴스만 실행.
4. **스케줄러 전용 인스턴스**: 스케줄 작업만 도는 단일 프로세스를 분리 배포(nestjs-deployment 참조).

```typescript
// 대응 1 예시: cron은 트리거, 큐가 실행 책임 + 중복 방지
@Cron(CronExpression.EVERY_DAY_AT_3AM)
async triggerSettlement(): Promise<void> {
  const day = today();
  await this.settleQueue.add('settle', { day }, { jobId: `settle:${day}` });
  // 여러 인스턴스가 동시에 add해도 같은 jobId라 잡은 하나만 생성됨
}
```

## 큐와 조합

권장 아키텍처: **schedule = 언제, BullMQ = 무엇을 어떻게**.

```typescript
@Injectable()
export class ReportScheduler {
  constructor(@InjectQueue('report') private readonly queue: Queue) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightly(): Promise<void> {
    // ✕ 나쁨: cron 콜백에서 직접 무거운 리포트 생성
    //   → 실패 시 재시도 없음, 오래 걸리면 다음 트리거와 겹침, 다중 인스턴스 중복
    // await this.buildHeavyReport();

    // ○ 좋음: 큐로 위임 — 재시도·동시성·중복방지는 BullMQ가 책임
    await this.queue.add(
      'daily',
      { date: today() },
      { jobId: `daily:${today()}`, attempts: 3 },
    );
  }
}
```

이렇게 분리하면 cron 콜백은 즉시 끝나고, 재시도·backoff·동시성·실패 보존은 전부 큐 계층이 담당한다.

## 흔한 함정

- **`ScheduleModule.forRoot()` 누락** — 데코레이터가 조용히 무시된다. 등록 필수.
- **cron 콜백에서 무거운 처리** — 실행이 다음 트리거까지 밀리거나 겹친다. 큐로 위임.
- **다중 인스턴스 중복 발화 방치** — 정산·집계가 N회 실행. jobId·락·repeat 잡으로 단일 실행 보장.
- **타임존 미지정** — 서버 UTC 기준으로 발화해 "매일 03시"가 어긋난다. `{ timeZone }` 명시.
- **동적 잡을 삭제 없이 재등록** — 같은 이름 중복 등록으로 예외. 재등록 전 `deleteCronJob`.
- **async cron 콜백의 미처리 예외** — schedule은 재시도하지 않는다. 예외 처리와 알림을 직접 걸거나 큐로 위임.
