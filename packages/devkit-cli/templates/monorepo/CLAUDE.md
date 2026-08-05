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
