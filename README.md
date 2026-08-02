# devkit — `@devbak` 개발 표준 툴킷

개인 프로젝트의 린트·포맷·타입·테스트 설정을 한 곳에 모아두고, 그 표준이 적용된
새 프로젝트를 명령 하나로 만들어내는 pnpm 모노레포다.

두 갈래로 쓴다.

1. **설정 패키지를 직접 소비한다** — 기존 프로젝트에서 `@devbak/eslint-config-nest`,
   `@devbak/tsconfig` 같은 패키지를 `link:`로 붙여 쓴다.
2. **새 프로젝트를 생성한다** — `devbak create`가 공식 CLI로 뼈대를 만든 뒤 위
   패키지들로 설정을 교체한다.

> 로컬 디렉토리 이름은 `eslint`, 워크스페이스 이름은 `eslint-workspace`,
> GitHub 저장소 이름은 `devkit`이다. 셋 다 같은 저장소를 가리킨다.

---

## 패키지

| 패키지 | 역할 | 빌드 |
| --- | --- | --- |
| [`@devbak/devkit-cli`](packages/devkit-cli) | `devbak create`로 nest·next·monorepo 프로젝트 생성 | tsup |
| [`@devbak/eslint-plugin-fsd`](packages/eslint-plugin-fsd) | Feature-Sliced Design 강제 ESLint 플러그인 (+ React/Next 프리셋) | tsup |
| [`@devbak/eslint-config-nest`](packages/eslint-config-nest) | NestJS용 타입 인식 ESLint 설정 (zod DTO 검증 포함) | tsup |
| [`@devbak/tsconfig`](packages/tsconfig) | tsconfig 프리셋 4종 (`base`·`nest`·`next`·`lib`) | 없음 (JSON) |
| [`@devbak/prettier-config`](packages/prettier-config) | 공용 Prettier 설정 | 없음 (JSON) |
| [`@devbak/jest-config`](packages/jest-config) | NestJS용 Jest 설정 (`nest`·`nest-e2e`) | 없음 (CJS) |
| [`@devbak/vitest-config`](packages/vitest-config) | Vitest 설정 (`next`·`node`) | 없음 (ESM) |

**빌드가 없는 쪽이 기본이고, 있는 쪽이 예외다.** `link:` 의존은 어떤 라이프사이클
스크립트도 실행하지 않는다. 그래서 빌드가 필요한 패키지는 `dist`가 낡으면 소비자가
조용히 옛 설정을 쓰게 된다. JSON·CJS·ESM 순수 객체로 낼 수 있는 것은 전부 빌드
없이 두어 이 문제를 아예 겪지 않게 했다. 반대로 빌드가 필요한 `devkit-cli`는
`dist/bin.js`가 `src/`보다 오래되면 **실행 자체를 거부한다** — 같은 함정을 스스로
막기 위해서다.

## 의존 방향

```
@devbak/tsconfig ─┐
@devbak/prettier-config ─┤
@devbak/jest-config ─┼─→ devkit-cli 템플릿 ─→ 생성된 프로젝트
@devbak/vitest-config ─┤        (link: 상대경로로 선언)
@devbak/eslint-config-nest ─┤
@devbak/eslint-plugin-fsd ─┘
```

설정 패키지들은 서로를 import하지 않는다. `devkit-cli`가 이들을 조립해 생성물의
`package.json`·설정 파일에 꽂아 넣을 뿐이다.

---

## 새 프로젝트 만들기

```bash
pnpm install
pnpm build                                        # devkit-cli의 dist 최신화 (필수)
pnpm devbak create my-api --type nest             # 또는 --type next | monorepo
```

| 유형 | 뼈대 | 얹는 표준 |
| --- | --- | --- |
| `nest` | `@nestjs/cli new` | eslint-config-nest, prettier-config, jest-config, zod |
| `next` | `create-next-app` | eslint-plugin-fsd/next, prettier-config, vitest-config/next, FSD 레이어 |
| `monorepo` | Turborepo + 위 `next` 레시피를 `apps/web`에 합성 | 루트에서 한 번만 lint/build |

### 위치 제약 — 반드시 이 저장소의 형제 디렉토리로 생성된다

생성물은 `@devbak/*`를 `link:../eslint/packages/...` 같은 **상대경로**로 선언한다.
따라서 `devbak create`는 항상 이 저장소의 부모 디렉토리(`~/Documents/develop/`)
아래에 프로젝트를 만든다. 생성 후 다른 위치로 옮기면 `link:` 경로가 깨져
`pnpm install`부터 실패한다.

