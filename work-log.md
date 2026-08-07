# Work Log

## 2026-08-07

### `no-public-api-sidestep`이 자기가 요구하는 배럴을 스스로 금지하던 것
- **변경 파일**: `packages/eslint-plugin-fsd/src/lib/{layers,types,parse-path}.ts` · `src/rules/no-public-api-sidestep.ts` · `tests/{layers,parse-path,no-public-api-sidestep}.test.ts` · `packages/eslint-plugin-fsd/README.md` · `work-log.md`
- **내용**: 규칙이 "같은 슬라이스 내부면 통과"라는 예외를 `from.slice != null && from.slice === to.slice`로 판정했는데, `parsePath`는 **비-슬라이스 레이어(`app`·`shared`)의 `slice`를 구조적으로 항상 `null`** 로 둔다. `!= null` 가드에서 걸려 예외가 아예 성립하지 않으므로 그 두 레이어 내부의 상대 import가 전부 "Public API 우회"로 오탐됐다. 가장 나쁜 사례는 **`shared/ui/index.ts`가 `./Button`을 re-export하는 것** — 규칙이 요구하는 진입점 배럴 자체를 규칙이 금지한다. 즉 위반을 고치려면 다른 위반을 만들어야 해서 빠져나갈 길이 없었다. Next.js App Router에서는 `src/app/layout.tsx → './providers/Theme'`, `src/app/products/page.tsx → './loading'` 같은 표준 코드도 전부 걸렸다.
  - **원인은 조건문이 아니라 모델의 결손이었다.** "Public API를 누가 소유하는가"는 레이어의 속성인데 `LayerDef`엔 `sliced` 불리언밖에 없었고, 규칙이 그 빈자리를 `slice`로 대신 메우다 무너졌다. `PublicApiUnit = 'slice' | 'segment' | 'layer'`를 레이어 모델에 명시하고(`app`→`layer`, `shared`→`segment`, 나머지 4개→`slice`), `FsdLocation.unit`으로 그 단위의 이름을 실어, 규칙은 `from.unit === to.unit`만 본다. FSD 명세의 "슬라이스가 없는 레이어에서는 세그먼트가 진입점을 소유한다"를 코드가 그대로 말하게 한 것이다.
  - **`app`만 `segment`가 아니라 `layer`인 이유**: 세그먼트 단위로 하면 `app/layout.tsx → './providers/Theme'`가 여전히 에러다(`layout.tsx`와 `providers`는 다른 세그먼트로 파싱된다 — 파서는 fs를 안 보므로 파일과 폴더를 구분하지 못한다). 반면 `app`은 최상위라 **아무도 legally import할 수 없고**(`no-higher-level-imports`가 막는다) 넘을 Public API 경계 자체가 없다. 잃는 검출력은 0, 없애는 오탐은 실코드 전량이라 판단이 명확했다.
  - **`shared`는 세그먼트 단위를 유지했다** — 느슨하게 풀지 않았다. `shared/ui/Card.tsx → '../lib/cn'`은 여전히 에러다. 기존 invalid 테스트(`@/shared/ui/Button`)가 이미 그 엄격함을 계약으로 박아두고 있어, 이번 수정으로 계약이 바뀌면 안 된다.
- **검증**: RED 먼저 — 오탐 4건을 valid 케이스로 넣어 `4 failed | 5 passed` 실측 후 수정. 반대 방향(과하게 느슨해짐)을 잠그는 invalid 3건과 `sliced === (publicApi === 'slice')` 불변식 테스트를 추가. 플러그인 76개, 워크스페이스 전체 `pnpm test` 7태스크 그린, `pnpm lint`(에러 0, oxlint 경고 5건은 기존과 동일), `pnpm typecheck`, `pnpm build` 통과.
  - **RuleTester 그린으로 끝내지 않았다.** RuleTester는 `filename`을 문자열로 받을 뿐 파일이 없어도 되고 flat config 조립·`ignores`를 전혀 거치지 않는다. 저장소 **밖** 스크래치패드에 실제 FSD 디렉토리를 만들어 빌드된 `dist`의 `configs.recommended`로 ESLint를 돌려, 오탐 4건이 조용하고 진짜 위반 5건이 그대로 잡히는 것을 확인했다(검증용 생성물을 저장소 안에 만들면 자동 훅이 커밋해버리는 사고가 이전에 4회 있었다).
- **커밋**: 브랜치 `worktree-lexical-bubbling-bee`(`origin/main` 기준 rebase 후 작업). main 미머지.

### 앵커된 `.claude` 조상 줄이 부정 패턴을 무력화하던 것과, 릴리스가 다음 릴리스를 깨던 스냅샷 수정
- **변경 파일**: `packages/devkit-cli/src/ops/merge-ignore.ts` · `templates/_shared/_gitignore` · `tests/merge-ignore.test.ts` · `tests/merge-ignore-git.test.ts` · `tests/recipe-{nest,next,monorepo}.test.ts` · `tests/__snapshots__/recipe-{nest,next,monorepo}.test.ts.snap` · `work-log.md`
- **내용**: 두 가지를 고쳤다. 브랜치 `fix/gitignore-anchored-ancestor`.
  1. **`/.claude/`·`/.claude` 표기가 조상 스트립을 빠져나가고 있었다.** git 은 제외된 디렉토리 안으로 내려가지 않으므로 대상에 `.claude` 를 통째로 무시하는 줄이 있으면 devkit 블록의 `!.claude/agents/` 가 물리적으로 무효다. `mergeIgnore` 는 그런 조상 줄을 지워 대응하는데(최종 리뷰 Critical 의 해법), `isAncestorExclusion` 이 트레일링 슬래시만 정규화하고 **리딩 슬래시는 하지 않아** 앵커 표기 2종이 살아남았다. `git check-ignore` 로 4종(`.claude/`·`.claude`·`/.claude/`·`/.claude`) 전부 실측해 확인했다 — 넷 다 부정을 죽인다(앵커 2종은 루트만, 나머지는 모든 깊이). 두 층으로 막았다: (A) 정규화에 리딩 슬래시 추가, (B) 템플릿 블록 맨 앞에 `!.claude/` 를 넣어 디렉토리 자체를 되살림. B 는 병합기가 모르는 표기까지 견디는 안전망이라 A 와 중복이 아니다. 실패 방향이 "커밋돼야 할 파일이 조용히 안 들어감"이라 `git add` 도 `git status` 도 아무 말을 하지 않는 게 이 결함의 위험한 점이다.
  2. **릴리스가 다음 릴리스를 깨고 있었다(별개 발견).** 레시피 스냅샷 3건이 생성물 마커의 `devkit.version` 을 리터럴로 박고 있어, 오늘 릴리스가 0.1.0 → 0.2.0 으로 올리자 main 이 빨개졌다. 워크플로는 **검증 → 버전 갱신** 순이라 그 실행 자체는 통과하고 대가는 다음 릴리스가 치른다 — mtime 버그와 같은 모양이 하나 더 예약돼 있었다. 스냅샷을 0.2.0 으로 갱신만 하면 매 릴리스 재발하므로 `<devkitVersion>` 자리표시자로 정규화했다. 값 자체는 각 파일의 「마커」 테스트가 `devkitVersion()` 과 직접 대조하고 있어 커버리지 손실이 없다. monorepo 는 루트와 `apps/web` **두 곳**에 마커가 있어 고정 경로 접근이 깊은 쪽을 놓쳤고, 트리 전체를 걷는 방식으로 고쳤다.
- **검증**: 수정 전 RED 4건(단위 2 + git 판정 2) 확인 후 수정. `pnpm build` · `pnpm test` **374개/31파일** · `pnpm typecheck` · `pnpm lint:ox`(경고 3건 — 기존과 동일, 신규 0) · `pnpm lint:es` · `pnpm test:e2e` **13/13**(164s). git 판정 테스트는 새 파일을 만들지 않고 이미 있던 `merge-ignore-git.test.ts`(`a2d66e5`)에 넣었고, 블록을 손으로 적지 않고 배포 템플릿에서 읽어 갈라짐을 막았다. 중간에 `walk` 중첩 함수로 oxlint 경고 3건이 새로 생겨 자기재귀 단일 함수로 바꿔 없앴다(`74fe700` 의 관행).
- **커밋**: 브랜치 `fix/gitignore-anchored-ancestor` — PR #1 로 main 에 머지됨(`d4e848e`).

### `devbak version` 명령 구현 (Task 1~3, 설계·계획은 이미 기록됨)
- **변경 파일**: Task 1(포맷) `src/version/format.ts`·`src/version/types.ts`·`tests/version-format.test.ts` · Task 2(수집) `src/version/collect.ts`·`tests/version-collect.test.ts` · Task 3(배선, 이 항목) `src/bin.ts`(import 3줄·`USAGE`에 `version` 줄 추가·`parseArgs` 옵션에 `version`/`-v` 추가·`--version` 분기와 `version` 서브커맨드 분기를 `assertDistFresh` 앞에 배치·`runVersionCommand` 신설)·`tests/bin.test.ts`(`describe('version')` 8건 추가)·`README.md`(사용법 두 줄·`devbak version` 섹션 신설)·`work-log.md`
- **내용**: `devbak`에 지금 무엇을 쓰고 있는지 보는 명령이 없어(`bin.ts`가 `create`·`update` 외 인자를 전부 `USAGE`로 던졌다) 3태스크로 나눠 추가했다. `devbak version [path]`는 CLI 자신 버전·프로젝트의 `devkit` 마커·선언된 `@cheolubak/*`의 실제 설치 버전 3층을 한 번에 낸다. `devbak --version`/`-v`는 별도로 버전 문자열 한 줄만 내는 안정된 계약이다 — 리포트 형식을 스크립트가 파싱하게 두면 형식을 영영 바꿀 수 없어서 처음부터 갈랐다. `version` 분기는 `--help`와 같이 `assertDistFresh`보다 앞에 둔다 — 현재 상태를 묻는 명령이 빌드 상태에 막히면 거꾸로다. 진단 명령이라 종료 코드는 항상 0이다(devkit 프로젝트가 아닌 것도, 마커가 깨진 것도 정당한 답). Task 1은 `formatVersionReport`(표시 폭 기준 정렬, 한글 헤더 대응), Task 2는 `collectVersionReport`(깊이 3까지 마커 스캔, `pnpm-workspace.yaml` 파싱 없이 런타임 의존성 0개 유지), Task 3은 이 둘을 `bin.ts`에 배선했다. 앞선 태스크가 실측으로 남긴 함정 둘을 그대로 확인했다 — `tests/tsconfig.json`에 `noUncheckedIndexedAccess`가 없어 배열 인덱스 뒤 `!`가 린트 에러가 되는 것, `pnpm typecheck`/`pnpm lint`가 캐시로 새 코드를 건너뛸 수 있어 `--force`로 재확인해야 하는 것.
- **TDD**: RED(`pnpm --filter @cheolubak/devkit-cli exec vitest run tests/bin.test.ts`) 8 failed(신규) | 6 passed(기존) — `Unknown option '--version'`·`version` 서브커맨드가 `USAGE`를 던짐, 모두 예상된 원인. 구현 후 GREEN — 같은 명령 14/14. 빌드 산출물(`node packages/devkit-cli/dist/bin.js`)로 `--version`·`-v`·`version packages/devkit-cli`·`version` 4가지를 직접 실행해 전부 종료 코드 0 확인(`echo $?`).
- **리뷰가 잡은 계획 결함 5건** — 전부 **실행해야만** 드러났고 코드 리딩·타입 검사로는 하나도 안 잡혔다. 계획을 쓸 때 정상 경로의 사실은 실물로 확인했지만(패키지 이름·레시피 구성·tsconfig 상속) **출력 예시와 예외 경로는 머릿속에서 썼다.**
  1. **깊이 테스트가 아무것도 검증하지 못했다.** 마커를 `a/b/c/deep`(깊이 4)에 뒀는데 `scan()`은 `readWorkspace` 뒤에 `depth >= MAX_DEPTH`로 재귀를 막으므로 `MAX_DEPTH`가 0이든 3이든 깊이 4엔 도달하지 못한다 — 상수를 무엇으로 바꿔도 통과했다. 경계인 `a/b/c`(깊이 3)를 추가해 양쪽에서 고정했다.
  2. **정렬 테스트가 `.sort()`를 지워도 통과했다.** 비-루트 워크스페이스가 하나뿐이라 루트가 먼저 push되는 것만으로 순서가 맞았다. 형제를 셋으로 늘려도 macOS APFS의 `readdir`이 우연히 알파벳순을 내줘 여전히 통과했다(실측) — **파일시스템 순회로는 정렬을 검증할 수 없다.** `sortWorkspaces`를 export된 순수 함수로 뽑아 역순 배열을 직접 주입하는 방식으로 바꿔 해결했다.
  3. **README 출력 예시가 실제와 달랐다.** 알고리즘(표시 폭 + `GAP=2`)을 정한 뒤 예시는 손으로 정렬해 썼고, 1열 33/2열 10으로 실제(32/8)보다 넓었다. 그 예시가 브리프를 거쳐 README까지 verbatim으로 흘렀다. 빌드 산출물을 실제로 돌려 캡처한 출력으로 교체하고 `diff`로 바이트 일치를 확인했다.
  4. **마커가 깨지면 표가 무너졌다.** `readMarker`가 던지는 `InvalidMarkerError` 세 변형 중 "알 수 없는 프로젝트 유형"만 메시지가 두 줄인데(`marker.ts:54-56`), 설계 6.3절이 이를 단일 케이스로 다뤘고 계획의 테스트 픽스처는 **하필 단일 라인인 것**을 골랐다. `format.ts`에 `collapseLines`를 두어 접고, 픽스처는 `readMarker`를 **실제로 호출해** 얻은 값을 쓰도록 바꿨다 — 문자열을 베끼면 상류가 바뀌어도 따라오지 않는다.
  5. **없는 경로·파일 경로에서 죽었다.** `readWorkspace`는 `existsSync`로 막지만 그 다음 `readdirSync`가 무방비라 `ENOENT`/`ENOTDIR`이 그대로 튀어나와 exit 1이 됐다 — 설계 4절("종료 코드는 항상 0")과 README("실패하지 않는다")를 정면으로 어겼다. 완료 기준 9개가 전부 정상 경로만 다룬 **계획의 누락**이다. 최상위는 한글 에러 + exit 1(입력 오류는 진단 결과가 아니다), 하위 순회 실패는 삼키고 계속하도록 갈랐다. **두 방어는 짝이어야 한다** — 하위 `try/catch`만 두면 최상위 `ENOENT`까지 그 catch에 걸려 "던지지 않고 빈 리포트"가 된다(실증).
