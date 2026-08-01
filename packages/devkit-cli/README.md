# @devbak/devkit-cli

`@devbak` 표준(ESLint·Prettier·tsconfig·테스트 설정)이 적용된 프로젝트를 생성하는 CLI.

## 위치 제약 — 반드시 `~/Documents/develop/` 아래에서 실행한다

생성물의 `package.json`은 `@devbak/*` 패키지를 `link:` **상대경로**로 선언한다
(예: `link:../eslint/packages/eslint-config-nest`, 모노레포의 `apps/web`은
`link:../../../eslint/packages/...`). 이 상대경로는 생성물이 이 저장소
(`@devbak` 툴킷, 예: `~/Documents/develop/eslint`)와 **형제 디렉토리**일 때만
유효하다.

즉 `devbak create <name>`은 항상 이 저장소의 **부모 디렉토리**(`~/Documents/develop/`)
아래에 `<name>` 디렉토리를 새로 만든다. 다른 위치로 프로젝트를 옮기면 `link:`
경로가 깨져 `pnpm install`부터 실패한다.

## 사용법

```bash
pnpm build            # devkit-cli의 dist를 최신화한다 (필수 — 아래 참고)
pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]
```

- `<name>`: 생성할 디렉토리 이름이자 프로젝트 이름. 이미 존재하는 디렉토리는
  덮어쓰지 않고 던진다.
- `--type`: 아래 세 가지 중 하나. 필수.
- `--no-verify`: 생성 후 `pnpm install`은 그대로 하되 자가검증(`pnpm lint` /
  `pnpm build`)은 건너뛴다. 설치조차 건너뛰는 옵션은 없다 — 설치 없이는
  린트·빌드가 애초에 의미가 없다.

CLI는 실행 전에 `dist/bin.js`가 `src/`보다 새로운지 확인하고, 오래됐으면
막는다. `link:` 소비는 어떤 라이프사이클 스크립트도 돌리지 않으므로 빌드를
잊으면 옛 코드가 조용히 실행되는 것을 스스로 막기 위해서다.

## 지원 유형

### `nest` — NestJS API

`@nestjs/cli new`로 스캐폴딩한 뒤:

- Prettier·ESLint를 `@devbak/eslint-config-nest` + `@devbak/prettier-config`로
  교체한다(`eslint-plugin-prettier` 제거, ESLint 10 전용).
- Jest 설정을 `@devbak/jest-config`로 교체한다(`package.json`의 `"jest"` 키
  제거).
- 입력 검증용 `zod`를 런타임 의존성으로 추가한다(devDependencies가 아님 —
  `pnpm install --prod` 배포 빌드에서 빠지면 안 되므로).
- 관용 폴더(`src/modules`, `src/common`)를 만든다.

### `next` — Next.js App Router (FSD)

`create-next-app`으로 스캐폴딩한 뒤:

- ESLint를 `@devbak/eslint-plugin-fsd/next` + `typescript-eslint`로 교체한다.
- Vitest를 `@devbak/vitest-config/next`로 연결한다(`jsdom`, 테스트 0개에서도
  통과하도록 `passWithNoTests: true`).
- `package.json`에 `"type": "module"`을 추가한다 — `create-next-app` 산출물이
  `"type"` 필드 없이 CJS로 취급되면 Vite의 config 로더가 `vitest.config.ts`를
  CJS로 번들링하다가 ESM 전용 `@devbak/vitest-config`를 `require()`하려고
  시도해 실패한다. (산출물에 `.js`/`.cjs` 파일이 없어 안전하다 — 전부
  `.ts`/`.tsx`/`.mjs`.)
- Feature-Sliced Design 레이어(`src/views`, `widgets`, `features`, `entities`,
  `shared`)를 만든다. `pages` 대신 `views`를 쓴다 — Next의 Pages Router와
  이름이 충돌하기 때문이다.

### `monorepo` — Turborepo 모노레포

`next` 레시피를 `apps/web`에 그대로 합성한 뒤(로직을 복제하지 않는다):

- `apps/web`의 `pnpm-workspace.yaml`·`eslint.config.mjs`를 제거한다 —
  남으면 각각 "중첩 워크스페이스 루트"·"ESLint의 `tsconfigRootDir` 자동추론
  충돌"을 일으킨다. 루트 `eslint.config.mjs` 하나가 `apps/web`까지 전부
  훑는다.
- 설치·자가검증(`lint`/`build`)은 루트에서 한 번만 한다. `apps/web`에서 따로
  하면 중첩 `node_modules`가 생긴다.
- 일반 의존성은 `pnpm-workspace.yaml`의 `catalog:`를 참조하게 한다.
  `@devbak/*`는 catalog에 넣을 수 없다(pnpm이 `link:` 항목을 거부) — 루트와
  `apps/web`이 각자 (깊이가 다른) `link:` 상대경로로 직접 선언한다.

## 검증 (3층)

| 층 | 대상 | 실행 |
| --- | --- | --- |
| 1. 원자 연산 단위 | 순수 로직 | `pnpm test` |
| 2. 레시피 스냅샷 | `describe()` 직렬화 | `pnpm test` |
| 3. 실생성 통합 | 진짜 생성 → lint/build/test | `pnpm test:e2e` |

3층은 각 유형마다 `pnpm dlx` 다운로드 + `pnpm install` + 빌드가 들어가 느리고
네트워크가 필요하다. 기본 `pnpm test`에는 포함되지 않는다 — 반드시
`pnpm test:e2e`로 따로 실행한다.

한 번 실행에 프로젝트가 3개(`nest`·`next`·`monorepo`) 생성되고, 각각
자체 `node_modules` 트리를 갖는다 — 이게 디스크를 쓰는 실체다. 게다가
3층은 **실패한 테스트의 생성물을 `~/Documents/develop/devkit-e2e-*-<pid>`에
지우지 않고 남긴다**(설계 6.3절 — 디버깅 증거를 보존한다). 통과한 테스트의
생성물은 자동으로 정리되지만, **실패가 반복되면 보존된 프로젝트가 계속
쌓여 디스크를 채울 수 있다.** 실행 전에 여유 공간을 확인하고, 조사가
끝난 보존 디렉토리는 손으로 지운다:
`rm -rf ~/Documents/develop/devkit-e2e-*`. `DEVKIT_E2E_KEEP=1 pnpm test:e2e`로
통과한 생성물까지 전부 남길 수도 있다.
