---
name: nestjs-caching
description: "NestJS 캐싱 패턴. @nestjs/cache-manager(CacheModule), 인메모리 vs Redis store(Keyv/ioredis), CacheInterceptor 자동 캐싱, 수동 cacheManager get/set/del, TTL·무효화·키 전략, cache stampede 대응.\nAPPLIES: NestJS에서 `CacheModule`·`cacheManager`·Redis store를 쓰거나 응답/조회 결과를 캐싱할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"NestJS 캐싱\", \"서버 캐싱\", \"Redis 캐시\", \"CacheModule\", \"cache-manager\", \"CacheInterceptor\", \"TTL 설정\", \"캐시 무효화\", \"응답 캐싱\", \"백엔드 캐시\", NestJS 백엔드 캐싱 구현 시.\nSKIP: Next.js 앱 데이터 캐싱(use cache)은 cache-components. 클라이언트 서버상태 캐싱은 tanstack-query. 벡터/시맨틱 검색은 nestjs-semantic-search."
version: 1.0.0
---

# NestJS 캐싱 (Caching)

> 참조:
> - [references/redis-setup.md](references/redis-setup.md) - cache-manager v6 + Redis(Keyv/ioredis) 연결, registerAsync + ConfigService, 전역/모듈별 등록, 연결 옵션
> - [references/patterns.md](references/patterns.md) - 인터셉터 자동 캐싱 vs 수동 제어, 무효화 전략, 키 설계, TTL 정책, cache-aside/wrap, stampede 회피 **CRITICAL**

## 핵심: 캐싱은 "빠른 사본"이지 진실이 아니다

캐시는 원본(DB·외부 API) 응답을 잠시 복제해 반복 조회를 줄이는 장치다. 원본이 바뀌면 사본은 **낡는다(stale)**. 그래서 캐싱 코드의 난이도는 "저장"이 아니라 **"언제 버릴지(TTL·무효화)"** 와 **"낡아도 되는지"** 판단에 있다. 저장은 한 줄, 무효화가 설계다.

NestJS는 `@nestjs/cache-manager`로 통일된 캐시 추상을 제공한다. 같은 코드가 **인메모리**(개발·단일 인스턴스)와 **Redis**(다중 인스턴스 공유)에서 동일하게 동작한다. store만 갈아끼우면 된다.

이 스킬은 **NestJS 백엔드 서버 캐싱**을 다룬다. Next.js 앱의 데이터 캐싱(`use cache`)은 cache-components, 클라이언트 서버상태 캐싱은 tanstack-query, 벡터/시맨틱 검색은 nestjs-semantic-search로 간다.

## 설치와 기본 등록

```bash
pnpm add @nestjs/cache-manager cache-manager
# Redis store를 쓸 때 추가
pnpm add @keyv/redis keyv cacheable
```

```typescript
// app.module.ts — 기본 인메모리 store, 전역 등록
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true, // 전역 등록 → 모듈마다 import 불필요
      ttl: 5000,      // 기본 TTL (밀리초 단위, v5+)
      max: 1000,      // 인메모리 최대 엔트리 수
    }),
  ],
})
export class AppModule {}
```

- **`ttl`은 밀리초 단위다** (cache-manager v5부터 초 → 밀리초로 바뀜). `5`가 아니라 `5000`.
- `isGlobal: true`면 한 번만 등록하고 어디서든 `CACHE_MANAGER`를 주입할 수 있다.
- 비동기 설정(ConfigService 주입, Redis URL)이 필요하면 `registerAsync` → redis-setup.md.

## 자동 캐싱: CacheInterceptor

`CacheInterceptor`는 **GET 요청의 응답을 URL 기준으로 자동 캐싱**한다. 손 안 대고 읽기 캐시를 얻는 가장 빠른 길이다.

```typescript
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { Controller, Get, UseInterceptors } from '@nestjs/common';

@Controller('articles')
@UseInterceptors(CacheInterceptor) // 컨트롤러 전체의 GET에 적용
export class ArticlesController {
  @Get('popular')
  @CacheKey('articles:popular') // 캐시 키 명시(기본은 요청 URL)
  @CacheTTL(30000)              // 이 라우트만 30초
  findPopular() {
    return this.service.findPopular();
  }
}
```

전역 적용은 `APP_INTERCEPTOR`로:

```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';

providers: [{ provide: APP_INTERCEPTOR, useClass: CacheInterceptor }];
```

주의: `CacheInterceptor`는 **GET만, 그리고 요청 단위로 구분 없이** 캐싱한다. 로그인 사용자별로 다른 응답(개인화)에 전역 적용하면 **다른 유저의 응답이 새어 나간다**. 아래 흔한 실수 참조.

## 수동 캐싱: cacheManager 직접 제어

무효화·조건부 캐싱·복잡한 키가 필요하면 `CACHE_MANAGER`를 주입해 직접 다룬다.