세 유형 모두 Claude 기반 코드 리뷰 자산(`/review` 슬래시 커맨드, PR 자동 리뷰
워크플로, 유형별 리뷰어 에이전트)을 함께 놓는다. CI 워크플로를 실제로 돌리려면
생성된 저장소에 시크릿 `CLAUDE_CODE_OAUTH_TOKEN`을 등록해야 한다(API key가 아니다).
자세한 내용은 [`packages/devkit-cli/README.md`](packages/devkit-cli/README.md).

---

## 기존 프로젝트에 붙이기

가장 간단한 방법은 `devbak update`다.

```bash
pnpm build
pnpm devbak update ../my-api --type nest
```

마커가 없는 외부 프로젝트에는 `--type`이 필요하고, 전체 update가 마커를 심으면
다음부터는 생략할 수 있다. 자세한 내용은
[`packages/devkit-cli/README.md`](packages/devkit-cli/README.md).

수동으로 붙이려면 아래처럼 한다. 각 패키지 README에도 설치·설정 예시가 있다.
요약하면 소비자 `package.json`에 `link:` 상대경로로 넣고, peer는 직접 설치한다.

```jsonc
{
  "devDependencies": {
    "@devbak/eslint-config-nest": "link:../eslint/packages/eslint-config-nest",
    "@devbak/tsconfig": "link:../eslint/packages/tsconfig",
    "eslint": "^10.0.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

**ESLint 버전 요구가 패키지마다 다르다.** `@devbak/eslint-config-nest`는 ESLint 10
전용이고, `@devbak/eslint-plugin-fsd`는 9 또는 10을 받는다.

---

## 이 저장소에서 개발하기

```bash
pnpm install
pnpm build        # 빌드가 있는 3개 패키지 (-r)
pnpm test         # vitest, 단위·스냅샷
pnpm test:e2e     # 실제 프로젝트 생성 통합 테스트 (느림, 네트워크 필요)
pnpm lint         # oxlint && eslint .
pnpm lint:es      # ESLint만
pnpm lint:fix
```

### 린트는 oxlint + ESLint 하이브리드다

- **oxlint** (`.oxlintrc.json`) — 비타입 correctness 대부분을 Rust 속도로 담당
- **ESLint** (`eslint.config.mjs`) — oxlint가 못 하는 타입 인식 규칙 전담
- **eslint-plugin-oxlint** — 위 둘의 중복 규칙을 **마지막에** off 처리

`buildFromOxlintConfigFile(...)` 스프레드는 반드시 flat config 배열의 맨 끝에
와야 한다. 앞이나 중간에 두면 뒤따르는 config가 규칙을 다시 켜서 같은 문제가 두 번
보고된다.

`pnpm lint`는 `&&` 단락 평가라 oxlint가 실패하면 ESLint는 아예 돌지 않는다.
ESLint 쪽만 확인하려면 `pnpm lint:es`를 쓴다.

### e2e 테스트는 디스크를 쓴다

`pnpm test:e2e`는 한 번에 프로젝트 3개를 실제로 생성하고 각각 `node_modules`
트리를 만든다. **실패한 케이스의 생성물은 디버깅 증거로 남긴다** —
`~/Documents/develop/devkit-e2e-*-<pid>`. 조사가 끝나면 손으로 지운다.

```bash
rm -rf ~/Documents/develop/devkit-e2e-*
```

---

## 저장소 구조

```
packages/           7개 패키지
docs/superpowers/   설계 문서(specs)와 구현 계획(plans)
work-log.md         날짜별 작업 기록
eslint.config.mjs   저장소 자체 ESLint (하이브리드 구성)
.oxlintrc.json      저장소 자체 oxlint
tsconfig.base.json  패키지들이 extends하는 공통 tsconfig
vitest.config.ts    단위·스냅샷 테스트
vitest.e2e.config.ts 실생성 통합 테스트
```

각 패키지의 "왜 이렇게 했는가"는 해당 README에, 그보다 앞선 설계 판단은
`docs/superpowers/specs/`에 있다.

## 요구 사항

- Node.js `^20.19.0 || ^22.13.0 || >=24`
- pnpm (npm으로 실행하지 않는다 — 워크스페이스와 `link:` 해석이 pnpm 전제다)
