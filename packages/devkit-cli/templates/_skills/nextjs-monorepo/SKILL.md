---
name: nextjs-monorepo
description: "Next.js 모노레포 가이드. Turborepo + pnpm workspace 설정, 공유 패키지, 내부 패키지, 빌드 파이프라인, 환경변수, 배포.\nAPPLIES: Next.js 앱을 여러 패키지로 나누거나 Turborepo·pnpm workspace 공유 패키지를 다룰 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"모노레포\", \"monorepo\", \"Turborepo\", \"workspace\", \"공유 패키지\", \"패키지 분리\", \"프로젝트 구조 나누기\", Next.js 모노레포 설정/관리 시.\nSKIP: NestJS 모노레포는 nestjs-monorepo. 단일 프로젝트 구조는 react-best-practices."
version: 1.0.0
---

> 참조:
> - [references/turborepo-config.md](references/turborepo-config.md) - Turborepo 상세 설정 (tasks, 캐시, 원격 캐시, 필터링, CI/CD)
> - [references/shared-packages.md](references/shared-packages.md) - 공유 패키지 패턴 (@repo/ui, tsconfig, eslint, utils, database)
> - [references/environment-variables.md](references/environment-variables.md) - 환경변수 관리 (turbo.json env, t3-env 검증)
> - [references/deployment.md](references/deployment.md) - 배포 전략 (Vercel, Docker, GitHub Actions)

# Next.js 모노레포 (Turborepo + pnpm Workspaces)

## 개요

여러 Next.js 앱과 공유 라이브러리를 하나의 저장소에서 관리하는 모노레포 구성 가이드. Turborepo v2 + pnpm workspaces 조합을 사용한다.

**모노레포 장점:**
- 패키지 간 코드 공유 (UI 컴포넌트, 유틸, 타입, 설정)
- 일관된 린트/포맷/빌드 설정
- Turborepo 빌드 캐시로 빠른 CI/CD
- 원자적 변경 (관련 패키지를 한 PR에서 수정)

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
pnpm dlx create-turbo@latest my-monorepo
cd my-monorepo
```

### 기존 프로젝트를 모노레포로 마이그레이션

```bash
# 1. 루트에 Turborepo 설치
pnpm add -D turbo

# 2. pnpm-workspace.yaml 생성
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

# 3. 기존 앱을 apps/로 이동
mkdir -p apps packages
mv my-next-app apps/web

# 4. turbo.json 생성 (아래 설정 참조)
```

## 디렉토리 구조

```
my-monorepo/
├── apps/
│   ├── web/                         # 메인 Next.js 앱
│   │   ├── app/
│   │   ├── next.config.ts
│   │   ├── package.json             # name: "@repo/web"
│   │   └── tsconfig.json
│   ├── admin/                       # 어드민 Next.js 앱
│   │   ├── app/
│   │   ├── next.config.ts
│   │   ├── package.json             # name: "@repo/admin"
│   │   └── tsconfig.json
│   └── docs/                        # 문서 사이트
│       └── ...
├── packages/
│   ├── ui/                          # 공유 UI 컴포넌트
│   │   ├── src/
│   │   ├── package.json             # name: "@repo/ui"
│   │   └── tsconfig.json
│   ├── typescript-config/           # 공유 TSConfig
│   │   ├── base.json
│   │   ├── nextjs.json
│   │   ├── library.json
│   │   └── package.json             # name: "@repo/typescript-config"
│   ├── eslint-config/               # 공유 ESLint 설정
│   │   ├── base.js
│   │   ├── next.js
│   │   └── package.json             # name: "@repo/eslint-config"
│   └── utils/                       # 공유 유틸리티
│       ├── src/
│       ├── package.json             # name: "@repo/utils"
│       └── tsconfig.json
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                     # 루트 package.json
└── .npmrc
```

**네이밍 규칙:**
- 모든 패키지는 `@repo/` 스코프 사용 (npm에 배포하지 않는 내부 패키지)
- apps/ 하위: `@repo/web`, `@repo/admin` 등
- packages/ 하위: `@repo/ui`, `@repo/utils` 등

## pnpm Workspaces 설정

### pnpm-workspace.yaml

```yaml
# pnpm-workspace.yaml
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
    "type-check": "turbo type-check",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
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
# .npmrc
auto-install-peers=true
strict-peer-dependencies=false
```

### 의존성 관리 명령어

```bash
# 특정 앱에 패키지 추가
pnpm add react-hook-form --filter @repo/web

# 내부 패키지를 앱의 의존성으로 추가
pnpm add @repo/ui --filter @repo/web --workspace

# 루트에 개발 의존성 추가
pnpm add -D prettier -w

