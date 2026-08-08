# 모노레포 배포 전략

## Vercel 배포

### 앱별 프로젝트 설정

Vercel에서 모노레포의 각 앱을 별도 프로젝트로 배포한다.

1. Vercel 대시보드에서 "Import Project"
2. Git 저장소 연결
3. **Root Directory** 설정: `apps/web` (앱마다 다르게)
4. Framework Preset: `Next.js`
5. Build Command: `cd ../.. && turbo build --filter @repo/web`
6. Install Command: `pnpm install`

### vercel.json (앱별)

```json
// apps/web/vercel.json
{
  "installCommand": "pnpm install",
  "buildCommand": "cd ../.. && turbo build --filter @repo/web"
}
```

### Vercel 원격 캐시 연동

Vercel에 배포하면 Turborepo 원격 캐시가 자동으로 활성화된다. 로컬 개발에서도 사용하려면:

```bash
turbo login
turbo link
```

### Ignored Build Step (변경 감지)

Vercel은 모노레포에서 관련 파일이 변경된 경우에만 빌드를 실행하도록 설정할 수 있다:

```bash
# Vercel 대시보드 > Settings > Git > Ignored Build Step
npx turbo-ignore
```

`turbo-ignore`는 현재 앱과 관련된 파일이 변경되었는지 확인하여 빌드 스킵 여부를 결정한다.

## Docker 배포

### 멀티스테이지 Dockerfile

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

# ---- 의존성 트리 축소 ----
FROM base AS pruner
WORKDIR /app
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @repo/web --docker

# ---- 의존성 설치 ----
FROM base AS installer
WORKDIR /app

# pruned 결과의 lockfile로 설치 (캐시 효율화)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

# 소스 코드 복사 및 빌드
COPY --from=pruner /app/out/full/ .
RUN turbo build --filter @repo/web

# ---- 프로덕션 이미지 ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone 출력 복사
COPY --from=installer /app/apps/web/.next/standalone ./
COPY --from=installer /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
```

### Next.js standalone 설정

Docker 배포 시 `output: 'standalone'` 설정이 필요하다:

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@repo/ui', '@repo/utils'],
  // standalone 모드에서 모노레포 루트를 올바르게 설정
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
};

export default nextConfig;
```

`outputFileTracingRoot`는 모노레포 루트를 가리켜야 한다. 이 설정 없이는 공유 패키지의 파일이 standalone 출력에 포함되지 않는다.

### turbo prune

`turbo prune`은 특정 앱에 필요한 파일만 추출하여 Docker 빌드 컨텍스트를 최소화한다:

```bash
turbo prune @repo/web --docker
```

결과물 구조:
```
out/
├── json/                    # package.json, tsconfig만 포함 (의존성 설치용)
├── full/                    # 전체 소스 코드
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

이렇게 분리하면 Docker 레이어 캐싱이 효율적으로 작동한다:
- `json/` 레이어: package.json이 변경되지 않으면 `pnpm install` 스킵
- `full/` 레이어: 소스 변경 시에만 빌드 재실행

### docker-compose

```yaml
# docker-compose.yml
services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/mydb
      - NEXT_PUBLIC_API_URL=http://localhost:3000/api
    depends_on:
      - db

  admin:
    build:
      context: .
      dockerfile: apps/admin/Dockerfile
    ports:
      - "3001:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  pgdata:
```

## GitHub Actions CI/CD

### 전체 워크플로우

```yaml
# .github/workflows/ci.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      # Turborepo 캐시 복원
      - uses: actions/cache@v4
        with:
          # Turborepo 2.x는 .turbo/cache, 1.x는 node_modules/.cache/turbo를 쓴다.
          # 둘 다 지정해 두면 버전을 올려도 캐시가 조용히 미스되지 않는다.
          path: |
            .turbo/cache
            node_modules/.cache/turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
            turbo-${{ runner.os }}-

      - run: turbo build lint test type-check

  deploy-web:
    needs: ci
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      # Docker 빌드 및 푸시
      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/web:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### PR에서 변경된 앱만 테스트

```yaml
  ci:
    runs-on: ubuntu-latest
    steps:
      # ...

      # main 이후 변경된 패키지만 빌드/테스트
      - run: turbo build test --filter=...[origin/main]
```

### 앱별 배포 분기

```yaml
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.changes.outputs.web }}
      admin: ${{ steps.changes.outputs.admin }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: changes
        with:
          filters: |
            web:
              - 'apps/web/**'
              - 'packages/**'
            admin:
              - 'apps/admin/**'
              - 'packages/**'

  deploy-web:
    needs: [ci, detect-changes]
    if: needs.detect-changes.outputs.web == 'true' && github.ref == 'refs/heads/main'
    # ...

  deploy-admin:
    needs: [ci, detect-changes]
    if: needs.detect-changes.outputs.admin == 'true' && github.ref == 'refs/heads/main'
    # ...
```

## 빌드 최적화

### turbo prune으로 의존성 축소

```bash
# CI에서 특정 앱의 의존성만 설치
turbo prune @repo/web --docker
cd out
pnpm install --frozen-lockfile
turbo build --filter @repo/web
```

### Next.js standalone 출력

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: 'standalone',
};
```

standalone 출력은 `node_modules`에서 필요한 파일만 추출하여 경량 프로덕션 이미지를 생성한다.

### 빌드 시간 최적화 팁

1. **원격 캐시 활용** — 팀원 간, CI 간 빌드 캐시 공유
2. **--filter 사용** — 변경된 패키지만 빌드
3. **Internal Package 방식** — 라이브러리 빌드 단계 제거
4. **Docker 레이어 캐싱** — `turbo prune --docker`로 최적화
5. **병렬 실행** — Turborepo가 자동으로 병렬 처리

## 체크리스트

- [ ] Docker 배포 시 `output: 'standalone'` 설정
- [ ] Docker 배포 시 `outputFileTracingRoot` 모노레포 루트로 설정
- [ ] Vercel 배포 시 앱별 Root Directory 설정
- [ ] CI에서 `pnpm install --frozen-lockfile` 사용
- [ ] CI에서 Turborepo 캐시 복원 설정
- [ ] 변경 감지로 불필요한 배포 방지
