# 보안 헤더 · CORS · 페이로드 · 프로덕션 체크리스트

helmet으로 응답 헤더를 굳히고, CORS로 출처를 통제하고, 페이로드 크기를 제한하고, 프로덕션 배포 전 보안 항목을 점검한다. 이 문서는 그 네 가지의 세부를 다룬다.

> 값 검증은 nestjs-validation, 시크릿·환경변수는 nestjs-config 소관. 여기서는 헤더·출처·전송 크기 계층만 다룬다.

## 목차
- [helmet 보안 헤더](#helmet-보안-헤더)
- [CSP 조정](#csp-조정)
- [CORS 세부 설정](#cors-세부-설정)
- [페이로드 크기 제한](#페이로드-크기-제한)
- [에러 노출 차단](#에러-노출-차단)
- [프로덕션 보안 체크리스트](#프로덕션-보안-체크리스트)

## helmet 보안 헤더

`helmet`은 여러 방어 헤더를 한 번에 설정한다.

```typescript
// main.ts
import helmet from 'helmet';

const app = await NestFactory.create(AppModule);
app.use(helmet());
```

| 헤더 | 방어 대상 |
|------|-----------|
| `Strict-Transport-Security`(HSTS) | HTTP 다운그레이드, 중간자 공격 |
| `X-Content-Type-Options: nosniff` | MIME 타입 스니핑 |
| `X-Frame-Options` / CSP `frame-ancestors` | 클릭재킹(iframe 삽입) |
| `Referrer-Policy` | Referer로 내부 URL 유출 |
| `Content-Security-Policy` | XSS, 리소스 인젝션 |

Fastify 어댑터에서는 `@fastify/helmet`을 등록한다.

```typescript
import fastifyHelmet from '@fastify/helmet';
await app.register(fastifyHelmet);
```

## CSP 조정

helmet은 기본으로 엄격한 CSP를 켠다. 인라인 스크립트·외부 리소스를 쓰는 페이지(Swagger UI 등)가 깨질 수 있다.

```typescript
// ✕ 문제 회피용으로 CSP를 통째로 끄지 않는다 (XSS 방어 상실)
app.use(helmet({ contentSecurityPolicy: false }));

// ○ 필요한 출처만 명시적으로 허용
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
);
```

- **순수 JSON API 서버**(브라우저가 직접 렌더링하지 않음)는 CSP를 꺼도 실질 위험이 낮다. 다만 Swagger 같은 정적 페이지를 서빙한다면 위처럼 조정하는 편이 안전하다.
- `'unsafe-inline'`·`'unsafe-eval'`은 XSS 방어를 무력화하므로 최후의 수단으로만.

## CORS 세부 설정

```typescript
app.enableCors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  credentials: true,                                  // 쿠키·인증 헤더 허용
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,                                       // preflight 캐시(초)
});
```

### 와일드카드 + credentials 금지

```typescript
// ✕ 스펙 위반 — 브라우저가 credentials 요청을 차단하고, 열리면 CSRF 노출
app.enableCors({ origin: '*', credentials: true });
```

`origin: '*'`와 `credentials: true`는 함께 쓸 수 없다. 인증 정보를 주고받으려면 구체적 origin 목록이 필수다.

### 동적 다중 origin

서브도메인·환경별 목록을 함수로 검증한다.

```typescript
const allowlist = new Set([
  'https://app.example.com',
  'https://staging.example.com',
]);

app.enableCors({
  origin: (origin, callback) => {
    // origin이 없는 경우(서버-서버, 모바일 앱)는 정책에 따라 허용/거부
    if (!origin || allowlist.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
});
```

- **preflight(OPTIONS)**: 브라우저가 실제 요청 전에 보내는 사전 요청. NestJS `enableCors`가 자동 처리하지만, 커스텀 미들웨어·프록시가 OPTIONS를 가로채지 않도록 주의한다.
- origin 목록은 nestjs-config로 주입한다(환경별 분리, 하드코딩 금지).

## 페이로드 크기 제한

무제한 body는 메모리 고갈 DoS 벡터다. 파서에 상한을 건다.

```typescript
// main.ts — Express 어댑터
import { json, urlencoded } from 'express';

app.use(json({ limit: '1mb' }));
app.use(urlencoded({ extended: true, limit: '1mb' }));
```

Fastify 어댑터는 생성 시 `bodyLimit`을 준다.

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ bodyLimit: 1_048_576 }), // 1MB
);
```

- 파일 업로드는 별도 정책: Multer `limits.fileSize`로 상한, 허용 MIME 화이트리스트.
- 상한 초과는 `413 Payload Too Large`로 조기 차단 — 검증·비즈니스 로직에 도달하기 전.
- 큰 페이로드가 필요한 특정 라우트만 상한을 높이고, 전역 기본은 낮게 유지한다.

## 에러 노출 차단

프로덕션 응답에 스택 트레이스·내부 메시지·프레임워크 버전이 새면 공격자에게 지도를 넘기는 셈이다.

```typescript
// 전역 예외 필터에서 환경에 따라 노출 분기 (구현 상세는 nestjs-error-handling)
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const isProd = process.env.NODE_ENV === 'production';
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const body = {
      statusCode: status,
      message:
        status >= 500 && isProd
          ? 'Internal server error'          // 세부 숨김
          : (exception as Error).message,
    };
    // 스택은 로그로만, 응답 본문에는 절대 싣지 않는다
  }
}
```

- `X-Powered-By` 등 프레임워크 노출 헤더를 제거한다(helmet이 대부분 처리, Express는 `app.disable('x-powered-by')`).
- 예외 필터의 계층별 매핑·커스텀 예외 구현은 nestjs-error-handling 참조.

## 프로덕션 보안 체크리스트

| 항목 | 조치 | 담당 |
|------|------|------|
| HTTPS/HSTS | TLS 종단, HSTS 헤더 유지, HTTP→HTTPS 리다이렉트 | 이 스킬 / 인프라 |
| 보안 헤더 | `helmet()` 적용, CSP 조정 | 이 스킬 |
| CORS | origin 화이트리스트, `*`+credentials 금지 | 이 스킬 |
| rate limit | 전역 throttler + 인증 강화 + 분산 시 Redis | 이 스킬(rate-limiting) |
| 페이로드 | json/urlencoded/파일 업로드 상한 | 이 스킬 |
| 프록시 IP | trust proxy를 신뢰 홉 수로 | 이 스킬(rate-limiting) |
| 에러 노출 | 프로덕션 스택 트레이스·세부 메시지 숨김 | nestjs-error-handling |
| 값 검증 | 화이트리스트 DTO, `forbidNonWhitelisted` | nestjs-validation |
| 인증·인가 | JWT·Guard·RBAC | nestjs-auth |
| 시크릿 | 코드/이미지 하드코딩 금지, 환경변수 주입 | nestjs-config |
| 의존성 취약점 | `pnpm audit` CI 게이트, 정기 업데이트 | 이 스킬 / CI |

> 체크리스트는 계층 방어의 목록이다. 어느 한 줄도 다른 줄을 대체하지 못한다 — helmet이 있어도 CORS가 뚫려 있으면 뚫린다.
