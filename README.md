# devkit — 개발 표준 툴킷

개인 프로젝트의 린트·포맷·타입·테스트 설정을 한 곳에 모아두고, 그 표준이 적용된
새 프로젝트를 명령 하나로 만들어내는 pnpm 모노레포다.

두 갈래로 쓴다.

1. **설정 패키지를 직접 소비한다** — 기존 프로젝트에서 `@cheolubak/eslint-config-nest`,
   `@cheolubak/tsconfig` 같은 패키지를 GitHub Packages에서 `pnpm add -D`로 설치해 쓴다.
2. **새 프로젝트를 생성한다** — `devbak create`가 공식 CLI로 뼈대를 만든 뒤 위
   패키지들로 설정을 교체한다.

> 로컬 디렉토리 이름은 `eslint`, 워크스페이스 이름은 `eslint-workspace`,
> GitHub 저장소 이름은 `devkit`이다. 셋 다 같은 저장소를 가리킨다.

---

## 패키지

| 패키지 | 역할 | 빌드 |
| --- | --- | --- |
| [`@cheolubak/devkit-cli`](packages/devkit-cli) | `devbak create`로 nest·next·monorepo 프로젝트 생성 | tsup |
| [`@cheolubak/eslint-plugin-fsd`](packages/eslint-plugin-fsd) | Feature-Sliced Design 강제 ESLint 플러그인 (+ React/Next 프리셋) | tsup |
| [`@cheolubak/eslint-config-nest`](packages/eslint-config-nest) | NestJS용 타입 인식 ESLint 설정 (zod DTO 검증 포함) | tsup |
| [`@cheolubak/tsconfig`](packages/tsconfig) | tsconfig 프리셋 4종 (`base`·`nest`·`next`·`lib`) | 없음 (JSON) |
| [`@cheolubak/prettier-config`](packages/prettier-config) | 공용 Prettier 설정 | 없음 (JSON) |
| [`@cheolubak/jest-config`](packages/jest-config) | NestJS용 Jest 설정 (`nest`·`nest-e2e`) | 없음 (CJS) |
| [`@cheolubak/vitest-config`](packages/vitest-config) | Vitest 설정 (`next`·`node`) | 없음 (ESM) |

**빌드가 없는 쪽이 기본이고, 있는 쪽이 예외다.** 게시된 tarball은 게시 시점의
`dist`를 그대로 얼려 담는다. 그래서 빌드가 필요한 패키지는 `pnpm build`를 잊고
게시하면 낡거나 빈 `dist`가 그 버전으로 굳어버린다(같은 버전 재게시는 안 된다 —
바로잡으려면 버전을 올려 다시 게시해야 한다). JSON·CJS·ESM 순수 객체로 낼 수
있는 것은 전부 빌드 없이 두어 이 위험을 아예 겪지 않게 했다. 반대로 빌드가
필요한 `devkit-cli`는 `dist/bin.js`가 `src/`보다 오래되면 **실행 자체를
거부한다** — 같은 함정을 스스로 막기 위해서다(게시 경로는
`prepublishOnly: pnpm build`가 지키지만, 저장소에서 직접 실행할 때는 어떤
훅도 돌지 않으므로 이 검사가 유일한 방어선이다).

## 의존 방향

```
@cheolubak/tsconfig ─┐
@cheolubak/prettier-config ─┤
@cheolubak/jest-config ─┼─→ devkit-cli 템플릿 ─→ 생성된 프로젝트
@cheolubak/vitest-config ─┤        (GitHub Packages 버전 범위로 선언)
@cheolubak/eslint-config-nest ─┤
@cheolubak/eslint-plugin-fsd ─┘
```

설정 패키지들은 서로를 import하지 않는다. `devkit-cli`가 이들을 조립해 생성물의
`package.json`·설정 파일에 꽂아 넣을 뿐이다.

---

## CLI 설치

`devbak`은 설치 없이 바로 쓸 수 있다.

```bash
pnpm dlx @cheolubak/devkit-cli create my-api --type nest
```

