---
name: nestjs-monorepo
description: "NestJS 모노레포 가이드. Turborepo + pnpm workspace 설정, 공유 라이브러리, 마이크로서비스, 빌드 파이프라인, 배포.\nAPPLIES: NestJS 코드를 여러 앱/패키지로 나누거나 Turborepo·pnpm workspace 빌드 파이프라인을 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"모노레포\", \"monorepo\", \"Turborepo\", \"workspace\", \"공유 라이브러리\", \"마이크로서비스\", \"백엔드 프로젝트 분리\", NestJS 모노레포 설정/관리 시.\nSKIP: Next.js 프론트엔드 모노레포는 nextjs-monorepo."
version: 1.0.0
---

> 참조:
> - [references/shared-libraries.md](references/shared-libraries.md) - 공유 라이브러리 상세 (@repo/common, database, auth, config)
> - [references/turborepo-nestjs.md](references/turborepo-nestjs.md) - Turborepo NestJS 특화 설정 (SWC 빌드, Vitest, CI/CD)
> - [references/deployment.md](references/deployment.md) - 배포 전략 (Docker, docker-compose, GitHub Actions)

# NestJS 모노레포 (Turborepo + pnpm Workspaces)

## 개요

여러 NestJS 앱(API 서버, 워커, 마이크로서비스 등)과 공유 라이브러리를 하나의 저장소에서 관리하는 모노레포 구성 가이드. Turborepo v2 + pnpm workspaces 조합을 사용한다.

**모노레포 장점:**
- NestJS 모듈, DTO, 엔티티, Guard 등 코드 공유
- 일관된 린트/포맷/빌드/테스트 설정
- Turborepo 빌드 캐시로 빠른 CI/CD
- 원자적 변경 (관련 패키지를 한 PR에서 수정)

**NestJS CLI 모노레포 vs Turborepo:**

| 특성 | NestJS CLI (`nest g app`) | Turborepo + pnpm |
|------|--------------------------|-------------------|
| 설정 복잡도 | 낮음 | 보통 |
| 빌드 캐시 | 없음 | 로컬/원격 캐시 |
| 패키지 독립성 | 낮음 (단일 `node_modules`) | 높음 (독립 `package.json`) |
| 확장성 | 중소 규모 | 대규모 |
| Next.js 혼용 | 어려움 | 쉬움 |

**권장:** Turborepo + pnpm workspaces를 기본으로 사용한다. NestJS CLI 모노레포는 소규모 프로젝트에 적합하다.

## 사전 요구사항

```bash
# pnpm 설치 (corepack 사용 권장)
corepack enable
corepack prepare pnpm@latest --activate

# Turborepo CLI 전역 설치 (선택)
pnpm add -g turbo
```

## 프로젝트 초기 설정

### 새 프로젝트 생성

```bash
# 1. 모노레포 루트 생성
mkdir my-monorepo && cd my-monorepo
pnpm init
pnpm add -D turbo

# 2. pnpm-workspace.yaml 생성
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

# 3. 앱 생성
mkdir -p apps packages
cd apps
npx @nestjs/cli new api --package-manager pnpm --skip-git
npx @nestjs/cli new worker --package-manager pnpm --skip-git
```

### 기존 NestJS 프로젝트를 모노레포로 마이그레이션

```bash
# 1. 루트에 Turborepo 설치
pnpm add -D turbo

# 2. pnpm-workspace.yaml 생성
# 3. 기존 프로젝트를 apps/로 이동
mkdir -p apps packages
mv my-nestjs-app apps/api

# 4. apps/api/package.json에 name 수정
# "name": "@repo/api"

# 5. 루트에서 pnpm install
pnpm install
```

## 디렉토리 구조

```
my-monorepo/
├── apps/
│   ├── api/                             # 메인 API 서버
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   ├── nest-cli.json
│   │   ├── package.json                 # name: "@repo/api"
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   └── vitest.config.ts
│   └── worker/                          # 백그라운드 워커
│       ├── src/
│       ├── package.json                 # name: "@repo/worker"
│       └── ...
├── packages/
│   ├── common/                          # 공유 DTO, 데코레이터, 파이프, 인터셉터
│   │   ├── src/
│   │   ├── package.json                 # name: "@repo/common"
│   │   └── tsconfig.json
│   ├── database/                        # 공유 엔티티, DB 설정
│   │   ├── src/
│   │   ├── package.json                 # name: "@repo/database"
│   │   └── tsconfig.json
│   ├── auth/                            # 공유 인증 모듈
│   │   ├── src/
│   │   ├── package.json                 # name: "@repo/auth"
│   │   └── tsconfig.json
│   ├── typescript-config/               # 공유 TSConfig
│   │   ├── base.json
│   │   ├── nestjs.json
│   │   ├── library.json
│   │   └── package.json                 # name: "@repo/typescript-config"
│   └── eslint-config/                   # 공유 ESLint 설정
│       ├── base.js
│       └── package.json                 # name: "@repo/eslint-config"
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                         # 루트 package.json
└── .npmrc
```

## pnpm Workspaces 설정

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 루트 package.json

```json
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "test": "turbo test",
    "test:e2e": "turbo test:e2e",
    "type-check": "turbo type-check",
    "format": "prettier --write \"**/*.ts\""
  },
  "devDependencies": {
    "prettier": "^3.4.0",
    "turbo": "^2.4.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

### .npmrc

```ini
auto-install-peers=true
strict-peer-dependencies=false
```

### 의존성 관리 명령어

```bash
# 특정 앱에 패키지 추가
pnpm add @nestjs/swagger --filter @repo/api

# 내부 패키지를 앱의 의존성으로 추가
pnpm add @repo/common --filter @repo/api --workspace
pnpm add @repo/database --filter @repo/api --workspace

