# @cheolubak/devkit-cli

devkit 표준(ESLint·Prettier·tsconfig·테스트 설정)이 적용된 프로젝트를 생성하는 CLI.

## 위치 제약 — 반드시 `~/Documents/develop/` 아래에서 실행한다

생성물의 `package.json`은 `@cheolubak/*` 패키지를 `link:` **상대경로**로 선언한다
(예: `link:../eslint/packages/eslint-config-nest`, 모노레포의 `apps/web`은
`link:../../../eslint/packages/...`). 이 상대경로는 생성물이 이 저장소
(devkit 툴킷, 예: `~/Documents/develop/eslint`)와 **형제 디렉토리**일 때만
유효하다.

즉 `devbak create <name>`은 항상 이 저장소의 **부모 디렉토리**(`~/Documents/develop/`)
아래에 `<name>` 디렉토리를 새로 만든다. 다른 위치로 프로젝트를 옮기면 `link:`
경로가 깨져 `pnpm install`부터 실패한다.

## 사용법

```bash
pnpm build            # devkit-cli의 dist를 최신화한다 (필수 — 아래 참고)
pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]
pnpm devbak create --help                          # 사용법만 출력하고 종료
```

- `<name>`: 생성할 디렉토리 이름이자 프로젝트 이름. 이미 존재하는 디렉토리는
  덮어쓰지 않고 던진다.
- `--type`: 아래 세 가지 중 하나. 필수.
- `--no-verify`: 생성 후 `pnpm install`은 그대로 하되 자가검증(`pnpm lint` /
  `pnpm build`)은 건너뛴다. 설치조차 건너뛰는 옵션은 없다 — 설치 없이는
  린트·빌드가 애초에 의미가 없다.
- `--help`: `create`·`update` 공통. 사용법 두 줄을 출력하고 exit 0.

CLI는 실행 전에 `dist/bin.js`가 `src/`보다 새로운지 확인하고, 오래됐으면
막는다. `link:` 소비는 어떤 라이프사이클 스크립트도 돌리지 않으므로 빌드를
잊으면 옛 코드가 조용히 실행되는 것을 스스로 막기 위해서다.

## 지원 유형

### `nest` — NestJS API

`@nestjs/cli new`로 스캐폴딩한 뒤:

- Prettier·ESLint를 `@cheolubak/eslint-config-nest` + `@cheolubak/prettier-config`로
  교체한다(`eslint-plugin-prettier` 제거, ESLint 10 전용).
- Jest 설정을 `@cheolubak/jest-config`로 교체한다(`package.json`의 `"jest"` 키
  제거).
- 입력 검증용 `zod`를 런타임 의존성으로 추가한다(devDependencies가 아님 —
  `pnpm install --prod` 배포 빌드에서 빠지면 안 되므로).
- 관용 폴더(`src/modules`, `src/common`)를 만든다.

### `next` — Next.js App Router (FSD)

`create-next-app`으로 스캐폴딩한 뒤:

- ESLint를 `@cheolubak/eslint-plugin-fsd/next` + `typescript-eslint`로 교체한다.
- Vitest를 `@cheolubak/vitest-config/next`로 연결한다(`jsdom`, 테스트 0개에서도
  통과하도록 `passWithNoTests: true`).
- `package.json`에 `"type": "module"`을 추가한다 — `create-next-app` 산출물이
  `"type"` 필드 없이 CJS로 취급되면 Vite의 config 로더가 `vitest.config.ts`를
  CJS로 번들링하다가 ESM 전용 `@cheolubak/vitest-config`를 `require()`하려고
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
  `@cheolubak/*`는 catalog에 넣을 수 없다(pnpm이 `link:` 항목을 거부) — 루트와
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

---

## Claude 코드 리뷰 자산

생성된 프로젝트가 Claude 기반 코드 리뷰를 갖추게 하는 오버레이다.

| 경로 | 내용 |
| --- | --- |
| `templates/_shared/.claude/commands/review.md` | 로컬 `/review` 슬래시 커맨드 |
| `templates/_shared/.github/workflows/claude-review.yml` | PR 자동 리뷰 워크플로 |
| `templates/nest/.claude/agents/devkit-reviewer.md` | NestJS 리뷰어 |
| `templates/next/.claude/agents/devkit-reviewer.md` | Next.js + FSD 리뷰어 |
| `templates/monorepo/.claude/agents/devkit-reviewer.md` | Turborepo 모노레포 리뷰어 |

