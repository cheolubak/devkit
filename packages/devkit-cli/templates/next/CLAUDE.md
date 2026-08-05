# __NAME__

Next.js App Router 앱. devkit 표준 툴킷으로 생성됨.

## 명령어

- 개발: `pnpm dev`
- 빌드: `pnpm build`
- 린트: `pnpm lint`
- 포맷: `pnpm format`
- 테스트: `pnpm test`

## 아키텍처 — Feature-Sliced Design

`src/` 아래 레이어는 위에서 아래로만 의존한다.

```
app      → Next 라우팅 + 앱 초기화 (최상위)
views    → 페이지 조합 (FSD의 pages 레이어. Next의 Pages Router와 이름이
           충돌해 views를 쓴다)
widgets  → 독립적인 UI 블록
features → 사용자 시나리오
entities → 비즈니스 엔티티
shared   → 재사용 유틸·UI (최하위, 아무것도 의존하지 않는다)
```

`@cheolubak/eslint-plugin-fsd`가 이 경계를 강제한다.

- 하위 레이어가 상위를 import하면 에러다.
- 같은 레이어의 다른 슬라이스를 직접 import하면 에러다.
- 슬라이스 내부 파일을 직접 import하지 말고 슬라이스의 `index.ts`를 거쳐라.

## 규칙

- Server Component가 기본이다. `'use client'`는 필요한 곳에만 좁게 붙인다.
- mutation은 Server Actions로 처리한다.

## devkit 의존

`package.json`의 `@cheolubak/*`는 GitHub Packages에서 설치된다(`"^0.1.0"`처럼
버전 범위로 선언). `.npmrc`가 `@cheolubak:registry=https://npm.pkg.github.com`을
가리키므로 `GITHUB_TOKEN` 환경변수가 없으면 `pnpm install`이 실패한다 —
공개 패키지도 마찬가지다(GitHub Packages는 공개 패키지도 접근 토큰을
요구한다). 새 버전을 받으려면 버전을 올리고 다시 설치해야 한다. `link:`로
로컬 경로를 잡던 시절과 달리 이 프로젝트는 어디로 옮겨도 경로가 깨지지
않는다.
