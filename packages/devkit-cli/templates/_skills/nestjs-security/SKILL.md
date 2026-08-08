---
name: nestjs-security
description: "NestJS 보안 하드닝. helmet 보안 헤더, CORS 화이트리스트, @nestjs/throttler rate limiting, 페이로드 크기 제한, 프로덕션 보안 체크리스트.\nAPPLIES: NestJS에 helmet·CORS·throttler·페이로드 제한 등 보안 미들웨어를 붙이거나 점검할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"보안 설정\", \"rate limiting\", \"요청 제한\", \"속도 제한\", \"throttler\", \"helmet\", \"보안 헤더\", \"CORS 설정\", \"DDoS 방어\", \"API 보안\", NestJS 백엔드 보안 강화 시.\nSKIP: 인증/인가(JWT·Guard·Passport)는 nestjs-auth. DTO 입력값 검증은 nestjs-validation. 환경변수·시크릿 저장은 nestjs-config."
version: 1.0.0
---

# NestJS 보안 하드닝 (Security Hardening)

> 참조:
> - [references/rate-limiting.md](references/rate-limiting.md) - @nestjs/throttler 상세: ttl/limit, 다중 제한, 라우트 데코레이터, Redis 스토리지, 프록시/IP 처리, 인증 엔드포인트 강화 **CRITICAL**
> - [references/headers-cors.md](references/headers-cors.md) - helmet 헤더/CSP, CORS 세부(preflight·credentials·다중 origin), 페이로드 제한, 프로덕션 보안 체크리스트

## 이 스킬의 경계

이 스킬은 **전송·헤더·속도 계층**의 방어를 다룬다. 즉 "누가 얼마나 빠르게, 어떤 출처에서, 어떤 헤더를 달고, 얼마나 큰 몸통으로 들어오는가"를 통제한다. 값 자체의 형식·범위 검증은 여기 소관이 아니다.

| 관심사 | 담당 스킬 |
|--------|-----------|
| 요청 값 검증(`class-validator`, 화이트리스트 DTO) | nestjs-validation |
| 인증·인가(JWT, Guard, Passport, RBAC) | nestjs-auth |
| 시크릿·환경변수 저장(`ConfigModule`, `.env`) | nestjs-config |
| **보안 헤더·CORS·rate limit·페이로드 크기** | **이 스킬** |

> 보안은 계층 방어(defense in depth)다. throttler 하나로 끝나지 않는다. 헤더·출처·속도·크기를 각각 막고, 그 위에 인증과 값 검증을 얹는다.

## 핵심 원칙

1. **기본값을 거부로.** CORS origin·throttle·페이로드 크기는 명시적 화이트리스트/상한으로 시작한다. "일단 다 열고 나중에 조인다"는 프로덕션까지 그대로 새어 나간다.
2. **신뢰 경계를 명확히.** 프록시(ALB, Nginx, Cloudflare) 뒤에서는 클라이언트가 보낸 `X-Forwarded-For`를 함부로 믿으면 안 된다. 신뢰할 프록시 홉 수만 신뢰한다.
3. **세부를 숨긴다.** 프로덕션에서 스택 트레이스·프레임워크 버전·내부 에러 메시지를 응답에 노출하지 않는다.

## helmet: 보안 헤더

`helmet`은 여러 보안 관련 HTTP 응답 헤더를 한 번에 설정한다(HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy 등).

```typescript
// main.ts
import helmet from 'helmet';

const app = await NestFactory.create(AppModule);
app.use(helmet());
```

- **CSP(Content-Security-Policy) 주의.** helmet은 기본으로 엄격한 CSP를 켠다. Swagger UI·인라인 스크립트가 있는 페이지가 깨질 수 있다. API 전용 서버는 `contentSecurityPolicy: false`로 끄거나 `directives`를 조정한다(headers-cors 참조).
- Fastify 어댑터는 `app.use` 대신 `@fastify/helmet`을 등록한다.

## CORS: 출처 화이트리스트

```typescript
// ✕ 와일드카드 + credentials — 브라우저가 거부하고, 열면 CSRF/토큰 탈취 위험
app.enableCors({ origin: '*', credentials: true });

// ○ 명시적 화이트리스트 + credentials
app.enableCors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
});
```

- `origin: '*'`와 `credentials: true`는 **함께 쓸 수 없다**(스펙상 브라우저가 차단). 쿠키·인증 헤더를 주고받으려면 반드시 구체적 origin 목록.
- 환경별 origin 목록은 nestjs-config로 주입한다(하드코딩 금지).

## @nestjs/throttler: rate limiting

