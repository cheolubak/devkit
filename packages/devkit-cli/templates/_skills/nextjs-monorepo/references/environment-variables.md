# 모노레포 환경변수 관리

## 환경변수 파일 구조

```
my-monorepo/
├── .env                     # 공통 환경변수 (모든 패키지에서 접근)
├── .env.local               # 공통 로컬 오버라이드 (gitignore)
├── apps/
│   ├── web/
│   │   ├── .env             # web 앱 전용 환경변수
│   │   └── .env.local       # web 앱 로컬 오버라이드 (gitignore)
│   └── admin/
│       ├── .env             # admin 앱 전용 환경변수
│       └── .env.local       # admin 앱 로컬 오버라이드 (gitignore)
└── .gitignore               # *.local 파일 제외
```

### .env 로드 우선순위 (Next.js)

1. `process.env` (시스템 환경변수)
2. `.env.$(NODE_ENV).local` (예: `.env.development.local`)
3. `.env.local`
4. `.env.$(NODE_ENV)` (예: `.env.development`)
5. `.env`

**주의:** Next.js는 앱 디렉토리의 `.env` 파일만 자동 로드한다. 루트 `.env`는 자동 로드되지 않으므로, 루트에 두려면 `dotenv`를 직접 설정하거나 앱별로 복사해야 한다.

## turbo.json 환경변수 설정

Turborepo 캐시는 환경변수 값이 달라지면 캐시를 무효화한다. 이를 위해 task에 사용되는 환경변수를 선언해야 한다.

### env — task별 환경변수

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"],
      "env": [
        "DATABASE_URL",
        "NEXT_PUBLIC_API_URL",
        "NEXT_PUBLIC_SITE_URL"
      ]
    },
    "test": {
      "env": ["DATABASE_URL", "TEST_DATABASE_URL"]
    }
  }
}
```

이 환경변수의 값이 변경되면 해당 task의 캐시가 무효화된다.

### globalEnv — 모든 task에 영향

```json
{
  "globalEnv": ["CI", "NODE_ENV"],
  "tasks": { ... }
}
```

`globalEnv`에 선언된 환경변수가 변경되면 모든 task의 캐시가 무효화된다.

### globalDependencies — 파일 기반

```json
{
  "globalDependencies": [
    "**/.env.*local",
    ".env"
  ]
}
```

이 파일의 내용이 변경되면 모든 task의 캐시가 무효화된다.

### passThroughEnv — 캐시에 영향 없이 전달

```json
{
  "tasks": {
    "build": {
      "passThroughEnv": ["AWS_REGION", "SENTRY_DSN"]
    }
  }
}
```

캐시 키에는 포함되지 않지만 task 실행 시 접근 가능하다. 빌드 결과에 영향을 주지 않는 환경변수에 사용한다 (에러 추적 DSN, 로깅 설정 등).

## Next.js 환경변수 규칙

### NEXT_PUBLIC_ 접두사

```bash
# 서버 전용 (Server Components, Server Actions, API Routes)
DATABASE_URL=postgresql://...
AUTH_SECRET=my-secret

# 클라이언트에서도 접근 가능 (브라우저에 노출됨!)
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SITE_URL=https://example.com
```

**주의:** `NEXT_PUBLIC_` 접두사 없는 환경변수는 절대 클라이언트 번들에 포함되지 않는다. 서버에서만 접근 가능하다.

### 모노레포에서의 주의점

각 앱은 독립적인 Next.js 인스턴스이므로 같은 환경변수 이름이라도 앱별로 다른 값을 가질 수 있다:

```bash
# apps/web/.env
NEXT_PUBLIC_API_URL=https://api.example.com

# apps/admin/.env
NEXT_PUBLIC_API_URL=https://admin-api.example.com
```

## 환경변수 공유 패턴 — @repo/env

### t3-env 패턴 (Zod 검증)

```bash
pnpm add @t3-oss/env-nextjs zod --filter @repo/env
```

```json
// packages/env/package.json
{
  "name": "@repo/env",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@t3-oss/env-nextjs": "^0.11.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

### 환경변수 스키마 정의

```typescript
// packages/env/src/index.ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  // 서버 전용 환경변수
  server: {
    DATABASE_URL: z.url(),
    AUTH_SECRET: z.string().min(32),
    REDIS_URL: z.url().optional(),
  },

  // 클라이언트 환경변수 (NEXT_PUBLIC_ 접두사 필수)
  client: {
    NEXT_PUBLIC_API_URL: z.url(),
    NEXT_PUBLIC_SITE_URL: z.url(),
  },

  // 런타임 값 매핑
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    REDIS_URL: process.env.REDIS_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
});
```

### 앱에서 사용

```typescript
// apps/web/app/actions/user.ts
import { env } from '@repo/env';

export async function getUsers() {
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/users`);
  return res.json();
}
```

앱의 `next.config.ts`에 transpile 추가:

```typescript
const nextConfig: NextConfig = {
  transpilePackages: ['@repo/env'],
};
```

### 앱별 환경변수 확장

공통 환경변수 외에 앱 전용 변수가 필요한 경우:

```typescript
// apps/web/lib/env.ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';
import { env as sharedEnv } from '@repo/env';

export const env = {
  ...sharedEnv,
  ...createEnv({
    server: {
      STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
    },
    client: {
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
    },
    runtimeEnv: {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    },
  }),
};
```

## .gitignore 설정

```gitignore
# 환경변수 (루트 .gitignore에서 관리)
.env*.local
.env.development
.env.production

# 유지할 파일
!.env.example
```

## 체크리스트

- [ ] 앱별 `.env.local`이 `.gitignore`에 포함
- [ ] `turbo.json`의 `env` 필드에 빌드에 영향을 주는 환경변수 선언
- [ ] `NEXT_PUBLIC_` 접두사로 클라이언트/서버 구분
- [ ] 민감한 환경변수가 `NEXT_PUBLIC_` 접두사로 노출되지 않는지 확인
- [ ] CI/CD에서 환경변수가 올바르게 설정되었는지 확인
- [ ] `.env.example` 파일로 필요한 환경변수 목록 문서화