**리뷰어는 린터가 원리적으로 못 잡는 것만 본다** — 크로스 파일 아키텍처, 조용한 실패, 테스트 공백, 의도와 구현의 불일치. 포맷·import 정렬·타입 오류는 `prettier`·`oxlint`·ESLint·`tsc`가 담당하며, 각 리뷰어 문서의 "지적하지 않는 것" 절이 이를 명시한다. 그 절이 "보는 것"보다 **앞에** 오는 것이 동작 요구다 — 리뷰어는 문서를 위에서부터 읽으므로 금지 목록이 뒤에 있으면 이미 지적을 만든 뒤에 읽는다. `tests/review-assets.test.ts`가 이 순서와 유형별 고유 관점을 구조 단언으로 고정한다.

### 배치 규칙

유형별 리뷰어(`.claude/agents/`)는 각 유형 오버레이에 들어 있어 `copyOverlay('<type>')`가 함께 놓는다. `_shared/`의 둘(`/review` 커맨드·CI 워크플로)은 세 레시피가 각각 `copyOverlay('_shared')`로 놓는다.

**모노레포는 리뷰 자산을 루트에만 둔다.** CI 워크플로는 저장소 루트의 `.github/workflows/`만 GitHub이 인식하고, `/review` 커맨드도 저장소를 열었을 때 보여야 한다. `monorepo` 레시피는 `apps/web`에 합성한 `next` 레시피가 놓은 `.claude`·`.github`를 지운다 — 앱 하위의 워크플로는 실행되지 않으면서 "있는데 왜 안 도는가"라는 침묵하는 오해만 남기기 때문이다.

### CI 워크플로를 쓰려면

생성된 저장소에 시크릿 `CLAUDE_CODE_OAUTH_TOKEN`을 등록해야 한다(API key가 아니다). 없으면 워크플로가 동작하지 않는다. **파일이 놓였다는 사실이 리뷰가 동작한다는 뜻은 아니다.**

## `devbak update` — 기존 프로젝트에 표준 재적용

```bash
pnpm build
pnpm devbak update ../my-api                    # 마커가 있으면 유형 자동
pnpm devbak update ../legacy --type nest        # 마커가 없으면 유형 명시
pnpm devbak update ../my-api --only claude,ci   # 일부만
pnpm devbak update ../my-api --dry-run          # 목록만 보고 끝
pnpm devbak update --help                       # 사용법만 출력하고 종료
```

### 처음 쓴다면 — 권장 순서

**1. 무엇이 바뀌는지 먼저 본다.** `--dry-run`은 아무것도 쓰지 않는다.

```console
$ pnpm devbak update ../demo-api --type nest --dry-run
devkit update — demo-api (nest)

  덮어쓰기 (2)
    package.json
    tsconfig.json
  신규 (9)
    .claude/agents/devkit-reviewer.md
    .claude/commands/review.md
    .github/workflows/claude-review.yml
    .gitignore
    .prettierignore
    CLAUDE.md
    eslint.config.mjs
    jest-e2e.config.js
    jest.config.js

--dry-run — 아무것도 쓰지 않았습니다.
```

**2. 넓으면 `--only`로 좁힌다.** 한 번에 다 바꿀 이유는 없다.

```console
$ pnpm devbak update ../demo-api --type nest --only claude,ci --dry-run
devkit update — demo-api (nest)

  신규 (4)
    .claude/agents/devkit-reviewer.md
    .claude/commands/review.md
    .github/workflows/claude-review.yml
    CLAUDE.md
```

**3. 대상의 워킹트리를 깨끗하게 만든다.** 커밋하거나 stash한다. update는 dirty한 트리를 거부하는데, 되돌리는 수단이 git이기 때문이다 — 결과가 미커밋 작업과 섞이면 `git checkout`이 둘 다 지운다.

**4. 실행한다.** 확인 프롬프트에서 목록을 한 번 더 보고 `y`를 누른다(`--yes`로 생략 가능).

```console
$ pnpm devbak update ../demo-api --type nest --only lint
devkit update — demo-api (nest)

  덮어쓰기 (1)
    package.json
  신규 (2)
    .prettierignore
    eslint.config.mjs

계속할까요? (y/N) y
  씀: .prettierignore
  씀: eslint.config.mjs
  씀: package.json

완료. git diff 로 검토하세요.
설정이 바뀌었으니 pnpm lint 를 한 번 돌려보길 권합니다.
마커가 없어 다음에도 --type 이 필요합니다. 전체 update 가 마커를 심습니다.
```

**5. `git diff`로 검토하고 `pnpm lint`를 돌린다.** 기존 프로젝트에는 새 규칙에 걸리는 코드가 있을 수 있다 — 그것은 update의 실패가 아니라 이제 드러난 위반이다.

