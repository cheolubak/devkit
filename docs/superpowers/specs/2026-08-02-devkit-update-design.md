# @devbak devkit — `devkit update` 구현 설계 문서

- 작성일: 2026-08-02
- 브랜치: `feature/devkit-update`
- 선행 문서: `2026-08-01-devkit-claude-review-design.md` 5절 (이하 "리뷰 설계"), `2026-08-01-devkit-template-design.md` (이하 "템플릿 설계")
- 상태: 설계 확정

---

## 0. 요약

`devbak update` 서브커맨드를 구현한다. 이미 존재하는 프로젝트에 devkit 표준을 재적용하는 명령이다.

리뷰 설계 5절이 실행 모델·`--only` 카테고리·변경 목록 출력을 이미 정했고, 부품 4종(`categories`·`marker`·`classify`·`git`)도 구현·테스트되어 있다. **없는 것은 조립자와 서브커맨드다.**

이 문서는 그 설계를 현재 코드에 대보고 **어긋난 지점 5건을 메운 뒤**, 조립 구조를 확정한다. 리뷰 설계 5절을 대체하지 않고 구체화한다.

---

## 1. 실측 (2026-08-02) — 설계와 코드가 어긋난 지점

이 저장소의 원칙대로 상상하지 않고 실물을 먼저 읽었다. **다섯 군데에서 설계가 코드와 맞지 않는다.**

### 1.1 `create`가 마커를 심지 않는다

리뷰 설계 5.1절은 *"`create`가 `package.json`에 마커를 심는다"* 를 `update`의 전제로 세웠다. 그러나 `markerPatch()`를 호출하는 코드가 어디에도 없다. `grep`으로 세 레시피·템플릿을 훑으면 `devkit` 키를 쓰는 곳이 하나도 나오지 않는다.

즉 **지금 `update`를 붙여도 기존에 `create`로 만든 프로젝트는 전부 마커가 없다.** 7절에서 메운다.

### 1.2 `mergeJson`의 `required`는 생성 시점 전용 가드다

`nest` 레시피의 패치는 `required: ['jest', 'devDependencies.eslint-plugin-prettier']`를 요구한다. 그런데 이 두 키는 **같은 패치가 지우는 대상**이다(`jest: null`, `eslint-plugin-prettier: null`).

에러 메시지 자체가 용도를 말한다 — *"위임 대상(공식 CLI)의 산출물이 바뀌었을 수 있습니다."* 이건 `nest new`가 방금 만든 것을 검사하는 가드이지, 몇 달 굴러간 프로젝트를 검사하는 가드가 아니다. `update`가 같은 패치를 그대로 돌리면 **항상 실패한다.**

### 1.3 `copyOverlay`의 `expectUpstream`도 생성 시점 전용이다

같은 성격이다. `nest` 레시피는 `src/main.ts`의 sha256을 박아 두고 공식 CLI가 그 파일을 바꿨는지 본다. 기존 프로젝트의 `main.ts`는 사람이 고쳤으므로 당연히 다르고, `update`에서 돌면 무조건 던진다.

### 1.4 JSON 키 카테고리 테이블이 불완전하다

`JSON_KEY_CATEGORIES`에는 `prettier`·`devDependencies` 둘뿐이다. 그러나 세 레시피의 패치는 `dependencies`(zod)·`jest`(삭제)·`scripts`도 건드리고, `monorepo` 템플릿의 `package.json`은 `packageManager`·`private`까지 담고 있다.

미분류 경로는 **어떤 `--only`로도 갱신되지 않으면서 조용히 성공한다.** 리뷰 설계 5.4절이 파일 오버레이에 대해 세운 드리프트 방어가 JSON 쪽에는 없다. 6절에서 메운다.

### 1.5 JSON 파일 오버레이를 통째로 덮으면 사용자 작업이 사라진다

`templates/monorepo/package.json`은 `"name": "__NAME__"`부터 시작하는 통짜 파일이다. `templates/nest/tsconfig.json`도 마찬가지다(`extends` + `compilerOptions` + `include`).

`create`는 빈 디렉토리에 놓으므로 문제가 없다. `update`가 그대로 덮으면 **사용자가 늘린 의존성·스크립트·`compilerOptions.paths`가 사라진다.** 변경 목록에 "덮어쓰기"로 뜨긴 하지만, 사람이 `y`를 누를 때 자기 `paths`가 날아가는 것을 예상하지는 않는다. 5.5절에서 규칙을 세운다.

