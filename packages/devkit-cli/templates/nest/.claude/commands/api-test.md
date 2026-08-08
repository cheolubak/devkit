---
description: HTTP 경로의 e2e 스펙을 만든다
---

`$ARGUMENTS`가 가리키는 HTTP 경로(예: `POST /users`)의 e2e 스펙을 만든다.

스펙 작성 규약은 `.claude/skills/nestjs-testing`을 따른다. 파일은
`*.e2e-spec.ts`이며 `pnpm test:e2e`(`jest-e2e.config.js`)가 수집한다.

**검증 대상을 통째로 모킹하지 않는다.** 서비스 전체를 모킹한 e2e는 라우팅과
파이프가 깨져도 통과한다. 외부 경계(외부 HTTP·큐)만 대역으로 바꾼다.

성공 경로 하나로 끝내지 않는다. 최소한 다음을 덮는다.

- 검증 실패(zod 스키마가 거부하는 입력) → 기대하는 상태 코드
- 인증·권한이 걸린 경로라면 미인증 요청
- 존재하지 않는 리소스

테스트를 먼저 쓰고 실패를 확인한 뒤 구현으로 넘어가려면
`.claude/skills/tdd`의 절차를 따른다.