# 루트에 개발 의존성 추가
pnpm add -D prettier -w
```

앱의 `package.json`에서 workspace 의존성:

```json
{
  "dependencies": {
    "@repo/common": "workspace:*",
    "@repo/database": "workspace:*",
    "@repo/auth": "workspace:*"
  }
}
```

## Turborepo 설정

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local", ".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
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
    }
  }
}
```

**NestJS 특화 포인트:**
- `outputs: ["dist/**"]` — NestJS 빌드 출력은 `dist/` 디렉토리
- `test` / `test:e2e` — 유닛 테스트와 E2E 테스트 분리
- `env: ["DATABASE_URL"]` — DB 연결 정보가 빌드/테스트 캐시에 영향

> 상세 설정은 [Turborepo NestJS 특화 설정](references/turborepo-nestjs.md) 참조.

## 앱별 설정

### apps/api/package.json

```json
{
  "name": "@repo/api",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --config vitest.config.e2e.ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "@repo/common": "workspace:*",
    "@repo/database": "workspace:*",
    "@repo/auth": "workspace:*"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@repo/typescript-config": "workspace:*",
    "@repo/eslint-config": "workspace:*",
    "vitest": "^3.0.0",
    "unplugin-swc": "^1.5.0",
    "@swc/core": "^1.9.0"
  }
}
```

### apps/api/tsconfig.json

```json
{
  "extends": "@repo/typescript-config/nestjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "outDir": "./dist",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### apps/api/tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

### apps/api/nest-cli.json

```json
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

## 공유 TSConfig

### packages/typescript-config/base.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  },
  "exclude": ["node_modules"]
}
```

### packages/typescript-config/nestjs.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "./dist",
    "removeComments": true
  }
}
```

### packages/typescript-config/library.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## 공유 라이브러리 패턴 (요약)

### @repo/common — 공용 DTO, 데코레이터, 파이프

```json
// packages/common/package.json
{
  "name": "@repo/common",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/swagger": "^11.0.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.0"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

```typescript
// packages/common/src/index.ts
export * from './dto/pagination-query.dto';
export * from './dto/api-response.dto';
export * from './decorators/current-user.decorator';
export * from './pipes/parse-uuid.pipe';
export * from './interceptors/transform.interceptor';
export * from './filters/http-exception.filter';
```

앱에서 사용:

```typescript
// apps/api/src/users/users.controller.ts
import { PaginationQueryDto, CurrentUser } from '@repo/common';
```

### @repo/database — 공유 엔티티, DB 모듈

```typescript
// packages/database/src/index.ts
export * from './entities/user.entity';
export * from './entities/product.entity';
export * from './database.module';
```

앱에서 사용:

```typescript
// apps/api/src/app.module.ts
import { DatabaseModule } from '@repo/database';

@Module({
  imports: [DatabaseModule],
})
export class AppModule {}
```

> 상세 패턴은 [공유 라이브러리 상세](references/shared-libraries.md) 참조.

## 개발 서버 실행

```bash
# 모든 앱의 dev 서버 동시 실행
pnpm dev

# 특정 앱만 실행
pnpm dev --filter @repo/api

# 특정 앱 + 의존 패키지 (watch 모드)
pnpm dev --filter @repo/api...

# 여러 앱 실행
pnpm dev --filter @repo/api --filter @repo/worker
```

## 빌드 파이프라인

```bash
# 전체 빌드 (의존성 순서대로)
pnpm build

# 특정 앱만 빌드
pnpm build --filter @repo/api

# 변경된 패키지만 빌드 (CI용)
pnpm build --filter=...[HEAD~1]

# 캐시 무시하고 재빌드
pnpm build --force
```

빌드 순서 (Turborepo가 자동 결정):

```
@repo/typescript-config  →  @repo/common   →  @repo/api
                         →  @repo/database →  @repo/worker
                         →  @repo/auth
```

## 체크리스트

### 초기 설정

- [ ] `pnpm-workspace.yaml`에 `apps/*`, `packages/*` 설정
- [ ] 루트 `package.json`에 `"private": true` 설정
- [ ] 루트 `package.json`에 `"packageManager"` 필드로 pnpm 버전 고정
- [ ] `.npmrc`에 `auto-install-peers=true` 설정

### Turborepo

- [ ] `turbo.json` tasks에 build, lint, test, test:e2e, dev, type-check 정의
- [ ] build task에 `outputs: ["dist/**"]` 설정
- [ ] dev task에 `cache: false`, `persistent: true` 설정
- [ ] 환경변수를 사용하는 task에 `env` 필드 선언

### 공유 라이브러리

- [ ] 모든 내부 패키지에 `"private": true` 설정
- [ ] 라이브러리 패키지에 build 스크립트 (`tsc`) 설정
- [ ] `main`과 `types` 필드가 `dist/` 경로를 가리키는지 확인
- [ ] `@repo/typescript-config`으로 TSConfig 통일 (`emitDecoratorMetadata` 포함)
- [ ] NestJS 데코레이터를 사용하는 패키지에 필요한 의존성 추가

### 앱 설정

- [ ] 각 앱의 `nest-cli.json`에 `builder: "swc"` 설정 (빠른 빌드)
- [ ] 각 앱의 `tsconfig.json`이 `@repo/typescript-config`를 extends
- [ ] 공유 패키지를 `workspace:*`로 의존성 추가

## 참고

- `nestjs-config` 스킬: 환경변수 관리 상세
- `nestjs-database` 스킬: TypeORM/Prisma 설정 및 패턴
- `nestjs-testing` 스킬: Vitest 테스트 설정
- `nextjs-monorepo` 스킬: Next.js + NestJS 혼합 모노레포 시 참고