### 1.6 `removeFiles`를 무시하면 update가 지워야 할 파일을 되살린다

`monorepo` 레시피는 `compose`로 `next`를 `apps/web`에 합성한 뒤, `removeFiles`로 `apps/web/eslint.config.mjs`와 `apps/web/.claude`·`.github`를 지운다. 남으면 ESLint의 `tsconfigRootDir` 자동추론이 루트와 `apps/web` 두 후보를 등록하며 `multiple candidate TSConfigRootDirs`로 전체 린트가 죽고, 앱 하위의 워크플로는 GitHub이 인식조차 하지 않는다.

리뷰 설계 5.3절은 *"`removeFiles`는 실행하지 않는다"* 고 했다. 그대로 구현하면 **update가 그 파일들을 매번 되살린다.**

반대로 "`removeFiles` 대상은 무조건 제외"로 고치면 `next` 레시피가 깨진다. 거기서는 `removeFiles(['AGENTS.md', 'CLAUDE.md'])`가 `copyOverlay('next')`보다 **앞**에 있다 — 공식 CLI가 만든 문서를 지우고 devkit 판을 새로 놓는 순서다. 무조건 제외하면 `CLAUDE.md`가 영영 안 놓인다.

**순서가 의미를 만든다.** 5.7절에서 해소한다.

---

## 2. 범위 결정

### 2.1 확정된 결정 6건

| # | 결정 | 근거 |
| --- | --- | --- |
| 1 | **devkit 산출물과 무관한 프로젝트 둘 다 대상** | 마커가 있으면 유형 자동 판별, 없으면 `--type`. 두 경우가 같은 코드 경로를 타고 차이는 "유형을 읽느냐 받느냐"뿐이다 |
| 2 | **대상은 경로 인자, 생략 시 cwd** | `linkSpec()`이 `relative()`로 매번 계산하므로 임의 위치가 원래 지원된다. `create`의 형제 디렉토리 강제는 `bin.ts`가 스스로 거는 제약일 뿐이다 |
| 3 | **레시피를 재사용하고 `kind`로 거른다** | 패치 내용이 레시피 한 곳에만 존재한다. 별도 테이블로 복제하면 레시피에 의존성을 추가하고 테이블을 잊는 순간 update가 조용히 옛 표준을 재적용한다 |
| 4 | **`plan`이 진실이고 `run`은 `plan` + 가드 + 쓰기** | 변경 목록을 보여주려면 어차피 최종 내용을 계산해야 한다. 계산했으면 쓰기는 `writeFile`뿐이고, 보여준 것과 쓰는 것이 같은 바이트임이 구조적으로 보장된다 |
| 5 | **update에서 JSON 파일 오버레이는 패치로 환원한다** | 1.5절 |
| 6 | **롤백하지 않는다** | git이 안전망이라는 것이 이 명령의 전제다(리뷰 설계 2.1절). 자체 롤백을 넣으면 그 전제가 흐려지고 두 안전망이 서로를 약화시킨다 |

### 2.2 비범위

- **마이그레이션 로직** — 마커의 `version`은 기록용이다. 버전 간 변환은 필요해질 때 만든다(리뷰 설계 5.1절의 YAGNI를 유지).
- **대화형 파일 선택** — 변경 목록은 전체에 대한 y/N 하나다. 파일별 선택은 `--only`가 이미 거친 입자로 제공한다.
- **`create`의 동작 변경** — 7절의 마커 심기를 빼면 `create` 경로의 산출물은 바이트 단위로 동일해야 한다.
- **`update`가 `delegate`·`removeFiles`·`makeDirs`를 실행하는 것** — 리뷰 설계 5.3절 표 그대로다. `removeFiles`를 **계획에 반영**하는 것은 실행이 아니다(5.7절) — 대상 프로젝트의 파일을 지우지 않는다.

---

## 3. 명령 표면

```
devbak update [path] [--only <cats>] [--type <t>] [--dry-run] [--yes] [--force]
```

