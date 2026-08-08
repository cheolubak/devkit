# @nestjs/throttler 상세

`@nestjs/throttler`는 요청 속도를 제한해 브루트포스·스크래핑·기초적 DoS를 완화한다. 이 문서는 ttl/limit 모델, 다중 제한, 라우트 데코레이터, 분산 Redis 스토리지, 프록시 뒤 실제 IP 추출, 인증 엔드포인트 강화를 다룬다.

> throttler는 "속도"만 막는다. 값 검증은 nestjs-validation, 신원 확인은 nestjs-auth 소관. rate limit은 인증 이전 계층에서 무차별 시도 자체를 줄이는 장치다.

## 목차
- [설치와 ttl/limit 모델](#설치와-ttllimit-모델)
- [전역 가드 등록](#전역-가드-등록)
- [다중 제한(named throttlers)](#다중-제한named-throttlers)
- [라우트별 데코레이터](#라우트별-데코레이터)
- [분산 환경: Redis 스토리지](#분산-환경-redis-스토리지)
- [프록시 뒤 실제 IP 처리](#프록시-뒤-실제-ip-처리)
- [인증 엔드포인트 강화](#인증-엔드포인트-강화)
- [흔한 실수](#흔한-실수)

## 설치와 ttl/limit 모델

```bash
pnpm add @nestjs/throttler
```

throttler v6 기준으로 **`ttl`은 밀리초 단위**다(v5 이전의 초 단위와 다르다). 실수를 막기 위해 `seconds()`/`minutes()`/`hours()` 헬퍼를 쓴다.

```typescript
import { seconds, minutes } from '@nestjs/throttler';

seconds(60); // 60000
minutes(1);  // 60000
```

- `ttl`: 시간 창의 길이(윈도우).
- `limit`: 그 창 안에서 허용하는 최대 요청 수.
- 예: `{ ttl: seconds(60), limit: 100 }` = "60초당 100회".

## 전역 가드 등록

`APP_GUARD`로 `ThrottlerGuard`를 등록하면 모든 라우트에 기본 적용된다.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 100 }]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
```

한도 초과 시 throttler가 `429 Too Many Requests`를 던진다. `setHeaders: true`(전역 옵션)로 `X-RateLimit-*` 응답 헤더를 노출할 수 있다.

## 다중 제한(named throttlers)

이름을 붙여 서로 다른 창을 동시에 건다. "초당 폭주"와 "분당 총량"을 함께 막을 때 유용하다.

```typescript
ThrottlerModule.forRoot([
  { name: 'short', ttl: seconds(1), limit: 3 },   // 순간 폭주 차단
  { name: 'medium', ttl: seconds(10), limit: 20 },
  { name: 'long', ttl: minutes(1), limit: 100 },  // 지속적 남용 차단
]);
```

세 제한이 **모두** 적용된다 — 초당 3회를 넘거나 분당 100회를 넘으면 차단.

## 라우트별 데코레이터

```typescript
import { Throttle, SkipThrottle, seconds } from '@nestjs/throttler';

@Controller('api')
export class ApiController {
  // 특정 named throttler만 재정의
  @Throttle({ short: { limit: 1, ttl: seconds(1) } })
  @Post('expensive')
  expensive() {}

  // 전체 제한 제외(헬스체크·웹훅 등)
  @SkipThrottle()
  @Get('health')
  health() {}

  // 특정 named throttler만 제외
  @SkipThrottle({ short: true })
  @Get('feed')
  feed() {}
}
```

`@Throttle`/`@SkipThrottle`는 컨트롤러 클래스에도 붙여 전체 라우트에 적용할 수 있다.

## 분산 환경: Redis 스토리지

기본 스토리지는 **인메모리**라 인스턴스마다 카운터가 독립적이다. 인스턴스가 3개면 실질 한도가 3배로 뚫린다. 수평 확장 환경에서는 공유 스토리지가 필수다.

```bash
pnpm add @nest-lab/throttler-storage-redis ioredis
```

```typescript
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

ThrottlerModule.forRoot({
  throttlers: [{ ttl: seconds(60), limit: 100 }],
  storage: new ThrottlerStorageRedisService(
    new Redis({ host: process.env.REDIS_HOST, port: 6379 }),
  ),
});
```

- Redis 연결 정보는 nestjs-config로 주입한다.
- `forRootAsync`를 쓰면 `ConfigService`에서 값을 읽어 스토리지를 구성할 수 있다.

## 프록시 뒤 실제 IP 처리

throttler는 기본적으로 `req.ip`로 클라이언트를 식별한다. 로드밸런서·리버스 프록시(Nginx, ALB, Cloudflare) 뒤에서는 `req.ip`가 **프록시 IP로 고정**되어 모든 사용자가 하나의 버킷을 공유한다 — 정상 트래픽이 서로를 밀어내 429가 터진다.

### 1) trust proxy를 신뢰 홉 수로 설정

```typescript
// main.ts — Express 어댑터
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('trust proxy', 1); // 앞단 프록시 1홉만 신뢰
```

- **`trust proxy`를 `true`로 두지 않는다.** `true`는 `X-Forwarded-For` 전체를 신뢰하므로, 클라이언트가 헤더를 위조해 매 요청 IP를 바꿔 rate limit을 무력화할 수 있다.
- 신뢰할 프록시 홉 수(또는 프록시의 신뢰 대역)만 지정해야, 위조된 앞쪽 항목을 무시하고 **프록시가 덧붙인 실제 클라이언트 IP**를 얻는다.

### 2) getTracker로 추적 키 커스터마이즈

프록시 체인이 복잡하거나 인증 사용자를 IP 대신 사용자 ID로 추적하려면 `getTracker`를 재정의한다.

```typescript
ThrottlerModule.forRoot({
  throttlers: [{ ttl: seconds(60), limit: 100 }],
  // 로그인 사용자는 userId로, 익명은 검증된 req.ip로 추적
  getTracker: (req) => req.user?.id ?? req.ip,
});
```

`getTracker` 안에서 `req.headers['x-forwarded-for']`의 첫 항목을 그대로 신뢰하지 않는다 — 반드시 검증된 `req.ip`(위 trust proxy 전제)를 쓴다.

## 인증 엔드포인트 강화

로그인·회원가입·비밀번호 재설정·OTP 검증은 브루트포스의 표적이다. 전역 제한보다 훨씬 빡빡하게 건다.

```typescript
@Controller('auth')
export class AuthController {
  @Throttle({ default: { limit: 5, ttl: minutes(1) } }) // 분당 5회
  @Post('login')
  login(@Body() dto: LoginDto) {}

  @Throttle({ default: { limit: 3, ttl: minutes(10) } }) // 10분당 3회
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {}
}
```

- IP 기반 제한은 우회 가능하므로 **계정(이메일) 단위 잠금**과 병행한다(연속 실패 시 지연·잠금). 계정 잠금 로직 자체는 nestjs-auth에서 구현한다.
- CAPTCHA·지수 백오프를 함께 적용하면 방어가 견고해진다.

## 흔한 실수

- **ttl을 초로 착각** — v6는 밀리초다. `ttl: 60`은 60초가 아니라 0.06초. 항상 `seconds()`/`minutes()`를 쓴다.
- **인메모리 스토리지로 다중 인스턴스 운영** — 한도가 인스턴스 수만큼 뚫린다. Redis 스토리지로.
- **프록시 뒤 `req.ip` 미보정** — 전체 사용자가 프록시 IP 한 버킷을 공유. trust proxy를 신뢰 홉 수로 설정.
- **`trust proxy: true`** — `X-Forwarded-For` 위조로 우회 가능. 홉 수/신뢰 대역으로 제한.
- **로그인에 전역 제한만 적용** — 분당 100회면 브루트포스에 무력. 인증 엔드포인트는 별도 강화 + 계정 잠금.
