# __NAME__

Turborepo 모노레포. `@devbak` 표준 툴킷으로 생성됨.

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

**`@devbak/*`는 catalog에 넣을 수 없다.** pnpm이 catalog 항목의 `link:`
프로토콜을 거부하기 때문이다. 각 `package.json`이 `link:` 상대경로로 직접
선언하며, 루트와 `apps/web`은 깊이가 달라 경로도 다르다.

## 아키텍처

`apps/web`은 Feature-Sliced Design을 따른다. 자세한 내용은
`apps/web`의 레이어 구조와 `@devbak/eslint-plugin-fsd` 규칙을 참고하라.

## 모듈 타입 — 루트는 CJS, apps/web은 ESM (의도된 비대칭)

루트 `package.json`에는 `"type"`이 없고(CJS) `apps/web/package.json`에는
`"type": "module"`이 있다(ESM). **통일하지 마라.** `apps/web`이 ESM인 이유는
Vite의 config 로더가 `vitest.config.ts`를 번들링할 때 ESM 전용인
`@devbak/vitest-config`를 `require()`가 아니라 `import`로 로드해야 하기
때문이다 — `"type"`을 빼면(또는 루트와 맞추겠다고 지우면) 그 즉시
"resolved to an ESM file" 에러로 `pnpm test`가 다시 깨진다. 패키지
경계(루트/`apps/web`)마다 Node가 독립적으로 모듈 시스템을 해석하므로 이
비대칭은 정상이며, 두 곳이 각자 자기 안에서만 일관되면 충분하다.