| 옵션 | 의미 |
| --- | --- |
| `path` | 대상 프로젝트. 생략 시 cwd |
| `--only` | 쉼표 구분 카테고리. 생략 시 `scaffold`를 제외한 전체 |
| `--type` | 마커가 없을 때 유형 지정 |
| `--dry-run` | 변경 목록만 출력하고 종료 (exit 0) |
| `--yes` | 확인 프롬프트 생략 |
| `--force` | git 관련 거부만 우회 |

### 3.1 유형 결정

| 상황 | 동작 |
| --- | --- |
| 마커 있음, `--type` 없음 | 마커의 `type` |
| 마커 없음, `--type` 있음 | `--type` |
| 마커 없음, `--type` 없음 | 에러 + `--type` 안내 (`MissingMarkerError`의 기존 메시지) |
| 마커 `nest`, `--type next` | **거부.** `--force`로도 우회 못 한다 |

마지막 줄이 중요하다. 둘이 어긋나면 사용자가 대상을 착각했거나 마커가 오염됐다는 신호다. 조용히 한쪽을 고르면 **엉뚱한 유형의 표준을 덮어쓴다.** 리뷰 설계 5.3절이 `--force`의 범위를 "되돌릴 수 있는 상태의 문제"로 한정한 것과 같은 논리다.

### 3.2 툴킷 저장소 자기 자신은 거부한다

대상의 절대경로가 `toolkitRoot`와 같으면 던진다. `pnpm devbak update`를 무심코 치면 이 저장소를 프로젝트로 덮어쓰게 되고, 그때 사라지는 것이 `update` 자신의 소스다.

---

## 4. 실행 흐름

```
1  대상 확정      path ?? cwd → 절대경로. package.json 존재 확인. 툴킷 자신이면 거부
2  유형 결정      3.1절 표
3  git 게이트     4.1절
4  플랜 생성      레시피 → 평탄화 → kind 필터 → 카테고리 필터 → PlannedFile[]
5  분류·출력      classifyFiles → formatChangeList (리뷰 설계 5.5절)
6  --dry-run      여기서 종료 (exit 0)
7  확인           y/N. --yes로 생략. 변경 0건이면 확인 없이 종료
8  쓰기           PlannedFile 전부 writeFile
9  마커           전체 update일 때만 (4.2절)
10 설치           deps가 대상이고 package.json이 실제로 바뀐 경우에만 pnpm install
11 요약           "git diff로 검토하세요" + "pnpm lint 권장"
```

### 4.1 git 게이트 — dirty와 not-a-repo를 구분한다

리뷰 설계 5.2절은 not-a-repo를 *"경고 후 확인"* 이라 했고, 5.3절은 `--force`의 우회 대상에 *"저장소 아님"* 을 넣었다. 두 문장이 미묘하게 어긋난다. **둘 다 만족하는 해석**을 택한다.

| 상태 | 동작 | 우회 |
| --- | --- | --- |
| `clean` | 진행 | — |
| `dirty` | **거부** | `--force` |
| `not-a-repo` | 경고 + 확인 프롬프트 | `--force` 또는 `--yes` |

dirty가 더 강한 이유는 되돌릴 대상이 **섞이기** 때문이다. update의 결과와 사용자의 미커밋 작업이 같은 diff에 들어가면 `git checkout`이 둘 다 지운다. 저장소가 아니면 애초에 되돌릴 수단이 없으므로 경고로 족하다 — 없는 안전망을 강제할 수는 없다.

### 4.2 마커 갱신 규칙

리뷰 설계 5.1절대로 **`version`은 전체 update에서만 갱신한다.** `--only`가 주어지면 마커를 손대지 않는다.

여기서 마커가 **아예 없는** 프로젝트에 `--only`만 돌리는 경우가 남는다. 마커가 안 생기므로 다음에도 `--type`이 필요하다. `readMarker`는 `version` 없는 마커를 `InvalidMarkerError`로 던지므로 "type만 심기"는 성립하지 않는다.

**그대로 둔다.** 대신 완료 메시지에 한 줄을 붙인다:

```
마커가 없어 다음에도 --type이 필요합니다. 전체 update가 마커를 심습니다.
```

거짓 신호를 만드느니 불편을 남긴다. `--only claude`만 돌린 프로젝트의 마커가 최신 버전을 가리키면, 훗날 마이그레이션 판단의 근거가 오염된다.