같은 명령을 다시 돌리면 전부 "동일 — 건너뜀"이 된다. 이미 반영된 것을 또 쓰지 않는다.

```console
$ pnpm devbak update ../demo-api --type nest --only lint --dry-run
알림: 커밋되지 않은 변경이 3건 있습니다. 실제 실행은 --force 없이는 거부됩니다.
devkit update — demo-api (nest)

  동일 — 건너뜀 (3)
    .prettierignore
    eslint.config.mjs
    package.json
```

### `--only` 카테고리가 건드리는 것

| 카테고리 | 대상 |
| --- | --- |
| `claude` | `CLAUDE.md`, `.claude/agents/**`, `.claude/commands/**` |
| `ci` | `.github/workflows/**` |
| `lint` | `eslint.config.mjs`, `.prettierignore`, `package.json`의 `prettier` 키와 `scripts.lint`·`format`·`format:check` |
| `ts` | `tsconfig.json`, `tsconfig.build.json` |
| `test` | `jest.config.js`, `jest-e2e.config.js`, `test/jest-e2e.config.ts`, `vitest.config.ts`, `package.json`의 `jest` 키와 `scripts.test`·`test:watch`·`test:e2e` |
| `deps` | `package.json`의 `dependencies`·`devDependencies`(`link:` 재계산 포함). **이 카테고리가 대상이고 `package.json`이 실제로 바뀌면 `pnpm install`이 돈다** |
| `repo` | `.gitignore`, `pnpm-workspace.yaml`, `turbo.json`, `package.json`의 `packageManager`·`private`·`type`과 `scripts.build`·`dev`·`typecheck` |
| `scaffold` | `src/**` — 프레임워크 뼈대. **기본 제외**이며 명시해야만 대상이 된다 |

`scaffold`가 기본 제외인 이유는 그 파일들이 생성 시점에 한 번 놓이고 그 뒤로는 사람이 고쳐 쓰는 것이기 때문이다. 재적용이 덮으면 사용자의 작업이 사라진다.

### 사용자가 손댄 것은 어디까지 보존되는가

앞의 예시에서 대상 `package.json`은 이렇게 남는다 — `name`·`version`과 직접 넣은 `my-lib`가 그대로 있고 표준 키만 얹혔다.

