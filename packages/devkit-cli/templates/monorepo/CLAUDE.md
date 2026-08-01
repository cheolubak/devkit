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