---

## 5. 내부 구조 — `plan`이 진실이다

### 5.1 `Step.plan`

`Step`에 선택적 `plan`을 추가한다. `copyOverlay`·`mergeJson`·`linkDeps` 세 op만 구현한다.

```ts
export type PlannedChange =
  | { kind: 'file'; relPath: string; content: string }
  | { kind: 'json'; file: string; patch: JsonObject };

export interface Step {
  kind: StepKind;
  label: string;
  describe: () => unknown;
  plan?: (ctx: Ctx) => Promise<PlannedChange[]>;
  run: (ctx: Ctx) => Promise<void>;
}
```

### 5.2 `run`은 `plan` + 가드 + 쓰기

각 op의 `run`이 자기 `plan`을 호출하도록 재구성한다.

| op | `run` = |
| --- | --- |
| `copyOverlay` | `assertNoDrift` → `plan` → 파일 쓰기 |
| `mergeJson` | `required` 검사 → `plan` → 병합 결과 쓰기 |
| `linkDeps` | `plan` → 병합 결과 쓰기 |

**plan과 run이 갈라질 수 없다.** 그리고 1.2·1.3절의 가드가 `run`에만 남으므로, `plan`만 호출하는 `update`는 별도 스위치 없이 그것들을 비켜간다.

### 5.3 왜 `Ctx`에 `mode`·`only`를 넣지 않는가

처음에는 `Ctx`에 `mode: 'create' | 'update'`와 `only: Set<Category>`를 실어 op들이 스스로 걸러내게 하려 했다. 기각한다.

`plan`이 최종 내용을 전부 계산하므로 **update는 `run`을 아예 타지 않는다.** 필터링은 `plan` 결과에 대한 순수 함수이고, 쓰기는 `writeFile` 뿐이다. `Ctx`에 update 전용 개념을 섞으면 `create` 경로의 모든 op가 자기와 무관한 분기를 갖게 된다.

### 5.4 조립 파이프라인

```
recipe(type, { skipInstall: true })
  → flatten          compose 재귀. 각 step에 매핑된 targetDir를 함께 들고 나온다
  → kind 필터        copyOverlay · mergeJson · linkDeps 만
  → plan             순서대로 실행. 가상 파일맵에 누적
  → 카테고리 필터
  → PlannedFile[]
```

`compose` 재귀 덕분에 `monorepo`의 `apps/web`도 그대로 따라간다 — `monorepo` 레시피가 `next` 레시피를 합성한 구조를 update가 복제하지 않는다.

**가상 파일맵이 필요한 이유는 순서 때문이다.** `monorepo` 레시피는 `copyOverlay('monorepo')`로 `package.json`을 놓은 뒤 `linkDeps`로 그 파일을 패치한다. `create`에서는 두 번째 단계가 방금 쓰인 파일을 읽는다. `update`의 `plan`은 아무것도 쓰지 않으므로, JSON 패치의 기준 내용을 **가상 파일맵 → 없으면 디스크** 순으로 찾아야 같은 의미가 된다.

### 5.5 JSON 파일 오버레이는 패치로 환원한다

1.5절의 해소다. `update`에서 `.json` 확장자의 파일 오버레이는 **통째 복사하지 않고 키 단위 병합 패치로 바꾼다.** 현재 해당하는 것은 둘이다.

| 파일 | 유형 | 통째로 덮으면 사라지는 것 |
| --- | --- | --- |
| `package.json` | monorepo | 사용자가 추가한 의존성·스크립트, 그리고 `name` |
| `tsconfig.json` | nest | `compilerOptions.paths` 등 |

`package.json`은 추가로 **`name`·`version`을 환원 대상에서 뺀다.** 프로젝트 고유값이고, 템플릿의 `"name": "__NAME__"`은 `create`가 디렉토리 이름으로 치환하는 자리다. update가 이를 다시 쓰면 사용자가 바꾼 패키지 이름을 디렉토리 이름으로 되돌린다.

환원의 대가는 **키 삭제가 전파되지 않는다**는 것이다. 템플릿에서 스크립트 하나를 없애도 기존 프로젝트에는 남는다. 받아들인다 — 남는 쪽이 사라지는 쪽보다 회복 가능하다.

