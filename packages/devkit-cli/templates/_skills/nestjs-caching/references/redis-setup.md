# Redis store 연결 (cache-manager v6 + Keyv)

`@nestjs/cache-manager`의 최신 버전(cache-manager v6)은 store를 **Keyv 어댑터**로 연결한다. NestJS v10 시절의 `redisStore`/`store` 옵션은 **더 이상 지원되지 않으며**, `stores: [ ... ]` 배열에 Keyv 어댑터 인스턴스를 넣는 방식으로 바뀌었다. 이 문서는 그 연결과 registerAsync + ConfigService 주입, 전역/모듈별 등록, 연결 옵션을 다룬다.

> DB 연결·마이그레이션 자체는 nestjs-database, 환경변수·시크릿 관리는 nestjs-config 스킬 참조. 여기서는 캐시 store 배선에 집중한다.

## 목차
- [패키지 설치](#패키지-설치)
- [정적 등록: KeyvRedis](#정적-등록-keyvredis)
- [registerAsync + ConfigService](#registerasync--configservice)
- [다층 store: 인메모리 + Redis 폴백](#다층-store-인메모리--redis-폴백)
- [ioredis 인스턴스 재사용](#ioredis-인스턴스-재사용)
- [전역 vs 모듈별 등록](#전역-vs-모듈별-등록)
- [연결 옵션과 운영 주의점](#연결-옵션과-운영-주의점)

## 패키지 설치

```bash
pnpm add @nestjs/cache-manager cache-manager @keyv/redis keyv cacheable
```

- `@keyv/redis`: Redis용 Keyv 어댑터(`KeyvRedis`).
- `keyv`: 어댑터를 감싸는 store 래퍼.
- `cacheable`: 다층 store 구성 시 인메모리 계층(`KeyvCacheableMemory`)에 사용.

## 정적 등록: KeyvRedis

가장 단순한 형태. Redis URL만 있으면 된다.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [new KeyvRedis('redis://localhost:6379')],
        ttl: 60000, // 기본 TTL (밀리초)
      }),
    }),
  ],
})
export class AppModule {}
```

## registerAsync + ConfigService

Redis 접속 정보는 환경변수에서 온다. `registerAsync`로 `ConfigService`를 주입한다.

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('REDIS_URL');
        return {
          stores: [new KeyvRedis(url)],
          ttl: config.get<number>('CACHE_TTL_MS', 60000),
        };
      },
    }),
  ],
})
export class AppModule {}
```

- `getOrThrow`로 필수 값 누락 시 부팅을 실패시킨다(런타임에 조용히 캐시가 죽는 것보다 낫다).
- ConfigModule을 전역(`isGlobal: true`)으로 등록했다면 `imports: [ConfigModule]`은 생략 가능.

## 다층 store: 인메모리 + Redis 폴백

앞쪽 store(인메모리)에서 먼저 찾고, miss면 뒤쪽(Redis)으로 내려간다. 초저지연 로컬 캐시와 인스턴스 간 공유를 동시에 얻는다.

```typescript
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: () => ({
    stores: [
      // 1차: 프로세스 로컬 인메모리 (LRU)
      new Keyv({ store: new KeyvCacheableMemory({ ttl: 30000, lruSize: 5000 }) }),
      // 2차: 공유 Redis
      new KeyvRedis('redis://localhost:6379'),
    ],
  }),
});
```

주의: 다층 구성에서 로컬 인메모리 계층은 **인스턴스마다 독립**이다. 다른 인스턴스에서 Redis 값을 무효화해도 이 인스턴스의 로컬 계층은 자기 TTL이 끝나야 갱신된다. 정합성이 중요하면 로컬 계층 TTL을 짧게 잡는다.

## ioredis 인스턴스 재사용

이미 애플리케이션에 `ioredis` 클라이언트가 있다면(예: BullMQ와 공유) 별도 커넥션을 늘리지 않고 재사용할 수 있다. `KeyvRedis`에 클라이언트를 넘긴다.

```typescript
import KeyvRedis from '@keyv/redis';
import Redis from 'ioredis';

const client = new Redis({
  host: config.get('REDIS_HOST'),
  port: config.get<number>('REDIS_PORT'),
  password: config.get('REDIS_PASSWORD'),
  db: 1, // 캐시 전용 논리 DB 분리 권장
});

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: () => ({ stores: [new KeyvRedis(client)] }),
});
```

- 캐시용 논리 DB(`db`)를 큐·세션과 분리하면 `clear()`(FLUSH 성격) 실행 시 다른 용도 데이터를 지우지 않는다.
- 커넥션 수·인증·TLS 옵션은 ioredis 쪽에서 통제한다.

## 전역 vs 모듈별 등록

| 방식 | 설정 | 언제 |
|------|------|------|
| 전역 | `isGlobal: true` (앱 모듈에서 1회) | 앱 전반이 같은 캐시 인스턴스 공유 |
| 모듈별 | 해당 기능 모듈에서 `CacheModule.register(...)` | 모듈마다 다른 TTL·store·네임스페이스가 필요할 때 |

```typescript
// 특정 모듈만 다른 정책으로 등록
@Module({
  imports: [
    CacheModule.register({ ttl: 5000, max: 200 }), // 이 모듈 전용
  ],
})
export class ReportsModule {}
```

전역 등록 후에도 특정 모듈에서 다시 `register`하면 그 모듈 스코프에서는 후자가 우선한다. 대부분은 전역 1회로 충분하다.

## 연결 옵션과 운영 주의점

- **네임스페이스**: 여러 앱이 한 Redis를 공유하면 `new KeyvRedis(url, { namespace: 'app1' })`로 키 접두사를 분리해 충돌을 막는다.
- **직렬화**: Keyv는 값을 JSON으로 직렬화한다. `Date`는 문자열, `Map`/`Set`/클래스 인스턴스는 평문 객체로 복원되니, 캐시에는 직렬화 안전한 형태(plain object/primitive)로 저장한다.
- **연결 실패 내성**: Redis가 잠깐 끊겨도 요청이 통째로 실패하지 않게, 캐시 조회는 실패 시 원본 조회로 폴백하는 방어 코드를 고려한다(캐시는 최적화지 정답의 원천이 아니다).
- **TTL 단위**: 전 구간 밀리초. `ttl: 60`은 60ms다.
- **모니터링**: hit/miss 비율, Redis 메모리·eviction, 커넥션 수를 관측 대상에 포함한다(grafana-observability 참조).
