---
name: nextjs-testing
description: "Next.js 테스트 가이드. Vitest 유닛 테스트, Cypress 컴포넌트/E2E 테스트.\nAPPLIES: React/Next.js에서 Vitest·Testing Library·Cypress 테스트를 쓰거나 설정할 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"테스트 작성해줘\", \"테스트 코드\", \"유닛 테스트\", \"컴포넌트 테스트\", \"e2e 테스트\", \"vitest\", \"cypress\", \"테스트 깨져\", \"테스트 통과\", Next.js/React 프로젝트에서 테스트 작성 시.\nSKIP: NestJS 백엔드 테스트는 nestjs-testing."
version: 1.0.0
---

# Next.js 테스트 작성

## 참조 문서

상세 설정과 고급 패턴은 아래 참조 문서를 확인한다:

- [Vitest 상세 설정](references/vitest-config.md) - vitest.config.ts, path alias, 커버리지, next/* 모킹
- [Cypress 상세 설정](references/cypress-config.md) - cypress.config.ts, 컴포넌트/E2E devServer, support 파일
- [Vitest 테스트 패턴](references/vitest-patterns.md) - 유틸, Hook, Server Action, API Route, Store 테스트 예시
- [Cypress 컴포넌트 테스트 패턴](references/cypress-component-patterns.md) - 컴포넌트 마운트, 인터랙션, 폼, Next.js 기능
- [Cypress E2E 테스트 패턴](references/cypress-e2e-patterns.md) - 페이지 네비게이션, 폼 제출, 인증, API 인터셉트
- [고급 패턴](references/patterns.md) - MSW, 픽스처, 커스텀 커맨드, 세션 관리, 환경별 테스트
- [문제 해결](references/troubleshooting.md) - Vitest/Cypress 문제 해결, CI/CD 설정

## 개요

Next.js 프로젝트에서 Vitest(유닛 테스트)와 Cypress(컴포넌트/E2E 테스트)를 조합하여 테스트를 작성한다.

| 테스트 유형 | 도구 | 대상 | 속도 |
|------------|------|------|------|
| 유닛 테스트 | Vitest | 유틸, Hook, Server Action, API Route, Store | 빠름 |
| 컴포넌트 테스트 | Cypress | React 컴포넌트 (실제 브라우저 렌더링) | 보통 |
| E2E 테스트 | Cypress | 전체 사용자 플로우 (페이지 간 이동, 폼 제출) | 느림 |

**도구 선택 이유:**
- **Vitest**: ESM 네이티브 지원, 빠른 실행, `@vitejs/plugin-react`로 Next.js JSX 변환 처리
- **Cypress**: 실제 브라우저 환경, 컴포넌트+E2E 단일 도구, Next.js 공식 지원 (`framework: 'next'`)

## 사전 요구사항

```bash
# Vitest (유닛 테스트)
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom

# Cypress (컴포넌트/E2E 테스트)
pnpm add -D cypress
```

## 파일 구조 및 네이밍 규칙

```
project/
├── __tests__/                    # Vitest 유닛 테스트
│   ├── lib/
│   │   └── utils.test.ts         # 유틸리티 함수 테스트
│   ├── hooks/
│   │   └── use-counter.test.ts   # Hook 테스트
│   ├── actions/
│   │   └── user.test.ts          # Server Action 테스트
│   ├── api/
│   │   └── users/
│   │       └── route.test.ts     # API Route 테스트
│   └── stores/
│       └── cart.test.ts          # Zustand 스토어 테스트
├── cypress/
│   ├── component/                # 컴포넌트 테스트
│   │   ├── button.cy.tsx
│   │   └── login-form.cy.tsx
│   ├── e2e/                      # E2E 테스트
│   │   ├── auth.cy.ts
│   │   └── checkout.cy.ts
│   ├── support/
│   │   ├── component.tsx         # 컴포넌트 테스트 셋업
│   │   ├── e2e.ts                # E2E 테스트 셋업
│   │   └── commands.ts           # 커스텀 커맨드
│   └── fixtures/                 # 테스트 데이터
│       └── users.json
├── vitest.config.ts
└── cypress.config.ts
```

**네이밍 규칙:**
- Vitest 유닛 테스트: `*.test.ts` / `*.test.tsx`
- Cypress 컴포넌트 테스트: `*.cy.tsx`
- Cypress E2E 테스트: `*.cy.ts`

## Vitest 설정 (요약)

```typescript
// vitest.config.ts
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'hooks/**', 'app/actions/**', 'app/api/**'],
      exclude: ['**/*.d.ts'],
    },
  },
});
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

