# Turborepo 설정 상세

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
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": ["DATABASE_URL", "NEXT_PUBLIC_API_URL"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "**/*.test.{ts,tsx}"],
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

## Task 정의

### build

```json
{
  "build": {
    "dependsOn": ["^build"],
    "outputs": [".next/**", "!.next/cache/**", "dist/**"],
    "env": ["DATABASE_URL", "NEXT_PUBLIC_API_URL"]
  }
}
```

- `dependsOn: ["^build"]` — 의존 패키지의 build를 먼저 실행
- `outputs` — 캐시에 저장할 파일 (변경 없으면 빌드 스킵)
  - `.next/**` — Next.js 빌드 결과
  - `!.next/cache/**` — Next.js 자체 캐시는 제외
  - `dist/**` — 라이브러리 패키지 빌드 결과
- `env` — 캐시 키에 포함할 환경변수

### lint

```json
{
  "lint": {
    "dependsOn": ["^lint"]
  }
}
```

outputs가 없으면 파일 시스템 출력 없이 캐시됨 (exit code만 캐시).

### test

```json
{
  "test": {
    "dependsOn": ["^build"],
    "inputs": ["$TURBO_DEFAULT$", "**/*.test.{ts,tsx}"]
  }
}
```

- `dependsOn: ["^build"]` — 의존 패키지가 빌드된 후 테스트 실행
- `inputs` — 캐시 키를 계산할 파일 목록
  - `$TURBO_DEFAULT$` — 기본 입력 파일 (소스 코드)
  - 추가 테스트 파일 패턴 지정 가능

### dev

```json
{
  "dev": {
    "cache": false,
    "persistent": true
  }
}
```

- `cache: false` — 개발 서버는 캐시하지 않음
- `persistent: true` — 프로세스가 종료되지 않고 계속 실행

### type-check

```json
{
  "type-check": {
    "dependsOn": ["^build"]
  }
}
```

앱의 `package.json`에 스크립트 추가:

```json
{
  "scripts": {
    "type-check": "tsc --noEmit"
  }
}
```

## Task 의존성 (dependsOn)

### `^` 접두사 — 의존 패키지 우선

```json
{
  "build": {
    "dependsOn": ["^build"]
  }
}
```

`@repo/web`이 `@repo/ui`에 의존하면, `@repo/ui`의 build가 먼저 실행된다.

### 같은 패키지 내 의존성

```json
{
  "test": {
    "dependsOn": ["build"]
  }
}
```

`^` 없이 `"build"`만 쓰면 같은 패키지의 build task를 먼저 실행한다.

### 의존성 그래프 시각화

```bash
# 터미널에서 의존성 그래프 확인
turbo build --graph

# DOT 파일로 출력
turbo build --graph=graph.dot

# JSON으로 출력
turbo build --graph=graph.json
```

## 캐시 전략

### 로컬 캐시

Turborepo는 빌드 결과를 로컬 캐시에 저장한다. 입력 파일이 변경되지 않으면 이전 빌드 결과를 복원한다. 캐시 위치는 **2.x에서 `.turbo/cache`**, 1.x에서는 `node_modules/.cache/turbo`였다(`--cache-dir`로 변경 가능).

**캐시 히트/미스 확인:**

```bash
turbo build --summarize
```

### outputs 설정

```json
{
  "build": {
    "outputs": [
      ".next/**",           // Next.js 빌드 출력
      "!.next/cache/**",    // Next.js 내부 캐시 제외
      "dist/**",            // 라이브러리 빌드 출력
      "coverage/**"         // 테스트 커버리지 (선택)
    ]
  }
}
```

### inputs 설정

기본적으로 git에 추적되는 모든 파일이 입력으로 사용된다. 특정 파일만 캐시 키에 포함하려면:

```json
{
  "test": {
    "inputs": [
      "$TURBO_DEFAULT$",
      "vitest.config.ts",
      "**/*.test.{ts,tsx}"
    ]
  }
}
```

`$TURBO_DEFAULT$`는 기본 입력 파일을 의미한다 (소스 코드, package.json 등).

### globalDependencies

모든 task의 캐시 키에 영향을 주는 파일:

```json
{
  "globalDependencies": [
    "**/.env.*local",
    ".env",
    "tsconfig.json"
  ]
}
```

이 파일이 변경되면 모든 패키지의 캐시가 무효화된다.

### 캐시 비활성화

```bash
# 특정 실행에서 캐시 무시
turbo build --force

# 캐시 삭제
turbo clean
```

## 원격 캐시 (Remote Cache)

### Vercel Remote Cache

```bash
# Vercel 계정 연결
turbo login

# 프로젝트 연결
turbo link
```

연결 후 빌드 결과가 Vercel 서버에 캐시되어 팀 전체가 공유한다.

### Self-hosted 원격 캐시

Turborepo는 Remote Cache API 스펙을 공개하고 있어 자체 서버 구축 가능:

```json
// .turbo/config.json (자동 생성됨)
{
  "teamId": "team_xxxxx",
  "apiUrl": "https://api.vercel.com"
}
```

자체 호스팅 시 `apiUrl`을 자체 서버로 변경.

### 환경변수로 원격 캐시 설정 (CI용)

```bash
# CI 환경에서 원격 캐시 사용
TURBO_TOKEN=<token> TURBO_TEAM=<team> turbo build
```

## 필터링과 스코핑

### --filter 문법

```bash
# 특정 패키지만 실행
turbo build --filter @repo/web

# 특정 패키지 + 의존 패키지
turbo build --filter @repo/web...

# 특정 패키지를 의존하는 패키지
turbo build --filter ...@repo/ui

# 여러 패키지
turbo build --filter @repo/web --filter @repo/admin

# 디렉토리 기준
turbo build --filter ./apps/*

# 변경된 패키지만 (git 기준)
turbo build --filter=...[HEAD~1]

# main 브랜치 이후 변경된 패키지
turbo build --filter=...[main]
```

### 패키지 제외

```bash
# 특정 패키지 제외
turbo build --filter !@repo/docs
```

## CI/CD 설정

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2    # 변경 감지에 필요

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      # Turborepo 로컬 캐시 복원
      - uses: actions/cache@v4
        with:
          # Turborepo 2.x는 .turbo/cache, 1.x는 node_modules/.cache/turbo를 쓴다.
          # 둘 다 지정해 두면 버전을 올려도 캐시가 조용히 미스되지 않는다.
          path: |
            .turbo/cache
            node_modules/.cache/turbo
          key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            turbo-${{ runner.os }}-

      - run: turbo build lint test type-check
```

### Vercel Remote Cache와 함께 사용

```yaml
      - run: turbo build lint test type-check
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

### 변경된 패키지만 빌드 (PR용)

```yaml
      - run: turbo build --filter=...[origin/main]
```
