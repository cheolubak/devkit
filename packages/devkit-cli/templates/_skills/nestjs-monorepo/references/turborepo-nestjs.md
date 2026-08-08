# Turborepo NestJS 특화 설정

## turbo.json 전체 구조

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [
    "**/.env.*local",
    ".env"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"],
      "env": ["DATABASE_URL", "NODE_ENV"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "**/*.spec.ts"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "test/**/*.e2e-spec.ts"],
      "env": ["DATABASE_URL"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

### Next.js와 차이점

| 항목 | NestJS | Next.js |
|------|--------|---------|
| 빌드 출력 | `dist/**` | `.next/**`, `!.next/cache/**` |
| 빌드 도구 | `nest build` (SWC) 또는 `tsc` | `next build` |
| 테스트 분리 | `test` + `test:e2e` | `test` (Vitest) + `cy:e2e` (Cypress) |
| DB task | `db:generate`, `db:migrate` | 해당 없음 |
| Dev 서버 | `nest start --watch` | `next dev` |

## NestJS 빌드 옵션

### SWC 빌드 (권장)

SWC는 Rust 기반 컴파일러로 TypeScript 변환이 매우 빠르다.

```json
// apps/api/nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "builder": "swc",
    "typeCheck": true
  }
}
```

필요 패키지:

```bash
pnpm add -D @swc/core @swc/cli --filter @repo/api
```

### tsc 빌드

```json
// apps/api/nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "builder": "tsc"
  }
}
```

### 라이브러리 패키지 빌드

라이브러리 패키지는 `nest build` 대신 `tsc`를 직접 사용:

```json
// packages/common/package.json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  }
}
```

## Vitest 설정

### 유닛 테스트 설정

```typescript
// apps/api/vitest.config.ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: false,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.module.ts',
        'src/main.ts',
        'src/**/*.dto.ts',
        'src/**/*.entity.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@repo/common': resolve(__dirname, '../../packages/common/dist'),
      '@repo/database': resolve(__dirname, '../../packages/database/dist'),
      '@repo/auth': resolve(__dirname, '../../packages/auth/dist'),
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
```

### E2E 테스트 설정

```typescript
// apps/api/vitest.config.e2e.ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: false,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@repo/common': resolve(__dirname, '../../packages/common/dist'),
      '@repo/database': resolve(__dirname, '../../packages/database/dist'),
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
```

### 앱 package.json 스크립트

```json
{
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:e2e": "vitest run --config vitest.config.e2e.ts",
    "type-check": "tsc --noEmit"
  }
}
```

## 필터링

```bash
# 특정 앱만 빌드
turbo build --filter @repo/api

# 특정 앱 + 모든 의존 패키지
turbo build --filter @repo/api...

# 특정 패키지를 의존하는 앱들
turbo build --filter ...@repo/common

# 여러 앱
turbo build --filter @repo/api --filter @repo/worker

# 변경된 패키지만 (git 기준)
turbo build --filter=...[HEAD~1]

# main 이후 변경된 패키지
turbo build --filter=...[main]
```

## CI/CD GitHub Actions

### 기본 워크플로우

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
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

      # 린트, 타입 체크, 유닛 테스트
      - run: turbo build lint type-check test

      # E2E 테스트 (DB 필요)
      - run: turbo test:e2e
        env:
          DATABASE_HOST: localhost
          DATABASE_PORT: 5432
          DATABASE_NAME: test_db
          DATABASE_USER: postgres
          DATABASE_PASSWORD: postgres
```

### PR에서 변경된 패키지만 테스트

```yaml
      - run: turbo build test --filter=...[origin/main]
```

### 원격 캐시 사용

```yaml
      - run: turbo build lint type-check test
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

## dev 명령어 최적화

### turbo.json dev task

```json
{
  "dev": {
    "cache": false,
    "persistent": true
  }
}
```

- `cache: false` — dev 서버는 캐시할 필요 없음
- `persistent: true` — 프로세스가 종료되지 않고 계속 실행

### 라이브러리 watch 모드

라이브러리 변경 시 자동 재빌드되도록 `dev` 스크립트에 watch 모드 설정:

```json
// packages/common/package.json
{
  "scripts": {
    "dev": "tsc -p tsconfig.json --watch"
  }
}
```

`turbo dev` 실행 시 모든 앱의 dev 서버와 라이브러리의 watch 모드가 동시에 실행된다.

### 특정 앱만 개발

```bash
# api만 개발 (+ 의존 라이브러리 watch)
pnpm dev --filter @repo/api...
```