> 상세 설정은 [Vitest 상세 설정](references/vitest-config.md) 참조.

### 유닛 테스트 패턴 (Vitest)

상세 패턴은 [Vitest 테스트 패턴](references/vitest-patterns.md)을 참조한다.

**주요 테스트 대상:**
- 유틸리티 함수
- React Hook (renderHook)
- Server Action (직접 함수 호출)
- API Route Handler (NextRequest 생성)
- Zustand Store (createStore)

### Cypress 컴포넌트 테스트 패턴

상세 패턴은 [Cypress 컴포넌트 테스트 패턴](references/cypress-component-patterns.md)을 참조한다.

**주요 테스트 대상:**
- 기본 컴포넌트 마운트 및 렌더링
- 사용자 인터랙션 및 콜백
- 폼 컴포넌트
- Next.js 기능 (Image, Link)

### Cypress E2E 테스트 패턴

상세 패턴은 [Cypress E2E 테스트 패턴](references/cypress-e2e-patterns.md)을 참조한다.

**주요 테스트 대상:**
- 페이지 네비게이션 및 라우팅
- 폼 제출 플로우
- 인증 플로우
- API 인터셉트 및 스터빙

## 테스트 실행 명령어

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "cy:open": "cypress open",
    "cy:component": "cypress run --component",
    "cy:e2e": "cypress run --e2e",
    "cy:e2e:headed": "cypress run --e2e --headed"
  }
}
```

```bash
# Vitest 유닛 테스트
pnpm test                    # 전체 실행
pnpm test:watch              # Watch 모드
pnpm test:cov                # 커버리지 포함

# Cypress 컴포넌트 테스트
pnpm cy:open                 # GUI 열기 (컴포넌트/E2E 선택)
pnpm cy:component            # 헤드리스 실행

# Cypress E2E 테스트
pnpm cy:e2e                  # 헤드리스 실행
pnpm cy:e2e:headed           # 브라우저 표시
```

## Server Component 테스트 전략

Server Components는 직접 유닛 테스트할 수 없다. 대신 다음 전략을 사용한다:

| 대상 | 테스트 방법 |
|------|-----------|
| 데이터 페칭 함수 | Vitest 유닛 테스트 (함수 단독 테스트) |
| Server Action | Vitest 유닛 테스트 (next/cache, next/headers 모킹) |
| 렌더링 결과 | Cypress E2E (전체 페이지 방문하여 검증) |
| 클라이언트 인터랙션 | Cypress 컴포넌트 테스트 (Client Component 단위) |

## 체크리스트

### Vitest

- [ ] `vitest.config.ts`에 `@vitejs/plugin-react` 플러그인 설정
- [ ] `vitest.setup.ts`에 `@testing-library/jest-dom/vitest` import
- [ ] `@/` path alias가 `tsconfig.json`과 일치
- [ ] Server Action 테스트 시 `next/cache`, `next/headers` 모킹
- [ ] Zustand 스토어 테스트 시 `beforeEach`에서 `.setState()` 초기화
- [ ] 각 유닛에 정상 케이스 + 에러 케이스 테스트

### Cypress

- [ ] `cypress.config.ts`에 `framework: 'next'`, `bundler: 'webpack'` 설정
- [ ] `cypress/support/component.tsx`에 globals.css import + Provider 래핑
- [ ] E2E 테스트 시 `cy.intercept()`로 API 스텁 처리
- [ ] `data-testid` 속성으로 요소 선택 (CSS 클래스 의존 방지)
- [ ] 인증 플로우에 `cy.session()` 사용하여 테스트 속도 향상

### 공통

- [ ] 테스트 파일 네이밍: Vitest=`*.test.ts(x)`, Cypress=`*.cy.ts(x)`
- [ ] Mock 데이터는 팩토리 함수로 생성 (`createMockUser()` 패턴)
- [ ] `beforeEach`에서 상태/Mock 초기화
- [ ] CI에서 Cypress는 headless 모드로 실행