```typescript
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async findOne(id: string): Promise<Product> {
    const key = `product:${id}`;
    const cached = await this.cache.get<Product>(key);
    if (cached) return cached;               // hit

    const product = await this.repo.findById(id); // miss → 원본 조회
    await this.cache.set(key, product, 60000);     // 60초 캐싱
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.repo.update(id, dto);
    await this.cache.del(`product:${id}`);   // 변이 후 무효화 — 필수
    return product;
  }
}
```

핵심 메서드: `get<T>(key)`, `set(key, value, ttl?)`, `del(key)`, `clear()`, 그리고 cache-aside를 한 줄로 압축하는 `wrap(key, fn, ttl?)` → patterns.md.

## cache-aside 한 줄: wrap

위 `findOne`의 get→miss→set 패턴은 `wrap`으로 압축된다. `wrap`은 **키가 있으면 반환, 없으면 팩토리 실행 후 저장**을 원자적으로 처리하며, 동시에 몰린 miss를 **하나의 팩토리 호출로 합쳐(coalesce)** cache stampede를 완화한다.

```typescript
async findOne(id: string): Promise<Product> {
  return this.cache.wrap(
    `product:${id}`,
    () => this.repo.findById(id), // miss일 때만 호출
    60000,
  );
}
```

## ✕/○ 대비: 흔히 틀리는 지점

```typescript
// ✕ 변이 후 무효화 누락 → update 이후에도 60초간 옛 값 응답
async update(id: string, dto: UpdateProductDto) {
  return this.repo.update(id, dto); // 캐시는 그대로 stale
}
// ○ 변이 후 관련 키를 반드시 del
async update(id: string, dto: UpdateProductDto) {
  const p = await this.repo.update(id, dto);
  await this.cache.del(`product:${id}`);
  return p;
}
```

```typescript
// ✕ 개인화 응답을 URL만으로 전역 캐싱 → 유저 A의 프로필이 B에게 노출
@UseInterceptors(CacheInterceptor)
@Get('me')
getMe(@Req() req) { return this.service.profile(req.user.id); }
// ○ 사용자별로 키를 분리하거나(수동), 개인화 응답은 캐싱하지 않는다
@Get('me')
getMe(@Req() req) {
  return this.cache.wrap(`profile:${req.user.id}`, () => this.service.profile(req.user.id), 30000);
}
```

```typescript
// ✕ 키 충돌 — 도메인 없이 원시 id를 키로 → user 42와 product 42가 겹침
await this.cache.set(`${id}`, value);
// ○ 도메인:식별자 네이밍 컨벤션
await this.cache.set(`product:${id}`, value);
```

## TTL 전략

| 데이터 성격 | 예시 | 권장 TTL |
|-------------|------|----------|
| 자주 바뀜 | 실시간 재고, 잔액 | 짧게 (수초~수십초) 또는 캐싱 안 함 |
| 가끔 바뀜 | 상품 상세, 프로필 | 중간 (분 단위) |
| 거의 안 바뀜 | 카테고리, 국가 코드 | 길게 (시간~일) + 변이 시 명시적 del |
| 개인화·민감 | 로그인 세션별 응답 | 캐싱 지양 또는 사용자별 키 + 짧은 TTL |

- **TTL은 안전망이지 무효화의 대체물이 아니다.** 정확성이 중요하면 변이 시 `del`로 즉시 무효화하고, TTL은 "그래도 혹시" 상한선으로 둔다.
- 짧은 TTL은 stampede 위험을 키운다(동시 만료 → 백엔드 폭주). stale 허용 데이터는 `refreshThreshold`로 만료 직전 백그라운드 재계산 → patterns.md.

## 캐시 store 선택

| store | 범위 | 언제 |
|-------|------|------|
| 인메모리(기본) | 프로세스 로컬 | 단일 인스턴스, 개발, 초저지연 |
| Redis(Keyv) | 인스턴스 간 공유 | 다중 인스턴스·오토스케일, 무효화 전파 필요 |

다중 인스턴스에서 인메모리를 쓰면 **인스턴스마다 캐시가 따로 논다** — 한 곳에서 `del`해도 다른 곳은 여전히 stale. 수평 확장 환경이면 Redis가 사실상 필수다. 연결·설정 → redis-setup.md.

## 흔한 실수 요약

- **무효화 누락** — 변이(POST/PUT/DELETE) 후 관련 키 `del`을 빼먹어 stale 응답. 가장 흔하고 치명적.
- **개인화 응답 전역 캐싱** — `CacheInterceptor`를 사용자별 응답에 전역 적용해 응답이 교차 노출.
- **키 충돌** — 도메인 접두사 없는 원시 id를 키로 사용. 항상 `도메인:식별자`.
- **TTL 단위 착각** — v5+는 밀리초. `ttl: 5`는 5ms라 즉시 만료된다.
- **Redis 직렬화 문제** — Keyv는 값을 JSON 직렬화한다. `Date`·`Map`·클래스 인스턴스는 평문 객체로 돌아오니, 도메인 객체 대신 직렬화 안전한 형태로 저장하거나 역직렬화 매핑을 둔다.
- **stampede 무대책** — 인기 키가 동시 만료되며 miss가 한꺼번에 원본으로 몰림. `wrap`/`refreshThreshold`로 대응 → patterns.md.