`create` 경로는 영향받지 않는다. 환원은 update의 `plan` 후처리이고, `run`은 지금처럼 통째로 쓴다.

### 5.6 `package.json`은 여러 패치가 합쳐진 한 파일이다

`classify.ts`는 `PlannedFile{relPath, content}`를 받아 신규/덮어쓰기/동일을 판정한다. JSON 패치는 파일이 아니라 키라서 이 모델에 안 맞는다.

**최종 문자열을 계산해 `PlannedFile` 하나로 환원한다.** 파일별로 패치를 순서대로 `applyPatch`한 뒤 `JSON.stringify(merged, null, 2) + '\n'`로 직렬화하면 — `mergeJson.run`이 쓰는 것과 같은 형식이다 — 그대로 `classify`에 들어간다. "동일 — 건너뜀" 판정도 공짜로 얻는다.

`monorepo`는 루트와 `apps/web`의 `package.json` 둘이 각각 별개의 `PlannedFile`이 된다.

### 5.7 `removeFiles`는 실행하지 않지만 계획에는 반영한다

1.6절의 해소다. 가상 파일맵이 이미 순서를 모델링하고 있으므로 규칙은 한 줄이다.

> `removeFiles`를 만나면 **그때까지 누적된 계획에서** 해당 항목을 지운다. 디스크는 건드리지 않는다.

리뷰 설계 5.3절의 *"실행하지 않는다"* 는 그대로 참이다 — 대상 프로젝트의 파일을 지우지 않는다. 사용자가 의도적으로 되살린 파일은 안전하다. 다만 **레시피가 놓은 적 없는 것으로 치는** 것뿐이다.

두 레시피가 정반대 방향으로 이 규칙을 검증한다.

| 레시피 | 순서 | 결과 |
| --- | --- | --- |
| `next` | `removeFiles(['CLAUDE.md'])` → `copyOverlay('next')` | `CLAUDE.md`가 **계획에 남는다** — 지운 뒤 놓는 순서다 |
| `monorepo` | `compose(next)` → `removeFiles(['apps/web/.claude', …])` | `apps/web/.claude/**`가 **계획에서 빠진다** — 놓은 뒤 지우는 순서다 |

디렉토리 경로는 prefix로 매칭한다(`apps/web/.claude`가 `apps/web/.claude/agents/devkit-reviewer.md`를 걸러야 한다). 경로 구분자는 POSIX `/`로 정규화한다 — `monorepo` 레시피는 `join()`으로 경로를 만들어 플랫폼 구분자가 섞인다.

`removeFiles`의 `required` 검사는 여기서도 돌리지 않는다. 1.2·1.3절과 같은 이유로 생성 시점 전용 가드다.

---

## 6. 카테고리 테이블 보강

### 6.1 파일 카테고리가 기본, `package.json`만 키 단위

| 대상 | 분류 기준 |
| --- | --- |
| 파일 오버레이 | `categoryOf(relPath)` — 기존 `FILE_PATTERNS` |
| `tsconfig.json`의 환원 패치 | 파일 카테고리(`ts`)를 그대로 물려받는다 |
| `package.json`의 패치 | **키 경로 테이블** |

`package.json`만 다른 이유는 그 파일의 키가 실제로 여러 카테고리에 걸쳐 있기 때문이다. `prettier`는 lint, `devDependencies`는 deps, `jest`는 test다. 파일 하나로 뭉뚱그리면 `--only lint`가 의존성까지 갱신한다.

### 6.2 점 경로 prefix 테이블 (최장 매칭)

| 경로 | 카테고리 |
| --- | --- |
| `dependencies`, `devDependencies` | `deps` |
| `prettier` | `lint` |
| `jest` | `test` |
| `scripts.lint`, `scripts.format`, `scripts.format:check` | `lint` |
| `scripts.test`, `scripts.test:watch`, `scripts.test:e2e` | `test` |
| `scripts.build`, `scripts.dev`, `scripts.typecheck` | `repo` |
| `packageManager`, `private`, `type` | `repo` |
| `devkit` | 마커 — 카테고리 없이 별도 취급 (4.2절) |

`devDependencies.eslint` 같은 하위 경로는 prefix 매칭으로 `deps`에 걸린다.

### 6.3 미분류는 던진다

