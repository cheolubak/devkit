# @cheolubak/devkit-cli

devkit 표준(ESLint·Prettier·tsconfig·테스트 설정)이 적용된 프로젝트를 생성하는 CLI.

```bash
pnpm dlx @cheolubak/devkit-cli create my-api --type nest
```

`~/.npmrc`에 `@cheolubak` 스코프와 토큰이 있어야 한다(GitHub Packages는
공개 패키지도 익명 접근을 허용하지 않는다). 자세한 것은
[루트 README의 CLI 설치](../../README.md#cli-설치).

이 저장소에서 직접 실행할 수도 있다 — `pnpm install && pnpm build` 후
`pnpm devbak ...`. 개발·기여할 때 쓰는 경로다.

## 위치 — 실행한 위치(cwd) 기준이다

`devbak create <name>`은 실행한 디렉토리(cwd) 아래에 `<name>` 디렉토리를
만든다. 이 저장소(devkit 툴킷)와 형제 디렉토리여야 한다는 제약은 없다 —
생성물의 `package.json`은 `@cheolubak/*` 패키지를 `^0.1.0` 같은 **버전
범위**로 선언하고 GitHub Packages에서 내려받으므로, 생성물을 어디로
옮겨도(또는 아예 다른 머신에서 클론해도) `pnpm install`이 그대로 동작한다.

다만 생성물의 `pnpm install`이 되려면 `.npmrc`(생성물에 자동으로 놓인다)와
함께 `GITHUB_TOKEN` 환경변수가 있어야 한다 — GitHub Packages는 **공개
패키지도** 토큰 없는 접근을 허용하지 않는다.

```bash
export GITHUB_TOKEN=$(gh auth token)   # 또는 read:packages 권한의 PAT
```

## 사용법

**이 저장소에서 직접 실행할 때다.** `pnpm dlx`로 쓸 때는 위 첫 문단처럼
`pnpm dlx @cheolubak/devkit-cli <command>` 뒤에 아래와 같은 인자·옵션을
그대로 붙이면 된다.

```bash
pnpm build            # devkit-cli의 dist를 최신화한다 (필수 — 아래 참고)
pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]
pnpm devbak create --help                          # 사용법만 출력하고 종료
pnpm devbak version [path]                         # 버전 확인
pnpm devbak --version                              # CLI 버전만 한 줄로
```

- `<name>`: 생성할 디렉토리 이름이자 프로젝트 이름. 이미 존재하는 디렉토리는
  덮어쓰지 않고 던진다.
- `--type`: 아래 세 가지 중 하나. 필수.
- `--no-verify`: 생성 후 `pnpm install`은 그대로 하되 자가검증(`pnpm lint` /
  `pnpm build`)은 건너뛴다. 설치조차 건너뛰는 옵션은 없다 — 설치 없이는
  린트·빌드가 애초에 의미가 없다.
- `--help`: `create`·`update` 공통. 사용법 두 줄을 출력하고 exit 0.

CLI는 실행 전에 `dist/bin.js`가 `src/`보다 새로운지 확인하고, 오래됐으면
막는다. 저장소에서 직접 실행하는 방식에는 어떤 라이프사이클 스크립트도
돌지 않으므로 빌드를 잊으면 옛 코드가 조용히 실행되는 것을 스스로 막기
위해서다.

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
  `@cheolubak/*`는 catalog에 넣지 않는다 — `link:` 상대경로 시절에는 pnpm이
  catalog의 `link:` 항목을 거부해 그럴 수도 없었고, 레지스트리 버전 범위로
  바뀐 지금도 루트와 `apps/web`이 각자 버전 범위를 직접 선언하는 편이 더
  단순하다(둘 다 값이 같은 `^0.1.0`이라 catalog로 묶을 이득이 크지 않다).

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
| `templates/_shared/.github/scripts/wait-and-merge.sh` | 리뷰 결과를 폴링해 전부 통과하면 머지 |
| `templates/_shared/.claude/commands/merge.md` | `/merge` — 위 스크립트를 부른다 |
| `templates/nest/.claude/agents/devkit-reviewer.md` | NestJS 리뷰어 |
| `templates/next/.claude/agents/devkit-reviewer.md` | Next.js + FSD 리뷰어 |
| `templates/monorepo/.claude/agents/devkit-reviewer.md` | Turborepo 모노레포 리뷰어 |

**리뷰어는 린터가 원리적으로 못 잡는 것만 본다** — 크로스 파일 아키텍처, 조용한 실패, 테스트 공백, 의도와 구현의 불일치. 포맷·import 정렬·타입 오류는 `prettier`·`oxlint`·ESLint·`tsc`가 담당하며, 각 리뷰어 문서의 "지적하지 않는 것" 절이 이를 명시한다. 그 절이 "보는 것"보다 **앞에** 오는 것이 동작 요구다 — 리뷰어는 문서를 위에서부터 읽으므로 금지 목록이 뒤에 있으면 이미 지적을 만든 뒤에 읽는다. `tests/review-assets.test.ts`가 이 순서와 유형별 고유 관점을 구조 단언으로 고정한다.

### 배치 규칙

유형별 리뷰어(`.claude/agents/`)는 각 유형 오버레이에 들어 있어 `copyOverlay('<type>')`가 함께 놓는다. `_shared/`의 둘(`/review` 커맨드·CI 워크플로)은 세 레시피가 각각 `copyOverlay('_shared')`로 놓는다.

**모노레포는 리뷰 자산을 루트에만 둔다.** CI 워크플로는 저장소 루트의 `.github/workflows/`만 GitHub이 인식하고, `/review` 커맨드도 저장소를 열었을 때 보여야 한다. `monorepo` 레시피는 `apps/web`에 합성한 `next` 레시피가 놓은 `.claude`·`.github`를 지운다 — 앱 하위의 워크플로는 실행되지 않으면서 "있는데 왜 안 도는가"라는 침묵하는 오해만 남기기 때문이다.

### CI 워크플로를 쓰려면

생성된 저장소에 시크릿 `CLAUDE_CODE_OAUTH_TOKEN`을 등록해야 한다(API key가 아니다). 없으면 워크플로가 동작하지 않는다. **파일이 놓였다는 사실이 리뷰가 동작한다는 뜻은 아니다.**

### 머지

`.github/scripts/wait-and-merge.sh` 가 PR 을 폴링해 판정한다. GitHub Actions 는
관여하지 않는다 — 리뷰만 돌고, 머지는 사람이 부른 세션에서 일어난다.

```bash
bash .github/scripts/wait-and-merge.sh <PR번호>
```

판정은 세 갈래다.

| 접두 | 뜻 | 행동 |
| --- | --- | --- |
| `merge:` | 조건 충족 | `--rebase --delete-branch` 로 머지, 종료 코드 0 |
| `wait:` | 더 기다리면 해소될 수 있음 | 기본 20초 뒤 다시 폴링 |
| `stop:` | 기다려도 안 됨 | 사유 출력, 종료 코드 1 |

머지 조건은 넷이다.

| 조건 | 내용 |
| --- | --- |
| 상태 | PR 이 열려 있고 draft 가 아님 |
| 리뷰 | 철회되지 않은 변경 요청이 없음 |
| 통과 신호 | `claude-review` Commit Status 가 `success` 이고 생성자가 `github-actions[bot]` 또는 `github-actions` |
| 체크 | 다른 체크가 전부 완료·성공 |

생성자가 둘인 이유는 표기 차이다 — GraphQL(`gh pr view`)은 Actions 봇 로그인을
`github-actions`로 주고, REST(`gh api …/statuses`)는 `github-actions[bot]`로
준다. 게이트가 읽는 것은 REST 쪽이라 실제로는 `github-actions[bot]`만 오지만,
둘 다 받아 두지 않으면 GitHub 이 언제 표기를 바꿔도 알아채기 어렵다.

`claude-review` 는 **context 와 creator 를 둘 다** 본다. context 만 보면 외부 CI
의 초록불 하나로 머지되고, creator 를 안 보면 `statuses:write` 를 가진 임의의
앱이 같은 이름으로 `success` 를 심어 리뷰 없이 게이트를 뚫는다.

기본 타임아웃은 1800초다. `--timeout`·`--interval` 로 바꾼다. `--dry-run` 은
판정까지만 하고 머지하지 않는다.

**`no-auto-merge` 라벨은 기본 제공되지 않는다.** GitHub이 새 저장소에 만들어 주는
기본 라벨에 없으므로, 쓰려면 먼저 만들어야 한다.

```bash
gh label create no-auto-merge --description "이 PR 은 자동 머지하지 않는다"
```

**CI 워크플로를 추가해도 고칠 것이 없다.** 스크립트는 `statusCheckRollup` 을
통째로 집계하므로 새 체크가 자동으로 판정에 들어온다. 예전 `auto-merge.yml` 은
`on.workflow_run.workflows` 목록에 이름을 손으로 넣어야 했고, 빠뜨리면 PR 이
승인된 채로 조용히 멈췄다 — 이벤트로 깨어나지 않게 되면서 그 함정이 사라졌다.

**이 머지 기능은 `devbak update --only` 의 두 카테고리에 걸쳐 있다** —
`.claude/commands/merge.md`(`/merge` 커맨드)는 `claude` 카테고리, 
`.github/scripts/wait-and-merge.sh`(실제 판정·머지 로직)는 워크플로와 같은
`ci` 카테고리다(`categoryOf` 는 경로 기반이라 이 둘을 한 카테고리로 묶지
않는다). `--only` 로 하나만 고르면 절반만 놓인다.

- `--only claude` 는 `merge.md` 만 갱신한다. `wait-and-merge.sh` 는 오지
  않고, 은퇴한 `auto-merge.yml` 도 지워지지 않는다 — 소비자는 **없는 파일을
  부르는 `/merge`** 를 갖게 되고, 옛 자동 머지가 그대로 살아 있다.
- `--only ci` 는 `wait-and-merge.sh` 와 `claude-review.yml` 만 갱신한다.
  `/merge` 커맨드는 오지 않는다.

머지 기능 전체를 갱신하려면 `--only claude,ci` 로 둘 다 지정하거나, `--only`
를 아예 빼고 전체 update 를 돌린다.

## `devbak version` — 지금 무엇을 쓰고 있는지 본다

```
pnpm devbak version              # 실행한 위치(cwd) 기준
pnpm devbak version ../my-api    # 경로를 주면 그곳 기준
pnpm devbak --version            # CLI 버전만 한 줄로
```

세 층을 한 번에 낸다 — 설치된 CLI 자신, 프로젝트의 devkit 마커, 그리고
선언된 `@cheolubak/*`의 실제 설치 버전.

```
$ pnpm devbak version
devbak                          0.2.0

. (monorepo)                    0.1.0
  패키지                        선언    설치본
  @cheolubak/eslint-plugin-fsd  ^0.1.0  0.1.1
  @cheolubak/prettier-config    ^0.1.0  0.1.1

apps/web (next)                 0.1.0
  패키지                        선언    설치본
  @cheolubak/eslint-plugin-fsd  ^0.1.0  0.1.1
  @cheolubak/vitest-config      ^0.1.0  미설치
```

**선언과 설치본을 둘 다 내는 이유**: `package.json`에 심기는 값은 구체적
버전이 아니라 고정 캐럿 범위(`^0.1.0`)라, 선언만 보면 게시 대상이 전부
똑같아 보인다. 실제로 무엇이 깔렸는지는 `node_modules`를 봐야 안다.

**모노레포는 마커가 있는 하위 워크스페이스까지 함께 낸다.** 루트에
`monorepo` 마커, `apps/web`에 `next` 마커가 따로 들어가기 때문이다.

`devbak version`은 **실패하지 않는다** — devkit 프로젝트가 아니면 CLI 한
줄만 내고 종료 코드 0으로 끝난다. `pnpm build`를 하지 않아 `dist`가
낡았어도 막히지 않는다. 최신 버전이 나왔는지는 묻지 않으므로
(`pnpm outdated`가 답한다) 네트워크를 타지 않는다. 단, 준 경로 자체가
없거나 디렉토리가 아니면 그건 진단 결과가 아니라 입력 오류이므로
에러를 내고 종료 코드 1로 끝난다.

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

아래 두 출력은 실제로 돌려 받은 것을 그대로 옮긴 것이다(손으로 지어낸 개수가
아니다). 다만 `신규`의 대부분은 `.claude/skills/` 아래 스킬 카탈로그 파일이라
**정확한 개수는 여기 고정할 수 없다** — 스킬이 추가될 때마다 늘어난다(실제로
이 예시의 이전 버전은 13개라고 적었다가 스킬 카탈로그가 늘며 어긋났다). 아래는
그 파일들을 생략하고 뼈대만 남긴 것이다.

```console
$ pnpm devbak update ../demo-api --type nest --dry-run
devkit update — demo-api (nest)

  덮어쓰기 (2)
    package.json
    tsconfig.json
  신규 (92)
    .claude/agents/devkit-implementer.md
    .claude/agents/devkit-reviewer.md
    .claude/commands/api-test.md
    .claude/commands/issue-work.md
    .claude/commands/issue.md
    .claude/commands/merge.md
    .claude/commands/module.md
    .claude/commands/review.md
    .claude/commands/verify.md
    .claude/skills/…                              (스킬 카탈로그 전체 — 생략, 버전마다 늘어난다)
    .github/scripts/wait-and-merge.sh
    .github/workflows/claude-review.yml
    .gitignore
    .npmrc
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

  신규 (86)
    .claude/agents/devkit-implementer.md
    .claude/agents/devkit-reviewer.md
    .claude/commands/api-test.md
    .claude/commands/issue-work.md
    .claude/commands/issue.md
    .claude/commands/merge.md
    .claude/commands/module.md
    .claude/commands/review.md
    .claude/commands/verify.md
    .claude/skills/…                              (스킬 카탈로그 전체 — 생략, 버전마다 늘어난다)
    .github/scripts/wait-and-merge.sh
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
| `ci` | `.github/workflows/**`, `.github/scripts/**` |
| `lint` | `eslint.config.mjs`, `.prettierignore`, `package.json`의 `prettier` 키와 `scripts.lint`·`format`·`format:check` |
| `ts` | `tsconfig.json`, `tsconfig.build.json` |
| `test` | `jest.config.js`, `jest-e2e.config.js`, `test/jest-e2e.config.ts`, `vitest.config.ts`, `package.json`의 `jest` 키와 `scripts.test`·`test:watch`·`test:e2e` |
| `deps` | `package.json`의 `dependencies`·`devDependencies`(`@cheolubak/*` 버전 범위 재선언 포함), `.npmrc`. **이 카테고리가 대상이고 `package.json`이 실제로 바뀌면 `pnpm install`이 돈다** |
| `repo` | `.gitignore`\*, `pnpm-workspace.yaml`, `turbo.json`, `package.json`의 `packageManager`·`private`·`type`과 `scripts.build`·`dev`·`typecheck` |
| `scaffold` | `src/**` — 프레임워크 뼈대. **기본 제외**이며 명시해야만 대상이 된다 |

\* `.gitignore`는 이 표에서 유일하게 **통째로 덮이지 않고 병합된다.** 대상의
기존 규칙을 유지한 채 devkit 규칙 중 없는 것만 더하고, `# >>> devkit >>>`
블록만 통째로 갱신한다. 그 블록은 `.claude/` 안에서 devkit이 놓는 리뷰
자산(`agents/`·`commands/`)만 추적하고 나머지 개인 스크래치는 무시한다.

`link:`로 이 툴킷을 쓰던 프로젝트를 옮길 때는 한 가지를 손으로 해야 한다.
`deps`는 `@cheolubak/*` 버전 범위와 `.npmrc`를 **얹기만** 하므로, 기존
`"@devbak/tsconfig": "link:../eslint/packages/tsconfig"` 같은 항목은 그대로
남는다. 지우지 않으면 이어지는 `pnpm install`이 옛 패키지를 같이 설치하거나
(중복 설정) 경로가 깨져 실패한다. update를 돌린 뒤 `package.json`에서
`@devbak/` 항목을 지워라.

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

**`create`와 달리 공식 CLI를 다시 돌리지 않는다.** 파일 삭제·디렉토리 생성·자가검증도 하지 않는다 — 기존 프로젝트에서는 lint 실패가 update의 실패가 아니기 때문이다. 실행하는 것은 오버레이 복사와 `package.json` 병합, `@cheolubak/*` 버전 범위 재선언이다.

**단, `deps` 카테고리가 대상이고 `package.json`이 실제로 쓸 파일 목록에 있으면 그 뒤에 대상 프로젝트에서 `pnpm install`도 돈다.** 네트워크를 타고 대상의 `node_modules`를 갈아엎는다는 뜻이다. `--only`로 `deps`를 뺐거나 이번 실행에서 `package.json`이 실제로 바뀌지 않았다면(마커 version만 바뀐 경우도 "바뀐 것"으로 친다) install은 돌지 않는다. 끄는 CLI 플래그는 없다 — `runUpdate`의 `skipInstall`은 프로그램으로 호출할 때만 쓸 수 있는 옵션이고 `devbak update`에는 전달되지 않는다.

**JSON 파일은 통째로 덮지 않는다.** `package.json`·`tsconfig.json`은 키 단위로 병합되므로 직접 추가한 의존성과 `compilerOptions.paths`가 보존된다. 대가로 **키 삭제는 전파되지 않는다.**

**JSON이 아닌 오버레이 파일은 반대로 통째로 덮는다 — `.gitignore`만 예외다(위 참고).** 여기 해당하는 것: `CLAUDE.md`(`claude`), `eslint.config.mjs`·`.prettierignore`(`lint`), `jest.config.js`·`jest-e2e.config.js`·`vitest.config.ts`(`test`), `pnpm-workspace.yaml`(`repo`, monorepo 전용), `.claude/agents/**`·`.claude/commands/**`(`claude`), `.github/workflows/**`·`.github/scripts/**`(`ci`). 프로젝트 `CLAUDE.md`에 쌓아 온 규칙처럼 사용자가 직접 손댄 내용도 update 한 번에 템플릿판으로 되돌아간다. 데이터 손실은 아니다 — 변경 목록에 "덮어쓰기"로 뜨고, 워킹트리 dirty 게이트 덕에 `git checkout -- <path>`로 되돌릴 수 있다. 특정 파일군을 통째로 빼려면 `--only`에서 그 카테고리를 제외하면 된다 — 예: `CLAUDE.md`를 건드리지 않으려면 `--only ci,lint,ts,test,deps,repo`로 `claude`를 뺀다.

**마커가 없는 첫 적용에서는 통째로 교체되는 파일을 따로 알린다.** 변경 목록의 "덮어쓰기"는 두 가지를 한 단어로 뭉뚱그린다 — `package.json`처럼 기존 위에 패치가 얹히는 것과, `eslint.config.mjs`처럼 통째로 교체되는 것. 마커가 없다는 건 devkit이 이 프로젝트를 관리한 적이 없다는 뜻이고, 그러면 덮이는 것은 전부 사람이 쓴 것이므로 뒤쪽만 따로 이름 붙여 낸다. 마커가 있으면 그 "덮어쓰기"는 devkit 자신의 이전 산출물 갱신이라 알리지 않는다(매번 뜨면 노이즈가 된다).

**`"type": "module"`이 새로 얹히면 깨질 CommonJS `.js`를 미리 알린다.** `next` 레시피는 `vitest.config.ts`가 CJS로 번들링되는 것을 막으려 이 키를 심는데, 그 안전 근거("`create-next-app` 산출물에 `.js`가 없다")는 갓 생성된 프로젝트에만 성립한다. update는 오래 쓴 프로젝트에도 같은 키를 심으므로, 대상을 훑어 `require(`·`module.exports`를 쓰는 `.js`만 골라 낸다(`node_modules`·빌드 산출물·`public`은 건너뛴다). 해법은 `.cjs`로 개명하는 것인데 남의 파일을 devkit이 개명해 줄 수는 없어 고지까지만 한다.

**워킹트리가 dirty하면 거부한다.** 되돌리는 수단이 git이기 때문이다. `--force`로 우회할 수 있지만, 그러면 update의 결과와 미커밋 작업이 같은 diff에 섞인다. **`--dry-run`은 이 게이트를 통과한다** — 아무것도 쓰지 않으므로 되돌림 안전망이 애초에 필요 없고, 여기서 막으면 git 저장소가 아닌 대상에서 "그래도 계속할까요?" 확인 프롬프트에 걸려 비대화형 실행(CI 등)이 멈춰 선다. 즉 **git 저장소가 아닌 대상도 `--dry-run`으로는 미리 볼 수 있다** — 다만 실제 실행(`--dry-run` 없이)은 되돌릴 수단이 없다는 경고를 한 번 더 받는다.

**비대화형 환경에서는 `--yes` 또는 `--dry-run` 없이 실행할 수 없다.** TTY가 아닌데 둘 다 없으면 확인 프롬프트에 매달리는 대신 즉시 거부하고 대안을 알린다 — CI 로그에서 "멈춘 것처럼 보이는" 원인 불명 상태를 피하기 위해서다.

**유형 마커**: `create`가 `package.json`에 `{"devkit": {"type": ..., "version": ...}}`을 심는다. `monorepo`는 루트에 `monorepo` 마커, 합성된 `apps/web`에는 `next` 마커가 따로 들어간다 — 그래서 앱만 따로 `pnpm devbak update ../my-monorepo/apps/web`로 갱신할 수 있다.

**`--only`가 주어지면 마커를 심지 않는다.** 부분 적용을 "최신 표준 전부 반영"으로 표시하지 않기 위해서다. 그래서 마커 없는 외부 프로젝트를 `--only`만으로 갱신하면 다음 실행에도 `--type`이 필요하고, 명령이 완료 메시지에서 그 사실을 안내한다.

### 개발자용 — 템플릿 JSON은 정규형이어야 한다

`create`는 템플릿 JSON을 원문 텍스트 그대로 쓰지만 `update`는 `JSON.stringify(…, null, 2)`로 재직렬화한다. 템플릿에 손으로 압축한 배열(예: `["src", "test"]`을 한 줄로)이 있으면 의미는 같아도 바이트가 달라져, 갓 생성한 프로젝트에 `update`를 돌려도 "덮어쓰기"가 뜬다. `tests/overlay-coverage.test.ts`의 방어 테스트가 `templates/**/*.json`이 정규형인지 고정한다 — 새 템플릿 JSON을 추가할 때는 `JSON.stringify(JSON.parse(t), null, 2) + '\n'`와 바이트가 같은지 먼저 확인한다.

템플릿·테스트를 고친 뒤에는 `pnpm test`뿐 아니라 `pnpm lint:ox`·`pnpm lint:es`도 **둘 다** 돌려야 한다 — 이유는 루트 [`README.md`](../../README.md#이-저장소에서-개발하기)의 "린트는 oxlint + ESLint 하이브리드다" 절 참고.