**단, GitHub Packages는 공개 패키지도 익명 접근을 허용하지 않는다.** CLI를
받는 것부터 인증이 필요하므로 `~/.npmrc`에 스코프와 토큰을 한 번 설정해야
한다.

```
@cheolubak:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
gh auth refresh -h github.com -s read:packages   # 브라우저에서 승인
export GITHUB_TOKEN=$(gh auth token)             # ~/.zshrc 에 넣어두면 편하다
```

확인:

```bash
gh auth status | grep -i scopes                  # read:packages 가 보여야 한다
```

`gh` 대신 [PAT](https://github.com/settings/tokens)(classic, `read:packages`)을
써도 된다. 토큰은 생성물의 `pnpm install`에도 그대로 쓰인다 — 생성물이
`@cheolubak/*` 설정 패키지를 같은 레지스트리에서 받기 때문이다.

### 개발·기여용 — 저장소에서 실행하기

이 저장소 자체를 고치거나 템플릿을 바꿔가며 시험하려면 클론해서 직접 돌린다.

```bash
git clone https://github.com/cheolubak/devkit.git
cd devkit
pnpm install
pnpm build            # devkit-cli의 dist 생성 — 이걸 빼먹으면 CLI가 실행을 거부한다
pnpm devbak --help
```

```console
사용법:
  pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]
  pnpm devbak update [path] [--only <categories>] [--type <t>] [--dry-run] [--yes] [--force]
```

`pnpm build`가 필수인 이유는 CLI가 매 실행마다 `dist/bin.js`가 `src/`보다
새로운지 확인하고 오래됐으면 막기 때문이다. 저장소에서 직접 실행하는 방식에는
`prepare` 같은 라이프사이클 훅이 안 돌아 빌드를 잊기 쉬운데, 그러면 옛 코드가
조용히 실행된다 — 그것을 막는 방어다. **`git pull` 뒤에는 `pnpm build`를 다시
돌려라.** `devbak create`가 끝에 `pnpm install`을 돌리므로 위에서 설정한
`GITHUB_TOKEN`이 이 경로에도 그대로 필요하다.

### 문제가 생기면

| 증상 | 원인과 해결 |
| --- | --- |
| `devkit-cli의 dist가 src보다 오래됐습니다` | 저장소에서 `pnpm build` |
| `pnpm dlx` 가 `401`/`ERR_PNPM_FETCH_401` 로 실패 | `~/.npmrc`에 `@cheolubak` 스코프 설정이 없거나 `GITHUB_TOKEN`이 비어 있다. 위 설치 절 참고 |
| 생성 도중 `pnpm install` 실패, `401`/`ERR_PNPM_FETCH_401` | `GITHUB_TOKEN`이 없거나 `read:packages` 스코프가 없다. 위 설치 절 참고 |
| `Cannot find package '@cheolubak/...'` | 설치가 안 된 상태로 린트·빌드가 돈 것이다. 생성물에서 `pnpm install`을 먼저 |
| `<name> 디렉토리가 이미 존재합니다` | 덮어쓰지 않는 것이 의도다. 다른 이름을 쓰거나 기존 디렉토리를 치울 것 |

---

## 새 프로젝트 만들기

[CLI 설치](#cli-설치)를 마쳤다면:

```bash
pnpm dlx @cheolubak/devkit-cli create my-api --type nest   # 또는 --type next | monorepo
```

저장소에서 개발 중이라면 위 `## CLI 설치`의 `### 개발·기여용` 소절대로
`pnpm devbak create ...`로 같은 일을 한다.

| 유형 | 뼈대 | 얹는 표준 |
| --- | --- | --- |
| `nest` | `@nestjs/cli new` | eslint-config-nest, prettier-config, jest-config, zod |
| `next` | `create-next-app` | eslint-plugin-fsd/next, prettier-config, vitest-config/next, FSD 레이어 |
| `monorepo` | Turborepo + 위 `next` 레시피를 `apps/web`에 합성 | 루트에서 한 번만 lint/build |

### 인자와 옵션

| 인자·옵션 | 설명 |
| --- | --- |
| `<name>` (필수) | 생성할 디렉토리 이름이자 프로젝트 이름. **이미 있으면 덮어쓰지 않고 던진다** |
| `--type <t>` (필수) | `nest` \| `next` \| `monorepo` |
| `--no-verify` | `pnpm install`은 그대로 하되 자가검증(`pnpm lint`·`pnpm build`)만 건너뛴다. 설치까지 건너뛰는 옵션은 없다 — 설치 없이는 린트·빌드가 애초에 의미가 없다 |
| `--help` | 사용법 두 줄을 출력하고 exit 0 |

### 무엇이 일어나는가

1. **공식 CLI로 뼈대를 만든다** — `@nestjs/cli new` 또는 `create-next-app`.
   뼈대는 직접 손으로 흉내 내지 않는다(프레임워크가 바뀌면 따라가야 하므로).
2. **설정을 devkit 표준으로 교체한다** — `eslint.config.mjs`·`tsconfig.json`·
   테스트 설정·`.prettierignore`를 얹고, `package.json`에 `@cheolubak/*`를
   `^0.1.0` 버전 범위로 선언한다. `.npmrc`도 함께 놓는다.
3. **`package.json`에 마커를 심는다** — `{"devkit": {"type", "version"}}`.
   나중에 `devbak update`가 `--type` 없이도 유형을 알아낸다.
4. **`pnpm install`을 돌린다** — 여기서 토큰이 필요하다.
5. **자가검증** — `pnpm lint`와 `pnpm build`를 돌려 생성물이 실제로 통과하는지
   확인한다. 실패하면 **생성물을 지우지 않고 남긴다**(지우면 디버깅이 불가능하다).

`devbak create`는 실행한 위치(cwd) 기준으로 `<name>` 디렉토리를 만든다 — 이
저장소의 형제 디렉토리여야 한다는 제약은 없다. 생성물은 `@cheolubak/*`를
`^0.1.0` 같은 **버전 범위**로 선언하고 GitHub Packages에서 내려받으므로, 어디로
옮겨도 `pnpm install`이 그대로 동작한다. 다만 생성물에는 `.npmrc`가 함께
놓이고, `pnpm install`이 되려면 `GITHUB_TOKEN` 환경변수가 있어야 한다 —
**공개 패키지도 예외가 아니다**(GitHub Packages 자체 제약, 아래 "기존
프로젝트에 붙이기" 참고).

세 유형 모두 Claude 기반 코드 리뷰 자산(`/review` 슬래시 커맨드, PR 자동 리뷰
워크플로, 유형별 리뷰어 에이전트)과 **자동 머지 워크플로**를 함께 놓는다. 리뷰가
통과하면 Claude가 승인하고, **신뢰할 수 있는** 승인이 1건 이상이면 PR이 rebase로
머지된다 — 승인은 `authorAssociation`이 `OWNER`/`MEMBER`/`COLLABORATOR`이거나 작성자가
`github-actions[bot]`인 것만 센다. 공개 저장소에서는 읽기 권한만 있는 아무나가 승인
리뷰를 남길 수 있기 때문이다. **승인은 그것이 달린 커밋에도 묶인다** — 승인 뒤에 새
커밋이 푸시되면 그 승인은 자동 머지에 쓰이지 않는다. 브랜치 보호가 없으면 새 푸시가
기존 승인을 무효화하지 않으므로, 이 조건이 없으면 검토되지 않은 코드가 머지된다.
`no-auto-merge` 라벨을 붙이면 그 PR은 제외되지만,
**이 라벨은 기본 제공되지 않는다** — `gh label create no-auto-merge`로 먼저 만들어야
쓸 수 있다. CI 워크플로를 실제로 돌리려면 생성된 저장소에 시크릿
`CLAUDE_CODE_OAUTH_TOKEN`을 등록해야 한다(API key가 아니다).
자세한 내용은 [`packages/devkit-cli/README.md`](packages/devkit-cli/README.md).

---

## 기존 프로젝트에 붙이기

가장 간단한 방법은 `devbak update`다. **먼저 `--dry-run`으로 무엇이 바뀌는지 보고**,
대상의 워킹트리를 깨끗하게 만든 뒤 실행한다.

```bash
pnpm dlx @cheolubak/devkit-cli update ../my-api --type nest --dry-run   # 변경 목록만 본다
pnpm dlx @cheolubak/devkit-cli update ../my-api --type nest             # 확인 후 적용
```

저장소에서 개발 중이라면 `pnpm build` 후 `pnpm devbak update ...`로 같은 일을 한다.

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

### 첫 적용에서 update가 따로 경고하는 것

devkit이 관리한 적 없는 프로젝트(마커 없음)에서는 "덮어쓰기"로 잡힌 파일이 전부
**사람이 쓴 것**이다. 그래서 첫 적용에 한해 두 가지를 따로 알린다. 둘 다 차단이
아니라 고지다 — devkit이 대신 고쳐 줄 수 없는 종류라, 조용히 지나가지 않는 것이
할 수 있는 전부다.

- **통째로 교체되는 파일 목록.** `eslint.config.mjs`의 `ignores`처럼 devkit이 알 수
  없는 설정은 복원되지 않는다. 실제로 이걸 놓쳐 저장소 안의 라이브 git
  worktree(`node_modules` 포함)를 린트하다, 거기 설치된 구버전
  `eslint-plugin-react`가 ESLint 10 API와 충돌해 린트가 결과가 아니라
  **크래시(exit 2)** 로 끝난 적이 있다. 적용 후 `ignores`를 다시 얹어야 한다.
- **`"type": "module"`이 새로 얹히며 깨지는 CommonJS `.js`.** 확장자를 `.cjs`로
  바꾸고 `require.resolve` 같은 참조도 함께 고친다.

### 먼저 걷어내야 하는 패키지

devkit의 ESLint 프리셋은 ESLint 10 위에서 돈다. 기존 프로젝트에 남은 **옛 설정
패키지가 구버전 플러그인을 함께 끌고 오면** 그쪽이 먼저 크래시한다.

```bash
pnpm why eslint-plugin-react    # 무엇이 물고 오는지 먼저 본다
pnpm remove eslint-config-next
```

`eslint-config-next`가 대표적이다 — 16.3.0 기준 `dependencies`에
`eslint-plugin-react@^7.37.0`(ESLint 10에서 제거된 `context.getFilename()`을
호출한다)과 `eslint-plugin-import@^2.32.0`이 들어 있다
(`npm view eslint-config-next dependencies`로 확인).

**devkit이 쓰는 `@next/eslint-plugin-next`는 다르다** — 16.2.12 기준
`peerDependencies`가 없고 의존성도 `fast-glob` 하나뿐이라 이 문제와 무관하다.
이름이 비슷해 크래시 원인을 devkit 프리셋으로 오인하기 쉬우므로 구분한다.

`eslint-plugin-jsx-a11y@6.10.2`는 아직 ESLint 10을 peer로 선언하지 않아 설치 시
경고가 나오지만 제거된 API를 호출하지 않으므로 **정상 동작한다** — 지우지 않는다.

수동으로 붙이려면 아래처럼 한다. 각 패키지 README에도 설치·설정 예시가 있다.
패키지는 GitHub Packages에 게시돼 있으므로 `pnpm add -D`로 설치하고, peer는
직접 설치한다.

```bash
pnpm add -D @cheolubak/eslint-config-nest @cheolubak/tsconfig eslint typescript-eslint
```

**GitHub Packages는 `@cheolubak` 스코프를 npm 기본 레지스트리로 풀지 않는다.**
소비자 프로젝트 루트에 아래 `.npmrc`가 있어야 하고 — `devbak create`/`devbak
update`가 놓아주는 것과 같다 —, `GITHUB_TOKEN` 환경변수도 있어야 `pnpm
install`이 된다. **공개(public) 패키지도 마찬가지다** — GitHub Packages는
익명 접근을 지원하지 않아 `read:packages` 권한이 있는 토큰이 항상 필요하다.

```
@cheolubak:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
export GITHUB_TOKEN=$(gh auth token)   # 또는 read:packages 권한의 PAT
```

**ESLint 버전 요구가 패키지마다 다르다.** `@cheolubak/eslint-config-nest`는 ESLint 10
전용이고, `@cheolubak/eslint-plugin-fsd`는 9 또는 10을 받는다.

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
pnpm exec turbo run test --filter=@cheolubak/tsconfig
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

### 릴리스는 자동이다

`main`에 push되면 `.github/workflows/release.yml`이 검증하고, 버전을 올리고,
게시한다. 손으로 `pnpm publish`를 칠 일이 없다.

**무엇이 릴리스를 부르는가** — 경로가 대상을 정하고, 커밋 접두가 크기를 정한다.

| 접두 | 올림 |
| --- | --- |
| `feat:` | minor |
| `fix:` · `refactor:` · `perf:` · `build:` | patch |
| `docs:` · `test:` · `chore:` | 없음 |
| 본문에 `BREAKING CHANGE:` 또는 제목에 `!` | major |

`tests/**`·`README.md`·설정 파일(`eslint.config.mjs`·`vitest.config.ts`·
`tsconfig.json`·`tsup.config.ts`·`turbo.json`)만 바뀌면 릴리스되지 않는다 —
tarball에 안 들어가거나 동작을 바꾸지 않기 때문이다.

**두 축이 따로 움직인다.**

- **설정 6개는 락스텝** — 하나만 바뀌어도 함께 올라간다. 생성물이 선언하는
  `DEVKIT_VERSION_RANGE`가 상수 하나라서, 6개가 다른 마이너로 흩어지면
  표현할 수 없다. 마이너 이상이면 그 상수도 자동으로 갱신된다.
- **`devkit-cli`는 단독** — `templates/`가 이 패키지 안에 있으므로 템플릿만
  바뀌어도 CLI가 새로 나간다.

**검증이 먼저다.** `test`·`typecheck`·`lint:ox`·`lint:es`·`test:e2e`가 전부
통과해야 게시한다. e2e가 일시적으로 실패하면 릴리스가 막히는데, 깨진 것을
게시하는 쪽보다 낫다고 판단했다 — 되돌릴 수 없기 때문이다(GitHub Packages는
같은 버전 재게시가 안 된다).

**게시가 중간에 실패하면 사람이 개입한다.** 일부만 올라간 상태에서 커밋·태그를
남기지 않고 워크플로가 실패한다. 자동 복구는 하지 않는다. `pnpm -r publish`는
**이미 게시된 버전을 건너뛰므로**, 버전이 안 바뀐 패키지는 자동으로 제외돼
재게시 충돌이 나지 않는다.

판정 로직은 `packages/devkit-cli/src/release/`에 있고 단위 테스트가 규칙을
고정한다 — 워크플로 YAML 안의 bash로 두면 테스트할 수 없기 때문이다.

**기준점 태그 둘(`config-v*`·`cli-v*`)이 `origin`에 있어야 한다 — 없으면
전체 이력으로 후퇴해 첫 실행에서 전 패키지가 통째로 올라간다.** 워크플로는
`git tag --list 'config-v*' --sort=-v:refname | head -1`로 가장 최근 태그를
찾는데, `git push --follow-tags`는 **annotated 태그만** 민다(lightweight는
로컬에만 남는다). 부트스트랩 태그를 새로 만들 때는 반드시:

```bash
git tag -a -m "release" config-v<버전> <커밋>
git tag -a -m "release" cli-v<버전> <커밋>
git push origin config-v<버전> cli-v<버전>
```

태그를 못 찾으면 워크플로가 `::error::`로 실패한다(조용히 전체 이력으로
넘어가지 않는다) — 그래도 애초에 태그가 origin에 없으면 실행 자체가 안 되므로,
새 기준점을 만들 때마다 이 절차를 빼먹지 않아야 한다.

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
- pnpm (npm으로 실행하지 않는다 — 이 저장소 자체가 pnpm 워크스페이스이고, 생성물의
  GitHub Packages 설치도 pnpm 기준으로 검증했다)