매칭되는 경로가 없으면 `UnknownCategoryError`를 던진다. `parseOnly`가 오타 하나에 전체를 거부하는 것과 같은 이유다 — 조용히 건너뛰면 그 키는 **어떤 `--only`로도 갱신되지 않으면서 성공을 보고한다.**

**드리프트 방어는 테스트다.** 세 레시피의 모든 JSON 패치 경로(환원된 파일 오버레이 포함)를 걸어 하나라도 미분류면 실패한다. `overlay-coverage.test.ts`가 파일에 대해 하는 일의 JSON판이다.

### 6.4 `scaffold`는 기본 제외를 유지한다

`DEFAULT_EXCLUDED_CATEGORIES`가 이미 정한 대로다. `--only`가 없으면 유효 카테고리는 `CATEGORIES - {scaffold}`이고, `--only scaffold`를 명시해야만 대상이 된다.

부수 효과 하나가 유익하다. `nest` 오버레이의 `src/main.ts`가 `scaffold`이므로 **기본 update는 `main.ts`를 건드리지 않는다.** 1.3절의 `expectUpstream` 문제가 카테고리 층에서도 한 번 더 막힌다.

### 6.5 "변경 없음"이 나오는 경우

`formatChangeList`의 빈 목록 분기는 살아 있다. 다만 조건이 바뀐다. 5.6절의 환원 덕분에 `--only deps`는 이제 `package.json`을 낸다. 빈 목록은 **그 유형에 해당 카테고리의 파일도 JSON 경로도 없을 때** 나온다 — 예를 들어 `next` 프로젝트에 `--only ts`(next 템플릿에는 `tsconfig.json`이 없다).

---

## 7. `create` 쪽 변경 — 마커 심기

1.1절의 해소다. 세 레시피의 `mergeJson` 패치에 `...markerPatch(type, version)`을 스프레드한다.

- **`version`은 `devkit-cli/package.json`에서 읽는다.** 하드코딩하면 릴리스마다 갱신을 잊는다.
- 각 레시피가 자기 유형을 선언하므로 **스냅샷 테스트가 이를 고정한다.**
- 마커 심기는 `install`·자가검증보다 **앞**에 온다. `devkit` 키는 의존성이 아니므로 재설치를 유발하지 않는다.

### 7.1 `monorepo`의 `apps/web`에도 `next` 마커가 심긴다

`monorepo` 레시피는 `compose`로 `next` 레시피를 `apps/web`에 돌리므로, `next` 레시피의 마커가 `apps/web/package.json`에 함께 들어간다.

**유익한 쪽으로 판단해 그대로 둔다.** 루트는 `monorepo`, 앱은 `next`로 각각 update할 수 있게 된다. `update apps/web`이 앱만 좁혀 갱신하는 경로가 공짜로 생긴다.

---

## 8. 에러 처리

| 상황 | 동작 |
| --- | --- |
| 대상에 `package.json` 없음 | 던진다. devkit이 다룰 수 있는 프로젝트가 아니다 |
| 대상이 툴킷 저장소 자신 | 던진다 (3.2절) |
| 마커 없음 + `--type` 없음 | `MissingMarkerError` |
| 마커와 `--type` 불일치 | 던진다. `--force`로도 우회 못 한다 |
| 알 수 없는 `--only` 값 | `UnknownCategoryError` — 부분 실행하지 않는다 |
| 미분류 JSON 경로 | 던진다 (6.3절) |
| `classify` 중 ENOENT 외의 읽기 실패 | 던진다 — 기존 `classify.ts` 동작 |
| 쓰기 중 실패 | **롤백하지 않는다.** "일부만 적용됐을 수 있습니다 — `git status`로 확인하세요" |

마지막 줄이 결정 2.1-6이다. 자체 롤백은 git 안전망과 경쟁하며, 경쟁하는 두 안전망은 각자 절반만 믿기게 된다.

---

## 9. 파일 배치

