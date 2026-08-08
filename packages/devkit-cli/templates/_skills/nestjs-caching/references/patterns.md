# 캐싱 패턴: 자동 vs 수동, 무효화, 키·TTL, stampede

캐싱의 어려움은 저장이 아니라 **정합성 유지**에 있다. 이 문서는 인터셉터 자동 캐싱과 수동 제어의 선택, 무효화 전략, 키 설계, TTL 정책, cache-aside(`wrap`), 그리고 cache stampede 회피를 다룬다.

> Next.js 앱 데이터 캐싱은 cache-components, 클라이언트 캐싱은 tanstack-query 스킬 참조. 여기서는 NestJS 서버 캐싱 패턴에 집중한다.

## 목차
- [자동(CacheInterceptor) vs 수동(cacheManager)](#자동cacheinterceptor-vs-수동cachemanager)
- [cache-aside와 wrap](#cache-aside와-wrap)
- [무효화 전략](#무효화-전략)
- [키 설계 컨벤션](#키-설계-컨벤션)
- [TTL 정책](#ttl-정책)
- [cache stampede 회피](#cache-stampede-회피)
- [흔한 실수](#흔한-실수)

## 자동(CacheInterceptor) vs 수동(cacheManager)

| 축 | CacheInterceptor(자동) | cacheManager(수동) |
|----|------------------------|---------------------|
| 대상 | GET 라우트 응답 | 임의 값(쿼리 결과·계산 결과) |
| 키 | 요청 URL(또는 `@CacheKey`) | 개발자가 직접 설계 |
| 무효화 | 스스로 못함 — TTL 만료에만 의존 | `del`로 즉시 무효화 가능 |
| 개인화 | 위험(요청자 구분 없음) | 사용자별 키로 안전하게 |
| 손 | 거의 안 감 | 조회·저장·무효화 직접 |

판단 기준: **읽기 전용에 가깝고 전역 공통이면 인터셉터**, **변이가 얽히거나 사용자별·조건부면 수동**. 무효화가 필요한 순간 인터셉터만으로는 부족하다 — 인터셉터는 스스로 캐시를 비울 수단이 없어 오직 TTL 만료를 기다린다.

```typescript
// 자동 — 공개 목록처럼 자주 읽고 무효화가 급하지 않은 곳
@UseInterceptors(CacheInterceptor)
@CacheTTL(30000)
@Get('categories')
listCategories() { return this.service.listAll(); }

// 수동 — 변이와 얽혀 즉시 무효화가 필요한 곳
async getProfile(userId: string) {
  return this.cache.wrap(`profile:${userId}`, () => this.repo.profile(userId), 30000);
}
async updateProfile(userId: string, dto: UpdateProfileDto) {
  const updated = await this.repo.update(userId, dto);
  await this.cache.del(`profile:${userId}`); // 인터셉터는 이걸 못한다
  return updated;
}
```

## cache-aside와 wrap

가장 널리 쓰는 패턴이 **cache-aside(lazy loading)**: 캐시를 먼저 보고, 없으면 원본에서 읽어 채운다.

```typescript
// 수동 cache-aside — 흐름을 그대로 드러냄
async findProduct(id: string): Promise<Product> {
  const key = `product:${id}`;
  const hit = await this.cache.get<Product>(key);
  if (hit) return hit;
  const product = await this.repo.findById(id);
  await this.cache.set(key, product, 60000);
  return product;
}
```

`wrap`은 위 세 단계를 한 호출로 합치고, **동시에 몰린 miss를 하나의 팩토리 실행으로 병합**한다.

```typescript
// ○ wrap — get→miss→set을 원자화, 동시 miss 병합
async findProduct(id: string): Promise<Product> {
  return this.cache.wrap(`product:${id}`, () => this.repo.findById(id), 60000);
}
```

```typescript
// ✕ 수동 get/set을 락 없이 쓰면 동시 요청이 각자 원본을 때린다(작은 stampede)
const hit = await this.cache.get(key);
if (!hit) {
  const v = await this.repo.findById(id); // 10개 요청이면 10번 호출
  await this.cache.set(key, v, 60000);
}
```

## 무효화 전략

무효화는 캐싱 정합성의 핵심이다. 세 갈래로 정리한다.

1. **쓰기 시 무효화(write-invalidate)** — 변이 직후 관련 키를 `del`. 가장 흔하고 확실하다.

```typescript
async remove(id: string) {
  await this.repo.remove(id);
  await this.cache.del(`product:${id}`);       // 단건
  await this.cache.del('product:list:page:1'); // 이 변이가 흔드는 파생 키도 함께
}
```

2. **쓰기 시 갱신(write-through)** — 변이 결과로 캐시를 곧바로 덮어쓴다. 다음 조회의 miss를 없앤다.

```typescript
async update(id: string, dto: UpdateProductDto) {
  const updated = await this.repo.update(id, dto);
  await this.cache.set(`product:${id}`, updated, 60000); // del 대신 set
  return updated;
}
```

3. **TTL 만료(time-based)** — 명시적 무효화가 어려운 파생·집계 데이터에. stale을 TTL 길이만큼 감수한다.

주의: **단건 키만 지우고 목록/집계 키를 잊는 것**이 가장 흔한 버그다. 한 변이가 흔드는 파생 키(목록·카운트·검색 결과)를 함께 무효화하라. 파생 키가 많으면 **버전/제너레이션 키**로 통째 무효화한다.

```typescript
// 네임스페이스 버전을 올려 하위 캐시를 한 번에 낡게 만드는 기법
const ver = await this.cache.get<number>('product:ver') ?? 0;
const key = `product:list:v${ver}:page:${page}`;
// 대량 변경 시
await this.cache.set('product:ver', ver + 1); // 이전 버전 키는 자연 만료로 소멸
```

## 키 설계 컨벤션

- **`도메인:식별자[:서브]`** 형태로 접두사를 붙인다: `product:42`, `user:7:orders`, `product:list:page:2`.
- 접두사가 없으면 서로 다른 도메인이 같은 원시 id로 **충돌**한다(`42`가 user인지 product인지 알 수 없다).
- 사용자별 응답은 반드시 식별자를 키에 포함: `feed:${userId}`.
- 쿼리 파라미터가 키에 들어가면 순서를 **정규화**한다(`sort=a&page=1`과 `page=1&sort=a`가 다른 키가 되지 않도록).
- 키 생성 로직은 헬퍼로 모아 오타·불일치를 막는다.

```typescript
const productKey = (id: string) => `product:${id}`;
const productListKey = (page: number) => `product:list:page:${page}`;
```

## TTL 정책

| 데이터 | 예시 | TTL 방향 |
|--------|------|----------|
| 자주 바뀜 | 재고·잔액·실시간 순위 | 짧게(수초) 또는 캐싱 안 함 |
| 가끔 바뀜 | 상품 상세·프로필 | 분 단위 + 변이 시 del |
| 정적 | 카테고리·코드 테이블 | 시간~일 + 변이 시 명시적 무효화 |

- **정확성 우선이면 짧은 TTL + 명시적 무효화**, **부하 절감 우선이면 긴 TTL + stale 허용**.
- TTL을 정확성 도구로 오해하지 마라. 15분 TTL은 "최대 15분 낡을 수 있다"는 뜻이지 "15분마다 정확해진다"가 아니다. 정확성이 필요하면 변이 시 `del`.
- 동일 TTL로 대량 키를 한꺼번에 채우면 **동시 만료**가 stampede를 부른다. TTL에 지터(무작위 오프셋)를 더해 만료를 분산한다.

```typescript
const jitter = Math.floor(Math.random() * 5000); // 0~5s 분산
await this.cache.set(key, value, 60000 + jitter);
```

## cache stampede 회피

**stampede(dog-piling)**: 인기 키가 만료되는 순간, 캐시를 못 찾은 다수 요청이 동시에 원본(DB)으로 몰려 백엔드를 폭주시키는 현상.

대응 세 가지:

1. **`wrap`으로 miss 병합** — 같은 키에 동시에 몰린 요청을 하나의 팩토리 실행으로 합쳐 원본 호출을 1회로 만든다. 1차 방어선.

```typescript
return this.cache.wrap(`product:${id}`, () => this.repo.findById(id), 60000);
```

2. **조기 재계산(refreshThreshold)** — cache-manager는 남은 TTL이 임계치 아래로 떨어지면, 현재 요청에는 아직 유효한 값을 즉시 돌려주면서 **백그라운드로 값을 미리 갱신**한다. 만료 시점의 동시 miss 자체를 없앤다.

```typescript
CacheModule.register({
  ttl: 60000,
  refreshThreshold: 10000, // 남은 TTL이 10초 미만이면 백그라운드 재계산
});
```

3. **TTL 지터** — 위 TTL 정책 참조. 만료 시각을 흩어 동시 만료를 방지한다.

더 강한 보장이 필요하면 Redis 분산 락(`SET key val NX PX`)으로 "재계산은 한 요청만" 강제하고 나머지는 짧게 대기하거나 stale을 반환하는 방식도 있으나, 대부분은 `wrap` + `refreshThreshold` + 지터로 충분하다. 락은 복잡도와 데드락 위험을 함께 들여오니 실측 후 필요할 때만 도입한다.

## 흔한 실수

- **무효화 누락** — 변이 후 `del`을 빼먹어 stale. 특히 단건만 지우고 목록·집계 키를 잊음.
- **락 없는 수동 get/set** — 동시 miss가 각자 원본을 때림. `wrap`을 써라.
- **동일 TTL 대량 세팅** — 동시 만료 → stampede. 지터로 분산.
- **개인화 응답 공용 키** — 사용자 식별자를 키에서 빼 응답이 교차 노출.
- **키 정규화 누락** — 파라미터 순서·형식 차이로 같은 데이터가 여러 키에 중복 저장되어 hit율 저하.
- **stale을 정확성으로 착각** — TTL은 상한이지 갱신 주기가 아니다.
