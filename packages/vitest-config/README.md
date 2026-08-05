# @cheolubak/vitest-config

프론트엔드/Node 프로젝트 공용 Vitest 설정. **빌드가 없다** — ESM `.js` 파일 2개가 전부다.

## 서브패스

| 서브패스 | 용도 | 환경 |
| --- | --- | --- |
| `@cheolubak/vitest-config/next` | Next.js 앱 (컴포넌트 테스트) | `jsdom` |
| `@cheolubak/vitest-config/node` | Node 라이브러리/서버 | `node` |

## 사용법

소비자 `vitest.config.ts`에서 그대로 재노출한다.

```ts
// vitest.config.ts
import config from '@cheolubak/vitest-config/next';
export default config;
```

```ts
// vitest.config.ts
import config from '@cheolubak/vitest-config/node';
export default config;
```

소비자 `package.json`에는 GitHub Packages에서 설치한다. `vitest`는
peerDependency이므로 소비자가 직접 설치한다. `next` 프리셋은 `jsdom`도
요구하므로(아래 참고) 함께 설치한다. 루트 README의
[".npmrc·GITHUB_TOKEN"](../../README.md#기존-프로젝트에-붙이기) 안내를 먼저 본다.

```bash
pnpm add -D @cheolubak/vitest-config vitest jsdom
```

## `include` 상대 경로는 누구 기준인가

`next.js`/`node.js`의 `include: ['src/**/*.{test,spec}.ts', ...]` 같은 상대 경로는 이 패키지 파일의 위치가 아니라, **이 객체를 최종적으로 담는 소비자의 `vitest.config.ts` 위치(정확히는 vitest의 `root`)**를 기준으로 해석된다(실측 확인됨 — `tests/config.test.ts`의 "실제 vitest 실행" 스위트가 이를 검증한다: `packages/vitest-config`에는 `src/` 디렉터리가 없는데도, `--root`로 넘긴 픽스처 디렉터리의 `src/sample.test.ts`를 찾아 통과시킨다). 이는 `@cheolubak/jest-config`의 `rootDir`과 같은 동작이며, `@cheolubak/tsconfig`의 `extends` 상대 경로(프리셋 파일 자신의 위치 기준)와는 반대다. 별도 조치 없이 소비자를 안전하게 보호한다.

## 왜 `passWithNoTests: true`인가

`create-next-app`은 테스트를 하나도 만들지 않으므로, 갓 생성된 프로젝트에서 `pnpm test`가 exit 1로 실패한다. 이 저장소 루트도 같은 이유로 `--passWithNoTests`를 쓴다(work-log 2026-07-26). 두 프리셋 모두 이 플래그를 켠다.

단 이 플래그 때문에 devkit의 자가검증은 `pnpm test`를 실패 신호로 신뢰하지 않고 제외한다(설계 5.4절) — 테스트가 하나도 없어 통과한 상태를 실제 성공으로 잘못 읽지 않기 위해서다.

## 왜 `jsdom`이 optional peerDependency인가

`environment: 'jsdom'`은 `jsdom` 패키지를 요구하지만, `node` 프리셋만 쓰는 소비자(순수 Node 라이브러리/서버)에게 DOM 구현체 설치를 강요할 이유가 없다. 그래서 `peerDependenciesMeta`로 optional 처리했다 — `next` 프리셋을 쓰는 소비자만 직접 설치하면 된다.

## 왜 CJS가 아니라 ESM인가

vitest는 ESM 기반이고 `vitest.config.ts`는 ESM으로 로드된다. `@cheolubak/jest-config`가 CJS인 것과 대칭이 아니지만, 각 도구의 실제 로딩 방식을 따른 것이다. 억지로 통일하지 않는다.

## 왜 빌드가 없는가

ESM 순수 객체이므로 트랜스파일할 것이 없다. 게시된 tarball은 게시 시점의 파일을 그대로 얼려 담으므로, 빌드가 필요한 패키지는 `dist`가 낡거나 비어 있으면 그 버전에 그대로 굳는다(같은 버전 재게시는 안 된다). 이 패키지는 빌드 자체가 없어 그 문제를 아예 겪지 않는다.