| 파일 | 책임 |
| --- | --- |
| `src/update/plan.ts` | 레시피 평탄화 · kind 필터 · plan 누적 · 카테고리 필터 → `PlannedFile[]` |
| `src/update/index.ts` | 흐름 조립 (유형 결정 · git · 확인 · 쓰기 · 마커 · 설치) |
| `src/lib/confirm.ts` | y/N 프롬프트. 테스트를 위해 주입 가능 |
| `src/lib/categories.ts` | `categoryOfJsonPath()` 추가, 키 테이블 확장 |
| `src/types.ts` | `PlannedChange`, `Step.plan?` 추가 |
| `src/ops/{copy-overlay,merge-json,link-deps}.ts` | `plan` 구현, `run`을 `plan` 기반으로 재구성 |
| `src/recipes/*.ts` | `markerPatch` 스프레드 |
| `src/bin.ts` | `runCreate` / `runUpdate` 분기 |

`plan.ts`와 `index.ts`를 나누는 이유는 테스트 때문이다. 플랜 생성은 파일시스템 읽기만 하는 순수에 가까운 함수라 단위 테스트가 쉽고, 흐름 조립은 프롬프트·설치·git이 얽혀 통합 테스트 영역이다.

---

## 10. 테스트 전략 (5층)

| 층 | 대상 | 실행 |
| --- | --- | --- |
| 1. 단위 | `categoryOfJsonPath` 최장 매칭·미분류 throw, 유형 결정 4케이스, JSON 환원, 가상 파일맵 순서 | `pnpm test` |
| 2. 플랜 스냅샷 | 유형 3 × `--only` 조합의 `PlannedFile[]` 직렬화 | `pnpm test` |
| 3. 드리프트 방어 | 세 레시피의 모든 JSON 패치 경로가 분류되는가 | `pnpm test` |
| 4. 통합 (빠름) | 임시 디렉토리 + `git init` + 최소 `package.json` → `update --type nest --yes` | `pnpm test` |
| 5. e2e | `create` 산출물에 `update`를 돌리면 **변경 0건** | `pnpm test:e2e` |

4층이 **네트워크를 쓰지 않는다**는 점이 중요하다. `update`는 `delegate`를 실행하지 않으므로 공식 CLI 다운로드가 없다. `create`의 e2e와 달리 기본 `pnpm test`에 넣을 수 있다. 여기서 **두 번 돌리면 두 번째는 전부 "동일 — 건너뜀"** 임을 단언한다(멱등성).

5층이 가장 강한 그물이다. `create`와 `update`가 같은 레시피에서 갈라지는 순간을 잡는다. 5.2절의 "`run`은 `plan` + 가드 + 쓰기"가 실제로 지켜지는지를 **결과로** 검증한다.

---

## 11. 완료 기준

1. `pnpm devbak update ../<프로젝트> --dry-run`이 변경 목록을 내고 아무것도 쓰지 않는다.
2. 마커가 없는 외부 프로젝트에 `--type nest`로 표준이 적용되고, 사용자의 `compilerOptions.paths`와 추가 의존성이 보존된다.
3. `create`로 만든 프로젝트에 곧바로 `update`를 돌리면 변경이 0건이다.
4. 같은 `update`를 두 번 돌리면 두 번째는 전부 "동일 — 건너뜀"이다.
5. dirty한 워킹트리에서 거부되고, `--force`로 진행된다.
6. `monorepo` update가 `apps/web/eslint.config.mjs`·`apps/web/.claude/**`를 되살리지 않고, `next` update는 `CLAUDE.md`를 정상적으로 놓는다.
7. 세 레시피에 JSON 패치 경로를 추가하고 6.2절 테이블을 갱신하지 않으면 테스트가 실패한다.
8. `create` 산출물이 마커 한 키를 빼면 이전과 바이트 단위로 동일하다.
9. `pnpm lint`·`pnpm test`가 통과한다.

---

## 12. 미결 사항 / follow-up

- **마커 `version`의 마이그레이션** — 지금은 기록만 한다. 표준이 호환 불가하게 바뀌는 첫 사례가 나올 때 설계한다.
- **`update`가 지운 적 없는 파일** — `removeFiles`를 실행하지 않으므로, 템플릿이 어떤 파일을 "제거 대상"으로 바꿔도 기존 프로젝트에는 남는다. 5.5절의 키 삭제와 같은 성격의 한계다.
- **`--only` 없이 돌렸을 때의 `scaffold`** — 기본 제외를 유지하되, 프레임워크 뼈대가 크게 바뀌는 상황(예: Next 메이저 업그레이드)에서 무엇이 필요한지는 그때 판단한다.