- **검증**: `pnpm build` 3/3 · `pnpm --filter @cheolubak/devkit-cli exec vitest run` **406개 전부 통과**(33파일). 작업 내내 `recipe-{nest,next,monorepo}` 스냅샷 3건이 빨갰는데 이 작업과 무관한 사전 결함이었다 — 릴리스 버전 범프(`0.1.0`→`0.2.0`)가 원인이고 `36a2042`가 이미 고쳤으나 그 커밋이 다른 브랜치에 있어 main 분기점(`8c11cf5`)에는 없었다. 마무리 단계에서 최신 `origin/main`(PR #1로 그 브랜치가 머지됨) 위로 rebase 하자 그대로 해소됐다. 착수 전 기준선 3 failed / 384 passed → 최종 0 failed / 406 passed. `pnpm turbo run typecheck lint --force`로 **14/14 `Cached: 0`** 확인 후 통과. 빌드 산출물로 4케이스 직접 실행: 없는 경로·파일 경로 → 한글 에러 exit 1, 마커 손상 → 표 온전 exit 0, 정상 모노레포 → 3층 출력 exit 0. 리뷰어가 `chmod 000`으로 하위 디렉토리를 잠가 `EACCES`는 조용히 건너뛰고 나머지는 정상 수집됨(exit 0)을 실증했다.
- **커밋 이력을 논리 단위로 재구성했다.** 자동 WIP 커밋 훅이 fix 라운드마다 개입해 17커밋이 됐고, 그중 3건은 메시지가 백틱으로 깨졌으며 `6ee5399`는 **검증용으로 일부러 `.sort()`를 비활성화한 상태를 그대로 커밋**했다(다음 커밋이 정정). `git rebase -i`가 이 환경에서 안 되므로 `git reset --soft` 후 5커밋으로 다시 쌓았고, 재구성 전후 트리가 완전히 동일함을 `git diff backup/devbak-version-raw HEAD`가 비어 있음으로 확인했다. 원본은 `backup/devbak-version-raw`에 남겼다.
- **커밋**: `bf3814e`(설계·계획) · `1357637`(데이터 모델·출력 포맷) · `0edfe74`(마커 스캔 수집) · `a217e2f`(명령·플래그 배선) · `0a6ebf7`(문서) · 이 항목. 최신 `origin/main`(`3bb2073`) 위로 rebase 한 뒤의 해시다. 브랜치 `feature/devbak-version`, PR 로 통합 예정.

### `devbak version` 명령 설계 확정 (구현 전)
- **변경 파일**: `docs/superpowers/specs/2026-08-07-devbak-version-design.md`(신설) · `work-log.md`
- **내용**: `devbak` 에 버전 확인 명령이 없어(`bin.ts:112` 가 `create`·`update` 외 인자를 전부 `USAGE` 로 던진다) 추가하는 작업. 브레인스토밍으로 범위를 먼저 정했다 — 이 CLI 에는 버전이 **두 군데**(설치된 CLI 자신, 소비 프로젝트의 `devkit` 마커) 있고, 여기에 설치된 `@cheolubak/*` 설정 패키지까지 더한 **3층 전부**를 내기로 했다. 확정한 핵심 판단:
  1. **새 계산 로직이 없다.** `devkitVersion()`(`src/lib/version.ts`)·`readMarker()`(`src/lib/marker.ts`)·`packageRoot()`(`src/lib/layout.ts`)가 이미 있어 조합만 한다.
  2. **선언 범위와 설치본을 나란히 낸다.** 소비자에 심기는 값은 구체 버전이 아니라 고정 캐럿 범위 `^0.1.0`(`DEVKIT_VERSION_RANGE`)이라, 게시 대상 6개가 락스텝인 지금 **선언만 보면 전부 똑같아 실질 정보가 0** 이다. 패키지 목록은 하드코딩하지 않는다 — 레시피마다 집합이 다르다(nest 4 · next 3 · monorepo 루트 2).
  3. **`pnpm-workspace.yaml` 을 파싱하지 않는다.** 이 패키지는 런타임 의존성이 0개인데 YAML 파서를 넣으면 그 성질이 깨지고, `fs.glob` 은 `engines` 에 있는 Node 20 에 없다. 대신 깊이 3까지 `package.json` 을 훑어 `devkit` 마커가 있는 것만 담는다(`node_modules`·숨김 제외, 상대경로 순 고정). 모노레포는 루트와 `apps/web` 에 마커·선언이 각각 있어 한 곳만 봐서는 답이 반쪽이다.
  4. **진단 명령은 죽지 않는다.** 종료 코드 항상 0, `--help` 와 같이 `assertDistFresh` **앞**에 배치(`bin.ts:104` 주석의 논리 — 낡은 dist 때문에 현재 상태를 못 보면 거꾸로다), `InvalidMarkerError` 는 던지지 않고 표시하고 계속.
  - **셀프 리뷰가 결함 1건을 잡았다**: 4.2절에 "정렬 열은 전부 ASCII"라고 써 놓고 정작 내가 설계한 출력의 헤더 첫 열이 한글(`패키지`)이었다. `padEnd` 는 코드포인트를 세지만 터미널은 표시 폭으로 그려 `'패키지'.padEnd(30)` 이 화면에서 33칸이 되고 그 행의 다음 열만 밀린다. 헤더만 상수 보정하는 대신 `displayWidth`/`padTo` 헬퍼를 두기로 했다 — 상수 보정은 나중에 한글 값이 열에 들어오는 순간 조용히 깨진다. 함께 고친 것: 출력 예시가 실제 next 레시피(3개)와 어긋나 `prettier-config` 누락, "깊이 3"의 기준점 모호, 폭 정렬 테스트 누락.
  - 포맷 검증에 **스냅샷을 쓰지 않는다** — 커밋 `36a2042`("레시피 스냅샷을 릴리스 버전과 무관하게 만든다")가 이미 밟은 함정이다.
  - **범위 밖**: 원격 레지스트리 조회(`pnpm outdated` 가 답한다), 자동 업데이트 제안(권할 임계값의 근거가 없다).
- **검증**: 설계 단계라 코드 변경 없음. 설계 판단의 근거는 전부 실측으로 확인했다 — 워크스페이스 패키지 이름·버전(스코프가 `@devbak/` 가 아니라 `@cheolubak/` 임을 확인해 초안을 정정), 레시피별 `registryDeps` 집합, 모노레포의 마커 이중 배치, 기존 테스트의 `mkdtempSync` 픽스처 관습.
- **커밋**: 이후 이력 재구성으로 `bf3814e`에 합쳐졌다(위 구현 항목 참조). 브랜치 `feature/devbak-version`

### 릴리스 워크플로 첫 실행 진단과 `assertDistFresh` 테스트의 CI 전용 실패 수정
- **변경 파일**: `packages/devkit-cli/tests/bin.test.ts` · `work-log.md`
- **내용**: "main 에 푸시했는데 워크플로가 안 돌았다"에서 출발해 두 가지가 나왔다.
  1. **워크플로는 안 돈 게 아니라 19분 늦게 돌았다.** 푸시 `045113d`(22:53:49Z)에 대한 run 이 **23:13:03Z** 에 생성됐다. 그 사이 설정은 전부 정상이었다 — 워크플로 `state: active`, repo `actions/permissions.enabled: true`, `[skip ci]` 없음, 파일은 `100644` 정규 파일, 계정의 다른 저장소는 3일 전 정상 실행. 진단을 가른 지표는 **워크플로 레코드의 `created_at` 이 푸시 시각과 초 단위로 일치**한다는 것이었다(= Actions 인덱서가 그 푸시를 이미 읽었다는 증거이므로 설정 오류 가설이 전부 배제된다). 유일한 증상은 HEAD 의 check-suites 에 github-actions 만 없는 것이었다. 결론: 설정 변경 불필요, 앞으로 같은 증상은 20분 기다린 뒤 판단할 것.
  2. **그 run 은 검증 스텝에서 실패했고, 이건 진짜 결함이었다.** `tests/bin.test.ts` 의 `assertDistFresh` 테스트가 `dist/bin.js` → `src/bin.ts` 를 연속으로 써서 src 가 더 새롭다고 가정하는데, **리눅스의 파일 mtime 은 커널의 coarse 시계(타이머 틱 1~4ms)에서 온다** — 두 쓰기가 같은 mtime 을 받아 `newestMtime(src) > distBin.mtimeMs` 의 엄격 부등호가 거짓이 되고 예외가 안 난다. macOS(APFS)는 서브밀리초라 로컬에선 0.14ms 차이로 항상 통과했다(실측). 쓰기 순서 대신 `utimesSync` 로 dist 를 60초 과거로 명시적으로 밀어 해상도 의존을 없앴다.
- **검증**: `pnpm build` 3/3 · `pnpm test` **364개/31파일** · `pnpm typecheck` 7/7 · `pnpm lint:ox` 에러 0·warning 3 · `pnpm lint:es` 8/8 · `pnpm test:e2e` **13/13**(179s). `git status` 잔재 없음. 첫 실행 때 `main()` 테스트 2건이 함께 빨갛게 나왔는데 이는 로컬 `dist` 가 낡아 가드에 걸린 것으로, `pnpm build` 선행 후 사라졌다 — CI 검증 스텝이 build 를 test 보다 앞에 두는 이유다.
- **커밋**: `843b2c3`(트리거 확인용 빈 커밋), 이 항목

## 2026-08-06

### .gitignore 병합과 .claude 리뷰 자산 추적 (설계 → Task 1~5 구현·검증)
- **변경 파일**: `packages/devkit-cli/src/ops/merge-ignore.ts`(신설, Task 1) · `tests/merge-ignore.test.ts`(신설, Task 1) · `src/types.ts`(`PlannedChange`에 `ignore` 추가, Task 2) · `src/ops/copy-overlay.ts`(`splitIgnoreTemplate`, `plan`·`run` 배선, Task 2) · `src/update/plan.ts`(`ignore` 분기 — 타입 확장이 강제해 Task 2에서 선반영, Task 3이 테스트로 고정) · `src/ops/read-existing.ts`(신설, ENOENT 외 오류를 삼키지 않는 공용 읽기 헬퍼, Task 2 수정 라운드) · `tests/plan-ops.test.ts`·`tests/update-plan.test.ts`·`tests/fs-ops.test.ts`(테스트 추가·대상 조정) · `templates/_shared/_gitignore`(신설, Task 4) · `templates/nest/_gitignore`·`templates/monorepo/_gitignore`(삭제, Task 4) · `tests/e2e/create.e2e.test.ts`(e2e 단언 추가, Task 5) · `packages/devkit-cli/README.md`(`--only` 카테고리 표 갱신, Task 5) · 이 항목(Task 5)
- **내용**: 설계·계획 `.superpowers/sdd/2026-08-06-gitignore-merge`의 5태스크 전체. `devbak create`·`update`가 `.gitignore`를 통째로 덮어써 사용자가 추가한 무시 규칙을 지우고 있었다(설계 1.2절) — 이것을 줄 단위 병합으로 바꿨다. 이 작업이 고친 두 문제:
  1. **`.claude` 리뷰 자산이 무시될 수 있었다.** 기존 프로젝트의 `.gitignore`가 `.claude/`를 통째로 무시하면, devkit이 나중에 `.claude/agents/`·`.claude/commands/`에 리뷰 자산을 놓아도 git이 추적하지 못한다 — git은 이미 무시된 디렉토리 안으로는 `!` 부정 패턴을 적용해도 하위를 되살리지 못하기 때문이다(디렉토리 자체가 아니라 `.claude/*`처럼 자식만 무시해야 `!.claude/agents/`가 먹힌다).
  2. **`update`가 사용자의 `.gitignore` 규칙을 지우고 있었다.** 통째 덮어쓰기라 사용자가 손으로 추가한 줄이 매 `update` 실행마다 사라졌다.
  - **Task 1** (`8b58376`, 멱등성 fix `2163fd7`): 부수효과 없는 순수 함수 `mergeIgnore(existing, lines, block)`을 만들었다. 규칙 셋 — 대상의 기존 내용 유지, 템플릿 줄 중 없는 것만 추가(빈 줄·주석은 중복 판정 제외), `# >>> devkit >>>`~`# <<< devkit <<<` 블록은 있으면 통째 교체·없으면 끝에 덧붙임. 여는 구분자만 있고 닫는 게 없으면 조용히 삼키지 않고 던진다. 리뷰에서 멱등성 Critical 버그 발견 — `significant()`가 빈 줄·주석에 `null`을 반환하는데 존재 판정 없이 매번 추가돼, 주석이 섞인 `lines`로 두 번 돌리면 계속 누적됐다(계획서 자체의 버그). 유의미 줄은 trim 키로, 빈 줄·주석은 원문 그대로 일치로 판정을 이원화해 고쳤다.
  - **Task 2** (`dd4868d`, ENOENT fix `73fee7c`): `PlannedChange`에 `{ kind: 'ignore'; file; lines; block }`를 더하고 `copyOverlay`의 `plan()`이 `.gitignore`에 대해 `ignore` 변경을 내고 `run()`이 `mergeIgnore`로 실제로 쓰게 배선했다. 타입 확장이 `update/plan.ts`의 타입체크를 즉시 깨뜨려(그 파일이 `kind !== 'file'`인 것을 전부 JSON 패치로 취급하던 코드였다) update 경로의 진짜 구현도 이 태스크에서 함께 들어갔다 — 계획서의 태스크 분할이 두 경로를 분리할 수 없었다. 리뷰에서 `readFile(...).catch(() => '')`가 ENOENT 아닌 실패(EACCES 등)까지 "빈 대상"으로 오인해 기존 `.gitignore`를 덮어쓸 수 있다는 Important 지적을 받아, `pathExists`와 같은 관용의 `readExistingOrEmpty` 헬퍼로 두 호출부(`copy-overlay.ts`·`update/plan.ts`)를 통일했다.
  - **Task 3** (`3ab4028`): update 경로 분기가 Task 2에서 이미 들어가 있어 이 태스크는 그 동작(사용자 규칙 보존, 멱등)을 고정하는 테스트만 추가했다. RED가 안 나오는 상황이라 분기를 잠시 지워 두 테스트가 실제로 크래시함을 확인하는 "회귀 실증"으로 대신했다. `isIgnoreOverlay`는 `change.kind === 'ignore'`로 이미 판별돼 소비처가 없어 만들지 않았다(소비처 없는 심볼을 남기지 않는 저장소 규율).
  - **Task 4** (`21a73e4`): `_gitignore`가 `nest`·`monorepo`에만 있고 `next`에는 없어 유형별로 동작이 갈리던 것을 `templates/_shared/_gitignore`로 통합했다. 두 템플릿의 줄을 합집합으로 담고 devkit 블록(`.claude/*`·`!.claude/agents/`·`!.claude/commands/`)을 이 태스크에서 처음 채웠다 — 그전까지는 템플릿에 블록이 없어 구분자 쌍만 나왔다. `next`는 이번에 처음 `.gitignore` 오버레이를 받지만 병합이라 `create-next-app`의 규칙이 보존된다.
  - **Task 5** (이 항목): e2e에 `nest`·`next` 두 케이스 모두 devkit 블록(`# >>> devkit >>>`·`.claude/*`·`!.claude/agents/`)과 스캐폴딩 CLI 규칙 보존(`node_modules`·`.next`)을 단언하는 줄을 추가했다 — 특히 `next`는 `create-next-app`이 쓴 `.gitignore` 위에 병합이 실제로 얹히는지가 핵심 검증이다. `packages/devkit-cli/README.md`의 `--only` 카테고리 표에서 `repo` 행에 `.gitignore`가 이 표의 유일한 병합 대상임을 각주로 표시하고, 표 아래 문단으로 병합 규칙을 설명했다 — 같은 문서 안에 `.gitignore`를 "통째로 덮는" 파일로 잘못 나열한 문장이 남아 있어(Task 2·3으로 이미 사실이 아니게 된 것) 그 목록에서도 뺐다.
- **검증**: `pnpm test` 44파일/390개, `pnpm typecheck` 7/7, `pnpm lint:ox` 에러 0·warning 3, `pnpm lint:es` 8/8 — 각 태스크 마지막 단계에서 확인. `pnpm test:e2e` **13/13**(Task 5, `GITHUB_TOKEN=$(gh auth token) pnpm test:e2e`, 약 3분 소요). `git status`·`devkit-e2e-*` 잔재 없음 확인.
- **커밋**: 설계 `df5ec1a`, 계획 `50f6eec` · `8b58376`+`2163fd7`(Task 1) · `dd4868d`+`73fee7c`(Task 2) · `3ab4028`(Task 3) · `21a73e4`(Task 4) · 이 항목(Task 5). 브랜치 `feature/gitignore-merge`, main 미머지.
### 코드 작성 참고 자산(`devkit-implementer`)을 create/update에 추가
- **변경 파일**: `docs/superpowers/specs/2026-08-06-devkit-implementer-agent-design.md`(신설) · `packages/devkit-cli/templates/{next,nest,monorepo}/.claude/agents/devkit-implementer.md`(신설 3) · `packages/devkit-cli/templates/{next,nest,monorepo}/CLAUDE.md` · `packages/devkit-cli/tests/authoring-assets.test.ts`(신설) · `packages/devkit-cli/tests/{update-plan,overlay-coverage}.test.ts` · `.gitignore` · `work-log.md`
- **내용**: 템플릿의 `.claude` 자산이 리뷰(`devkit-reviewer`)만 있고 **작성 시점** 기준이 없어서, 유형별 작성자 에이전트를 대칭으로 추가했다.
  - 문서 구조는 리뷰어를 뒤집은 것이다: 「손으로 하지 않는 것」(포맷·import 정렬·타입은 prettier/oxlint/tsc가 한다)을 **먼저** 못 박고, 그 뒤에 리뷰어의 관점과 1:1 대응하는 다섯 결정(레이어/계층 배치 → 경계 → 실패를 드러내는 법 → 함께 쓸 테스트 → 마치기 전 돌릴 것)을 둔다. 리뷰 기준과 작성 기준이 갈라지면 매 PR에서 뒤늦게 재작업이 생기므로 대칭을 테스트로 고정했다.
  - **`src/` 변경 0건.** create는 `copyOverlay`의 재귀 복사, update는 `categories.ts`의 경로 정규식(`.claude/agents/.+` → `claude`)이라 파일을 두는 것만으로 양쪽이 배선된다. `copy-overlay.ts`의 `run`이 같은 `plan`을 호출하므로, update 계획 테스트가 새 파일을 포함한다는 것이 곧 create가 그 파일을 쓴다는 증명이다 — e2e를 돌리지 않은 근거.
  - nest 판의 타입 검사 명령은 `pnpm typecheck`가 아니라 `pnpm build`다. `src/recipes/nest.ts`가 병합하는 스크립트에 `typecheck`가 없다 — 없는 명령을 지시하면 작성자가 실패를 보고 검증 절을 통째로 건너뛴다. 이것을 테스트로도 고정했다(`not.toContain('pnpm typecheck')`).
  - 🚨 **구현 중 발견**: **툴킷 저장소 자체의** 루트 `.gitignore`의 `.claude/`가 `templates/<type>/.claude/`까지 삼키고 있었다. (같은 날 위 항목이 고친 것은 **생성되는 프로젝트**의 `.gitignore`다 — 층이 다르고 원인은 같은 git 성질이다.) 기존 `devkit-reviewer.md`들은 `-f`로 강제 추가돼 있어 드러나지 않던 함정이다. 위험한 이유는 아무것도 실패하지 않기 때문 — 테스트는 디스크를 읽어 전부 통과하고 `git add -A`는 조용히 건너뛴다. clone·CI·게시본에는 파일이 없는데 로컬은 초록불이 된다. `!packages/devkit-cli/templates/*/.claude/` negation으로 고쳤고(git은 무시된 **디렉토리** 아래로 내려가지 않아 파일 단위 negation은 안 먹는다 — 디렉토리를 되살려야 한다), `overlay-coverage.test.ts`에 "템플릿의 모든 파일이 git에 추적된다" 관문을 더해 재발을 막았다. 루트 `.claude/`는 계속 무시되는 것을 `git check-ignore`로 확인했다.
  - **비범위**: `update`가 `CLAUDE.md`를 통째로 덮어써 사용자 편집을 지우는 문제(`PlannedChange`의 `kind: 'file'`은 전체 치환)는 기존 동작이라 이번에 고치지 않았다. 설계 문서 7절에 follow-up으로 남겼다.
- **검증**: `pnpm test` 319/319 통과(신규 36 + 기존, `update-plan`의 `--only claude` 정확 일치 단언 2건은 새 파일 반영해 갱신). 새 테스트가 항상-통과가 아님을 변형 2회로 실증 — 포인터 경로 오타는 1건 실패, 금지 목록 헤더 삭제는 3건 실패(순서 단언은 통과했다. `indexOf(A) < indexOf(B)`가 A 부재 시 `-1 < N`으로 통과하는 함정이라 존재 단언을 따로 둔 것이 값을 했다). git 추적 관문은 RED(3파일 미추적) → 추가 후 GREEN을 확인. `pnpm lint` 통과(oxlint warning 3은 전부 이월). 이 저장소 루트에는 prettier가 설치돼 있지 않아 포맷 검사는 해당 없음.
- **커밋**: `1fbca1a`(설계) · `6825cb8`(에이전트·CLAUDE.md·테스트) · `c7a398c`(.gitignore 수정·템플릿 3파일·추적 관문) · 이 항목. 위 `.gitignore` 병합 작업이 먼저 main에 들어와 `a2d66e5` 위로 rebase한 뒤의 해시다.

### CI 자동 릴리스 — Task 1~5 구현·검증
- **변경 파일**: `packages/devkit-cli/src/release/decide.ts`·`tests/release-decide.test.ts`(신설, Task 1) · `src/release/apply.ts`·`tests/release-apply.test.ts`(신설, Task 2) · `packages/{eslint-config-nest,eslint-plugin-fsd,jest-config,prettier-config,tsconfig}/package.json`(버전 정렬, Task 3) · `.github/workflows/release.yml`(신설, Task 4) · `README.md`(`### 릴리스는 자동이다` 절, Task 5) · 이 항목(Task 5)
- **내용**: 설계·계획 `.superpowers/sdd/2026-08-06-auto-release`의 5태스크 전체. 그동안 버전을 손으로 올리고 게시도 손으로 해서 게시본이 낡아 있었다(`devkit-cli@0.1.0` 이후 11커밋, 설정 패키지 6개의 락스텝도 깨져 있었다) — `main` push에서 검증·버전 올림·게시를 자동화했다.
  - **Task 1** (`4ede3d7`): `decideRelease(commits)`가 커밋 목록에서 릴리스 축(`config`/`cli`)과 올림 크기(`major`/`minor`/`patch`)를 판정한다. 경로가 대상을 정하고(`isReleasePath`가 `tests/**`·`README.md`·설정 파일을 제외), 커밋 접두가 크기를 정한다(`bumpOf` — `feat:`→minor, `fix:`·`refactor:`·`perf:`·`build:`→patch, `BREAKING CHANGE:`/`!`→major, 모르는 접두는 null이라 병합 커밋 등으로 릴리스가 안 남). 워크플로가 `node src/release/decide.ts <since>`로 **직접 실행**하므로 로컬 모듈을 import하지 않는다(Node 타입 스트리핑이 `./x.js`→`x.ts` 경로를 재작성하지 않아 런타임에 깨진다).
  - **Task 2** (`498860c`, lint 수정 `74fe700`): `nextVersion`·`nextRange`로 실제 `package.json` 버전과 `DEVKIT_VERSION_RANGE`(`src/ops/registry-deps.ts`)를 갱신한다. `cli` 축은 `devkit-cli` 단독, `config` 축은 6개 락스텝(가장 높은 버전 기준, 문자열이 아니라 자리별 숫자 비교 — `0.10.0 < 0.9.0` 역전 방지) + 마이너 이상이면 `DEVKIT_VERSION_RANGE`도 함께 옮긴다(패치는 캐럿이 흡수하므로 그대로 둠). `decide.ts`와 마찬가지로 로컬 import 없이 자립. 리뷰에서 `config` 분기 클로저였던 `rank` 헬퍼가 바깥 스코프를 안 쓴다는 `unicorn(consistent-function-scoping)` 지적을 받아 모듈 스코프로 옮겼다(계획서 코드의 결함).
  - **Task 3** (`829487e`): 부트스트랩 — 락스텝이 깨져 있던 5개 패키지(`vitest-config`만 `0.1.1`, 나머지 `0.1.0`)를 `0.1.1`로 정렬했다(이미 게시된 `vitest-config@0.1.1`은 되돌릴 수 없어 위로 맞춤). CI가 "지난 릴리스 이후"를 판단할 기준점 태그 `config-v0.1.1`(이 커밋)·`cli-v0.1.0`을 만들었다. `cli-v0.1.0`은 현재 커밋이 아니라 **실제 게시 시점 커밋**(`e8f65f8`, work-log에 게시 사실이 기록된 커밋)에 달아야 그 이후 쌓인 11개 커밋이 다음 릴리스에서 누락되지 않는다 — `git log --oneline --all -- packages/devkit-cli/package.json`으로 게시 가능화 커밋을 찾고, `e8f65f8..HEAD`가 정확히 11개 커밋임을 교차검증해 확정했다.
  - **Task 4** (`32c5270`): `.github/workflows/release.yml` — `main` push마다 판정 → (대상 없으면 종료) → 전체 검증(`build`·`test`·`typecheck`·`lint:ox`·`lint:es`·`test:e2e`) → 버전 갱신 → 게시(`pnpm -r publish`) → 커밋·태그·push 순서로 돈다. 게시가 커밋보다 앞이라 게시 실패 시 "올렸다는데 레지스트리엔 없는" 상태가 안 남고, 검증이 깨지면 아무것도 안 나간다. `permissions: contents: write, packages: write`로 기본 `GITHUB_TOKEN`만 쓰고 PAT이 필요 없다. 마지막 커밋의 `[skip ci]`가 무한 루프를 막는다. `fetch-depth: 0`(지난 태그 이후를 읽어야 함), Node 24(`.ts` 네이티브 실행). **워크플로는 실행하지 않았다** — 실행하면 실제 게시가 일어나 되돌릴 수 없어서, 정적 확인(필수 항목 존재)과 판정 파이프의 로컬 실행(같은 `decide.ts`/`apply.ts` 호출)으로만 검증했다.
  - **Task 5** (이 항목): 루트 README에 `### 릴리스는 자동이다` 절을 추가했다 — 접두→올림 표, 제외 경로, 두 축(락스텝 vs 단독), 검증 우선 원칙, 게시 실패 시 사람 개입, `pnpm -r publish`가 이미 게시된 버전을 자동으로 건너뛴다는 사실(dry-run으로 확인, 재게시 충돌 없음)을 담았다. `packages/devkit-cli/README.md`는 `publish`·`게시` 서술이 없어 손대지 않았다. 루트 `publish:packages` 스크립트는 워크플로가 쓰고 비상시 손으로도 쓸 수 있어 남겨뒀다 — README의 "손으로 칠 일이 없다"와 모순되지 않는다(평상시엔 안 쓴다는 뜻이지 스크립트 삭제가 아니다).
- **검증**: `pnpm test` 48파일/455개(Task 1이 +13, Task 2가 +7, Task 3~5는 변화 없음), `pnpm typecheck` 7/7, `pnpm lint:ox` 에러 0·warning 3, `pnpm lint:es` 8/8 — 각 태스크 마지막 단계에서 확인. `pnpm test:e2e`는 이 계획 범위 밖이라 돌리지 않았다. **이 계획은 게시하지 않는다** — `pnpm publish`·`gh workflow run`·`act` 전부 실행 금지, 첫 실제 릴리스는 이 브랜치가 main에 병합된 뒤 워크플로가 스스로 판단해 실행한다.
- **커밋**: 설계 `edec036`, 계획 `ca611a2` · `4ede3d7`(Task 1) · `498860c`+`74fe700`(Task 2) · `829487e`(Task 3) · `32c5270`(Task 4) · 이 항목(Task 5). 태그 `cli-v0.1.0`(`e8f65f8`) · `config-v0.1.1`(`829487e`). 브랜치 `feature/auto-release`, main 미머지.

## 2026-08-05

### devkit-cli 게시 가능화 — Task 1~7
- **변경 파일**: `packages/devkit-cli/src/lib/layout.ts`(신설)·`src/bin.ts`·`src/lib/version.ts`·`src/ops/copy-overlay.ts`·`tests/bin.test.ts`·`tests/layout.test.ts`(Task 1) · `src/types.ts`·`src/update/index.ts`·`tests/flatten.test.ts`·`tests/update-flow.test.ts`(Task 2) · `tests/registry-version.test.ts`(Task 3) · `packages/devkit-cli/package.json`·루트 `package.json`(Task 4) · `tests/e2e/packed.e2e.test.ts`(신설, Task 5) · `README.md`·`packages/devkit-cli/README.md`(Task 6) · `work-log.md`(Task 7, 이 항목)
- **내용**: 설계·계획 `.superpowers/sdd/2026-08-05-publishable-cli`의 7태스크 전체 — `devkit-cli`를 `private: true`에서 게시 가능한 패키지로 전환하고 실제로 게시했다. 배경: `findToolkitRoot`가 게시본(소비자의 `node_modules` 안)에서 `pnpm-workspace.yaml`을 못 찾으면 던지므로, 게시하려면 그 지점부터 걷어내야 했다.
  - **Task 1**: `packageRoot(from)`(`package.json`이 있는 첫 조상 탐색 — tsup 번들로 파일 깊이가 달라져도 답이 같다)과 `packageLayout(pkgRoot)`(`src` 유무로 source/bundled 판정)를 `lib/layout.ts` 한 곳에 모았다. `assertDistFresh`는 `bundled`면 즉시 반환 — 게시본에는 `src`가 없어 `newestMtime`을 부르면 ENOENT로 죽고, 신선도는 `prepublishOnly` 빌드가 이미 보장하므로 검사를 생략해도 방어가 빠지지 않는다. `templatesRoot`·`devkitVersion`이 각자 하던 walk-up도 `packageRoot`로 통일했다.
  - **Task 2**: `Ctx.toolkitRoot`/`UpdateOptions.toolkitRoot`를 `string`에서 `string | null`로 확장. 게시본 실행에서 `findToolkitRoot`를 그대로 부르면 소비자가 pnpm 모노레포일 때 **소비자의** 워크스페이스 루트를 `toolkitRoot`로 잡아버려, 그 루트에서 `devbak update`를 돌리는 사용자를 자기보호 가드가 부당하게 거부한다(`pnpm dlx`면 아예 던진다). `null`은 "검사 생략"이 아니라 "툴킷 저장소가 존재하지 않는다"는 사실의 표현 — `bin.ts`에서 `packageLayout(pkgDir) === 'source' ? findToolkitRoot(pkgDir) : null`로 계산하고, `runUpdate`의 가드는 `toolkitRoot !== null && targetDir === toolkitRoot`로 고쳐 null이면 건너뛰되 값이 있으면 여전히 문다. 테스트 2건(null일 때 안 걸림 / 값 있을 때 여전히 걸림)을 짝으로 추가 — 후자가 없으면 가드를 통째로 지워도 통과한다.
  - **Task 3**: 버전 관문(`registry-version.test.ts`)이 지금은 "`private`이 아닌 패키지 전부"를 훑는데, `devkit-cli`의 `private: true`가 떼이는 순간(Task 4) CLI가 대상에 들어온다. 하지만 관문이 검사하려던 명제는 "생성물이 `^0.1.0`으로 선언하는 범위가 실제 게시본을 가리키는가"이고, CLI는 아무도 의존으로 선언하지 않는 도구라 이 명제의 대상이 아니다. 대상을 `declaredShortNames()`(세 레시피가 `registryDeps`로 실제 선언하는 이름)로 좁혀 `devkit-cli`가 예외 목록 없이 자동으로 빠지게 했다. `DEVKIT_VERSION_RANGE`를 `^0.2.0`으로 바꿔 관문이 실제로 무는 것을 확인(`@cheolubak/eslint-config-nest@0.1.0 이 ^0.2.0 를 벗어난다`)한 뒤 원복, `private: true`를 잠시 지워 `devkit-cli`가 PASS로 빠지는 것을 확인한 뒤 원복 — 다만 devkit-cli 자체 버전이 `0.1.0`이라 이 PASS만으로는 증거가 약해, `declaredShortNames()`가 실제로 담는 6개 이름(devkit-cli 미포함)을 임시 테스트로 직접 확인했다.
  - 세 태스크 모두 `pkgDir` 계산 줄(`packageRoot(fileURLToPath(import.meta.url))`, Task 1 산출물)은 건드리지 않았다.
  - **Task 4**: `packages/devkit-cli/package.json`의 `private: true`를 지우고 나머지 6개와 같은 `publishConfig`(`access: public`, GitHub Packages 레지스트리)·`repository`를 넣었다. Task 3이 관문 대상을 좁혀 둔 덕에 devkit-cli가 관문을 안 받으면서도 게시 대상이 될 수 있었다. 루트 `publish:packages`의 devkit-cli 제외 필터도 걷어냈다(`pnpm -r`이 `private`을 자체적으로 거른다). `pnpm publish --dry-run`으로 tarball을 확인 — 총 32개 파일, `src/` 없음, `templates/**`(밑줄 dot-file 포함) 전부 포함.
  - **Task 5**: `pnpm pack`으로 실제 tarball을 만들어 풀고 그 `dist/bin.js`로 도는 e2e 2건(`packed.e2e.test.ts`)을 추가했다. 기존 e2e 11개는 전부 저장소 안 `dist/bin.js`를 직접 불러 게시본 갈래(레이아웃 판별, `toolkitRoot === null`)를 밟지 않았다 — 직전 레지스트리 전환에서 `link:`가 감춰 온 결함(`vitest-config` 타입 선언 누락)이 실제 설치 경로를 밟는 e2e에서만 드러났던 것과 같은 교훈이다. `assertDistFresh`의 `bundled` 조기 반환을 잠시 지우고 빌드해 두 번째 테스트가 정확히 `ENOENT: ... scandir '.../package/src'`로 죽는 것을 확인한 뒤 원복 — 관문이 실제로 무는 것을 실증했다.
  - **Task 6**: `private: true`를 전제로 쓴 문서 서술을 걷어내고 `pnpm dlx @cheolubak/devkit-cli create ...`를 주 경로로 올렸다. 저장소 클론 절차는 `### 개발·기여용` 소절로 내리고, `bin.js`를 절대경로로 부르는 alias 트릭은 `pnpm dlx`가 대신하므로 삭제했다. GitHub Packages가 **공개 패키지도 익명 접근을 허용하지 않는다**는 문턱(`~/.npmrc`에 스코프+토큰 필요)을 명시했다. 재리뷰에서 `## 새 프로젝트 만들기`·`## 기존 프로젝트에 붙이기`(루트 README)와 `## 사용법`(devkit-cli README)에도 같은 문제가 있다는 Important 지적을 받아 같은 원칙으로 정리했다.
  - **Task 7**: 사람 승인을 받아 `@cheolubak/devkit-cli@0.1.0`을 실제로 게시했다. 게시 전 `npm view ... versions`가 404(한 번도 게시된 적 없음)임을 확인 → `pnpm publish --no-git-checks` → 레지스트리에서 `0.1.0` 확인 → 빈 임시 디렉토리에서 `pnpm dlx @cheolubak/devkit-cli create dlx-demo --type nest --no-verify`로 최종 검증. **최초 시도는 이 머신에 `~/.npmrc`가 아예 없어 pnpm dlx가 기본 npm 레지스트리로 가 404가 났다** — Task 6 문서가 안내한 그대로 `~/.npmrc`에 `@cheolubak:registry=...`·`_authToken`을 설정한 뒤 재시도해 성공(프로젝트 생성 + `pnpm install`까지 완료, `@cheolubak/*`가 `^0.1.0`으로 선언됨). 이 파일을 문서화 목적으로 홈 디렉토리에 남겨 뒀다.
  - **최종 리뷰 fix wave(Minor 5건)**: ①`version.ts`의 docstring이 `findToolkitRoot`(다른 함수)를 가리키던 것을 `lib/layout.ts`의 `packageRoot`로 정정. ② `bin.ts`·devkit-cli `README.md` 두 곳이 `assertDistFresh`의 근거로 여전히 "`link:` 소비"(레지스트리 전환으로 이미 사라진 개념)를 들던 것을 "저장소에서 직접 실행하는 방식"으로 통일(Task 6이 루트 README는 이미 고쳤는데 이 두 곳만 남아 있었다). ③ `layout.test.ts`의 쓰이지 않는 `orphan` 임시 디렉토리 셋업 제거. ④ `package.json`에 `"prepack": "pnpm build"` 추가 — `pnpm pack`은 `prepublishOnly`를 안 돌려 패키지 디렉토리에서 직접 `pnpm test:e2e`나 `pnpm pack`을 돌리면 낡은 `dist`를 담은 tarball을 검증하고도 초록불이 뜰 수 있었다(`dist`를 지운 뒤 `pnpm pack`이 스스로 재빌드하는 것으로 확인). ⑤ `packed.e2e.test.ts`의 템플릿 존재 단언이 `nest`만 보던 것에 `next`·`monorepo` 두 줄을 추가.
- **검증**: `pnpm test` 43파일/374개, `pnpm typecheck` 7/7, `pnpm lint:ox` 에러 0·warning 3, `pnpm lint:es` 8/8, `pnpm test:e2e` **13/13** — 7태스크 전부 끝난 시점의 최종 수치. fix wave 이후 `packed.e2e.test.ts` 2/2 재확인. `git status`·`devkit-e2e-*` 잔재 없음 확인.
- **커밋**: `3d82205`(Task 1) · `d4642e1`(Task 2) · `02f04df`(Task 3) · `5d38bad`(Task 4) · `bd0a0a3`(Task 5) · `38da60e`+`a11667c`(Task 6) · 이 항목(Task 7). 설계 `4d1dd8c`, 계획 `2253b4a`. 브랜치 `feature/publishable-cli`, main 미머지(머지는 사용자 몫).

### 루트 README에 CLI 설치·사용 절 추가
- **변경 파일**: `README.md`
- **내용**: 레지스트리 전환으로 소비 쪽 문서는 충실해졌는데 **CLI를 어떻게 손에 넣는가**가 비어 있었다. `## CLI 설치` 절을 신설했다 — ① `devkit-cli`는 `private: true`라 `pnpm add -D`·`pnpm dlx` 둘 다 안 되고 클론해서 쓴다는 것과 그 이유(`findToolkitRoot`가 `pnpm-workspace.yaml`을 못 찾으면 던지므로 게시본은 첫 줄에서 죽는다), ② 클론·`pnpm build`와 빌드가 필수인 이유(`dist`가 `src`보다 오래되면 실행을 거부한다), ③ `gh auth refresh -h github.com -s read:packages` → `export GITHUB_TOKEN=$(gh auth token)`(생성물의 `pnpm install`이 요구한다 — 공개 패키지도 예외가 아니다), ④ `pnpm devbak --help` 실측 출력, ⑤ **저장소 밖에서 쓰는 법** — `findToolkitRoot`가 cwd가 아니라 `bin.js` 위치에서 탐색하므로 절대경로 alias로 어느 디렉토리에서든 생성할 수 있다(저장소 밖 cwd에서 실행해 실증했다), ⑥ 증상별 트러블슈팅 표 5건(에러 문구는 `bin.ts`·테스트에서 실제 문자열을 확인해 옮겼다). `새 프로젝트 만들기`에는 인자·옵션 표와 "무엇이 일어나는가" 5단계(자가검증 실패 시 생성물을 지우지 않는다 — 설계 6.3절)를 덧붙였다.
- **커밋**: 아래

### 레지스트리 설치 전환 (설계 → Task 1~8 구현·게시·검증)
- **변경 파일**: 패키지 7개의 `package.json`(스코프 개명 + 게시 메타데이터), `src/ops/link-deps.ts` → `registry-deps.ts`(신설, `linkSpec`·`normalizeToPosix` 삭제), 레시피 3종(`nest`·`next`·`monorepo`)과 `update/plan.ts`가 `registryDeps` 참조, `templates/**/_npmrc`(신설, `categoryOf('.npmrc') === 'deps'`), `src/bin.ts`(`cwd` 주입 → `resolve(baseDir, name)`, 위치 제약 제거), `.gitignore`(`.npmrc` 등록), 루트 `package.json`(`publish:packages` 스크립트), `packages/devkit-cli/tests/e2e/{create,update}.e2e.test.ts`(`GITHUB_TOKEN` 가드), `README.md` + `packages/*/README.md` 6건(설치 예시를 `pnpm add -D`로, "위치 제약" 절 삭제/재작성)
- **내용**: 설정 패키지를 `link:` 상대경로 대신 GitHub Packages(npm 레지스트리)에서 설치하는 방식으로 바꿨다. 설계 문서 `docs/superpowers/specs/2026-08-05-registry-install-design.md`, 계획 `docs/superpowers/plans/2026-08-05-registry-install.md`.
  - **스코프 개명**: `@devbak/*` → `@cheolubak/*`(GitHub Packages는 npm 스코프가 저장소 소유자와 같아야 한다). 코드·템플릿·테스트·현행 README는 전부 개명했지만 **`docs/superpowers/**`와 이 파일의 기존 항목(2026-08-04 이전)은 그대로 뒀다** — "언제 왜 이름이 바뀌었는가"를 아는 과거 기록이 사라지면 안 되기 때문이다.
  - **게시 메타데이터**: `devkit-cli`는 `private: true`(findToolkitRoot가 `pnpm-workspace.yaml`을 못 찾으면 던져 `pnpm dlx`로 못 쓴다 — 게시해도 실질적으로 무의미하다). 나머지 6개에 `repository`·`publishConfig.registry`·`publishConfig.access: public`.
  - **`linkDeps` → `registryDeps`**: 소비자 `package.json`에 `@cheolubak/*`를 `^0.1.0` 버전 범위로 선언한다. 상대경로 계산(`linkSpec`·`normalizeToPosix`, 모노레포 `apps/web`의 깊이 다른 경로)이 통째로 사라졌다 — 대상이 어디에 있든 값이 같다.
  - **`.npmrc` 템플릿**: 생성물에 `@cheolubak:registry=https://npm.pkg.github.com` + `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}`을 놓는다. npm이 패키지 안 dot-file을 걸러내므로 `_npmrc`로 저장해두고 `copyOverlay`가 복사 시 점 이름으로 복원한다. 카테고리는 `deps`(의존성과 함께 움직여야 하므로) — 덕분에 `devbak update --only deps`가 기존 `link:` 프로젝트에 `.npmrc`와 버전 범위를 한 번에 놓는다. 다만 **완전한 마이그레이션은 아니다**: `registryDeps`는 새 키를 얹기만 하므로 옛 `@devbak/*`: `link:...` 항목이 그대로 남고 손으로 지워야 한다(최종 리뷰 I-1이 잡았다).
  - **위치 제약 제거**: `create`가 `main(argv, { cwd })`를 주입받아 `resolve(cwd, name)`으로 대상을 정한다. 예전엔 언제나 툴킷의 부모 디렉토리에만 생성됐지만, 이제 실행한 위치 기준이다.
  - **실제 게시(Task 8, 사람 승인 후)**: 게시 직전 `gh` 토큰에 `write:packages` 스코프가 없다는 것이 드러나 `gh auth refresh -s write:packages,read:packages`(device flow)로 붙였다. 6개 전부 `0.1.0`으로 첫 게시 성공(사전에 `npm view`로 404 확인 — 버전 충돌 없음). tarball 내용이 Task 7 dry-run 예측과 정확히 일치했다. 게시 후 `npm view`로 레지스트리 반영 확인, 빈 디렉토리에서 `pnpm add -D @cheolubak/tsconfig@^0.1.0` 성공(`base`·`nest`·`next`·`lib` json 4개 확인), `devbak create demo-api --type nest --no-verify` → `pnpm install` 성공(`.npmrc` 배치, `"@cheolubak/tsconfig": "^0.1.0"` 확인, cwd 기준 생성 확인) — 이 전환의 실질 증거.
  - **e2e 토큰 가드**: `GITHUB_TOKEN` 없이 e2e를 돌리면(레지스트리를 타므로 반드시 401로 죽는다) 원인을 알 수 없는 채로 죽거나 조용히 넘어가는 것을 막기 위해 두 e2e 파일 맨 위에 명시적 `throw`를 넣었다. `describe.skip` 없이, 토큰 없으면 설치 시도 전(318ms)에 알아볼 수 있는 메시지로 실패하는 것을 확인했다.
  - **e2e 실행 결과 — 11개 전부 실패, 원인은 발행이 아니라 e2e 테스트 하네스 자체다.** `create`/`update`는 실측으로 정상 동작함을 확인했는데(위 sandbox 검증), `packages/devkit-cli/tests/e2e/{create,update}.e2e.test.ts`가 Task 6이 바꾼 cwd 기준 동작에 맞춰 갱신되지 않았다 — 여전히 `execFileSync(..., { cwd: TOOLKIT })`로 CLI를 실행하면서, 결과 경로는 예전 위치 제약 시절 그대로 `PARENT`(`TOOLKIT`의 부모)로 계산해 기록한다. cwd 기준 로직에서는 `resolve(cwd=TOOLKIT, name)`이 되어 생성물이 **툴킷 저장소 자기 자신 안**(`eslint/devkit-e2e-*`)에 만들어지는데, 그 위치는 저장소의 `pnpm-workspace.yaml`(`packages: - 'packages/*'`) 범위에 속하지 않아 `pnpm install`이 `@cheolubak/*`를 설치하지 못한다(`node_modules/@cheolubak`가 아예 안 생김) — ESLint가 `Cannot find package '@cheolubak/eslint-config-nest'`로 죽는다. `create` 5개·`update` 6개 전부 이 경로로 실패했다. 잘못 생성된 픽스처 11개(`eslint/devkit-e2e-*`)는 `rm -r`로 정리했다(lint 스캔 오염 확인 후 복구).
  - **e2e 수정과 최종 결과 — 11/11 통과.** 위 진단을 리뷰어가 독립 검증해 Task 6이 만든 회귀로 확정한 뒤 세 번에 걸쳐 고쳤다. ① 하네스가 `cwd: PARENT`로 CLI를 부르고 `bin.js`를 절대경로로 지정하게 바꿨다(`3cc51e6`) → 9/11. ② `@cheolubak/vitest-config`에 타입 선언이 없어 `next`·`monorepo` 생성물의 `next build`가 TS7016으로 죽었다(아래 항목) → 10/11. ③ `create.e2e.test.ts`에 `expect(webPkg).toContain('link:../../../eslint/packages/')`가 남아 있었다 — 이 줄에는 `@devbak`이 없어 스코프 개명 grep에 걸리지 않았다. 확인할 내용이 "깊이별 상대경로가 맞는가"에서 "깊이가 무의미해졌는가"로 바뀌었으므로 버전 범위 선언과 `link:` 부재를 단언하도록 고쳤다(`352a474`) → **11/11**.
  - **`@cheolubak/vitest-config@0.1.1` 재게시 — `link:`가 감춰 온 결함.** 이 패키지는 타입 선언 없는 순수 `.js`(`next.js`·`node.js`)만 게시한다. `link:` 시절에는 심볼릭 링크의 realpath가 `node_modules` **밖**(툴킷 저장소 안)이라 소비자 tsconfig의 `allowJs: true`가 실제로 먹혀 통과했다. 레지스트리 설치는 파일을 진짜 `node_modules` 안에 놓는데, TypeScript는 그 안의 `.js`를 타입 추론 대상에서 제외하므로(`maxNodeModuleJsDepth` 기본 0) `allowJs`가 무력해지고 TS7016이 난다. 설치본에 `next.d.ts`를 손으로 넣어 빌드가 즉시 통과하는 것으로 기전을 확증한 뒤, `next.d.ts`·`node.d.ts`를 만들어 `0.1.1`로 재게시했다(`0.1.0`은 재게시가 불가능하다). 생성물은 `^0.1.0` 범위로 선언하므로 코드를 한 줄도 바꾸지 않고 새 버전을 받는다 — semver 범위 선언의 이득이 첫 수정에서 바로 나타났다. 부수 발견: `.d.ts`를 tsconfig `include`에 넣자 같은 이름의 `.js`가 프로그램에서 밀려났다(shadowing). 게시되는 선언을 타입 검사 대상으로 두고 설정 객체일 뿐인 `.js`는 타입 인식 린트에서 빼는 쪽을 택했다(`checkJs: false`라 원래도 타입 검사를 받지 않았다).
  - **README**: 루트와 패키지 6개(devkit-cli 포함 7개) 전부에서 `link:` 설치 예시를 `pnpm add -D`로, "위치 제약" 절을 cwd 기준 서술로 바꿨다. `.npmrc`·`GITHUB_TOKEN`이 **공개 패키지에도** 필요하다는 점을 루트 README에 명시했다. `devkit-cli`는 게시하지 않으므로 그 README에 "저장소를 클론해 직접 실행한다"고 적었다.
  - **최종 리뷰 fix wave(Important 4건)**: ① `work-log`의 e2e 서술이 "11개 실패, 미수정"에서 멈춰 정정 사실을 되돌리고 있었다(turbo 작업에서 한 번 고쳤던 것과 같은 실수) — 위 항목들로 이었다. ② `categories.ts`와 devkit-cli README의 "별도 도구가 필요 없다"가 거짓이었다(레거시 `@devbak/*`가 남는다) — 사실에 맞췄다. ③ `registry-deps.ts`의 "패키지 7개가 락스텝"이 `vitest-config` `0.1.1`로 깨졌고 개수도 틀렸다(게시 대상은 6개) — 락스텝은 규칙이 아니라 기본값이며 캐럿이 패치 선행을 흡수한다는 근거로 바꿨다. ④ `DEVKIT_VERSION_RANGE`가 실제 패키지 버전과 아무것에도 묶여 있지 않았다(기존 두 테스트는 그 상수를 import해 자기 자신과 비교하므로 무슨 값이든 통과했다) — `tests/registry-version.test.ts`를 신설해 게시 대상의 `version`이 범위를 만족하는지, 레시피가 선언하는 짧은 이름이 실재하는지 검사한다. 범위를 `^0.2.0`으로, 레시피 이름을 오타로 각각 바꿔 두 단언이 실제로 무는 것을 확인한 뒤 원복했다.
- **검증**: `pnpm test`(41파일/363개 → fix wave 후 42파일/365개), `pnpm typecheck`(7/7), `pnpm lint:ox`(에러 0, warning 3 — 픽스처 정리 후 기준선과 동일), `pnpm lint:es`(8/8), `pnpm build` 성공, **`pnpm test:e2e` 11/11 통과**. `git status`에 `.npmrc` 없음 확인.
- **커밋**: `f4fbfda`(설계) ~ `352a474`(e2e 단언·주석 수정) + 최종 리뷰 fix wave 커밋. `feature/registry-install` 브랜치.

## 2026-08-04

### Turborepo 도입 (설계 → Task 1~5 구현·검증)
- **변경 파일**: `turbo.json`(신규), `eslint.base.mjs`(신규), 패키지 7개에 `eslint.config.mjs`·`vitest.config.ts` 신설(기존 것 이동/분할), `devkit-cli`에 `vitest.e2e.config.ts`·`turbo.json`, `packages/vitest-config/tests/tsconfig.json`(`allowJs` 추가로 TS7016 수정)와 `tests/config.test.ts`(반대로 적혀 있던 주석 정정), 각 `package.json`에 `typecheck` 스크립트 추가, `packages/devkit-cli/tests/lint-coverage.test.ts`(신규), 루트 `package.json`(스크립트 전부 `turbo run`으로 교체), 루트 `eslint.config.mjs`(`packages/**` 무시), 루트 `vitest.config.ts`·`vitest.e2e.config.ts` 삭제, `README.md`
- **내용**: 저장소 자체(`eslint-workspace`)에 Turborepo를 붙여 `build`·`test`·`lint`·`typecheck`를 패키지 단위 태스크로 쪼갰다. 설계 문서 `docs/superpowers/specs/2026-08-04-turbo-toolkit-design.md`.
  - **얻은 것은 캐싱과 도그푸딩뿐이다.** 실측대로 패키지 7개 사이에 워크스페이스 의존이 0이라(설정 패키지는 서로 import하지 않고 `devkit-cli`는 이들을 템플릿 내용으로만 조립한다) `dependsOn: ["^build"]`가 no-op이고 `pnpm -r`이 이미 하던 동시 실행 이상의 스케줄링 이득이 없다. "빌드가 빨라진다"는 기대는 틀린 기대다 — 실제로 얻은 것은 (1) 안 바뀐 패키지의 재실행을 건너뛰는 캐시, (2) 툴킷이 `monorepo` 레시피로 남에게 권하는 구조를 자기도 쓰는 도그푸딩 두 가지뿐이다.
  - Task 3(`typecheck` 배선)에서 `tests/tsconfig.json`은 **7개 패키지 전부에 이미 있었다** — 새로 만든 것은 `tsconfig.json`이 아니라 각 패키지의 `typecheck` 스크립트다. `tsc`를 처음 켜자 `vitest-config`에서 TS7016(암묵적 `any`, 타입 선언 없는 모듈) 2건이 실제로 나왔다. 원인은 `tests/tsconfig.json`이 `../tsconfig.json`을 extends하지 않는 **형제 프로젝트**라 `allowJs`를 상속하지 않는 것이었고, 반대로("형제 프로젝트가 옵션을 상속한다") 적어 둔 주석도 `packages/vitest-config/tests/config.test.ts`에서 함께 발견돼 고쳤다.
  - Task 4(ESLint 분할)가 가장 위험했다. 패키지마다 `eslint.config.mjs`를 두면 `tsconfigRootDir` 후보가 갈려 `multiple candidate TSConfigRootDirs`로 저장소 전체 린트가 죽는다 — 루트 설정이 `packages/**`를 무시하게 해 어떤 실행에서도 스코프 안 설정이 정확히 하나이게 만들어 해소했다. 공유 규칙 배열 파일명은 `eslint.base.mjs`여야 한다(`eslint.config.*`면 ESLint가 자동 탐색해 중첩이 재발한다). 대가는 **격리** — 새 패키지가 `eslint.config.mjs`나 `"lint": "eslint ."`를 빠뜨리면 조용히 린트 대상에서 빠진다(분할 전엔 설정이 없으면 요란하게 전체가 죽었는데, 지금은 초록불로 넘어간다). `tests/lint-coverage.test.ts`를 방어 테스트로 추가해 막았다.
  - Task 5(이 항목)에서 설계 6절의 검증 6개를 전부 재현했다: 테스트 41파일/363개 보존, `pnpm lint` 에러 0·`multiple candidate` 0건, 빌드 성공, 두 번째 `pnpm build && pnpm test && pnpm lint`가 전부 `FULL TURBO`, **부분 무효화**는 `eslint-plugin-fsd/src/index.ts`만 고쳤을 때 그 패키지만 `cache miss`(나머지 6개 `cache hit`)로 정확히 재현됐다(turbo는 mtime이 아니라 파일 내용 해시로 캐시 키를 만들어 `touch`로는 무효화되지 않는다는 점을 확인), 기본 `pnpm test`에 e2e가 섞이지 않음(태스크 수 7개, e2e 태스크 없음). `pnpm test:e2e` 11개도 정상 통과.
  - 알려진 유예 지적 넷을 README에 남기고 고치지는 않았다: turbo가 첫 실패에서 나머지 태스크를 죽여 원인이 가려질 수 있다(`--continue`로 우회), `lint:fix`는 여전히 `&&` 단락 평가(분할 전과 동일, 회귀 아님), `//#lint:root`의 캐시가 과잉 무효화된다(inputs가 넓어 실제 린트 대상 2개보다 훨씬 많은 파일에 반응), `devkit-cli:test`가 형제 패키지 `package.json`이 바뀌면 271개 전부 재실행된다(커버리지 테스트가 다른 패키지 파일을 읽는데 그것이 캐시 키에 안 잡히면 새 패키지 추가가 조용히 안 걸리기 때문 — 자기 캐시 때문에 죽을 뻔한 재귀적 함정을 커버리지 테스트 자신이 안고 있다).
- **검증**: `pnpm test`(41파일/363개), `pnpm lint`(oxlint+ESLint 병렬, 에러 0, `multiple candidate` 0), `pnpm build`, 두 번째 실행 `FULL TURBO` 3종, 부분 무효화 실측(`eslint-plugin-fsd`만 miss), `pnpm test:e2e` 11개 통과.
- **커밋**: `e2c14c6`(설계) ~ `0f6335b`(커밋 범위 정정). `feature/turbo-toolkit` 브랜치, 총 14커밋. main 미머지.

### 최종 전체 브랜치 리뷰 fix wave (I-1·I-2·M-1·M-2·M-3)
- **변경 파일**: `packages/devkit-cli/tests/lint-coverage.test.ts` → `package-task-coverage.test.ts`(이름 변경 + 내용 확장), `turbo.json`, `eslint.base.mjs`, `README.md`, `work-log.md`, `docs/superpowers/plans/2026-08-04-turbo-toolkit.md`, `docs/superpowers/specs/2026-08-04-turbo-toolkit-design.md`
- **내용**: `.superpowers/sdd/2026-08-04-turbo-toolkit/final-review.md`(FIX FIRST, Critical 0·Important 2)가 지적한 항목을 반영했다.
  - **I-1**: 바로 위 Task 5 항목이 이 브랜치가 스스로 정정한(`fe60b02`) 전제를 되살리고 있었다 — `tests/tsconfig.json`을 `prettier-config`·`tsconfig`에 "신설"했다고 적었지만 실제로는 7개 패키지 전부에 이미 있었고, Task 3의 일은 `typecheck` 스크립트 배선이었다. TS7016도 그 두 패키지가 아니라 `vitest-config`에서 났다. 해당 문단과 변경 파일 목록을 실제 사건으로 고치고 커밋 수도 13 → 14로 바로잡았다.
  - **I-2**: lint에는 `lint-coverage.test.ts`(Task 4)가 있었지만, 같은 조용한-실패 기전이 Task 2(vitest 분할)에도 생겼는데 아무도 막지 않았다 — 분할 전엔 루트 `vitest.config.ts`의 `include`가 새 패키지를 공짜로 덮었지만, 분할 후 `turbo run test`는 `test` 스크립트가 있는 패키지만 돈다. 새 패키지가 `vitest.config.ts`나 `test` 스크립트를 빠뜨리면 테스트 0개가 돌고 `pnpm test`는 초록불이다(테스트가 안 도는 것은 lint 누락보다 심각한 **정확성 손실**). 커버리지 테스트를 `package-task-coverage.test.ts`로 일반화해 `vitest.config.ts`+`scripts.test`, `scripts.typecheck` 검사를 추가했다. `scripts.typecheck`는 7개 패키지 전부가 실제로 갖고 있음을 먼저 확인한 뒤 예외 없이 단언했다(`prettier-config`·`tsconfig`는 루트 `tsconfig.json`이 없어 `tests/tsconfig.json`만 검사하지만 스크립트 자체는 있다). README의 새 패키지 체크리스트도 3항목으로 늘렸다.
  - **방어 실증**: `vitest-config/vitest.config.ts`를 임시로 지우고 새 테스트가 실패함을 확인 후 복원, `prettier-config`의 `typecheck` 스크립트를 지우고 실패 확인 후 복원, `lint` 스크립트를 공백 문자열로 바꿔 "빈 스크립트는 없는 것으로 친다"(M-2)는 방어도 실패로 확인 후 복원 — 세 번 모두 복원 뒤 `git diff`가 커밋 기준선과 바이트 단위로 동일함을 확인했다.
  - **M-1**: 커버리지 테스트가 읽는 루트 `pnpm-workspace.yaml`이 `devkit-cli/turbo.json`의 inputs에도 루트 `globalDependencies`에도 없어, 워크스페이스 glob만 바뀌면 stale hit할 여지가 원리상 있었다. 루트 `turbo.json`의 `globalDependencies`에 한 줄 추가(패키지 로컬 inputs가 아니라 전역으로 — 워크스페이스 정의는 실제로 전역 사실이라서).
  - **M-3**: 계획·설계 문서가 "테스트 362개"를 완료 기준으로 못 박은 채 남아 있었다. Task 4에서 362 → 363(41파일)으로 바뀐 뒤에도 두 문서의 **최종 완료 기준**(설계 6절 표, 계획 "완료 확인" 체크리스트)이 갱신되지 않았던 것 — Task 1~3 중간 체크포인트의 "362개"는 그 시점 실측과 일치해 그대로 뒀다.
  - **FIX SOON(선택, 함께 처리)**: `eslint.base.mjs`의 `disableTypeChecked` `files` 항목 중 `'eslint.base.mjs'`가 flat config의 상대경로 규칙상 루트 실행에서만 유효하다는 사실(패키지 실행에서는 존재하지 않는 `packages/<pkg>/eslint.base.mjs`를 가리켜 무해한 no-op)을 주석 두 줄로 남겼다.
  - **M-4는 손대지 않았다**(리뷰가 ACCEPT AS-IS로 판정 — `globalDependencies`와 태스크 inputs의 이중 등재는 무해한 중복이고 패키지 태스크 무효화에 `globalDependencies` 선언이 필요하다).
- **검증**: `pnpm test`(41파일/363개, 변화 없음 — 기존 테스트를 확장했을 뿐 새 `it`를 추가하지 않았다), `pnpm typecheck`(7/7), `pnpm lint:ox`(에러 0, warning 3 — 기존과 동일), `pnpm lint:es`(8/8).
- **커밋**: `59b342a`(커버리지 테스트+turbo/설정) + 문서 커밋 1건(이 항목). `feature/turbo-toolkit` 브랜치. main 미머지.

## 2026-08-03

### devbak update 사용 안내 보강 및 main 통합
- **변경 파일**: `README.md`, `packages/devkit-cli/README.md`
- **내용**: 옵션과 계약은 이미 적혀 있었으나 "실제로 어떻게 쓰는가"의 흐름과 화면이 없었다. 임시 프로젝트(`name`·`version`·`my-lib`·`compilerOptions.paths` 보유)를 만들어 `--dry-run`·`--only`·실제 적용·재실행을 각각 돌린 **실측 출력**을 그대로 실었다. 권장 순서 5단계(dry-run → `--only`로 좁히기 → 대상 트리 정리 → 실행 → `git diff` + `pnpm lint`), `--only` 카테고리 8종이 각각 건드리는 파일·키 표, 사용자 자산 보존 범위 예시를 추가했다. 카테고리 표 초안을 `categories.ts`의 `FILE_PATTERNS`·`JSON_KEY_CATEGORIES`와 대조해 두 곳(`tsconfig.build.json`, `test/jest-e2e.config.ts`)을 고쳤다.
- **통합**: `feature/devkit-update`(24 커밋)를 `main`에 fast-forward로 머지하고 브랜치를 삭제했다(merge commit 없음). 병합 결과에서 테스트 362개·oxlint 에러 0·ESLint clean·빌드 성공 확인. **`origin/main` 푸시는 하지 않았다.**
- **커밋**: `3c2bad5`

## 2026-08-02

### devkit update 구현
- **변경 파일**: `packages/devkit-cli/src/{types,run,bin,index}.ts`, `src/ops/{copy-overlay,merge-json,link-deps,remove-files}.ts`, `src/lib/{categories,version,confirm,marker}.ts`, `src/update/{flatten,json-patch,plan,resolve-type,index}.ts`, `src/recipes/{nest,next,monorepo}.ts`, `templates/{nest/tsconfig.json,monorepo/turbo.json}`, `tests/*`, README 2건(`packages/devkit-cli/README.md`, 루트 `README.md`)
- **내용**: 기존 프로젝트에 devkit 표준을 재적용하는 `devbak update` 서브커맨드를 구현했다. `create`가 쓰는 레시피를 재사용하고 `kind`로 걸러 `copyOverlay`·`mergeJson`·`linkDeps`만 실행한다(생성 시점 전용인 스캐폴딩·자가검증·삭제는 건너뛴다). 각 op에 `plan()`을 추가해 쓰기 전에 최종 내용을 전부 계산하고, `run()`을 `plan()` 기반으로 재구성해 두 경로가 갈라질 수 없게 했다 — 그 결과 `Ctx`에 `mode` 분기를 넣지 않고도 생성 시점 전용 가드(`mergeJson`의 `required`, `copyOverlay`의 `expectUpstream`)가 update에서 자연히 비켜간다. JSON 파일 오버레이는 통째 복사 대신 패치로 환원해 사용자의 의존성·`paths`를 보존한다.
  - `create`가 `package.json`에 `{"devkit": {"type", "version"}}` 마커를 심도록 함께 고쳤다. `monorepo`는 루트에 `monorepo` 마커, 합성된 `apps/web`에는 `next` 마커를 각각 심어 앱만 따로 update할 수 있게 했다. `--only`가 주어지면 마커를 심지 않는다 — 부분 적용을 "전체 반영"으로 표시하지 않기 위해서다.
  - **git 안전망**: 워킹트리가 dirty하면 거부한다(`--force`로 우회). `--dry-run`은 이 게이트를 통과시킨다 — 처음에는 dry-run도 같은 게이트를 태웠는데, 그러면 git 저장소가 아닌 대상에 `--dry-run`을 돌릴 때 "그래도 계속할까요?" 프롬프트에 걸려 비대화형 실행이 멈춰 섰다. 아무것도 쓰지 않는 경로에 되돌림 안전망을 요구할 이유가 없다는 결론으로 게이트를 비켜가게 고쳤다.
  - **비대화형 가드**: `--yes`도 `--dry-run`도 없이 TTY가 아니면 확인 프롬프트에 매달리는 대신 즉시 거부하고 대안을 안내한다 — CI에서 원인 불명으로 멈춘 것처럼 보이는 상태를 막기 위해서다.
  - `devbak --help`/`devbak update --help`/`devbak create --help` 모두 사용법 두 줄을 출력하고 exit 0.
  - **발견**: `create`는 템플릿 JSON을 원문 그대로 쓰고 `update`는 `JSON.stringify(…, null, 2)`로 재직렬화하므로, 손으로 압축한 JSON 배열이 템플릿에 있으면 갓 생성한 프로젝트에도 "덮어쓰기"가 뜬다. `templates/nest/tsconfig.json`·`templates/monorepo/turbo.json`을 정규형으로 고치고 `tests/overlay-coverage.test.ts`에 방어 테스트를 추가해 재발을 막았다.
- **검증**: `pnpm test`(단위·스냅샷, e2e 미포함), `pnpm test:e2e`(별도 실행), `pnpm lint:ox`, `pnpm lint:es`, `pnpm build` 통과.
- **커밋**: `e0e64a7`(설계) ~ `d047982`(update e2e 생성물 보존 수정), 총 18커밋. 문서화 커밋은 별도.

## 2026-07-26

### eslint-plugin-fsd 설계 확정 및 저장소 초기화
- **변경 파일**: `docs/superpowers/specs/2026-07-26-eslint-plugin-fsd-design.md`, `.gitignore`
- **내용**: FSD 구조를 강제하는 ESLint 패키지(`eslint-plugin-fsd`) 설계 확정. pnpm 모노레포 구성, rule 3개(`no-higher-level-imports`/`no-cross-imports`/`no-public-api-sidestep`) + `recommended` flat config 프리셋. 관습 기반 zero-config 경로 파싱(`src/` 앵커로 Next.js 라우팅 폴더 오탐 방지), `pages` 레이어 별칭 `views`/`screens` 지원. git 초기화 및 설계 문서 커밋.
- **커밋**: 0bde34b

### Task 1: pnpm 모노레포 스캐폴딩 + eslint-plugin-fsd 패키지 뼈대
- **변경 파일**: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `packages/eslint-plugin-fsd/package.json`, `packages/eslint-plugin-fsd/tsconfig.json`, `packages/eslint-plugin-fsd/tsup.config.ts`, `packages/eslint-plugin-fsd/src/index.ts`, `pnpm-lock.yaml`
- **내용**: task-1-brief.md의 명세대로 pnpm 워크스페이스와 `eslint-plugin-fsd` 패키지 뼈대(임시 stub export)를 생성. `pnpm install`/`pnpm build`(tsup으로 dist 생성 확인)/`pnpm test` 모두 성공 확인. vitest가 테스트 0개로 exit 1 실패하여 브리프의 폴백대로 루트 `test` 스크립트에 `--passWithNoTests`를 추가해 exit 0으로 통과시킴.
- **커밋**: 1c29d1f

## 2026-07-27

### eslint-plugin-fsd 구현 완료 (Task 2~10 + 최종 리뷰 반영)
- **변경 파일**: `packages/eslint-plugin-fsd/src/lib/{types,layers,parse-path,resolve-import,create-rule}.ts`, `src/rules/{no-higher-level-imports,no-cross-imports,no-public-api-sidestep}.ts`, `src/index.ts`, `packages/eslint-plugin-fsd/tests/*.test.ts`, `README.md`
- **내용**: Subagent-Driven Development로 계획 10개 태스크를 TDD로 구현(레이어 모델 → 경로 파싱 → import 해석 → rule 공통 헬퍼 → rule 3개 → 진입점/`recommended` 프리셋 → README/통합검증). 총 42개 테스트 통과, tsup 빌드 성공. 태스크별 리뷰에서 실버그 3건 수정: (1) `findFsdRoot` 최상위 레이어 시 절대경로 `/` 반환, (2) `createImportRule`의 `ImportExpression`을 실제 노드로 처리해 report 크래시 제거, (3) 최종 리뷰(opus)에서 발견한 Critical — `recommended` 프리셋이 Next.js 루트 라우팅 `pages/`를 no-cross-imports 오탐 → `ignores: ['app/**','pages/**']` 스코핑으로 차단.
- **브랜치/커밋**: `feature/eslint-plugin-fsd` (fb00c5a..981b9a5, 총 14 커밋). main 미머지.
- **남은 follow-up**: type-only import 예외, 명시적 `/index` 진입점 허용, Windows 경로 테스트, `@x` cross-import, rule option `rootDir`.

## 2026-07-29

### oxlint + ESLint 하이브리드 린팅 도입 (저장소 자체 린트 구성)
- **변경 파일**: `.oxlintrc.json`(신규), `eslint.config.mjs`(신규), `packages/eslint-plugin-fsd/tests/tsconfig.json`(신규), `package.json`, `pnpm-lock.yaml`, `packages/eslint-plugin-fsd/src/lib/parse-path.ts`, `packages/eslint-plugin-fsd/tests/{create-rule,no-cross-imports,no-higher-level-imports,no-public-api-sidestep}.test.ts`
- **내용**: 루트 `lint` 스크립트가 `eslint .`를 가리키는데 `eslint.config.*`가 아예 없어 동작하지 않던 상태였다(플러그인 저장소인데 자기 자신은 린트되지 않음). oxlint 도입과 함께 ESLint 설정을 처음 구성해 하이브리드로 세움.
  - oxlint(`.oxlintrc.json`): plugins `eslint/typescript/import/promise/unicorn/vitest`, categories `correctness=error, suspicious=warn, perf=warn`. `unicorn/no-array-sort`는 tsconfig target이 ES2022라 `toSorted`(ES2023)를 못 써서 off.
  - ESLint(`eslint.config.mjs`): `recommendedTypeChecked` + `projectService`로 **타입 인식 규칙만** 담당. `eslint-plugin-oxlint`의 `buildFromOxlintConfigFile`을 배열 **맨 끝**에 spread해 중복 규칙 제거(198개 중 158개 off, 잔여 40개는 대부분 타입 인식 규칙).
  - 타입 인식 커버리지 구멍 해소: 빌드용 tsconfig가 `include: ["src"]`라 테스트 파일이 어떤 TS 프로젝트에도 속하지 않아 `projectService`가 실패 → `tests/tsconfig.json` 별도 추가. `*.config.*`는 오버라이드에서 `disableTypeChecked` + `projectService: false`(disableTypeChecked는 규칙만 끄고 파서는 안 끄기 때문).
  - 스크립트: `lint`를 `oxlint && eslint .`(빠른 쪽 먼저 실패시켜 느린 ESLint를 아끼는 순서)로 바꾸고 `lint:ox`/`lint:es`/`lint:fix` 추가.
  - 첫 린트에서 `@typescript-eslint/no-unnecessary-type-assertion` 5건 검출·수정: `parse-path.ts`의 `rel[0]!`(tsconfig에 `noUncheckedIndexedAccess`가 없어 무의미), 테스트 4곳의 `it as unknown as typeof RuleTester.it`. 전부 oxlint가 타입 정보 없이는 못 잡는 건이라 하이브리드에서 ESLint를 남긴 근거가 됨.
- **검증**: `oxlint` 0.13s 통과, `eslint .` 통과, `tsc --noEmit`(src/tests) 통과, `pnpm test` 42/42 통과, `pnpm build` 성공.
- **커밋**: `8e78c65`(타입 단언 정리), `68b7984`(하이브리드 구성), `e150ae3`(README), `271b9f5`(work-log). 이후 `16004bf`로 `.superpowers/**`를 ESLint ignores에 추가(ESLint는 `.gitignore`를 읽지 않아 스크래치 파일이 `projectService`에 걸려 lint를 깨뜨렸다).

### ESLint 10 업그레이드
- **변경 파일**: `package.json`, `packages/eslint-plugin-fsd/package.json`, `packages/eslint-plugin-fsd/README.md`, `pnpm-lock.yaml`
- **내용**: ESLint를 9.39.5 → **10.8.0**으로 올림. Node v24.6.0으로 v10 요구사항(`^20.19 || ^22.13 || >=24`) 충족.
  - `typescript-eslint@8.65.0`은 이미 peer가 `^8.57.0 || ^9.0.0 || ^10.0.0`이라 메이저 업그레이드 불필요. `eslint-plugin-oxlint`는 peer가 `oxlint`뿐이라 무관. `@eslint/js`만 `^9` → `^10.0.1`로 동반 상향(하이브리드 도입 시 eslint 9에 맞추려 임시로 낮춰뒀던 것).
  - **함정**: 루트만 올리면 `packages/eslint-plugin-fsd/node_modules/eslint`가 9.39.5로 남는다. 락파일에 auto-install된 peer `eslint: ">=9"`가 9.39.5로 고정돼 있고 `>=9`를 만족하니 pnpm이 갱신하지 않기 때문. 테스트가 패키지 디렉토리에서 `eslint`(RuleTester)를 import하므로 이대로면 **42개 테스트가 v9로 돌아가 업그레이드 검증이 무의미**해진다 → 플러그인 패키지에 `devDependencies: { eslint: "^10.8.0" }`을 명시해 해결.
  - `peerDependencies`를 `">=9"` → `"^9.0.0 || ^10.0.0"`으로 좁힘. 무제한 `>=9`는 미검증 미래 메이저(v11+)까지 지원한다고 주장하게 되므로 알려진 지원 범위로 한정.
  - 규칙 집합 변화는 1건뿐: **`no-useless-assignment`가 v10 `recommended`에 신규 편입**(oxlint 활성 카테고리 밖이라 ESLint가 담당, 현재 코드는 통과). 제거된 규칙 0건. 하이브리드 중복 제거는 그대로 유지(off 158개 동일, 활성 40→41).
  - README의 "ESLint v9 flat config" 표기를 v9/v10으로 갱신. `docs/superpowers/` 아래 설계·계획 문서는 당시 결정을 담은 이력 문서라 수정하지 않음.
- **검증**: `eslint --version` 10.8.0(루트/패키지 모두), `pnpm lint` 통과, `pnpm test` 42/42 통과(v10 RuleTester), `tsc --noEmit`(src/tests) 통과, `pnpm build` 성공.
- **커밋**: `8e78c65`(타입 단언 정리), `68b7984`(하이브리드 구성), `e150ae3`(README), `271b9f5`(work-log)

## 2026-07-30

### React/Next 프리셋 서브패스 export 추가 (완료)
- **변경 파일**: `docs/superpowers/specs/2026-07-29-fsd-react-preset-design.md`, `docs/superpowers/plans/2026-07-29-fsd-react-preset.md`, `packages/eslint-plugin-fsd/src/{react,next}.ts`, `src/lib/preset.ts`, `src/types/eslint-plugin-jsx-a11y.d.ts`, `tests/{preset,react-preset,next-preset,entry-isolation}.test.ts`, `tests/tsconfig.json`, `package.json`, `tsup.config.ts`, `README.md`, `eslint.config.mjs`
- **내용**: consumer용 React/Next flat config 프리셋을 서브패스 export(`eslint-plugin-fsd/react`, `/next`)로 추가. 브레인스토밍 → 설계 → 계획 → Subagent-Driven 실행(6개 태스크, 태스크별 리뷰) → 최종 전체 브랜치 리뷰 순서로 진행.
  - **핵심 설계 3건**: (1) 루트 진입점은 React 의존 0을 유지한다 — optional peer만 선언하고 static import하면 선언과 실제가 어긋나므로 모듈 경계로 보증한다. (2) 프리셋은 config **배열**이다 — `ignores`를 FSD config에만 둬야 `@next/next` 규칙이 `app/`·`pages/`에서 꺼지지 않는다. (3) `eslint-plugin-react` 제외.
  - **실런타임 결함 발견**: 구조 단언 테스트 9개가 전부 통과한 상태에서, ESLint를 실제 실행해보니 `eslint-plugin-react@7.37.5`가 ESLint 10에서 크래시했다. `settings.react.version:'detect'` → `util/version.js:31`이 제거된 `context.getFilename()`을 호출. `version` 명시로 그 크래시는 피할 수 있으나 미가드 호출이 3곳 더 남아 사용자 결정에 따라 **프리셋에서 제외**. `jsx-a11y`는 제거된 API를 호출하지 않아 유지. peer 범위가 `^9.7`까지인 것을 "표기 지연"으로 본 초기 판단이 틀렸음을 스펙 2.1절에 기록하고, 설계에 **런타임 스모크 검증**(6.1절)을 절차로 추가.
  - **프리셋 구성**: `/react` = `[FSD, react-hooks]`(2개), `/next` = `[FSD, react-hooks, jsx-a11y, @next/next]`(4개). `ignores`는 FSD config에만, `@next/next`는 무스코프(라우팅 폴더에서 돌아야 함), `react-hooks`는 `.ts`/`.js`까지, `jsx-a11y`는 `.jsx`/`.tsx`만.
  - **최종 리뷰(opus)에서 Important 5건 발견·수정**: (I1) 문서가 "프리셋은 JSX 파싱을 설정하지 않는다"고 했으나 `jsx-a11y`의 상류 config가 `ecmaFeatures.jsx`를 품고 있어 `/next`는 실제로 파싱을 켠다 — 컨트롤러의 런타임 스모크가 `/next`만 대상으로 해 부분적으로 우연히 통과했고, `/react`가 `.jsx` 파싱에 실패하는 사실을 끝까지 놓쳤다. (I2) `react-hooks` peer 하한 `^7.0.0`이 ESLint 10을 선언하지 않는 7.0.x를 허용해 2.1절의 교훈을 재도입 → `^7.1.0`으로 상향. (I3) `react-hooks` recommended가 16개 규칙(error 13/warn 3, React Compiler 규칙군 포함)을 켠다는 사실이 미문서화, 스펙 8절의 `recommended-latest` 비교도 부정확(차이는 `void-use-memo` 1건). (I4) 격리 가드가 denylist라 서브패스 스펙시파이어·목록 밖 패키지를 놓침 → allowlist(`['eslint']`)로 전환. (I5) work-log가 완료 작업을 미완으로 기록.
- **검증**: `pnpm test` 42 → **67개** 통과, `pnpm lint`(oxlint+eslint) exit 0, 양쪽 `tsc` exit 0, `pnpm build` 성공. 산출물 격리 확인: `dist/index.js`의 실제 모듈 그래프를 재귀 추적해 React 패키지 참조 0건. 런타임 스모크: `/next`를 ESLint에 실어 `.jsx` 린트 → fatal 0건, 세 플러그인 규칙 모두 발화.
- **커밋**: `69b87f6`(설계) → `1936172`(Task 6) + 최종 리뷰 수정. 이번 세션 커밋 20건 이상.
- **follow-up**: CI 매트릭스(`eslint: [9, 10]`)로 v9 지원 주장 실체화, 배포 메타데이터(`license`/`description`/`repository`+LICENSE), `/react`에도 JSX `languageOptions`를 줄지 결정, `tsup` `splitting: false` 검토.

## 2026-07-31

### React/Next 프리셋 main 머지
- **내용**: `feature/eslint-plugin-fsd`를 `main`에 **fast-forward** 머지(merge commit 없음, CLAUDE.md 규칙 준수). 머지된 결과에서 테스트 67/67·lint·build·양쪽 tsc 재검증 후 feature 브랜치 삭제. `origin/main`이 존재하지 않아 통합은 전부 로컬이며 푸시하지 않았다.
- **커밋**: `main` HEAD = `ef06507` (총 40커밋)

### eslint-config-nest 설계·계획 (구현 대기)
- **변경 파일**: `docs/superpowers/specs/2026-07-31-eslint-config-nest-design.md`, `docs/superpowers/plans/2026-07-31-eslint-config-nest.md`
- **내용**: NestJS 백엔드용 ESLint 공유 설정을 **별도 패키지** `packages/eslint-config-nest`로 만드는 설계와 4개 태스크 구현 계획. 브랜치 `feature/eslint-config-nest`.
  - **별도 패키지인 이유(실측)**: `eslint-plugin-fsd`에 `/nestjs` 서브패스를 만들 수 없다. FSD 규칙이 NestJS 전형 구조에서 오탐한다 — `entities`와 `shared`가 FSD 레이어명이면서 동시에 NestJS에서 가장 흔한 폴더명이라, TypeORM 엔티티 상호 참조(관계 매핑에 필수) 같은 정상 코드에 `no-cross-imports`가 발화한다. `src/modules/`·`src/common/`·`src/app.module.ts`는 무반응.
  - **zod 전용**: 사용자 스택이 zod이므로 `@darraghor/eslint-plugin-nestjs-typed`를 제외했다(가치의 대부분이 class-validator 데코레이터 규칙이고 `class-validator`를 필수 peer로 요구하며 peer 상한도 무제한). 대신 `eslint-plugin-zod`(peer 전부 optional, `^10` 명시, 규칙 40개 중 recommended 30개)를 쓴다.
  - **ESLint 10 전용**: `peerDependencies`에 `^9`를 넣지 않는다. 검증하지 않은 범위를 지원한다고 주장하지 않기 위해서이며, `eslint-plugin-fsd`가 최종 리뷰에서 받은 지적을 반영한 것이다.
  - **핵심 설계**: 켜는 것만큼 끄는 것이 값어치다. 어떤 규칙이 Nest 관용구(생성자 파라미터 프로퍼티, 데코레이터만 있는 빈 `@Module` 클래스, 메서드 참조 전달)와 충돌하는지 추측하지 않고 디스크 픽스처에 실제 ESLint를 돌려 정한다. 결정 절차 5단계를 스펙·계획에 못박았고, 발화가 오탐인지 픽스처가 나쁜지 구분하는 판단을 포함한다.
  - 픽스처는 `@nestjs/*`를 설치하지 않고 데코레이터를 로컬 스텁으로 재현한다(출처는 규칙 판정에 무관). 반면 `zod`는 실제 설치 — 미해결 모듈은 `any`가 되어 `no-unsafe-*`가 무더기로 발화해 오탐 가드를 무력화한다.
- **커밋**: `e11ec1a`(설계 문서), `b4dd59b`(구현 계획)

### eslint-config-nest 구현 완료
- **변경 파일**: `packages/eslint-config-nest/**`(신규 패키지: `src/index.ts`, `tests/config.test.ts`, `tests/fixtures/nest-app/**`, `package.json`, `tsconfig.json`, `tests/tsconfig.json`, `tsup.config.ts`, `README.md`), `eslint.config.mjs`, `.oxlintrc.json`, `pnpm-lock.yaml`
- **내용**: Subagent-Driven으로 4개 태스크를 실행하고 최종 전체 브랜치 리뷰까지 완료. 테스트 67 → **77개**.
  - **config 구성**: `typescript-eslint` `recommendedTypeChecked` + `eslint-plugin-zod` `recommended`(30개) + Nest 치명 규칙 3종(`no-floating-promises`·`no-misused-promises`·`require-await`) 명시 고정. 자체적으로 끈 규칙은 **단 하나** — `@typescript-eslint/unbound-method`, `*.spec.ts`/`*.e2e-spec.ts` 스코프.
  - **"측정한 것만 끈다" 방법론**: 디스크 픽스처에 실제 ESLint를 돌려 발화한 것만 조정. 발화가 (a) Nest 관용구 오탐인지 (b) 픽스처가 나쁜지 구분하고 (b)면 픽스처를 고쳤다. 실제로 Task 2에서 데코레이터 스텁의 미사용 파라미터가 `no-unused-vars`를 발화시켰는데, 실제 Nest 코드는 데코레이터를 소비할 뿐 정의하지 않으므로 (b)로 판정해 픽스처를 분리했다 — 규칙을 껐다면 모든 consumer가 값어치 있는 규칙을 잃었을 것이다.
  - **최종 리뷰가 Critical 1건 발견**: `recommended-type-checked`에 `files` 제한이 없어 타입 인식 규칙이 `.js`/`.mjs`/`.cjs`에도 걸리는데 `projectService`는 `.ts`에만 켜져 있었다. 타입 정보 없는 타입 인식 규칙은 경고가 아니라 **예외를 던지므로**, consumer가 `eslint .`를 돌리면 자기 `eslint.config.mjs`에서 종료 코드 2로 크래시했다. 74개 테스트가 전부 초록인 상태에서 살아 있었고, 하네스가 손으로 고른 `.ts` 경로만 린트해 이 부류를 구조적으로 못 잡았기 때문이다. `disableTypeChecked`를 `.js/.mjs/.cjs`에 적용하고, `lintFiles(['.'])`로 프로젝트 전체를 린트하는 회귀 테스트를 함께 넣었다.
  - **npm 이름 선점 발견**: `eslint-config-nest`(v0.0.8, 2022)와 `eslint-plugin-fsd`(v1.0.1)가 이미 존재한다. 사고 방지로 `private: true`만 넣고 이름 결정은 보류.
- **검증**: `pnpm test` 77/77, `pnpm lint`(oxlint+eslint) exit 0, `pnpm build` 성공, 양쪽 `tsc --noEmit` exit 0.
- **커밋**: `6271c46`(스캐폴딩) → `0fb79df`(최종 리뷰 수정). 브랜치 `feature/eslint-config-nest`, 총 13커밋.
- **follow-up**: 픽스처 보강(느슨한 `@Body()` DTO 경로로 `no-unsafe-*` 시험, `@UseGuards` + `canActivate(): Promise<boolean>`로 `no-misused-promises` 시험, TypeORM 엔티티), 배포 메타데이터(LICENSE 파일).

### 두 패키지를 @devbak 스코프로 전환
- **변경 파일**: `packages/eslint-plugin-fsd/{package.json,src/index.ts,README.md}`, `packages/eslint-config-nest/{package.json,README.md,tests/config.test.ts}`
- **내용**: 무스코프 이름 `eslint-plugin-fsd`(v1.0.1)와 `eslint-config-nest`(v0.0.8, 2022)가 **둘 다 npm에 타인 선점**돼 그대로는 배포 불가였다. `@devbak/eslint-plugin-fsd`·`@devbak/eslint-config-nest`로 전환(두 스코프 이름 모두 미등록 확인).
  - `eslint-config-nest`의 `private: true` 제거 — 이름 충돌 방지용이었고 스코프 전환으로 이유가 사라짐.
  - 두 패키지에 `publishConfig.access: "public"` 추가. 스코프 패키지는 기본이 restricted라 없으면 공개 배포 안 됨.
  - 두 패키지에 `prepublishOnly: "pnpm build"` 추가. `files: ["dist"]`인데 `dist`가 gitignore 대상이라 빌드 없이 publish하면 **빈 패키지**가 나감(최종 리뷰 I3 지적).
  - 플러그인 `meta.name`을 패키지명과 일치.
  - **규칙 접두어 `fsd/`는 불변** — flat config에서 규칙명은 `plugins` 키로 정해지므로 패키지명 변경의 영향을 받지 않는다. 기존 consumer 설정 그대로 동작.
  - `docs/superpowers/` 설계·계획 문서와 이 work-log의 과거 항목은 당시 결정을 담은 이력이라 수정하지 않음.
- **검증**: `pnpm test` 77/77, `pnpm lint`·`pnpm build` 통과, `tsc` 4개 프로젝트 통과, `npm pack --dry-run`으로 tarball 정상 생성 확인(10파일/4파일).
- **커밋**: `d8952a9` — `main`에 fast-forward 머지 완료
- **남은 것**: 배포하려면 `npm login`으로 `@devbak` 스코프 소유 계정 로그인 필요(현재 미로그인).

### devkit 로드맵 및 Phase 1·2 설계 확정
- **변경 파일**: `docs/superpowers/specs/2026-07-31-devkit-roadmap-design.md`(신규), `work-log.md`
- **내용**: 이 저장소를 ESLint 패키지 모음에서 Next.js/NestJS 공용 개발 표준 툴킷(`@devbak/*`)으로 확장하는 4단계 로드맵과, Phase 1·2의 상세 설계를 확정.
  - **실측 선행**: `~/Documents/develop`의 28개 프로젝트 의존성을 스캔해 근거를 세웠다. `prettier@3`이 16개 프로젝트에 각자 존재(공통분모 1위), ESLint가 8(6개)/9(9개)/10(2개)로 3중 파편화, NestJS 3개(`account-api`/`devlog-api`/`eungam-api`)는 **전부 eslint@8 + legacy `.eslintrc.js`**, 테스트 러너는 프론트=vitest·백엔드=jest로 깔끔히 갈림.
  - **NestJS 3개 계측이 규칙 후보를 걸러냈다**: (1) 배럴 `index.ts`가 **통틀어 0개** → FSD의 `no-public-api-sidestep`에 대응하는 "모듈 Public API 강제" 규칙 기각. (2) **`class-validator`를 아예 안 쓰고** `@Body(new ZodValidationPipe(schema))` 패턴이 지배적 → "DTO에 class-validator 데코레이터 요구" 규칙을 만들었다면 소비자 전체가 위반이 될 뻔했다. `eslint-config-nest` 설계 3절이 zod를 전제한 것과 독립적으로 같은 결론에 도달. (3) `devlog-api`의 `AppController`가 `PrismaService`를 직접 주입 → R1의 실제 검출 사례.
  - **로드맵 순서를 작성 도중 뒤집었다**: 초판은 `eslint-plugin-nest-arch`를 Phase 1로 놓았으나, `git rebase origin/main`으로 `eslint-config-nest`가 들어오면서 **완성됐지만 소비자가 0인 패키지**가 이미 있다는 사실이 드러났다. 소비자를 만들기 전에 새 패키지를 더 만들면 미사용 패키지가 둘이 된다. 게다가 `eslint-config-nest`는 peer가 `eslint: ^10` 전용인데 소비자 후보 3개가 전부 eslint@8이라 **구조적으로 쓸 수 없는 상태**였다. → Phase 1을 "소비자 활성화"(ESLint 8→10 마이그레이션 + 설정 패키지 추출), Phase 2를 `nest-arch`로 재배치. 마이그레이션이 `nest-arch`의 오탐 기준선도 만들어주므로 정보 흐름도 맞다.
  - **Phase 2 규칙 4개 확정**: `no-persistence-in-controller`(error), `no-untyped-payload`(error), `no-cross-module-controller-import`(error), `no-direct-env-access`(warn). 핵심 결정은 **"클래스 역할은 오직 데코레이터로 판정한다"** — Nest는 경로가 아니라 `@Controller()`/`@Injectable()`이 역할을 선언하며, 이 덕분에 규칙이 단일 파일만 보면 되고 타입 정보가 불필요해진다(이미 타입 인식이라 느린 `eslint-config-nest`와 함께 켜도 추가 부담 없음).
  - **기각한 규칙을 스펙에 명시**: `thin-controller`는 "얼마나 thin해야 thin인가"가 주관적이라 오탐 후 규칙이 꺼지는 결말이 예상되어 기각하고, 의도 중 객관적으로 판정 가능한 부분만 R1이 대신한다. `no-http-artifacts-in-service`는 타입 정보가 필요해 follow-up으로 미룸.
  - **셀프 리뷰에서 내부 모순 1건 수정**: 4.1절이 "파일명과 경로는 판정에 쓰지 않는다"고 선언했는데 R3·R4는 실제로 경로를 쓴다. 원칙을 "클래스 역할 판정"으로 한정하고, R3가 파일명 관습에 의존하는 것이 안전한 이유(오차가 false negative 방향으로만 난다)를 명시.
  - **추측성 서술 2건을 실측으로 대체**: `**/tests/fixtures/**`가 `eslint.config.mjs`·`.oxlintrc.json` 양쪽에 이미 있고 패키지 경로를 앵커하지 않아 새 패키지도 자동 커버됨을 확인. `eslint-plugin-fsd`의 `license`/`description`/`repository`/`keywords`/`engines`가 **전부 비어 있음**을 확인(`eslint-config-nest`는 5개 모두 보유) → Phase 1에서 정렬.
- **커밋**: `ec4665a` (브랜치 `feature/devkit-roadmap`, main 미머지)
- **블로커**: 두 패키지 모두 미배포 상태라, Phase 1에서 소비자 프로젝트가 설치하려면 npm 배포 또는 `pnpm link`/`file:` 로컬 검증 경로를 먼저 정해야 한다.

## 2026-08-01

### 프로젝트 템플릿(`devkit create`) 설계 확정
- **변경 파일**: `docs/superpowers/specs/2026-08-01-devkit-template-design.md`(신규), `work-log.md`
- **내용**: 새 프로젝트를 한 명령으로 생성하는 CLI 설계를 확정. 산출물은 새 패키지 4개(`devkit-cli`, `tsconfig`, `jest-config`, `vitest-config`)이며 지원 유형은 NestJS · Next.js · Turborepo 모노레포.
  - **로드맵 순서를 다시 앞당겼다**: 로드맵 3.3절은 스캐폴딩을 Phase 4로 미루며 "Phase 1 없이 하면 설정을 하드코딩하게 된다"고 했다. 그 논증은 설정 패키지가 없을 때만 성립하므로, 패키지를 **먼저 뽑고** 템플릿으로 가는 순서로 무력화했다. 또 배포하지 않기로 한 이상 `create-` 접두어(= `npm create` 레지스트리 규약)가 무의미해져 **Phase 3·4를 한 패키지로 통합**했다.
  - **`eslint-plugin-fsd`도 소비자가 0이라는 사실이 드러났다**: 로드맵이 백엔드 마이그레이션만 다뤄 가려져 있었고, 어느 Phase도 이를 해소하지 않았다. Next.js 템플릿이 그 첫 소비자가 된다.
  - **공식 CLI를 실제로 돌려 후처리를 확정했다** — 추측했다면 세 군데를 틀렸다. (1) `@nestjs/cli` 11은 `.eslintrc.js`가 아니라 **`eslint.config.mjs`(flat config)를 생성**한다(`devlog-api`의 legacy 설정은 CLI 10 유물). 후처리는 삭제가 아니라 덮어쓰기다. (2) `nest new`가 **`eslint-plugin-prettier`+`eslint-config-prettier`를 기본 포함**하고 **`eslint: ^9.18.0`**을 박는다 — 로드맵 4.5절이 제거하기로 한 조합이자 `eslint-config-nest`의 `^10` 전용 peer와 충돌. (3) `nest new`는 **`.gitignore`를 만들지 않는다**.
  - **문서에 없고 실행해야만 나오는 함정 1건**: `create-next-app` 16은 `pnpm-workspace.yaml`(`ignoredBuiltDependencies`)을 생성한다. 모노레포의 `apps/web/` 안에 남으면 **중첩 워크스페이스**가 된다. 단일 앱에서는 `sharp` 빌드 승인에 필요하므로 남기고, 모노레포에서만 제거해 루트로 이관한다.
  - **`pnpm catalog:`가 `link:`를 지원하지 않음을 실측으로 확인**(`ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC`). 모노레포의 각 `package.json`이 `link:`를 직접 선언하고, 루트와 `apps/web`은 깊이가 다르므로 `linkDeps` 연산이 상대경로를 **계산**한다. `catalog:`는 `next`·`react` 등 일반 패키지에만 쓴다.
  - **설정 패키지 3개는 전부 빌드가 없다**(JSON · CJS 객체 · ESM 함수). 편의가 아니라 위험 제거다 — 로드맵 4.2절이 경고한 "`dist`가 낡으면 조용히 옛 규칙으로 린트한다"가 **구조적으로 불가능**해진다. 빌드가 필요한 건 `devkit-cli` 하나뿐이고, 그것은 시작 시 `src`/`dist` mtime 비교로 자체 방어한다.
  - **핵심 설계 — 연산이 기대를 선언한다**: 가장 위험한 실패는 크래시가 아니라 조용한 성공이다. `create-next-app`이 언젠가 `pnpm-workspace.yaml` 생성을 멈추면 제거 연산이 말없이 통과하고 방어가 죽은 줄 모르게 된다. `required: true`가 붙은 연산은 대상이 없으면 **실패**시켜 공식 CLI의 변화를 침묵 대신 에러로 드러낸다.
  - **셀프 리뷰에서 내부 모순 1건 수정**: `nest` 레시피만 8단계에 `verify`를 뒀는데 이는 원자 연산 6종에 없는 이름이었고 `next`에는 아예 없었다. 세 레시피 공통 `delegate` 단계로 통일하고 5.4절을 신설. 그 과정에서 **`pnpm test`를 자가검증에서 빼야 함**이 드러났다 — `create-next-app`은 테스트를 하나도 만들지 않아 갓 생성된 Next 앱에서 vitest가 "테스트 0개"로 실패한다. 생성물에 `--passWithNoTests`를 넣어 실패를 감추는 대신 자가검증 범위를 `lint`+`build`로 좁혔다.
- **커밋**: `feature/devkit-roadmap` 브랜치 (main 미머지)
- **다음**: 구현 계획 작성 → 설정 패키지 3개 → CLI 원자 연산 → 레시피 3종 순서
- **미결**: `eslint-config-nest`가 Nest 런타임 전역(`sourceType: 'commonjs'`, `globals.node`+`globals.jest`)을 담는지 구현 첫 단계에서 확인 필요. 로드맵 Phase 1 Task 2~10(기존 3개 프로젝트 마이그레이션)은 취소가 아니라 이 작업 뒤로 미뤄졌다.

### @devbak/tsconfig 패키지 추가 (Task 1)
- **변경 파일**: `packages/tsconfig/{package.json,base.json,nest.json,next.json,lib.json,README.md,tests/config.test.ts,tests/tsconfig.json}`(신규), `.gitignore`, `eslint.config.mjs`, `.oxlintrc.json`, `docs/superpowers/plans/2026-08-01-devkit-template.md`
- **내용**: `nest`·`next`·`lib` 3개 프리셋 + 공통 기반 `base`로 구성된, 빌드 없는 순수 JSON tsconfig 프리셋 패키지. `nest`는 `base`를 extends하지 않는다(`module: nodenext` 등 서로 다른 축이 많아 상속이 오히려 복잡해서). `next`·`lib`은 `base`를 extends한다.
  - **경로 옵션의 위험한 기준선을 여기서 처음 확정**: `extends`로 참조되는 tsconfig의 상대 경로(`include`/`exclude` 등)는 **그 파일 자신의 위치**를 기준으로 해석된다 — 소비자 프로젝트 위치가 아니다. `base.json`에 있던 `exclude: ["node_modules", "dist"]`가 실제로는 `packages/tsconfig/node_modules`·`packages/tsconfig/dist`를 가리켜 소비자 프로젝트에서는 **완전히 무의미**했다. 이 결함을 계획 자체에서 먼저 잡아 `exclude`를 프리셋에서 빼기로 계획 텍스트를 갱신한 뒤(커밋 `95a3634`) 구현에 반영했다(`ae2c711`). 이후 Task 2(jest `rootDir`)·Task 3(vitest `include`)가 반대 방향(소비자 기준)임을 실측으로 확인해 "도구마다 다르므로 일반화 금지"라는 원칙이 여기서 나왔다.
  - `.claude/worktrees/`(다른 세션이 만든 워크트리, `node_modules` 없음)가 루트 `pnpm lint`의 `projectService`를 깨뜨려 저장소 전체 린트가 막힌 인프라 문제를 별도로 처리(`68add0b`) — `.superpowers/`와 같은 부류로 `.gitignore`·`eslint.config.mjs`·`.oxlintrc.json` 3곳에서 제외.
- **검증**: `pnpm vitest run packages/tsconfig` 4/4(실제 `tsc` 실행 — 데코레이터 통과·strict 위반 검출·JSX 통과·`noUncheckedIndexedAccess` 검출), `pnpm lint`·`pnpm build` 통과.
- **커밋**: `535c84d..ae2c711`(사전 계획 결함 수정 포함) — 브랜치 `feature/devkit-roadmap`, main 미머지
- **후속 판단(Task 13)**: `/lib` 서브패스는 이 계획의 3개 레시피(nest·next·monorepo) 중 어디에서도 소비되지 않는다. 완료 기준 6번은 패키지 단위 기준이라 위반은 아니며(`@devbak/tsconfig` 자체는 nest·next가 쓴다), 로드맵이 예정한 "순수 라이브러리" 프로젝트 유형(미구현)을 위해 남겨둔다. 설계 문서 9절에 기록.

### @devbak/jest-config 패키지 추가 (Task 2)
- **변경 파일**: `packages/jest-config/{package.json,nest.js,nest-e2e.js,README.md,tsconfig.json,tests/config.test.ts,tests/tsconfig.json}`(신규), `eslint.config.mjs`, `.gitignore`, `package.json`, `pnpm-lock.yaml`
- **내용**: `nest new`의 인라인 `jest` 블록·`test/jest-e2e.json`을 CJS `module.exports`로 재노출하는 빌드 없는 패키지. `devkit-cli`가 생성할 NestJS 프로젝트가 `jest.config.js`에서 `require('@devbak/jest-config/nest')`로 소비한다.
  - **이 패키지가 저장소 최초의 "빌드 없는 순수 CJS `.js` 소스"였다**: `prettier-config`/`tsconfig`는 JSON만 배포해 겪지 않던 문제. 루트 `eslint.config.mjs`의 `projectService`가 이 `.js` 파일들을 못 찾아 `pnpm lint`가 전체 실패했고(파싱 에러), 찾은 뒤에도 `module`이 `no-undef`로 잡혔다. `eslint-config-nest`/`eslint-plugin-fsd`가 쓰는 패턴(패키지 루트 dev 전용 `tsconfig.json`, `allowJs`)으로 첫 문제를, `eslint.config.mjs`에 `packages/jest-config/*.js` 전용 `sourceType: 'commonjs'` 블록(글롭 확장이 아니라 새 블록 추가)으로 두 번째 문제를 해결.
  - **브리프가 예상한 실패와 실제 실패가 달랐다**: "ts-jest의 tsconfig 부재"를 예상했으나 실제로는 `Module ts-jest ... was not found`였다. 원인은 브리프가 준 테스트 코드가 픽스처를 `os.tmpdir()`에 만들어서였다 — 이 경로는 워크스페이스 트리 밖이라 Jest의 Node 모듈 해석이 `node_modules/ts-jest`를 못 찾는다. 실제 소비자는 자기 프로젝트 안에 `ts-jest`를 설치하므로 겪지 않는 문제(패키지 결함 아님). 테스트를 지우지 않고 픽스처 위치만 워크스페이스 트리 안(`packages/jest-config/tests/.fixtures/`)으로 옮겨 해결.
  - **경로 옵션 기준 실측**: `rootDir`/`coverageDirectory` 같은 상대 경로가 `@devbak/tsconfig`의 `extends`(프리셋 파일 위치 기준 — Task 1 결함)와 달리, **소비자의 `jest.config.js` 위치**를 기준으로 안전하게 해석됨을 실제 jest 실행(CLI 오버라이드 없이, `--coverage` 포함)으로 확인. README에 이 차이를 문서화.
- **커밋**: `7944b55` (브랜치 `feature/devkit-roadmap`, main 미머지)

### @devbak/vitest-config 패키지 추가 (Task 3)
- **변경 파일**: `packages/vitest-config/{package.json,next.js,node.js,README.md,tsconfig.json,tests/config.test.ts,tests/tsconfig.json}`(신규), `package.json`, `pnpm-lock.yaml`
- **내용**: 프론트엔드/Node 프로젝트 공용 Vitest 설정을 ESM 순객체 2종(`next`=jsdom, `node`=node)으로 재노출하는 빌드 없는 패키지. `devkit-cli`가 생성할 Next.js 프로젝트가 `vitest.config.ts`에서 `import config from '@devbak/vitest-config/next'`로 소비한다.
  - **`include` 상대 경로 기준을 실측으로 확인**: `@devbak/jest-config`의 `rootDir`과 같은 방향 — 프리셋 파일 자신의 위치가 아니라 **소비자의 vitest root(설정 파일 위치/`--root`)** 기준으로 해석된다. `packages/vitest-config`에는 `src/` 디렉터리가 없는데도, 워크스페이스 트리 안 픽스처(`tests/.fixtures/`, Task 2에서 배운 대로 `os.tmpdir()` 회피)에 `--root`로 넘긴 디렉터리의 `src/sample.test.ts`를 실제로 찾아 통과시킴을 확인. `@devbak/tsconfig`의 `extends`(프리셋 위치 기준 — Task 1 결함)와는 반대다.
  - **CJS `.js` 파일 lint 파싱 함정이 반복됨**: `@devbak/jest-config`와 동일하게 루트 `eslint.config.mjs`의 `projectService`가 `next.js`/`node.js`를 못 찾아 파싱 에러 → 패키지 루트에 dev 전용 `tsconfig.json`(`allowJs: true, checkJs: false, include: ["*.js"]`) 추가로 해결. 단 이번엔 ESM이라 `sourceType: 'commonjs'` 블록은 불필요.
  - **테스트에서 import한 설정 객체의 `no-unsafe-member-access`**: `checkJs: false`로 타입 검사 대상에서 빠져 `any`로 좁혀지는 것을, `@devbak/jest-config`가 require 결과를 캐스팅한 것과 같은 방식으로 필요한 필드만 명시한 타입으로 캐스팅해 해결.
  - **회귀 테스트 3개 전부 RED→GREEN 실측**: (1) next 프리셋 `environment: 'jsdom'`을 `'node'`로 바꿔 실패 확인 후 복원, (2) node 프리셋을 `'jsdom'`으로 바꿔 실패 확인 후 복원, (3) node.js의 `include`를 매칭되지 않는 패턴(`nomatch/**/*.test.ts`)으로 바꿔 "1 passed"가 사라짐(대신 "No test files found, exiting with code 0")을 확인 후 복원. 세 테스트 모두 실제 회귀를 잡는다.
  - `jsdom`은 `next` 프리셋만 요구하므로 `peerDependenciesMeta`로 optional 처리하고 워크스페이스 루트에 `pnpm add -D -w jsdom@^25` 추가.
- **검증**: `pnpm vitest run packages/vitest-config` 3/3, `pnpm lint`(oxlint+eslint) exit 0, `pnpm test`(루트, `--passWithNoTests`) 92/92 통과.
- **커밋**: `06367cc` (브랜치 `feature/devkit-roadmap`, main 미머지)

### devkit-cli 패키지 뼈대 + 타입 + 진입점 (Task 4)
- **변경 파일**: `packages/devkit-cli/{package.json,tsup.config.ts,tsconfig.json,src/{bin.ts,index.ts,types.ts},tests/{bin.test.ts,tsconfig.json},templates/}`(신규), 루트 `package.json`(`devbak` 스크립트)
- **내용**: `Ctx`·`Step`·`Recipe`·`RecipeOptions`·`ProjectType` 타입 정의, `findToolkitRoot()`(툴킷 루트 탐색), `assertDistFresh()`(`src`/`dist` mtime 비교로 시작 시 거부). `main()`은 `RECIPES`를 빈 객체로 남겨 Task 8이 배선하도록 브리프가 지시한 대로 비워둠.
- **핵심 실측**: `pnpm lint`는 `oxlint && eslint .`라서 **oxlint가 실패하면 ESLint가 아예 돌지 않는다.** oxlint는 포팅한 core 규칙을 `eslint(rule-name)` 형식으로 출력해 언뜻 ESLint가 돈 것처럼 보이므로, ESLint 단독 검증은 반드시 `pnpm lint:es`로 해야 한다는 함정을 여기서 처음 확인했다(이후 모든 태스크가 이 구분을 지킴). 대조 실험(`.oxlintrc.json`·`eslint.config.mjs` 양쪽의 `templates` glob을 제거)으로 `lint:es`가 픽스처 경로를 지목하며 exit 1이 됨을 확인해 인과를 확정 — oxlint는 자기 설정 파일만 읽으므로(`eslint.config.mjs`를 안 읽음) 양쪽에 같은 패턴이 필요하다.
- **디스패치 오류를 브리프가 막음**: 컨트롤러가 "브리프 Step 7이 RECIPES를 빈 객체로 두라 한다"고 착각(실제로는 Task 8 내용)했으나, 구현자가 브리프 원문을 최종 근거로 삼아 정확히 판단 — 브리프-우선 원칙이 컨트롤러 기억 오류의 전파를 막은 사례.
- **fix round**: templates glob 필요성을 5조건 대조 실험으로 검증(커밋 `6a573c5`).
- **deferred**: `assertDistFresh`가 `dist/bin.js`는 있고 `src/`가 없을 때 가공 없는 `ENOENT`를 던짐; `assertDistFresh` 자체에는 테스트가 없음(`findToolkitRoot`만 있음); `findToolkitRoot`의 에러 문구가 "찾지 못했습니다...찾았습니다"로 한국어 자기모순(브리프 원문 유래, 계획 결함).
- **커밋**: `e199343..6a573c5` (브랜치 `feature/devkit-roadmap`, main 미머지)

### mergeJson 연산 추가 (Task 5)
- **변경 파일**: `packages/devkit-cli/src/ops/merge-json.ts`(신규), `tests/merge-json.test.ts`(신규)
- **내용**: JSON 파일에 패치를 재귀 병합하는 원자 연산. `null` 값은 키 삭제, `required`는 병합 후 존재해야 할 경로를 선언해 위반 시 실패시킨다(6.2절 규약의 시작점).
- **계획 자체에서 발견한 버그**: `applyPatch({}, {a:{b:null}})`가 `{"a":{"b":null}}`을 반환 — 부모 경로(`a`)가 대상에 없으면 패치 서브트리를 통째로 대입해 중첩 `null`이 삭제 대신 **값으로 기록**됐다. 현재 3개 레시피는 부모 경로가 전부 이미 존재해 실피해가 0이었지만, 이후 레시피 작성자가 "null은 어디서나 삭제된다"고 가정했다면 조용히 깨진 JSON을 만들 뻔했다. 사용자 승인을 받아 계획 텍스트를 먼저 고치고(`8c1b977`) 재귀 삭제로 수정(`d204ed0`).
- **재리뷰 판정**: 회귀 테스트 3개 중 2개는 수정 전 구현에서 실제로 실패하는 진짜 회귀 테스트, 3번째("기존 키의 중첩 null")는 수정 전에도 통과했을 비회귀 고정(non-regression pin) — 결함은 아니나 회귀 검출력은 2개뿐이라고 기록.
- **커밋**: `178dce0..d204ed0` (브랜치 `feature/devkit-roadmap`, main 미머지)

### removeFiles·copyOverlay·makeDirs 연산 추가 (Task 6)
- **변경 파일**: `packages/devkit-cli/src/ops/{remove-files.ts,copy-overlay.ts,make-dirs.ts}`(신규), `tests/fs-ops.test.ts`(신규), `templates/`(픽스처)
- **내용**: 3개 원자 fs 연산. `assertInside()`로 `targetDir` 밖 경로 탈출을 거부하고, `required` 규약을 `removeFiles`까지 확장.
- **리뷰어가 구현자의 "순차가 설계 의도" 주장을 반박**: 세 루프 항목 전부 서로 의존성이 없음(`rm`은 `force:true`, `mkdir`는 `recursive:true`로 멱등, `copyTree`는 형제 엔트리 독립)이 근거. `Promise.all`로 병렬화해 `no-await-in-loop` 경고를 제거했으나(`cc0ffee`), 이것이 **로그 순서 보장을 실제로 깨뜨렸다** — `removeFiles`·`makeDirs`가 async 콜백 안에서 `logs.push()`를 부작용으로 실행해, `Promise.all`이 배열 순서만 보장하고 콜백 내부 실행 시점(libuv 스레드풀)은 보장하지 않는다는 사실이 드러남. 반환값 배열 기반으로 순서를 재구성해 구조적으로 해결(`f243bd7`).
- **deferred**: `copyOverlay`의 `describe()`가 변수 값은 빼고 키만 노출; `required` 경로가 여럿 누락되면 어느 `stat`이 먼저 settle되느냐로 에러 메시지 경로가 결정(순차일 땐 결정적이었음); `Promise.all`은 throw 이후에도 형제 작업을 취소하지 않음; `copyTree`의 fan-out에 상한 없음(현재 템플릿 크기에서는 무해).
- **이월(Task 8로)**: `copyOverlay`의 `templatesRoot()`가 `import.meta.url` 기준 dist 상대경로를 쓰는데, 당시 `src/ops/*`가 어떤 tsup 엔트리에도 안 붙어 있어 번들 여부 미확인 — Task 8에서 엔트리 연결 후 실빌드로 재검증하도록 명시.
- **이월(Task 12로)**: `copyOverlay`의 `run()` 경로에 자동 테스트가 0개(그레이 확인) — `templatesRoot()`가 dist를 전제해 vitest에서는 ENOENT. 3개 레시피 전부 이 연산으로 템플릿을 배선하므로 e2e가 반드시 덮어야 함.
- **커밋**: `38d3467..f243bd7` (2 fix rounds, 브랜치 `feature/devkit-roadmap`, main 미머지)

### linkDeps 연산 추가 (Task 7)
- **변경 파일**: `packages/devkit-cli/src/ops/link-deps.ts`(신규), `tests/link-deps.test.ts`(신규)
- **내용**: 소비자 `package.json`과 툴킷 패키지 디렉터리 사이의 `link:` 상대경로를 계산하는 연산. 7절이 요구하는 깊이 2종(루트 직속·`apps/web` 같은 중첩)을 모두 계산할 수 있어야 한다.
- **재리뷰가 검출력을 보강**: `normalizeToPosix`를 `linkSpec`에서 추출해 별도로 테스트 — `win32.relative`는 호스트 플랫폼과 무관하게 백슬래시를 반환하므로, 이 테스트는 실제로 macOS에서 실행되면서도 Windows 경로 정규화를 플랫폼 독립적으로 검증한다. 공개 시그니처는 불변.
- **parked → Task 13이 확정**: Windows를 지원 대상으로 볼 것인가 — 로드맵 2.1절이 소비자를 전부 macOS 개인 프로젝트로 한정하므로 **미지원으로 확정**하되, 이미 정확하고 테스트도 있는 정규화 코드는 제거 실익이 없어 유지(설계 9절에 기록).
- **parked → Task 11로 이월, Task 13이 재확인**: `linkDeps.run`이 항상 `ctx.targetDir` 기준으로 `linkSpec`을 계산하는데 `file`이 중첩 경로(`apps/web/package.json`)면 pnpm은 그 파일 자신의 위치 기준으로 `link:`를 해석해 어긋난다. 현재 세 레시피는 `compose`로 자식 `ctx`를 만들어 기본 파일에만 쓰므로 이 조합을 타지 않는다 — 결함이 아니라 새 레시피 작성 시 주의할 함정으로 설계 9절에 남김.
- **커밋**: `e183b1c..a15c10d` (브랜치 `feature/devkit-roadmap`, main 미머지)

### delegate 연산 + run 실행기 + CLI 진입점 (Task 8)
- **변경 파일**: `packages/devkit-cli/src/{ops/delegate.ts,run.ts,bin.ts,ops/index.ts}`, `tests/{run.test.ts,bin.test.ts}`(신규)
- **내용**: `delegate()`(외부 명령 위임), `compose()`/`scaffold()`(레시피 단계 조합기), `main()`이 `RECIPES` 레지스트리와 CLI 인자 파싱을 배선.
- **Task 6 이월 항목 해소**: `templatesRoot()`의 dist 상대경로가 옳음을 실빌드로 확인 — `dist/`에 `bin.js`·`index.js`·`chunk-*.js`가 전부 평평하게 배치되므로 `../templates`가 정확히 `packages/devkit-cli/templates`를 가리킨다. 실빌드 산출물을 동적 import해 `copyOverlay`를 실제로 실행시키고 `ENOENT` 경로로 확인(경로를 읽기만 한 게 아니라 실행 검증).
- **리뷰어 실증**: `run.test.ts`의 목에서 `async`를 제거하자 `run`이 `Promise.all`로 병렬화되는 회귀에 대해 테스트가 **통과하게 됐다.** async 함수의 `throw`는 거부된 Promise로 변환돼 `.map()`을 멈추지 않지만, 동기 `throw`는 `.map()` 자체를 멈춰 later 스파이가 호출되지 않는다 — 린트(`require-await`)를 만족시키려는 수정이 테스트 검출력을 정확히 무력화한 사례. `async` 복원 + 순서 테스트 보강으로 해결.
- `ops/index.ts` 재export가 5개 op 파일의 실제 export와 전부 일치(드리프트 0)를 리뷰어가 대조 확인.
- **커밋**: `37658d1..3d8ea72` (브랜치 `feature/devkit-roadmap`, main 미머지)

### nest 레시피와 템플릿 추가 (Task 9)
- **변경 파일**: `packages/devkit-cli/src/recipes/nest.ts`(신규), `templates/nest/*`(신규), `tests/recipe-nest.test.ts`(신규)
- **내용**: `nest new --strict --skip-git --skip-install -p pnpm` → `.prettierrc` 제거(required) → `copyOverlay('nest')` → `mergeJson`(package.json) → `linkDeps`(4개) → `makeDirs`(src/modules, src/common) → install/lint/build.
- **실제 생성 2회가 계획 실측이 놓친 것 2건을 드러냄**: (1) jest 설정의 `require()`가 `no-require-imports`에 걸림 (2) `nest new`의 `main.ts`가 `bootstrap()`을 await 없이 호출해 `no-floating-promises`(우리는 error, NestJS 자신은 warn)에 걸림.
- **리뷰 Important 3건, 전부 즉시 반영**: (1) `zod`가 `devDependencies`에 있어 `pnpm install --prod`에서 런타임 크래시 → `dependencies`로 이동 (2) `test/jest-e2e.json` 잔여(오버레이가 `jest-e2e.config.js`로 대체하는데 구 파일이 안 지워짐) → 제거 추가 (3) `main.ts` 오버레이가 설계 3.2절("애플리케이션 코드는 건드리지 않는다")과 충돌 → **사용자 판정**: 오버레이 유지 + `copyOverlay`에 `expectUpstream`(sha256 고정 드리프트 감지) 추가. `nest new`의 `main.ts`가 바뀌면 조용히 덮어쓰지 않고 실패한다.
- **계획 결함 누적 6건째**: `s.label.includes('lint')`가 `'eslint-config-nest'`와, `includes('install')`이 `'--skip-install'`과 부분 일치해 테스트가 오탐 — 정확 일치로 수정.
- **deferred**: `assertNoDrift`·`removeFiles`가 `stat` 실패를 전부 "파일 부재"로 취급(`EACCES` 오인 가능, Task 6 선례와 동일 패턴이라 수용); `copy-overlay-drift.test.ts`가 `assertNoDrift`를 직접 호출해 `copyOverlay(...).run()`을 통한 실제 배선은 Task 12 e2e만 덮음.
- **커밋**: `ce8bb04..f901cfa` (브랜치 `feature/devkit-roadmap`, main 미머지)

### next 레시피와 템플릿 추가 (Task 10)
- **변경 파일**: `packages/devkit-cli/src/recipes/next.ts`(신규), `templates/next/*`(신규), `tests/recipe-next.test.ts`(신규)
- **내용**: `create-next-app@latest --ts --app --src-dir --tailwind --no-eslint ...` → AGENTS.md/CLAUDE.md 제거(required) → `copyOverlay('next')` → `mergeJson` → `linkDeps` → FSD 레이어(`pages` 대신 `views`) → install/lint/build.
- **브리프 결함 2건을 구현자가 실행 중 잡음**: (1) `@devbak/eslint-plugin-fsd/next`에 파서가 없어 브리프 템플릿 그대로면 `next.config.ts`·`layout.tsx`가 "Unexpected token {"로 파싱 실패 — `jsx-a11y`가 JSX는 되게 하지만 TS 타입 주석은 espree가 모른다. `typescript-eslint` recommended(비타입체크)를 템플릿에 추가해 해결. (2) 브리프의 skipInstall 테스트가 `label.includes('lint')`를 써서 `'@devbak/eslint-plugin-fsd'`와 부분 일치 — 계획 결함 6번의 재발, 디스패치 경고 덕에 즉시 발견.
- **FSD 양방향 검증**: 고의 위반(shared→features)에서 `fsd/no-higher-level-imports` 발화, 위반 제거 후 원 생성물(`src/app/` 라우팅 포함) exit 0 — 오탐 없음.
- **Task 13 이월 항목 해소 여기서 답이 정해짐**: "next | tsconfig | 확인 필요" → **뺀다**. `create-next-app`의 tsconfig를 덮어쓰지 않기로 했으므로(Next가 관리하는 `.next/types/**` 항목이 있어서) `@devbak/tsconfig`에 소비처가 없다.
- **follow-up(범위 밖)**: `@devbak/eslint-config-next` 패키지로 `eslint-config-nest`와 대칭을 맞출지 — 현재는 생성물 템플릿에 `typescript-eslint`를 인라인. 이 계획의 패키지 4개 범위 밖.
- **커밋**: `f901cfa..e43bcb7` (fix 라운드 없음, 브랜치 `feature/devkit-roadmap`, main 미머지)

### monorepo 레시피와 템플릿 추가 (Task 11)
- **변경 파일**: `packages/devkit-cli/src/recipes/monorepo.ts`(신규), `templates/monorepo/*`(신규), `tests/recipe-monorepo.test.ts`(신규)
- **내용**: 루트 `copyOverlay('monorepo')` → `makeDirs`(apps/packages) → `compose`로 next 레시피를 `apps/web`에 합성(ctx 리매핑) → `apps/web/pnpm-workspace.yaml`·`eslint.config.mjs` 제거(required) → `mergeJson`(apps/web을 catalog: 참조로) → `linkDeps`(루트) → install/lint/build.
- **설계 4.1절 가설이 실제로 검증됨**: `next.ts` 무수정(git log로 확인), `compose` + ctx 리매핑 한 줄로 로직 복제 0건.
- **Important**: `apps/web/package.json`에 `typescript-eslint`가 고아로 남음(eslint·prettier는 null로 뺐는데 이것만 빠뜨림, `eslint.config.mjs`를 지웠으므로 쓸 곳이 없음) → null로 수정.
- **컨트롤러가 직접 재현·확정한 결함**: 생성물에 `"type"` 필드가 없어 Vite의 config 로더가 `vitest.config.ts`를 CJS로 번들링하고, externalize-deps가 ESM 전용인 `@devbak/vitest-config`를 `require()`로 로드하려다 실패("resolved to an ESM file", 2026-08-01 실측). `next.ts`의 `mergeJson`에 `"type": "module"`을 추가해 해결 — next 레시피 자체가 고쳤으므로 monorepo가 합성할 때도 `applyPatch`의 spread 특성으로 자동 상속됨을 `merge-json.ts` 소스로 확인.
- **설계 5.4절의 근거가 틀렸음이 여기서 드러남**: "create-next-app이 테스트를 안 만들어 vitest가 실패한다"던 원문 근거가 부정확 — 실제로는 config 로딩 단계에서 죽었을 뿐 `passWithNoTests`와 무관했다. 결정(자가검증에서 `pnpm test` 제외)은 유지, 근거 서술은 Task 13이 정정.
- **확인된 사실**: `create-next-app` 산출물의 확장자 분포는 svg 5·md 3·tsx 2·ts 2·json 2·yaml 1·mjs 1·ico 1·gitignore 1·css 1 — `.js`/`.cjs` **0개**. `"type": "module"`이 안전한 근거.
- **의도된 비대칭**: 루트=CJS(`"type"` 없음)·`apps/web`=ESM(`"type": "module"`)이 패키지 경계별 해석이라 정상 — 나중에 "통일"하지 않도록 Task 13이 `templates/monorepo/CLAUDE.md`에 명시.
- **Task 13 이월 항목 해소**: 루트 `linkDeps`의 `'tsconfig'`도 소비처가 없음(루트에 tsconfig.json 자체가 없음) — 제거.
- **커밋**: `75466cb..aaf28d0` (브랜치 `feature/devkit-roadmap`, main 미머지)

### 실생성 통합 테스트 추가 — 3층 e2e (Task 12)
- **변경 파일**: `packages/devkit-cli/tests/e2e/create.e2e.test.ts`(신규), `vitest.e2e.config.ts`(신규), `package.json`(`test:e2e` 스크립트), `README.md`(디스크 제약 설명)
- **내용**: nest·next·monorepo 3개 유형 실제 생성 + 안전장치(기존 디렉토리 거부) 총 5개 테스트. 각 생성물에서 install→lint→build→(전부) test까지 실제 실행.
- **이월 6건 전부 이 층에서 덮음**: (1) 오버레이 배선을 내용 수준으로 단언(`_gitignore` 부재+`.gitignore` 존재, `CLAUDE.md`에 치환된 이름 존재+`__NAME__` 부재) (2) 생성물의 `pnpm test`가 "테스트 0개 exit 0"이지만 config 로드 **성공**을 증명 — 원 결함(Task 11)은 로드 단계에서 죽었으므로 두 상태를 구분해야 함 (3) 모노레포 FSD가 규칙명(`fsd/no-higher-level-imports`)을 문자열로 단언 (4) eslint config 잔여물·lint 스크립트 키 충돌 없음 (5) `.js` 검사가 `node_modules`·`.next`·`dist`·`.turbo`·`out`·`.git` 제외 (6) `copyOverlay`의 `run()` 경로가 여기서 처음 실행 검증됨(Task 6·9 이월 항목 해소).
- **Important**: e2e의 `afterEach`가 실패 시에도 생성물을 무조건 삭제해, 설계 6.3절("생성물은 지우지 않는다 — 지우면 디버깅이 불가능해진다")을 **하네스만** 어기고 있었다(CLI 런타임 자체는 지킴, `rmSync` 없음 확인). `RUN_ID` 접미사 + 조건부 정리로 수정.
- **실측**: 5/5 통과, 96.79초(warm pnpm store). 디스크 여유가 6.1GiB뿐이라 세 유형을 동시에 만들면 소진 위험 — README에 명시. 실측 수치 자체(6.1GiB)는 README에는 박지 않고 리포트에만 남김("이 정도면 충분"으로 오독될 수 있어서).
- **커밋**: `78d2953..10465e3` (2 fix rounds, 브랜치 `feature/devkit-roadmap`, main 미머지)

### 최종 검증 및 기록 (Task 13)
- **변경 파일**: `packages/devkit-cli/src/recipes/{next.ts,monorepo.ts}`, `packages/devkit-cli/tests/__snapshots__/{recipe-next.test.ts.snap,recipe-monorepo.test.ts.snap}`, `packages/devkit-cli/templates/monorepo/CLAUDE.md`, `docs/superpowers/specs/2026-08-01-devkit-template-design.md`, `work-log.md`
- **내용**: 새 기능 없이 12개 태스크의 이월 6건을 처리하고 완료 기준 7개를 전수 확인.
  - **(이월 1) 미사용 `tsconfig` linkDeps 제거**: `next.ts`와 `monorepo.ts`(루트) 양쪽에서 `@devbak/tsconfig`를 링크했지만 실제 소비처(`extends`)가 없음을 확인(Task 10·11이 이미 이유를 밝혀둔 것을 실행). 두 파일의 `linkDeps` 목록에서 `'tsconfig'`를 빼고 스냅샷 2개를 갱신 — diff는 정확히 그 한 줄뿐임을 확인.
  - **(이월 2) 설계 5.4절 서술 정정**: "create-next-app이 테스트를 안 만들어 vitest가 실패한다"는 원문을 "생성물에 `"type"`이 없어 config 로딩이 CJS/ESM 충돌로 죽었다(Task 11 실측), `passWithNoTests`와 무관했다"로 교체. 자가검증에서 `pnpm test`를 빼는 **결정은 유지**하고(3층 e2e가 이제 이 범위를 덮음), "배제가 실제 결함을 가렸다"는 교훈을 명시했다.
  - **(이월 3) work-log 중복 정리**: Task 2·3 구현자가 미리 커밋한 항목(`0d2ed2f`, `d41c269`)은 지우지 않고 그대로 두었다 — 실제로 중복이나 모순은 없었고(Task 1·4~13 항목이 아예 없었던 것뿐), 이번에 Task 1·4~13을 시간순으로 채워 넣어 전체 기록을 일관되게 완성했다.
  - **(이월 4) `dist` 삭제 후 재빌드 검증**: `packages/*/dist`를 전부 옮겨 지운 뒤(주의: `rm -rf`가 이 세션의 권한 정책에서 거부되어 `mv`로 대체) `pnpm build`로 처음부터 재생성, 그 산출물로 `pnpm devbak create devkit-final-check --type nest`를 실행 — install/lint/build 전부 exit 0. 캐시된 산출물에 우연히 기대던 배선이 아님을 확인.
  - **(이월 5) 모듈 타입 비대칭 문서화**: `templates/monorepo/CLAUDE.md`에 "루트=CJS/`apps/web`=ESM은 의도된 비대칭이며 통일하면 `pnpm test`가 다시 깨진다"는 절을 추가.
  - **(이월 6) 완료 기준 7개 전수 확인**: 아래 참조 — **7개 전부 통과.**
- **완료 기준 확인 결과**:
  1. 3개 유형 실생성 → `pnpm lint`·`pnpm build` exit 0, nest는 `pnpm test`까지 — `pnpm test:e2e` 5/5(113초)로 통과 확인
  2. 모노레포 `pnpm install`이 중첩 워크스페이스 경고 없이 완료 — e2e monorepo 테스트로 확인
  3. Next 생성물에서 FSD 규칙이 실제로 발화(고의 위반 테스트) — e2e로 확인, 이번 세션의 Task 10 실측과 일치
  4. Nest 생성물에서 `no-floating-promises` 발화 — Task 9 실측 + e2e로 확인
  5. `dist` 삭제 후 재빌드해도 생성물 정상 동작 — 이번 세션에서 직접 재현(위 이월 4)
  6. 설정 패키지 4개 전부 실제로 소비(선언만 하고 미사용 0) — 이월 1로 확보. `@devbak/tsconfig/lib` 서브패스는 미소비지만 패키지 단위 기준이라 위반 아님(설계 9절에 기록)
  7. `pnpm lint`(oxlint+eslint) 경고 0·에러 0, `pnpm build`, `tsc --noEmit`(devkit-cli 본체·테스트 tsconfig 둘 다) 통과 — 이번 세션에서 재확인
  - **참고**: `dist` 신선도 가드도 실제로 동작함을 별도 확인(`touch src/bin.ts` → `pnpm devbak create` 즉시 거부, 디렉토리 미생성 — 8절 완료 기준 목록엔 없지만 6.3절 실패 목록 항목이라 함께 검증).
- **테스트 개수**: 92(Task 3 시점) → **165**(단위/스냅샷) + **5**(e2e, 별도 실행) — 최종.
- **검증**: `pnpm build`·`pnpm lint`(oxlint+eslint, 경고 0)·`pnpm test` 165/165·`pnpm test:e2e` 5/5·`tsc --noEmit` 2개 프로젝트 전부 통과.
- **커밋**: `caca9aa`(fix: linkDeps 제거) · `d39cbda`(docs: 이 기록) — 브랜치 `feature/devkit-roadmap`, main 미머지

### 최종 전체 브랜치 리뷰 대응 (I-1~I-4, M-1, M-3~M-5)
- **변경 파일**: `templates/{nest,next,monorepo}/_prettierignore`(신규), `templates/nest/eslint.config.mjs`, `templates/monorepo/CLAUDE.md`, `src/ops/path-exists.ts`(신규), `src/ops/{copy-overlay,remove-files,index}.ts`, `src/bin.ts`, `src/recipes/next.ts`, `tests/{bin,fs-ops}.test.ts`, 스냅샷 2개, `docs/superpowers/specs/2026-08-01-devkit-template-design.md`
- **내용**: 최종 리뷰가 지적한 8건을 한 패스로 처리.
  - **I-1(blocking)**: 세 템플릿에 `_prettierignore` 추가. 실제 `nest` 프로젝트를 생성해 실행으로 검증한 결과, 리뷰가 지목한 `dist/`는 이 리포의 최소 스캐폴드에서는 원인이 아니었다(`prettier --write dist` 실행해도 바이트 변화 없음) — 진짜 원인은 (a) pnpm의 flow-style `pnpm-lock.yaml`을 Prettier가 block-style로 펼치려는 것, (b) `templates/nest/eslint.config.mjs`의 80자 초과 한 줄이었다. 둘 다 반영(`pnpm-lock.yaml`을 세 `_prettierignore`에 추가, `eslint.config.mjs` 줄바꿈 수정). 수정 전/후 `pnpm format:check`를 실행해 exit 1 → exit 0 전환을 직접 확인한 뒤 생성물은 삭제했다.
  - **I-2**: `.then(() => true, () => false)` 관용구(`bin.ts`·`remove-files.ts`·`copy-overlay.ts` 3곳)를 `ENOENT`/`ENOTDIR`만 "없음"으로 읽는 공용 `pathExists()`로 교체 — `EACCES`가 덮어쓰기 방지 가드를 무력화하던 문제. `chmod 000`으로 실제 `EACCES`를 유발하는 단위 테스트 추가.
  - **I-3**: `next.ts` mergeJson에 `required: ['dependencies.next', 'scripts.build']` 추가 — 그동안 next 단독 실행 시 `create-next-app` 변화를 감지하지 못하던 공백. 스냅샷 2개 갱신.
  - **I-4·M-1·M-4**: 설계 문서만 갱신(코드 변경 없음) — nest 오버레이의 `tsconfig.json` 드리프트 미감지를 §9에 기록, §9의 `/lib` 서술을 현재 상태(`/nest`만 소비)로 정정, §6.3의 경로 탈출 가드 서술을 `copyOverlay` 제외로 정정.
  - **M-3**: `monorepo/CLAUDE.md`에 루트/`apps/web` 깊이별 `link:` relocation 경고 절 추가.
  - **M-5**: `bin.ts`의 `!(type in RECIPES)`를 `Object.hasOwn`으로 교체 — `--type constructor`가 `Object` 생성자를 레시피로 착각해 `run()` 내부에서야 죽던 문제. 테스트 추가.
- **검증**: `pnpm test`(루트) 169/169 · `pnpm lint`(oxlint+eslint) 경고 0/에러 0 · `pnpm build`(전체) 통과. `pnpm test:e2e`는 실행하지 않음(지시).
- **커밋**: `c0527c7` — 브랜치 `feature/devkit-roadmap`, main 미머지
### Claude 리뷰 자산 및 devkit update 기반 모듈 구현
- **변경 파일**: `packages/devkit-cli/**`(신규 패키지), `eslint.config.mjs`, `.oxlintrc.json`, `docs/superpowers/specs/2026-08-01-devkit-claude-review-design.md`, `docs/superpowers/plans/2026-08-01-devkit-claude-review.md`
- **내용**: 생성된 프로젝트가 Claude 기반 코드 리뷰를 갖추게 하는 자산과, 그것을 갱신하는 `devkit update`의 기반 모듈을 구현.
  - **설계의 중심은 리뷰의 관심사 경계**: `devlog-api`의 기존 `코드-리뷰` 스킬 체크리스트를 항목별로 분류한 결과 대부분이 린터 영역(import 정렬·알파벳순·데코레이터 순서)이었고, `class-validator` 전제는 zod를 쓰는 실제 스택과 이미 어긋나 있었다. 그대로 계승했다면 모든 PR에서 잘못된 지적이 나왔을 것이다. 리뷰어는 린터가 원리적으로 못 잡는 4관점만 본다.
  - **CI 워크플로는 `devlog-api`의 동작 중인 실물이 기준선**. 두 군데만 변경 — `claude-skills` 체크아웃 제거, 참조 대상을 프로젝트 내부 자산으로. 기존 `nestjs-reviewer`/`nextjs-reviewer`가 FSD를 전혀 언급하지 않고(grep 0건) 자체 폴더구조를 제안해 devkit 표준과 충돌하기 때문이다.
  - **드리프트 방어**: 카테고리에 매칭되지 않는 오버레이 파일이 있으면 테스트가 실패한다. 계획 작성 중 이 방어가 `.gitignore` 미분류를 즉시 드러내 `repo` 카테고리를 추가했다. 방어가 실제로 실패시키는지 미분류 파일로 확인했다.
  - **`templates/`를 ESLint·oxlint 양쪽 ignore에 추가**. 소비자용 `.ts` 오버레이는 이 저장소의 어떤 tsconfig에도 속하지 않아 타입 인식 규칙이 예외를 던진다 — `eslint-config-nest`에서 겪은 Critical과 같은 부류이며, 증상이 나기 전에 막았다.
  - **Task 3에서 태스크 분해 도중 유실됐던 관점 3건을 리뷰가 복원**: 설계 3.4절이 nest 리뷰어에 배정한 고유 관점(zod 스키마와 사용처의 정합, 트랜잭션 경계, e2e 누락)이 계획에서 누락된 채로 진행되고 있었다.
  - **Task 4의 구조 단언이 항상-통과였다**: `expect(doc).toContain('FSD')`가 문서 전체를 검사해, "지적하지 않는 것" 목록에 있는 "FSD 레이어 간 import 방향 위반" 문구에 우연히 매치됐다 — 관점 절을 통째로 지워도 통과하는 단언이었다. 세 단언을 `## 보는 것` 슬라이스로 스코프하고, 구현자가 섹션을 임시 삭제해 실제로 실패하는지 확인한 뒤 되돌렸다.
  - **Task 7에서 과잉 catch 발견**: `readFile(...).catch(() => null)`이 `EISDIR`·`EACCES`까지 신규 파일로 삼켰다. 계획은 "쓰기 단계에서 같은 오류를 다시 만난다"고 정당화했으나, 리뷰가 `EACCES`에서는 **쓰기가 성공해 기존 파일을 조용히 덮어쓴다**는 것을 실증했다. `ENOENT`만 신규로 좁혔다.
  - **Task 8에서 과소 집계와 과잉 catch 2건 발견**: (a) `git status --porcelain`이 새 미추적 디렉토리를 한 줄로 접어 `changedFiles`를 과소 집계했다 — devkit이 `.claude/agents/`를 통째로 만드는 바로 그 시나리오에서 터진다. `-uall`로 고쳤다. (b) `catch(() => null)`이 권한 오류·손상된 저장소까지 `not-a-repo`로 뭉갰다. `isMissingRepo`로 좁혔더니 이번엔 stderr 매칭이 로케일에 취약해져, `LC_ALL=C`·`LANG=C`로 메시지를 고정했다.
  - **Task 9 검증 중 tsc 게이트가 실결함을 잡았다**: `overlay-coverage.test.ts`의 `entry.parentPath ?? entry.path` 폴백이 `@types/node@24`의 `Dirent`에 `path`가 없어 `TS2339`로 실패했다. vitest는 타입 체크 없이 트랜스파일만 하므로 테스트 76개가 전부 초록인 채로 이 결함을 통과시켰고, `tsc --noEmit` 게이트가 처음 잡았다. 게이트를 다섯 개 둔 이유가 이것이다. 폴백은 `engines` 하한(`^20.19.0`)이 `parentPath` 도입 이후라 애초에 커버할 구간도 없었다.
- **검증**: `pnpm lint` exit 0(경고 1건, `overlay-coverage.test.ts:16` `no-await-in-loop`, 알려진 항목), `pnpm test` 155개 통과(신규 76 + 기존 79), `pnpm build` 성공, `tsc --noEmit` 2개 프로젝트(`packages/devkit-cli/tsconfig.json`, `packages/devkit-cli/tests/tsconfig.json`) 통과
- **커밋**: `83dcc95`(설계) 외 구현 커밋 25개(`git log --oneline 41c2593..HEAD`), `8453b86`(tsc 폴백 결함 수정). 브랜치 `worktree-streamed-humming-papert`
- **남은 것**: CLI 실행 로직(`bin`·레시피·원자 연산 6종)과 `create`·`update` 서브커맨드는 템플릿 설계 구현의 몫이다(설계 0.1절)

### 전체 리뷰 후 조용한 성공 갈래 4건 수정
- **변경 파일**: `packages/devkit-cli/tests/review-assets.test.ts`, `packages/devkit-cli/tests/overlay-coverage.test.ts`, `packages/devkit-cli/src/lib/categories.ts`, `packages/devkit-cli/src/lib/classify.ts`, `packages/devkit-cli/src/index.ts`, `packages/devkit-cli/tests/categories.test.ts`, `packages/devkit-cli/tests/classify.test.ts`, `docs/superpowers/plans/2026-08-01-devkit-claude-review.md`, `work-log.md`
- **내용**: 전체 리뷰(`final-review.md`)가 잡은 "조용한 성공" 갈래 문제 3건과 기록 정확도 1건을 수정.
  - `_shared/`의 두 파일(CI 워크플로·`/review` 커맨드)이 기존엔 어떤 테스트도 훑지 않아, 사라져도 전 테스트가 초록이었다. `REVIEWER_PATH` 상수로 결합을 고정하고 존재·참조·`claude_code_oauth_token`·`pull-requests: write`를 단언하는 `_shared 오버레이` 블록을 추가. `overlay-coverage.test.ts`에는 유형 디렉토리 4개 각각의 최소 파일 수 단언을, `review-assets.test.ts` 공통 구조 블록에는 헤더 존재 단언(순서 단언의 `-1 < N` 사각 보완)을 추가.
  - `categories.ts`에 `JSON_KEY_CATEGORIES`(`prettier→lint`, `devDependencies→deps`) 테이블을 추가해 `package.json`이 키 단위로 카테고리에 속한다는 설계 5.4절의 결정을 인터페이스로 남김. 오버레이 커버리지 테스트가 이쪽을 훑지 못한다는 주의도 주석에 남김.
  - `classify.ts`의 `formatChangeList`가 세 섹션 전부 비었을 때(`deps`처럼 파일 패턴이 없는 카테고리로 `--only`를 걸 때 실제로 발생) 머리말만 내던 것을 "변경 없음" 명시로 고침. 부분적으로 빈 섹션을 숨기는 기존 동작은 유지.
  - `work-log.md`의 "구현 커밋 다수"를 `git log --oneline 41c2593..HEAD`로 센 실제 개수(25개)로 정정.
  - 계획 문서의 Task 2·3·4·5·7 코드 블록과 기대 테스트 개수를 구현과 일치하도록 갱신.
  - `_shared/.claude/commands/review.md`를 임시로 옮겨 신규 단언이 실제로 실패하는지 확인한 뒤 원복해 재통과를 확인.
- **검증**: `pnpm lint` exit 0(경고 1건, 알려진 항목), `pnpm test` 166개 통과(기존 155 + 신규 11), `pnpm build` 성공, `tsc --noEmit` 2개 프로젝트 통과.
- **남은 것**: 없음 — 이 작업으로 계획된 9개 태스크와 최종 리뷰 수정이 모두 완료됨.

## 2026-08-02

### 루트 README 작성
- **변경 파일**: `README.md` (신규)
- **내용**: 저장소 루트에 README가 없어 7개 패키지의 관계와 소비 방식이 각 패키지 README에만 흩어져 있던 것을 한 곳에 모음. 담은 것: 패키지 표(역할·빌드 유무), 의존 방향 다이어그램(설정 패키지 → devkit-cli 템플릿 → 생성물), `devbak create` 3유형과 형제 디렉토리 위치 제약, 기존 프로젝트에 `link:`로 붙이는 법, 저장소 자체 개발 명령(oxlint+ESLint 하이브리드에서 `buildFromOxlintConfigFile`이 맨 끝에 와야 하는 이유, `pnpm lint`의 `&&` 단락 평가 때문에 ESLint 단독 확인은 `lint:es`), `pnpm test:e2e`가 실패 생성물을 남겨 디스크를 채우는 점, 저장소 구조. 로컬 디렉토리명(`eslint`)·워크스페이스명(`eslint-workspace`)·GitHub 저장소명(`devkit`)이 다른 것도 명시.
- **핵심 서술**: "빌드 없는 패키지가 기본, 있는 쪽이 예외"라는 비대칭을 전면에 세움 — `link:` 의존은 라이프사이클 스크립트를 돌리지 않으므로 `dist`가 낡으면 소비자가 조용히 옛 설정을 쓴다. 4개 패키지는 JSON·CJS·ESM 순수 객체로 이 문제를 구조적으로 회피하고, 피할 수 없는 `devkit-cli`는 반대로 `dist`가 `src`보다 오래되면 실행을 거부한다.
- **검증**: README의 사실 주장을 코드로 확인 — 9개 패키지 tsconfig가 실제로 `tsconfig.base.json`을 extends, `vitest.config.ts`의 `include`가 한 단계 제한(`packages/*/tests/*.test.ts`), `engines.node` 범위, 각 패키지 `peerDependencies` 및 ESLint 버전 요구 차이(config-nest는 10 전용, plugin-fsd는 9||10).
- **커밋**: `docs: 루트 README 작성` — README와 이 기록이 같은 커밋이라 해시를 자기참조할 수 없어 제목으로 적는다. 브랜치 `main`

### 최종 전체 브랜치 리뷰 대응 — fix wave (I1~I3, M1~M9)
- **변경 파일**: `packages/devkit-cli/src/update/{plan,index}.ts`, `packages/devkit-cli/src/ops/copy-overlay.ts`, `packages/devkit-cli/src/index.ts`, `packages/devkit-cli/README.md`, `packages/devkit-cli/tests/{update-plan,update-flow}.test.ts`, `work-log.md`
- **내용**: `feature/devkit-update` 전체 브랜치 리뷰(`.superpowers/sdd/2026-08-02-devkit-update/final-review.md`)가 낸 Important 3건 + FIX SOON 9건을 한 번에 처리.
  - **I1**: README가 `pnpm install`이 도는 사실을 아예 적지 않아 "install은 안 돈다"로 읽혔다. `deps` 카테고리가 대상이고 `package.json`이 실제 쓰기 목록에 있을 때 대상 프로젝트에서 `pnpm install`이 돈다는 조건을 명시하고, 끄는 CLI 플래그가 없다는 것(`skipInstall`은 프로그램 API 전용)도 적었다. `--no-install` 플래그 자체는 지시 범위 밖이라 만들지 않았다.
  - **I2**: "JSON 파일은 통째로 덮지 않는다"만 있어 역(비-JSON은 통째로 덮는다)이 문서에 없었다. 실제 `templates/**` 트리를 `find`로 확인해 통짜 덮어쓰기 대상(`CLAUDE.md`·`eslint.config.mjs`·`.gitignore`·`.prettierignore`·`jest*.config.js`·`vitest.config.ts`·`pnpm-workspace.yaml`·`.claude/**`·`.github/workflows/**`)을 README에 명시하고 `--only`로 빼는 예시를 추가.
  - **I3**: `readJsonOrEmpty`가 대상 JSON 파싱 실패를 경로 없는 `SyntaxError`로 흘렸다 — 주석 섞인 `tsconfig.json` 같은 현실적인 입력에서 사용자가 어느 파일인지 알 수 없었다. `${경로}: JSON 파싱 실패`로 경로를 얹고 원본을 `cause`로 보존(같은 모듈 `json-patch.ts`의 관용과 통일). 재현 테스트 추가.
  - **M1**: `PLANNABLE` 화이트리스트가 `step.plan === undefined`와 항상 같은 값을 내면서 "미래에 `plan()`을 얻은 op를 조용히 떨어뜨리는" 능력만 갖고 있었다 — 삭제하고 `plan` 존재 자체를 신호로 씀(옵션 a). "조용한 실패 금지" 원칙에 더 직접 부합한다고 판단.
  - **M2**: `isJsonOverlay`(루트 기준)와 `isPackageJson`(단계 기준)의 경로 기준을 단계 기준으로 통일. 결과는 이전과 동일(둘 다 basename만 비교)함을 기존 monorepo 테스트로 재확인. `reduceJsonOverlay`만 에러 메시지 품질을 위해 루트 기준을 유지하며 이유를 주석으로 남김.
  - **M3**: 표시 정렬을 `localeCompare`(ICU 로케일 의존)에서 결정적 비교로 교체.
  - **M4**: `copy-overlay.ts`의 순차 `await` 2건에 이유 없는 oxlint warning이 있었다 — 브랜치 내 다른 6곳과 같은 `oxlint-disable-next-line -- <이유>` 관용으로 맞춤. 적용 후 해당 warning 2건이 `pnpm lint:ox` 출력에서 사라진 것을 확인.
  - **M5**: monorepo 대상에 `apps/web/package.json`이 없으면(예: `apps/site`로 개명) `apps/web` 트리 전체가 "신규"로 생성된다 — 경고 로그 추가.
  - **M6**: `--only scaffold`가 `nest`에서 실제로 `src/main.ts`를 내는 합성 경로가 테스트로 비어 있었다 — 양성 방향 단언 추가.
  - **M7**: `--force`가 `gitGate`를 통째로 조기 반환해 not-a-repo 경고까지 없앴다(README는 "git 관련 거부만 우회"라 적음) — `inspectGit` 호출을 force 체크보다 앞으로 옮기고, force는 dirty throw·not-a-repo confirm만 건너뛰도록 재구성. 부작용: `--dry-run --force` 조합의 로그가 미세하게 바뀜(이전엔 force가 먼저라 dry-run 알림도 안 나왔는데 이제 나옴) — 테스트가 없던 조합이고 기능 영향은 없어 그대로 진행.
  - **M8**: `src/index.ts` 헤더 주석이 "update가 조립할 순수 모듈만 노출"이라 적었으나 실제로는 조립기(`runUpdate`·`buildPlan`)도 내보낸다 — 현재 사실로 정정.
  - **M9**: 이 파일의 "devkit update 구현" 항목(위 참고)이 "`pnpm test`(단위·스냅샷·e2e)"라고 적었으나 `pnpm test`엔 e2e가 없다(`vitest.e2e.config.ts` 별도) — 정정.
  - 기존 테스트 중 이 변경들로 깨진 것은 없었다(362/362 그대로 통과) — M1·M7처럼 동작이 바뀌는 항목에서 "먼저 물어라"가 필요한 상황 자체가 발생하지 않았다.
- **검증**: `pnpm test` 362/362 통과, `pnpm lint:ox` 에러 0(warning 3, 전부 이 변경 이전부터 있던 이월 항목), `pnpm lint:es` clean, `pnpm build`(devkit-cli·eslint-config-nest·eslint-plugin-fsd) 성공.
- **커밋**: `de66180`(fix: 소스 4파일) · `497a996`(test: 회귀 테스트 2파일) · `4534576`(docs: README·work-log). 브랜치 `feature/devkit-update`, main 미머지.
