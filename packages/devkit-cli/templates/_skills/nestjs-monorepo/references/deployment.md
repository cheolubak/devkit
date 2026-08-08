# NestJS 모노레포 배포 전략

## Docker 배포

### 멀티스테이지 Dockerfile

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

# ---- 의존성 트리 축소 ----
FROM base AS pruner
WORKDIR /app
RUN pnpm add -g turbo
COPY . .
RUN turbo prune @repo/api --docker

# ---- 의존성 설치 ----
FROM base AS installer
WORKDIR /app

# pruned lockfile로 설치 (Docker 레이어 캐시 최적화)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile

# 소스 코드 복사 및 빌드
COPY --from=pruner /app/out/full/ .
RUN turbo build --filter @repo/api

# ---- 프로덕션 의존성만 설치 ----
FROM base AS prod-deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile --prod

# ---- 프로덕션 이미지 ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# 프로덕션 의존성 복사
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/*/node_modules ./packages/

# 빌드 결과물 복사
COPY --from=installer /app/apps/api/dist ./apps/api/dist
COPY --from=installer /app/packages/common/dist ./packages/common/dist
COPY --from=installer /app/packages/database/dist ./packages/database/dist
COPY --from=installer /app/packages/auth/dist ./packages/auth/dist

# package.json 복사 (패키지 해석에 필요)
COPY --from=pruner /app/out/json/ .

USER nestjs
EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
```

### turbo prune

`turbo prune`은 특정 앱에 필요한 파일만 추출한다:

```bash
turbo prune @repo/api --docker
```

결과물:
```
out/
├── json/                    # package.json만 포함 (의존성 설치용)
├── full/                    # 전체 소스 코드
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

Docker 레이어 캐싱 효과:
- `json/` 레이어: `package.json`이 변경되지 않으면 `pnpm install` 스킵
- `full/` 레이어: 소스 변경 시에만 빌드 재실행

### .dockerignore

```
# .dockerignore
node_modules
.git
*.md
.env*.local
coverage
.turbo
```

## docker-compose

### 기본 구성

```yaml
# docker-compose.yml
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_HOST=db
      - DATABASE_PORT=5432
      - DATABASE_NAME=myapp
      - DATABASE_USER=postgres
      - DATABASE_PASSWORD=postgres
      - JWT_ACCESS_SECRET=your-secret-key-min-32-chars-long
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    environment:
      - NODE_ENV=production
      - DATABASE_HOST=db
      - DATABASE_PORT=5432
      - DATABASE_NAME=myapp
      - DATABASE_USER=postgres
      - DATABASE_PASSWORD=postgres
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### 개발용 docker-compose

```yaml
# docker-compose.dev.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata_dev:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata_dev:
```

```bash
# 개발 인프라만 실행 (DB, Redis)
docker compose -f docker-compose.dev.yml up -d

# 앱은 로컬에서 실행
pnpm dev --filter @repo/api
```

## GitHub Actions CI/CD

### 빌드 및 배포 워크플로우

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

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

      - uses: actions/cache@v4
        with:
          # Turborepo 2.x는 .turbo/cache, 1.x는 node_modules/.cache/turbo를 쓴다.
          # 둘 다 지정해 두면 버전을 올려도 캐시가 조용히 미스되지 않는다.
          path: |
            .turbo/cache
            node_modules/.cache/turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}
          restore-keys: turbo-${{ runner.os }}-

      - run: turbo build lint type-check test

      - run: turbo test:e2e
        env:
          DATABASE_HOST: localhost
          DATABASE_PORT: 5432
          DATABASE_NAME: test_db
          DATABASE_USER: postgres
          DATABASE_PASSWORD: postgres

  deploy-api:
    needs: ci
    runs-on: ubuntu-latest
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
          file: apps/api/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-worker:
    needs: ci
    runs-on: ubuntu-latest
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
          file: apps/worker/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/worker:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### 변경 감지로 선택적 배포

```yaml
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      api: ${{ steps.changes.outputs.api }}
      worker: ${{ steps.changes.outputs.worker }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: changes
        with:
          filters: |
            api:
              - 'apps/api/**'
              - 'packages/**'
            worker:
              - 'apps/worker/**'
              - 'packages/**'

  deploy-api:
    needs: [ci, detect-changes]
    if: needs.detect-changes.outputs.api == 'true'
    # ...

  deploy-worker:
    needs: [ci, detect-changes]
    if: needs.detect-changes.outputs.worker == 'true'
    # ...
```

## 빌드 최적화

### 1. SWC 빌드 사용

NestJS CLI에서 SWC 빌더를 사용하면 `tsc` 대비 빌드 속도가 크게 향상된다:

```json
// nest-cli.json
{
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true
  }
}
```

### 2. Turborepo 캐시 활용

빌드 결과가 캐시되어 변경이 없으면 빌드를 스킵한다:

```bash
# 캐시 히트 확인
turbo build --summarize
```

### 3. 원격 캐시

팀원 간, CI 간 빌드 캐시를 공유:

```bash
turbo login
turbo link
```

### 4. Docker 레이어 캐싱

`turbo prune --docker`로 package.json과 소스 코드를 분리하여 Docker 빌드 캐시를 최적화한다.

## 체크리스트

- [ ] 각 앱의 Dockerfile에서 `turbo prune --docker` 사용
- [ ] `.dockerignore` 설정으로 불필요한 파일 제외
- [ ] docker-compose에서 `depends_on` + `healthcheck` 설정
- [ ] CI에서 `pnpm install --frozen-lockfile` 사용
- [ ] CI에서 Turborepo 캐시 복원 설정
- [ ] E2E 테스트용 PostgreSQL 서비스 설정
- [ ] 변경 감지로 불필요한 배포 방지
- [ ] Docker 이미지에 non-root 사용자 설정