# 전체 워크스페이스 의존성 설치
pnpm install
```

앱의 `package.json`에서 workspace 의존성은 다음과 같이 표시된다:

```json
{
  "dependencies": {
    "@repo/ui": "workspace:*",
    "@repo/utils": "workspace:*"
  }
}
```

## Turborepo 설정 (요약)

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"]
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

**핵심 개념:**
- `dependsOn: ["^build"]` — 의존하는 패키지를 먼저 빌드 (`^`는 의존성 방향)
- `outputs` — 캐시할 빌드 결과물 (변경 없으면 빌드 스킵)
- `cache: false` — dev 서버는 캐시하지 않음
- `persistent: true` — dev 서버처럼 계속 실행되는 task

> 상세 설정은 [Turborepo 상세 설정](references/turborepo-config.md) 참조.

## 공유 패키지 패턴 (요약)

### Internal Package (권장)

빌드 단계 없이 소스를 직접 참조하는 방식. HMR 즉시 반영.

```json
// packages/ui/package.json
{
  "name": "@repo/ui",
  "private": true,
  "exports": {
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx",
    "./globals.css": "./src/globals.css"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

앱의 `next.config.ts`에 `transpilePackages` 설정:

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/ui', '@repo/utils'],
};

export default nextConfig;
```

앱에서 사용:

```tsx
// apps/web/app/page.tsx
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';

export default function Page() {
  return (
    <Card>
      <Button>클릭</Button>
    </Card>
  );
}
```

### TSConfig 공유

```json
// packages/typescript-config/base.json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "declaration": true,
    "declarationMap": true
  },
  "exclude": ["node_modules"]
}
```

```json
// packages/typescript-config/nextjs.json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "preserve",
    "noEmit": true,
    "module": "ESNext",
    "plugins": [{ "name": "next" }]
  }
}
```

앱에서 extends:

```json
// apps/web/tsconfig.json
{
  "extends": "@repo/typescript-config/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

> 더 많은 공유 패키지 예시는 [공유 패키지 패턴](references/shared-packages.md) 참조.

## 개발 서버 실행

```bash
# 모든 앱의 dev 서버 동시 실행
pnpm dev

# 특정 앱만 실행
pnpm dev --filter @repo/web

# 특정 앱 + 의존 패키지만 실행
pnpm dev --filter @repo/web...

# 여러 앱 실행
pnpm dev --filter @repo/web --filter @repo/admin
```

## 빌드 파이프라인

```bash
# 전체 빌드 (의존성 순서대로 자동 실행)
pnpm build

# 특정 앱만 빌드
pnpm build --filter @repo/web

# 변경된 패키지만 빌드 (CI에서 유용)
pnpm build --filter=...[HEAD~1]

# 캐시 무시하고 재빌드
pnpm build --force
```

Turborepo는 의존성 그래프를 분석하여 빌드 순서를 결정한다:

```
@repo/typescript-config  →  @repo/ui      →  @repo/web
                         →  @repo/utils   →  @repo/admin
```

의존 패키지가 변경되지 않았으면 캐시된 결과를 재사용한다.

## 환경변수 관리 (요약)

모노레포에서 환경변수를 관리할 때 주의할 점:

1. **turbo.json에 env 선언** — Turborepo 캐시 키에 환경변수 포함
2. **앱별 .env 파일** — `apps/web/.env.local`, `apps/admin/.env.local`
3. **공통 환경변수** — 루트 `.env`에 선언하거나 `@repo/env` 검증 패키지 사용

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"],
      "env": ["DATABASE_URL", "NEXT_PUBLIC_API_URL"]
    }
  }
}
```

> 상세는 [환경변수 관리](references/environment-variables.md) 참조.

## 체크리스트

### 초기 설정

- [ ] `pnpm-workspace.yaml`에 `apps/*`, `packages/*` 설정
- [ ] 루트 `package.json`에 `"private": true` 설정
- [ ] 루트 `package.json`에 `"packageManager"` 필드로 pnpm 버전 고정
- [ ] `.npmrc`에 `auto-install-peers=true` 설정

### Turborepo

- [ ] `turbo.json` tasks에 build, lint, test, dev, type-check 정의
- [ ] build task에 `dependsOn: ["^build"]`와 `outputs` 설정
- [ ] dev task에 `cache: false`, `persistent: true` 설정
- [ ] 환경변수를 사용하는 task에 `env` 필드 선언

### 공유 패키지

- [ ] 모든 내부 패키지에 `"private": true` 설정
- [ ] `package.json`의 `exports` 필드로 진입점 명시
- [ ] 앱의 `next.config.ts`에 `transpilePackages` 설정
- [ ] `@repo/typescript-config`으로 TSConfig 통일
- [ ] `@repo/eslint-config`으로 린트 규칙 통일

### 환경변수

- [ ] `turbo.json`에 환경변수 선언 (캐시 키에 포함)
- [ ] `NEXT_PUBLIC_` 접두사 규칙 준수
- [ ] `.gitignore`에 `.env*.local` 추가

### 배포

- [ ] 앱별 독립 배포 가능 여부 확인
- [ ] CI에서 `pnpm install --frozen-lockfile` 사용
- [ ] Turborepo 캐시 활용 (원격 캐시 또는 CI 캐시)
