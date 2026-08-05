# __NAME__

NestJS API. devkit 표준 툴킷으로 생성됨.

## 명령어

- 개발: `pnpm start:dev`
- 빌드: `pnpm build`
- 린트: `pnpm lint`
- 포맷: `pnpm format`
- 테스트: `pnpm test` / e2e: `pnpm test:e2e`

## 규칙

- 비즈니스 로직은 Service에, Controller는 thin하게 유지한다.
- 입력 검증은 zod로 한다. `class-validator`를 쓰지 않는다.
- 린트 설정은 `@cheolubak/eslint-config-nest`에서 온다. 타입 인식 규칙이 켜져 있으므로
  `@typescript-eslint/no-floating-promises` 위반을 그냥 넘기지 않는다.
- 포맷은 Prettier가 전담한다. ESLint에 포맷 규칙을 추가하지 않는다.

## devkit 의존

`package.json`의 `@cheolubak/*`는 `link:` 상대경로로 `~/Documents/develop/eslint`를
가리킨다. 이 프로젝트를 다른 위치로 옮기면 경로가 깨진다.
