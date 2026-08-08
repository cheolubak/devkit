# 헬스체크와 라이프사이클 (@nestjs/terminus + graceful shutdown)

배포된 NestJS 프로세스는 오케스트레이터에게 두 가지를 정직하게 말해야 한다: **"나는 살아있다(liveness)"** 와 **"나는 트래픽 받을 준비가 됐다(readiness)"**. 그리고 교체될 때는 **처리 중 요청을 잃지 않고** 물러나야 한다(graceful shutdown). 이 문서는 `@nestjs/terminus` 헬스 인디케이터와 셧다운 라이프사이클을 다룬다.

> 관측성(로그·트레이스·메트릭 대시보드)은 grafana-observability, DB/Redis 연결 설정 자체는 nestjs-database·nestjs-config 참조. 여기서는 헬스 신호와 종료 절차에 집중한다.

## 목차
- [설치와 모듈 구성](#설치와-모듈-구성)
- [liveness vs readiness](#liveness-vs-readiness)
- [DB·디스크·메모리 인디케이터](#db디스크메모리-인디케이터)
- [HTTP·Redis 인디케이터](#httpredis-인디케이터)
- [커스텀 인디케이터](#커스텀-인디케이터)
- [graceful shutdown 원리](#graceful-shutdown-원리)
- [셧다운 시 커넥션 정리](#셧다운-시-커넥션-정리)
- [readiness와 셧다운 연동](#readiness와-셧다운-연동)

## 설치와 모듈 구성

```bash
pnpm add @nestjs/terminus
```

> 아래 예시는 terminus v11+ 기준이다. 커스텀 인디케이터가 `HealthIndicatorService`(v11 도입)를 쓴다 — v10 이하는 `HealthIndicator` 베이스 클래스 + `getStatus()` + `HealthCheckError`로 형태가 다르다. 내장 인디케이터(`pingCheck`·`checkHeap`·`checkStorage`)와 컨트롤러 형태는 v10/v11 공통이다.

```typescript
// health/health.module.ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';   // HttpHealthIndicator 사용 시
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

## liveness vs readiness

이 둘의 분리가 헬스체크의 핵심이다. **섞으면 장애가 증폭된다.**

| 프로브 | 질문 | 체크 대상 | 실패 시 오케스트레이터 동작 |
|--------|------|-----------|------------------------------|
| **liveness** | 프로세스가 살아있나? | 이벤트 루프 생존 (의존성 **제외**) | 컨테이너 **재시작** |
| **readiness** | 트래픽 받을 준비 됐나? | DB·Redis·외부 API 등 의존성 | 트래픽에서 **제외**(프로세스 유지) |

```typescript
// health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  // GET /health — liveness. 의존성을 절대 넣지 않는다.
  @Get()
  @HealthCheck()
  liveness() {
    return this.health.check([]);   // 응답 200 = 프로세스 살아있음
  }

  // GET /health/ready — readiness. 의존성 확인.
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
    ]);
  }
}
```

```yaml
# Kubernetes: 두 프로브를 각각 연결
livenessProbe:
  httpGet: { path: /health, port: 3000 }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
  periodSeconds: 5
```

- ✕ liveness가 `db.pingCheck`를 포함 → DB가 잠깐 끊기면 오케스트레이터가 **정상 앱을 재시작**한다. 재시작해도 DB는 안 살아나므로 재시작 루프에 빠진다.
- ○ DB 순단은 readiness만 실패시켜 트래픽에서 빠지고, DB 회복 시 자동으로 다시 준비 상태가 된다. 프로세스는 유지된다.

## DB·디스크·메모리 인디케이터

terminus 기본 인디케이터로 흔한 의존성을 커버한다.

```typescript
import {
  TypeOrmHealthIndicator,
  DiskHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
      // heap 사용량이 300MB 넘으면 unhealthy
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      // 루트 볼륨 사용률 90% 초과 시 unhealthy
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }
}
```

- Prisma를 쓰면 `PrismaHealthIndicator`(별도 구성) 또는 아래 커스텀 인디케이터로 `SELECT 1`을 던진다.
- 메모리·디스크 임계값은 컨테이너 리소스 한계에 맞춰 정한다. 무의미하게 높으면 신호가 되지 못한다.

## HTTP·Redis 인디케이터

외부 API 의존성은 `HttpHealthIndicator`로, Redis 같은 캐시는 `pingCheck`로 확인한다.

```typescript
import { HttpHealthIndicator } from '@nestjs/terminus';

@Get('ready')
@HealthCheck()
readiness() {
  return this.health.check([
    () => this.http.pingCheck('payment-api', 'https://api.example.com/health'),
  ]);
}
```

주의: readiness에 외부 API를 넣을지는 신중히 판단한다. **우리 서비스가 요청을 처리할 수 있는지**가 기준이다. 결제 API가 느리다고 우리 앱 전체를 트래픽에서 빼면 안 되는 경우가 많다 — 정말 그 의존성 없이는 아무 요청도 못 받을 때만 넣는다.

## 커스텀 인디케이터

기본 인디케이터로 안 되는 의존성은 `HealthIndicatorService`로 직접 만든다.

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redis: Redis,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const check = this.indicator.check(key);
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') return check.down({ message: 'unexpected reply' });
      return check.up();
    } catch (e) {
      return check.down({ message: (e as Error).message });
    }
  }
}
```

```typescript
// 사용
() => this.redisHealth.isHealthy('redis'),
```

## graceful shutdown 원리

재배포·스케일다운 시 흐름은 이렇다:

```
오케스트레이터 → 컨테이너에 SIGTERM 전송
        │  (grace period, 예: 30초)
        ├─ 신규 트래픽 차단 (엔드포인트에서 제거 / readiness 실패)
        ├─ 진행 중(in-flight) 요청 완료 대기
        ├─ DB·Redis·큐 커넥션 정리 (OnModuleDestroy)
        └─ 프로세스 정상 종료 (exit 0)
grace period 초과 시 → SIGKILL (강제 종료, 요청 유실)
```

이걸 켜는 스위치가 `enableShutdownHooks()`다. 이걸 호출해야 NestJS가 `SIGTERM`을 잡아 `OnModuleDestroy`/`OnApplicationShutdown` 훅을 실행한다.

```typescript
// src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();      // 없으면 아래 훅들이 호출되지 않는다
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
```

- ✕ `enableShutdownHooks()` 미호출 → SIGTERM에 프로세스가 즉시 죽고, 진행 중 요청과 커넥션이 유실된다. 재배포마다 일부 요청이 502로 실패한다.
- 성능 주의: `enableShutdownHooks()`는 시그널 리스너를 등록하므로, 다수의 인스턴스에서 리스너 누수를 피하려면 앱 부트스트랩에서 한 번만 호출한다.

## 셧다운 시 커넥션 정리

`OnModuleDestroy`(또는 `OnApplicationShutdown`)로 외부 리소스를 명시적으로 닫는다.

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(process.env.REDIS_URL!);

  async onModuleDestroy() {
    await this.client.quit();     // 진행 중 명령 flush 후 정상 종료
  }
}
```

```typescript
// 시그널 인자가 필요하면 OnApplicationShutdown
import { Injectable, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class QueueService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    // signal === 'SIGTERM'
    await this.queue.close();     // 컨슈머 중지 후 커넥션 정리
  }
}
```

- TypeORM/Prisma 커넥션 풀, 메시지 큐 컨슈머, Redis, 파일 핸들, 크론 잡을 모두 닫는다. 남은 커넥션은 DB의 커넥션 슬롯을 붙잡아 다음 배포에 영향을 준다.
- 훅은 병렬로 실행될 수 있으니 서로 의존하지 않게 각자 자기 리소스만 정리한다.

## readiness와 셧다운 연동

grace period 동안 신규 트래픽을 확실히 끊으려면, SIGTERM을 받는 즉시 readiness를 **의도적으로 실패**시켜 로드밸런서가 이 인스턴스를 엔드포인트에서 빼게 한다. 그 사이 진행 중 요청은 계속 처리된다.

```typescript
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class ReadinessState implements OnApplicationShutdown {
  private ready = true;

  constructor(private readonly indicator: HealthIndicatorService) {}

  onApplicationShutdown() {
    this.ready = false;           // 셧다운 시작 → readiness 실패로 전환
  }

  // 상태를 terminus 결과로 변환 (.down() 이면 응답이 503으로 포맷된다)
  check(key = 'accepting_traffic') {
    const c = this.indicator.check(key);
    return this.ready ? c.up() : c.down({ reason: 'shutting down' });
  }
}
```

```typescript
// readiness 체크에 상태를 반영 — 의존성 체크보다 앞에 둔다
@Get('ready')
@HealthCheck()
readiness() {
  return this.health.check([
    () => this.readinessState.check(),
    () => this.db.pingCheck('database'),
  ]);
}
```

- Kubernetes에서는 `preStop` 훅으로 몇 초 대기시켜, 엔드포인트 제거가 전파될 시간을 벌면 502를 더 확실히 없앨 수 있다.
- 즉 순서는 **"readiness 먼저 내리고 → 잠깐 대기 → 커넥션 정리 → 종료"** 다. 이 규율이 무손실 롤링 배포를 만든다.
