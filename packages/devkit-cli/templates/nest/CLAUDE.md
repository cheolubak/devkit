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

## 코드를 쓰기 전에

`.claude/agents/devkit-implementer.md`를 먼저 읽는다. 모듈·계층 배치, zod 검증과
트랜잭션 경계, 실패 처리, 테스트 동반 기준이 결정 절차의 형태로 거기에 있다.

리뷰 기준은 같은 디렉토리의 `devkit-reviewer.md`다. 둘은 같은 관점을 작성
시점과 리뷰 시점에서 각각 본 것이므로, 한쪽을 고치면 다른 쪽도 함께 본다.

## 스킬과 커맨드

`.claude/skills/` 에 이 스택에 해당하는 스킬이 놓여 있다. 판단이 필요할 때
그 문서를 읽는다.

**`.claude/skills/devkit-stack` 을 먼저 읽는다.** 나머지 스킬은 외부에서 그대로
가져온 것이라 이 프로젝트가 이미 정한 것과 어긋나는 지점이 있다 —
`nestjs-validation`·`nestjs-crud` 는 `class-validator` 를 가르치지만 이 프로젝트는
zod 를 쓴다. `devkit-stack` 이 그 우선순위를 정의한다.

슬래시 커맨드:

- `/review` — 변경분을 devkit 기준으로 리뷰
- `/verify` — 린트·빌드·테스트 게이트
- `/module <이름>` — 모듈 한 벌 배치
- `/api-test <경로>` — e2e 스펙 작성

## devkit 의존

`package.json`의 `@cheolubak/*`는 GitHub Packages에서 설치된다(`"^0.1.0"`처럼
버전 범위로 선언). `.npmrc`가 `@cheolubak:registry=https://npm.pkg.github.com`을
가리키므로 `GITHUB_TOKEN` 환경변수가 없으면 `pnpm install`이 실패한다 —
공개 패키지도 마찬가지다(GitHub Packages는 공개 패키지도 접근 토큰을
요구한다). 새 버전을 받으려면 버전을 올리고 다시 설치해야 한다. `link:`로
로컬 경로를 잡던 시절과 달리 이 프로젝트는 어디로 옮겨도 경로가 깨지지
않는다.