```jsonc
{
  "name": "demo-api",          // 보존
  "version": "1.4.0",          // 보존
  "dependencies": {
    "my-lib": "^2.0.0"         // 보존
  },
  "prettier": "@cheolubak/prettier-config",   // 얹힘
  "scripts": {                             // 얹힘
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

`tsconfig.json`의 `compilerOptions.paths`도 같은 방식으로 살아남는다. **JSON이 아닌 파일은 그렇지 않다** — 아래 "JSON이 아닌 오버레이" 항목을 반드시 읽어라.

| 옵션 | 의미 |
| --- | --- |
| `path` | 대상. 생략하면 현재 디렉토리 |
| `--only` | `claude`·`ci`·`lint`·`ts`·`test`·`deps`·`repo`·`scaffold`. 생략하면 `scaffold`를 뺀 전체 |
| `--type` | 마커가 없을 때 유형 지정 |
| `--dry-run` | 변경 목록만 출력하고 아무것도 쓰지 않는다 |
| `--yes` | 확인 프롬프트 생략 |
| `--force` | git 관련 거부만 우회 |
| `--help` | (`create`·`update` 공통) 사용법 두 줄을 출력하고 종료. 다른 옵션이 있어도 우선한다 |

**`create`와 달리 공식 CLI를 다시 돌리지 않는다.** 파일 삭제·디렉토리 생성·자가검증도 하지 않는다 — 기존 프로젝트에서는 lint 실패가 update의 실패가 아니기 때문이다. 실행하는 것은 오버레이 복사와 `package.json` 병합, `link:` 재계산이다.

**단, `deps` 카테고리가 대상이고 `package.json`이 실제로 쓸 파일 목록에 있으면 그 뒤에 대상 프로젝트에서 `pnpm install`도 돈다.** 네트워크를 타고 대상의 `node_modules`를 갈아엎는다는 뜻이다. `--only`로 `deps`를 뺐거나 이번 실행에서 `package.json`이 실제로 바뀌지 않았다면(마커 version만 바뀐 경우도 "바뀐 것"으로 친다) install은 돌지 않는다. 끄는 CLI 플래그는 없다 — `runUpdate`의 `skipInstall`은 프로그램으로 호출할 때만 쓸 수 있는 옵션이고 `devbak update`에는 전달되지 않는다.

**JSON 파일은 통째로 덮지 않는다.** `package.json`·`tsconfig.json`은 키 단위로 병합되므로 직접 추가한 의존성과 `compilerOptions.paths`가 보존된다. 대가로 **키 삭제는 전파되지 않는다.**

**JSON이 아닌 오버레이 파일은 반대로 통째로 덮는다.** 여기 해당하는 것: `CLAUDE.md`(`claude`), `eslint.config.mjs`·`.prettierignore`(`lint`), `.gitignore`(`repo`), `jest.config.js`·`jest-e2e.config.js`·`vitest.config.ts`(`test`), `pnpm-workspace.yaml`(`repo`, monorepo 전용), `.claude/agents/**`·`.claude/commands/**`(`claude`), `.github/workflows/**`(`ci`). 프로젝트 `CLAUDE.md`에 쌓아 온 규칙처럼 사용자가 직접 손댄 내용도 update 한 번에 템플릿판으로 되돌아간다. 데이터 손실은 아니다 — 변경 목록에 "덮어쓰기"로 뜨고, 워킹트리 dirty 게이트 덕에 `git checkout -- <path>`로 되돌릴 수 있다. 특정 파일군을 통째로 빼려면 `--only`에서 그 카테고리를 제외하면 된다 — 예: `CLAUDE.md`를 건드리지 않으려면 `--only ci,lint,ts,test,deps,repo`로 `claude`를 뺀다.

**워킹트리가 dirty하면 거부한다.** 되돌리는 수단이 git이기 때문이다. `--force`로 우회할 수 있지만, 그러면 update의 결과와 미커밋 작업이 같은 diff에 섞인다. **`--dry-run`은 이 게이트를 통과한다** — 아무것도 쓰지 않으므로 되돌림 안전망이 애초에 필요 없고, 여기서 막으면 git 저장소가 아닌 대상에서 "그래도 계속할까요?" 확인 프롬프트에 걸려 비대화형 실행(CI 등)이 멈춰 선다. 즉 **git 저장소가 아닌 대상도 `--dry-run`으로는 미리 볼 수 있다** — 다만 실제 실행(`--dry-run` 없이)은 되돌릴 수단이 없다는 경고를 한 번 더 받는다.

**비대화형 환경에서는 `--yes` 또는 `--dry-run` 없이 실행할 수 없다.** TTY가 아닌데 둘 다 없으면 확인 프롬프트에 매달리는 대신 즉시 거부하고 대안을 알린다 — CI 로그에서 "멈춘 것처럼 보이는" 원인 불명 상태를 피하기 위해서다.

**유형 마커**: `create`가 `package.json`에 `{"devkit": {"type": ..., "version": ...}}`을 심는다. `monorepo`는 루트에 `monorepo` 마커, 합성된 `apps/web`에는 `next` 마커가 따로 들어간다 — 그래서 앱만 따로 `pnpm devbak update ../my-monorepo/apps/web`로 갱신할 수 있다.

**`--only`가 주어지면 마커를 심지 않는다.** 부분 적용을 "최신 표준 전부 반영"으로 표시하지 않기 위해서다. 그래서 마커 없는 외부 프로젝트를 `--only`만으로 갱신하면 다음 실행에도 `--type`이 필요하고, 명령이 완료 메시지에서 그 사실을 안내한다.

### 개발자용 — 템플릿 JSON은 정규형이어야 한다

`create`는 템플릿 JSON을 원문 텍스트 그대로 쓰지만 `update`는 `JSON.stringify(…, null, 2)`로 재직렬화한다. 템플릿에 손으로 압축한 배열(예: `["src", "test"]`을 한 줄로)이 있으면 의미는 같아도 바이트가 달라져, 갓 생성한 프로젝트에 `update`를 돌려도 "덮어쓰기"가 뜬다. `tests/overlay-coverage.test.ts`의 방어 테스트가 `templates/**/*.json`이 정규형인지 고정한다 — 새 템플릿 JSON을 추가할 때는 `JSON.stringify(JSON.parse(t), null, 2) + '\n'`와 바이트가 같은지 먼저 확인한다.

템플릿·테스트를 고친 뒤에는 `pnpm test`뿐 아니라 `pnpm lint:ox`·`pnpm lint:es`도 **둘 다** 돌려야 한다 — 이유는 루트 [`README.md`](../../README.md#이-저장소에서-개발하기)의 "린트는 oxlint + ESLint 하이브리드다" 절 참고.
