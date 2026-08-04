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

가장 간단한 방법은 `devbak update`다. **먼저 `--dry-run`으로 무엇이 바뀌는지 보고**,
대상의 워킹트리를 깨끗하게 만든 뒤 실행한다.

```bash
pnpm build
pnpm devbak update ../my-api --type nest --dry-run   # 변경 목록만 본다
pnpm devbak update ../my-api --type nest             # 확인 후 적용
```

```console
devkit update — my-api (nest)

  덮어쓰기 (2)
    package.json
    tsconfig.json
  신규 (9)
    .claude/agents/devkit-reviewer.md
    ...

계속할까요? (y/N)
```

`package.json`·`tsconfig.json`은 **키 단위로 병합**되므로 직접 넣은 의존성과
`compilerOptions.paths`가 보존된다. 반대로 `CLAUDE.md`·`eslint.config.mjs` 같은
JSON이 아닌 파일은 **통째로 덮인다** — `--only`로 그 카테고리를 빼면 건드리지 않는다.

마커가 없는 외부 프로젝트에는 `--type`이 필요하고, 전체 update가 마커를 심으면
다음부터는 생략할 수 있다. 옵션·카테고리·보존 범위는
[`packages/devkit-cli/README.md`](packages/devkit-cli/README.md#devbak-update--기존-프로젝트에-표준-재적용).

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

`build`·`test`·`lint`·`typecheck` 전부 [Turborepo](https://turbo.build)를
거친다. 패키지 7개 사이에 워크스페이스 의존이 없어(설정 패키지는 서로
import하지 않고, `devkit-cli`는 이들을 템플릿 내용으로만 조립한다) 스케줄링
이득은 없다 — turbo가 주는 것은 **캐싱**이다.

```bash
pnpm install
pnpm build         # 빌드가 있는 3개 패키지, 나머지는 dist 없음
pnpm typecheck     # tsc --noEmit, 패키지별 tsconfig
pnpm test          # vitest, 단위·스냅샷
pnpm test:e2e      # 실제 프로젝트 생성 통합 테스트 (느림, 네트워크 필요, 캐시 안 함)
pnpm lint          # lint:ox + 패키지별 lint + lint:root, 독립 병렬 실행
pnpm lint:es       # ESLint만 (전 패키지 + 루트)
pnpm lint:fix
```

바뀐 게 없으면 두 번째 실행은 즉시 `>>> FULL TURBO`로 끝난다. 한 패키지의
소스만 고치면 **그 패키지의 태스크만 재실행**되고 나머지는 캐시에서 replay된다
(turbo는 mtime이 아니라 파일 **내용 해시**로 캐시 키를 만든다 — `touch`로는
무효화되지 않는다). 한 패키지만 골라 돌리려면:

```bash
pnpm exec turbo run test --filter=@devbak/tsconfig
```

`pnpm test:e2e`는 캐시하지 않는다. 네트워크로 `create-next-app`·`@nestjs/cli`를
받고 디스크에 실제 프로젝트를 생성하는 외부 상태 의존 작업이라 캐시 키로
가둘 수 없기 때문이다. 기본 `pnpm test`에도 섞이지 않는다 — vitest 설정을
패키지별 `vitest.config.ts`(기본 test)와 `vitest.e2e.config.ts`(e2e 전용)로
분리해뒀다.

### 린트는 oxlint + ESLint 하이브리드다

- **oxlint** (`.oxlintrc.json`) — 비타입 correctness 대부분을 Rust 속도로 담당
- **ESLint** — 패키지마다 자기 `eslint.config.mjs`를 갖고, oxlint가 못 하는
  타입 인식 규칙만 전담한다. 공유 규칙 배열은 루트 `eslint.base.mjs`에 있고
  (파일명이 `eslint.config.*`가 아니어야 ESLint가 설정으로 자동 탐색해
  중첩되지 않는다), 루트 `eslint.config.mjs`는 `packages/**`를 무시해 저장소
  전체 린트에서 스코프 안 설정이 항상 정확히 하나이게 만든다(그렇지 않으면
  `multiple candidate TSConfigRootDirs`로 죽는다)
- **eslint-plugin-oxlint** — 위 둘의 중복 규칙을 **마지막에** off 처리

`buildFromOxlintConfigFile(...)` 스프레드는 반드시 flat config 배열의 맨 끝에
와야 한다. 앞이나 중간에 두면 뒤따르는 config가 규칙을 다시 켜서 같은 문제가 두 번
보고된다.

`pnpm lint`는 `turbo run lint:ox lint lint:root`로, `lint:ox`(oxlint 전체)·
`lint`(패키지별 ESLint)·`lint:root`(루트 ESLint)를 **독립 병렬 실행**한다.
분할 전에는 `oxlint && eslint .`라 oxlint가 실패하면 ESLint가 아예 돌지 않는
단락 평가였는데, 이제는 하나가 실패해도 다른 태스크의 결과가 그대로 나온다.
다만 turbo는 **첫 실패에서 나머지 태스크를 마저 죽여** 원인이 화면에서 밀려날
수 있다 — 전체 결과를 보려면 `--continue`를 붙인다.

```bash
pnpm exec turbo run lint:ox lint lint:root --continue
```

**검증할 때는 `pnpm lint:ox`와 `pnpm lint:es`를 둘 다 돌려야 한다.** `pnpm
lint:es`만으로는 부족하다 — `eslint-plugin-oxlint`가 oxlint와 겹치는 규칙을
ESLint 쪽에서 꺼 두므로, `no-unused-vars` 같은 규칙은 **oxlint에만 남아 있고**
`lint:es`는 그 위반에 대해 항상 초록불이다(위반이 없어서가 아니라 애초에 보지
않아서다). 실측: 미사용 `import type`이 `pnpm lint:es`를 통과한 채 커밋됐다가
`pnpm lint:ox`(따라서 `pnpm lint`)에서 걸렸다(`91590af`).

`pnpm lint:fix`는 여전히 `oxlint --fix && turbo run lint -- --fix && eslint .
--fix`로 `&&` 단락 평가다 — fix는 순서가 중요해(oxlint가 먼저 고치고 나서
ESLint가 나머지를 보는 편이 재작업이 적다) 병렬화하지 않았다.

### 새 패키지 체크리스트

루트 `eslint.config.mjs`는 `packages/**`를 무시하고, 루트 `vitest.config.ts`·
`vitest.e2e.config.ts`는 Task 2에서 삭제됐다. 그 결과 `turbo run lint`·
`turbo run test`·`turbo run typecheck`는 각각 해당 스크립트가 **있는** 패키지만
실행한다 — 새 패키지를 만들며 다음 중 하나라도 빠뜨리면 그 태스크만 조용히
건너뛰고 `pnpm lint`/`pnpm test`/`pnpm typecheck`는 초록불로 통과한다(분할 전에는
설정이 아예 없으면 저장소 전체가 요란하게 죽었지만, 지금은 빠진 패키지 하나만
넘어간다):

- `eslint.config.mjs` + `package.json`의 `"lint": "eslint ."`
- `vitest.config.ts` + `package.json`의 `"test": "vitest run --passWithNoTests"`
- `package.json`의 `"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tests/tsconfig.json"`
  (패키지 루트에 `tsconfig.json`이 없으면 `tests/tsconfig.json`만 검사해도 된다)

lint가 빠지면 품질 손실이지만 test가 빠지면 **정확성 손실**이다 — 테스트를
아무리 써 놓아도 0개가 돌고 아무도 모른다. `packages/devkit-cli/tests/package-task-coverage.test.ts`가
이 사각지대 세 곳을 전부 방어 테스트로 잡는다.

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
packages/           7개 패키지, 각자 eslint.config.mjs·vitest.config.ts 보유(e2e는 devkit-cli만)
docs/superpowers/   설계 문서(specs)와 구현 계획(plans)
work-log.md         날짜별 작업 기록
turbo.json          루트 태스크 정의(build/typecheck/lint/test)와 캐시 설정
eslint.config.mjs   저장소 자체 ESLint — packages/**는 무시(패키지별 설정과 스코프 충돌 방지)
eslint.base.mjs     패키지 eslint.config.mjs가 공유하는 규칙 배열
.oxlintrc.json      저장소 자체 oxlint (패키지별로 나누지 않음, 전체가 밀리초 단위)
tsconfig.base.json  패키지들이 extends하는 공통 tsconfig
```

vitest·tsconfig가 패키지별로 흩어져 있어 단위 테스트와 타입체크는 각 패키지
디렉토리 안에서 완결된다. 루트에는 이들을 묶는 turbo 태스크 정의만 남는다.

각 패키지의 "왜 이렇게 했는가"는 해당 README에, 그보다 앞선 설계 판단은
`docs/superpowers/specs/`에 있다.

## 요구 사항

- Node.js `^20.19.0 || ^22.13.0 || >=24`
- pnpm (npm으로 실행하지 않는다 — 워크스페이스와 `link:` 해석이 pnpm 전제다)
