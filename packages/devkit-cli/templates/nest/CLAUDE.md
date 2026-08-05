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

`package.json`의 `@cheolubak/*`는 GitHub Packages에서 설치된다(`"^0.1.0"`처럼
버전 범위로 선언). `.npmrc`가 `@cheolubak:registry=https://npm.pkg.github.com`을
가리키므로 `GITHUB_TOKEN` 환경변수가 없으면 `pnpm install`이 실패한다 —
공개 패키지도 마찬가지다(GitHub Packages는 공개 패키지도 접근 토큰을
요구한다). 새 버전을 받으려면 버전을 올리고 다시 설치해야 한다. `link:`로
로컬 경로를 잡던 시절과 달리 이 프로젝트는 어디로 옮겨도 경로가 깨지지
않는다.
