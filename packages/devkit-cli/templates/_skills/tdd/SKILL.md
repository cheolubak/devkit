---
name: tdd
description: "테스트 주도 개발(TDD) 워크플로. 레드-그린-리팩터 사이클, 테스트 우선 규율, Vitest 실전 적용(프론트/NestJS 공통). 회귀(버그 재현) TDD, 실제 DB 통합 test-first 포함.\nAPPLIES: 테스트를 먼저 써서 구현을 이끌 때, 버그를 재현하는 실패 테스트부터 만들 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"TDD\", \"테스트 먼저\", \"테스트 주도\", \"red green refactor\", \"실패하는 테스트부터\", \"테스트 우선\", \"TDD로 만들어줘\", \"회귀 테스트 먼저\", \"버그 재현 테스트\", \"통합 테스트 먼저\", 테스트를 먼저 작성해 기능을 구현하거나 버그를 재현·수정할 때.\nSKIP: 테스트 도구/설정(vitest.config, 러너 배선)은 nextjs-testing/nestjs-testing. Python pytest 구조·픽스처·외부 의존성 격리는 python-backend. 브라우저 e2e 구동은 e2e-mcp."
---

# 테스트 주도 개발 (TDD)

> 참조:
> - [references/workflow.md](references/workflow.md) - 레드-그린-리팩터 사이클, 테스트 리스트, 삼각측량, 커밋 리듬
> - [references/walkthrough.md](references/walkthrough.md) - 한 기능을 테스트 리스트→사이클 반복→커밋 누적으로 끝까지 도는 완결형 세션
> - [references/frontend-vitest.md](references/frontend-vitest.md) - Vitest + Testing Library로 컴포넌트/훅/유틸 test-first
> - [references/frontend-advanced.md](references/frontend-advanced.md) - Server Action·TanStack Query·Zustand test-first (비동기/서버/전역상태 경계 검증)
> - [references/backend-vitest.md](references/backend-vitest.md) - NestJS + Vitest로 Service test-first, 의존성 모킹
> - [references/backend-integration.md](references/backend-integration.md) - 실제 테스트 DB 대상 통합 test-first (제약·쿼리·트랜잭션)
> - [references/regression.md](references/regression.md) - 버그 재현 회귀 TDD: 고치기 전에 실패 테스트를 먼저, 영구 회귀 가드로 보존

## 핵심 원칙

프로덕션 코드를 쓰기 전에 **실패하는 테스트를 먼저 작성**한다. superpowers의 일반 `test-driven-development` 스킬이 방법론이라면, 이 스킬은 그 방법론을 **이 저장소 스택(프론트·NestJS 모두 Vitest)에 적용**한 실전판이다.

## 레드-그린-리팩터 사이클

한 번에 한 동작씩, 아래 3단계를 짧게 반복한다.

1. **RED** — 아직 없는 동작을 검증하는 테스트를 먼저 작성한다. 실행해서 **실패하는 것을 눈으로 확인**한다. (테스트가 이유 없이 통과하면 테스트가 잘못된 것이다.)
2. **GREEN** — 그 테스트를 통과시킬 **최소한의 코드**만 작성한다. 하드코딩이라도 좋다. 여기서 목표는 오직 초록불이다.
3. **REFACTOR** — 테스트가 초록인 상태를 유지하며 중복 제거, 이름 정리, 구조 개선을 한다. 리팩터는 **초록일 때만** 한다.

```
RED (실패 확인) → GREEN (최소 통과) → REFACTOR (초록 유지 정리) → 다음 동작
```

## 규율 (반드시 지킨다)

- **실패하는 테스트가 있을 때만** 프로덕션 코드를 작성한다.
- **컴파일/타입 에러도 실패로 친다.** 타입이 안 맞아 빌드가 깨지는 것도 RED다. 이를 통과시키는 것부터 GREEN이다.
- 테스트를 **통과시킬 만큼만** 작성한다. 아직 테스트가 요구하지 않는 기능을 미리 만들지 않는다.
- 한 번에 하나의 실패만 다룬다. RED가 여러 개면 테스트 리스트로 쪼갠다.

## 빠른 피드백 루프

watch 모드를 켜두고 저장할 때마다 테스트가 자동으로 도는 상태에서 작업한다.

```bash
# 프론트엔드 (Vitest)
pnpm vitest --watch

# 백엔드 (NestJS + Vitest) — nestjs-testing의 package.json 스크립트 기준
pnpm test:watch
```

## 언제 TDD를 쓰나 / 스킵하나

| TDD를 쓴다 | TDD를 스킵한다 |
|-----------|--------------|
| 분기·계산·변환 등 **로직**이 있는 코드 | 단순 설정/배선(config, DI 등록, 상수) |
| **엣지 케이스**(빈 값, 경계, 예외)가 있는 코드 | 정답을 아직 모르는 **탐색적 프로토타입** |
| [버그 재현](references/regression.md)(회귀 테스트로 먼저 실패 재현) | 곧 버릴 일회성 스크립트 |

> 탐색적으로 짠 코드라도 **유지하기로 결정하면** 그 시점에 테스트로 감싸(characterization test) 뒷정리한다.
