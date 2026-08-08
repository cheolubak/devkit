---
name: nextjs-deployment
description: "Next.js 배포 패턴. Docker standalone 빌드, Vercel 설정, GitHub Actions CI/CD, 환경변수 관리, 모니터링, 헬스체크.\nAPPLIES: Next.js 앱을 Docker/Vercel로 빌드·배포하거나 CI 파이프라인·환경변수를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"배포해줘\", \"Docker 설정\", \"Vercel 배포\", \"CI/CD\", \"GitHub Actions\", \"빌드 설정\", \"환경변수 관리\", \"프로덕션 배포\", \"Dockerfile\", Next.js 프로젝트 배포/인프라 설정 시.\nSKIP: NestJS 백엔드 배포(Docker·PM2·헬스체크)는 nestjs-deployment. 모노레포 빌드 파이프라인은 nextjs-monorepo."
---

# Next.js 배포 가이드

## Docker 배포 (Self-hosted)

### next.config.ts - Standalone 설정

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // 필수: 독립 실행 파일 생성
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.example.com" },
    ],
  },
};

export default nextConfig;
```

### Dockerfile (멀티스테이지)

```dockerfile
# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 빌드 시점 환경변수 (NEXT_PUBLIC_*)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone 출력 복사
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

### .dockerignore

```
node_modules
.next
.git
*.md
.env*.local
```

### docker-compose.yml

```yaml
services:
  app:
    build:
      context: .
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

## 환경변수 관리

### 구분

| 변수 유형 | 접근 가능 | 설정 위치 |
|-----------|-----------|-----------|
| `NEXT_PUBLIC_*` | 서버 + 클라이언트 | 빌드 시점 (ARG) |
| 일반 변수 | 서버만 | 런타임 (env_file) |

### 환경별 파일

```text
.env                  # 기본값 (Git 커밋 가능)
.env.local            # 로컬 오버라이드 (.gitignore)
.env.development      # pnpm dev 시 자동 로드
.env.production       # pnpm build 시 자동 로드
.env.production.local # 프로덕션 시크릿 (.gitignore)
```

### 타입 안전 환경변수

```typescript
// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.url(),
  NEXT_PUBLIC_API_URL: z.url(),
});

export const env = envSchema.parse(process.env);

// 사용
import { env } from "@/lib/env";
const db = new Database(env.DATABASE_URL);
```

## 헬스체크 API

```typescript
// app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // DB 연결 확인 등 필요한 체크
    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy" },
      { status: 503 }
    );
  }
}
```

## GitHub Actions CI/CD

### .github/workflows/deploy.yml

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test

  build-and-push:
    needs: lint-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL }}
```

## Vercel 배포

### vercel.json

```json
{
  "framework": "nextjs",
  "regions": ["icn1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/api/proxy/:path*", "destination": "https://api.example.com/:path*" }
  ]
}
```

## 에러 모니터링 (Sentry)

> **전체 관측성(로그·메트릭·분산 트레이스)**이 필요하면 **grafana-observability** 스킬을 참조하세요. OpenTelemetry로 Next.js/NestJS를 계측하고 Grafana LGTM 스택(Loki·Tempo·Prometheus)으로 수집합니다. 아래 Sentry는 에러 추적에 특화된 가벼운 선택지입니다.

### 설치 및 설정

```bash
pnpx @sentry/wizard@latest -i nextjs
```

### sentry.client.config.ts

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
  ],
});
```

### app/global-error.tsx

```tsx
"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
```

## 캐싱 헤더 설정

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|png|webp|avif)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};
```

## 배포 전 체크리스트

1. **`output: "standalone"` 설정** (Docker 배포 시)
2. **환경변수 검증** (`zod`로 빌드 시점에 검증)
3. **`NEXT_PUBLIC_*` 빌드 시점 주입** (Docker ARG)
4. **헬스체크 엔드포인트** (`/api/health`)
5. **보안 헤더** (`X-Content-Type-Options`, `X-Frame-Options`)
6. **이미지 최적화** (`next/image` + `remotePatterns`)
7. **에러 모니터링** (Sentry 또는 동등 도구)
8. **번들 분석** (`pnpm add -D @next/bundle-analyzer`)
9. **Lighthouse 성능 점수** (90+ 목표)
10. **`.env.production.local`이 `.gitignore`에 포함**

## 자주 하는 실수

1. **standalone 없이 Docker 빌드** - node_modules 전체 복사로 이미지 크기 폭증
2. **`NEXT_PUBLIC_*`를 런타임에 설정** - 빌드 시점에 인라인되므로 ARG로 전달 필수
3. **HOSTNAME 미설정** - Docker에서 `0.0.0.0` 바인딩 필수
4. **`.env.local`을 Git에 커밋** - 시크릿 노출 위험
5. **캐시 헤더 미설정** - 정적 에셋에 `immutable` 캐시 적용
6. **프로덕션에서 devtools 활성화** - `NODE_ENV=production` 확인
