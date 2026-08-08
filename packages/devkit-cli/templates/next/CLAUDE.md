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

## 코드를 쓰기 전에

`.claude/agents/devkit-implementer.md`를 먼저 읽는다. 레이어 배치·Server/Client
경계·실패 처리·테스트 동반 기준이 결정 절차의 형태로 거기에 있다.

리뷰 기준은 같은 디렉토리의 `devkit-reviewer.md`다. 둘은 같은 관점을 작성
시점과 리뷰 시점에서 각각 본 것이므로, 한쪽을 고치면 다른 쪽도 함께 본다.

## 스킬과 커맨드

`.claude/skills/` 에 이 스택에 해당하는 스킬이 놓여 있다. 판단이 필요할 때
그 문서를 읽는다.

**`.claude/skills/devkit-stack` 을 먼저 읽는다.** 나머지 스킬은 외부에서 그대로
가져온 것이라 이 프로젝트가 이미 정한 것과 어긋나는 지점이 있다 —
`fsd-architecture` 는 `steiger` 를 전제로 쓰였지만 이 프로젝트는
`@cheolubak/eslint-plugin-fsd` 로 경계를 강제하고, FSD 의 `pages` 레이어를
`views` 로 쓴다. `devkit-stack` 이 그 우선순위를 정의한다.

슬래시 커맨드:

- `/review` — 변경분을 devkit 기준으로 리뷰
- `/verify` — 린트·빌드·테스트 게이트
- `/slice <레이어>/<이름>` — FSD 슬라이스와 Public API 배럴
- `/a11y` — 변경된 컴포넌트의 접근성 점검
- `/issue` — 지금 브랜치의 범위를 벗어난 발견을 이슈로 뺀다
- `/issue-work <번호>` — 이슈를 읽어 구현·검증하고 승인을 받아 PR 을 연다

## devkit 의존

`package.json`의 `@cheolubak/*`는 GitHub Packages에서 설치된다(`"^0.1.0"`처럼
버전 범위로 선언). `.npmrc`가 `@cheolubak:registry=https://npm.pkg.github.com`을
가리키므로 `GITHUB_TOKEN` 환경변수가 없으면 `pnpm install`이 실패한다 —
공개 패키지도 마찬가지다(GitHub Packages는 공개 패키지도 접근 토큰을
요구한다). 새 버전을 받으려면 버전을 올리고 다시 설치해야 한다. `link:`로
로컬 경로를 잡던 시절과 달리 이 프로젝트는 어디로 옮겨도 경로가 깨지지
않는다.
