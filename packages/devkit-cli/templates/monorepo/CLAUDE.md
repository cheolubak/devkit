# __NAME__

Turborepo 모노레포. devkit 표준 툴킷으로 생성됨.

## 구조

```
apps/web        Next.js App Router 앱 (FSD 구조)
packages/       공유 패키지 (필요할 때 추가)
```

## 명령어 (루트에서)

- 개발: `pnpm dev`
- 빌드: `pnpm build`
- 린트: `pnpm lint` (루트 한 번으로 전체를 훑는다)
- 타입: `pnpm typecheck`
- 테스트: `pnpm test`

## 버전 관리

일반 의존은 `pnpm-workspace.yaml`의 `catalog:`에서 버전을 정한다.
각 `package.json`은 `"next": "catalog:"`처럼 참조만 한다.

`@cheolubak/*`는 각 `package.json`에 버전 범위(`"^0.1.0"`)로 개별
선언돼 있다. `link:` 상대경로였을 때는 pnpm이 catalog 항목의 `link:`
프로토콜을 거부해 catalog에 넣을 수 없었다. 지금은 버전 범위라 catalog에
넣을 수 있지만, 이 프로젝트는 아직 그렇게 바꾸지 않았다.

## 아키텍처

`apps/web`은 Feature-Sliced Design을 따른다. 자세한 내용은
`apps/web`의 레이어 구조와 `@cheolubak/eslint-plugin-fsd` 규칙을 참고하라.

## 코드를 쓰기 전에

`.claude/agents/devkit-implementer.md`를 먼저 읽는다. 어느 워크스페이스에 둘
것인가, 앱 안 레이어 배치, Server/Client 경계, 실패 처리, 테스트 동반 기준이
결정 절차의 형태로 거기에 있다.

리뷰 기준은 같은 디렉토리의 `devkit-reviewer.md`다. 둘은 같은 관점을 작성
시점과 리뷰 시점에서 각각 본 것이므로, 한쪽을 고치면 다른 쪽도 함께 본다.

두 문서 모두 **저장소 루트에만** 있다. `apps/web` 하위에는 없는 것이 정상이다.

## 스킬과 커맨드

`.claude/skills/` 에 이 스택에 해당하는 스킬이 놓여 있다. 판단이 필요할 때
그 문서를 읽는다.

**`.claude/skills/devkit-stack` 을 먼저 읽는다.** 나머지 스킬은 외부에서 그대로
가져온 것이라 이 프로젝트가 이미 정한 것과 어긋나는 지점이 있다 —
`fsd-architecture` 는 `steiger` 를 전제로 쓰였지만 이 프로젝트는
`@cheolubak/eslint-plugin-fsd` 로 경계를 강제하고, FSD 의 `pages` 레이어를
`views` 로 쓴다. `nestjs-validation`·`nestjs-crud` 는 `class-validator` 를
가르치지만 이 프로젝트는 zod 를 쓴다. `devkit-stack` 이 그 우선순위를 정의한다.

스킬은 **저장소 루트에만** 놓인다. `apps/web/.claude/` 는 생성 과정에서 지워진다 —
리뷰와 스킬은 저장소 단위이고, 앱 하위에 같은 것이 또 있으면 어느 쪽이 진실인지
알 수 없게 된다.

슬래시 커맨드:

- `/review` — 변경분을 devkit 기준으로 리뷰
- `/verify` — 린트·빌드·테스트 게이트
- `/slice <레이어>/<이름>` — FSD 슬라이스와 Public API 배럴
- `/a11y` — 변경된 컴포넌트의 접근성 점검
- `/module <이름>` — 모듈 한 벌 배치
- `/api-test <경로>` — e2e 스펙 작성

## 모듈 타입 — 루트는 CJS, apps/web은 ESM (의도된 비대칭)

루트 `package.json`에는 `"type"`이 없고(CJS) `apps/web/package.json`에는
`"type": "module"`이 있다(ESM). **통일하지 마라.** `apps/web`이 ESM인 이유는
Vite의 config 로더가 `vitest.config.ts`를 번들링할 때 ESM 전용인
`@cheolubak/vitest-config`를 `require()`가 아니라 `import`로 로드해야 하기
때문이다 — `"type"`을 빼면(또는 루트와 맞추겠다고 지우면) 그 즉시
"resolved to an ESM file" 에러로 `pnpm test`가 다시 깨진다. 패키지
경계(루트/`apps/web`)마다 Node가 독립적으로 모듈 시스템을 해석하므로 이
비대칭은 정상이며, 두 곳이 각자 자기 안에서만 일관되면 충분하다.

## devkit 의존

루트와 `apps/web`의 `package.json` 모두 `@cheolubak/*`를 GitHub Packages에서
설치한다(`"^0.1.0"`처럼 버전 범위로 선언). `.npmrc`가
`@cheolubak:registry=https://npm.pkg.github.com`을 가리키므로 `GITHUB_TOKEN`
환경변수가 없으면 `pnpm install`이 실패한다 — 공개 패키지도 마찬가지다
(GitHub Packages는 공개 패키지도 접근 토큰을 요구한다). 새 버전을 받으려면
버전을 올리고 다시 설치해야 한다. `link:` 시절에는 루트와 `apps/web`이
툴킷까지의 깊이가 달라 상대경로도 서로 달랐지만, 지금은 두 곳 모두 같은
버전 범위를 선언하면 된다. 이 프로젝트를 다른 위치로 옮겨도 경로가
깨지지 않는다.