throttler v6는 **ttl을 밀리초**로 받고 `seconds()`/`minutes()` 헬퍼를 제공한다. 배열로 여러 제한을 동시에 건다.

```typescript
// app.module.ts
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'short', ttl: seconds(1), limit: 3 },   // 초당 3회
      { name: 'long', ttl: seconds(60), limit: 100 }, // 분당 100회
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }], // 전역 적용
})
export class AppModule {}
```

라우트별 조정:

```typescript
// 키는 forRoot에 등록한 이름과 같아야 한다. 위에서 short/long으로 등록했으므로 그 이름을 쓴다.
@Throttle({ short: { limit: 1, ttl: seconds(1) }, long: { limit: 5, ttl: seconds(60) } })
@Post('login')
login() {}

@SkipThrottle() // 헬스체크는 제외
@Get('health')
health() {}
```

> `@Throttle`의 키는 **`forRoot`에 등록한 이름과 일치해야 한다.** 등록하지 않은 이름(예: 관례적으로 쓰는 `default`)을 주면 `ThrottlerGuard`가 그 메타데이터를 조회하지 않아 **조용히 무시되고** 전역 제한만 적용된다. 에러도 경고도 없이 로그인 강화 설정만 사라지므로, 브루트포스 방어를 넣었다고 착각하기 쉽다. 이름을 바꿀 때는 `forRoot`와 `@Throttle` 양쪽을 함께 고쳐라.

- **분산 환경에서는 반드시 공유 스토리지.** 인메모리 기본 스토리지는 인스턴스마다 카운터가 따로 논다. `@nest-lab/throttler-storage-redis`로 Redis를 붙인다(rate-limiting 참조).
- **인증 엔드포인트(login, 비밀번호 재설정)는 더 빡빡하게.** 브루트포스 방어의 핵심 지점.

## 페이로드 크기 제한

무제한 body는 메모리 고갈(DoS) 벡터다. `json`/`urlencoded` 파서에 상한을 건다.

```typescript
// main.ts — Express 어댑터
import { json, urlencoded } from 'express';

app.use(json({ limit: '1mb' }));
app.use(urlencoded({ extended: true, limit: '1mb' }));
```

- 파일 업로드 라우트는 별도로 Multer `limits.fileSize`를 건다.
- 상한 초과 시 413(Payload Too Large)로 조기 차단 — 컨트롤러·검증까지 도달하지 않는다.

## 프로덕션 보안 체크리스트

| 항목 | 조치 |
|------|------|
| HTTPS/HSTS | TLS 종단 뒤 helmet HSTS 헤더 유지, HTTP→HTTPS 리다이렉트 |
| 에러 스택 노출 | 프로덕션에서 스택 트레이스·내부 메시지 숨김, 500은 일반 메시지로 |
| CORS | origin 화이트리스트, `*`+credentials 금지 |
| rate limit | 전역 throttler + 인증 엔드포인트 강화 + 분산 시 Redis |
| 페이로드 | json/urlencoded/파일 업로드 상한 |
| 프록시 IP | trust proxy를 신뢰 홉 수로, `X-Forwarded-For` 맹신 금지 |
| 의존성 취약점 | `pnpm audit` CI 게이트, 정기 업데이트 |
| 시크릿 | 코드/이미지에 하드코딩 금지 → nestjs-config |

## 흔한 실수

- **프록시 뒤에서 모든 요청이 같은 IP로 카운트** — `req.ip`가 로드밸런서 IP로 고정돼 전체 사용자가 하나의 버킷을 공유한다. trust proxy 설정 + `getTracker`로 실제 클라이언트 IP를 잡는다(rate-limiting 참조).
- **CORS 전체 허용(`origin: '*'`)을 프로덕션까지 방치** — 개발 편의로 열어둔 게 그대로 배포된다. 환경별 화이트리스트로.
- **helmet 미적용** — 클릭재킹·MIME 스니핑·정보 노출 헤더가 무방비. `app.use(helmet())` 한 줄로 대부분 방어.
- **페이로드 무제한** — 거대한 JSON 하나로 이벤트 루프·메모리를 막을 수 있다. 파서 `limit` 필수.
- **trust proxy를 `true`로 통째 신뢰** — 클라이언트가 `X-Forwarded-For`를 위조해 IP를 무한히 바꿔 rate limit을 우회한다. 신뢰할 프록시 홉 수만 지정한다(headers-cors 참조).

세부 구성과 스토리지·프록시 처리는 → [references/rate-limiting.md](references/rate-limiting.md), 헤더·CSP·CORS·체크리스트는 → [references/headers-cors.md](references/headers-cors.md).
