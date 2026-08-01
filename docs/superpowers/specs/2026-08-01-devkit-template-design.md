# @devbak devkit — 프로젝트 템플릿(`devkit create`) 설계 문서

- 작성일: 2026-08-01
- 브랜치: `feature/devkit-roadmap`
- 선행 문서: `2026-07-31-devkit-roadmap-design.md` (이하 "로드맵")
- 상태: 설계 확정

---

## 0. 요약

새 프로젝트를 시작할 때 한 명령으로 `@devbak` 표준이 적용된 프로젝트를 생성하는 CLI를 만든다.
로드맵이 Phase 3(`devkit-cli`)·Phase 4(`create-devbak-app`)로 나눠 뒀던 것을 **하나의 패키지로 통합**하고,
그보다 앞선 Phase 1(소비자 활성화)의 **설정 패키지 추출 부분만 선행**한다.

산출물은 새 패키지 4개다.

| 패키지 | 역할 | 빌드 |
| --- | --- | --- |
| `@devbak/devkit-cli` | `devkit create` 명령 | 필요 (tsup) |
| `@devbak/tsconfig` | `/nest` `/next` `/lib` | 없음 |
| `@devbak/jest-config` | `/nest` `/nest-e2e` | 없음 |
| `@devbak/vitest-config` | `/next` `/node` | 없음 |

---

## 1. 배경 — 로드맵과의 관계

### 1.1 로드맵이 이 작업을 뒤로 미뤘던 이유

로드맵 3.3절은 스캐폴딩을 Phase 4로 미루며 두 가지 근거를 댔다.

1. "Phase 1 없이 Phase 4를 만들면 CLI 템플릿 안에 `tsconfig`·`eslint.config.mjs` 내용을 하드코딩하게 되고, 나중에 Phase 1을 하면 전부 다시 써야 한다."
2. "`create-devbak-app`은 본질적으로 빈 디렉토리에서 제너레이터를 여러 번 돌리는 것이다. Phase 3을 먼저 만들면 Phase 4는 작아진다."

### 1.2 왜 지금 해도 되는가

**근거 1은 설정 패키지가 없을 때만 성립한다.** 이 문서는 `@devbak/{tsconfig, jest-config, vitest-config}`를 **먼저 만들고** 템플릿으로 간다(3절). 하드코딩할 대상이 사라지므로 근거가 무력화된다.

**근거 2는 Phase 3·4를 합치면 사라진다.** 배포하지 않기로 한 이상(로드맵 2.1절) `create-` 접두어는 의미가 없다 — 그 접두어는 `npm create <name>`이 `create-<name>` 패키지를 찾는 레지스트리 규약이다. 로컬 실행에서는 `devkit create`와 `devkit generate`가 같은 원자 연산을 공유하는 **하나의 CLI**가 자연스럽다.

### 1.3 오히려 순서를 바꾸는 것이 나은 이유

- **새 프로젝트는 레거시 위반이 0이다.** 기존 3개 프로젝트 마이그레이션은 (a)실제 결함 / (b)Nest 관용구 오탐 / (c)프로젝트 고유 사정이 뒤섞인 상태에서 설정을 검증한다(로드맵 4.4절). 갓 생성된 프로젝트에서 `pnpm lint`가 exit 0이 아니면 그것은 **무조건 설정의 문제**다. 더 깨끗한 검증대다.
- **`eslint-plugin-fsd`도 소비자가 0이다.** 로드맵은 백엔드 마이그레이션만 다뤄 이 사실을 가렸다. `eslint-config-nest`와 정확히 같은 처지인데 로드맵의 어느 Phase도 이를 해소하지 않는다. Next.js 템플릿이 그 첫 소비자가 된다.
- **기존 프로젝트 마이그레이션(로드맵 Phase 1 Task 2~10)은 여전히 해야 한다.** 이 문서는 그것을 취소하지 않고 순서만 뒤로 민다. 설정 패키지가 먼저 존재하면 그 작업도 쉬워진다.

### 1.4 이 문서가 다루지 않는 것

- 기존 3개 NestJS 프로젝트의 ESLint 8 → 10 마이그레이션 (로드맵 Phase 1 Task 2~10)
- `@devbak/eslint-plugin-nest-arch` (로드맵 Phase 2)
- `devkit generate` 서브커맨드 — CLI 구조는 이를 수용하도록 설계하되 구현하지 않는다
- npm 배포 (로드맵 2.2절에서 이미 비범위)

---

## 2. 실측 (2026-08-01)

이 설계의 모든 후처리 단계는 **실제로 공식 CLI를 돌려 관측한 결과**에 기반한다.
추측으로 썼다면 최소 세 군데를 틀렸을 것이다.

### 2.1 NestJS 11

```
pnpm dlx @nestjs/cli@latest new probe-nest --skip-git --skip-install -p pnpm --strict
```

생성 파일:
```
.prettierrc  eslint.config.mjs  nest-cli.json  package.json  README.md
src/{app.controller.spec.ts, app.controller.ts, app.module.ts, app.service.ts, main.ts}
test/{app.e2e-spec.ts, jest-e2e.json}
tsconfig.build.json  tsconfig.json
```

| 관측 | 설계 영향 |
| --- | --- |
| **`eslint.config.mjs`(flat config)를 생성한다** | `devlog-api`의 `.eslintrc.js`는 CLI 10 유물이다. 후처리는 삭제가 아니라 **덮어쓰기**다 |
| **`eslint-plugin-prettier` + `eslint-config-prettier`를 기본 포함한다** | 로드맵 4.5절이 제거하기로 한 바로 그 조합. devDeps에서 제거해야 한다 |
| **`eslint: ^9.18.0`** | `@devbak/eslint-config-nest`는 `^10.0.0` 전용이다. 그대로 두면 peer 불만족 |
| `@eslint/eslintrc`, `@eslint/js`, `globals` 포함 | 우리 config를 쓰면 전부 불필요 |
| `jest` 블록이 `package.json` 인라인 + `test/jest-e2e.json` 별도 | `@devbak/jest-config`의 서브패스 2개가 정확히 이 둘에 대응한다 |
| **`.gitignore`를 만들지 않는다** | 후처리가 생성해야 한다 |
| 생성된 config가 `sourceType: 'commonjs'`, `globals.node`+`globals.jest` 설정 | 우리 `eslint-config-nest`가 이를 담고 있는지 구현 시 확인 필요 |

`tsconfig.build.json`과 `nest-cli.json`은 **남긴다** — `nest build`가 실제로 참조한다.

### 2.2 Next.js 16

```
pnpm dlx create-next-app@latest probe-next --ts --app --src-dir --tailwind \
  --no-eslint --use-pnpm --skip-install --disable-git --import-alias '@/*'
```

생성 파일:
```
.gitignore  AGENTS.md  CLAUDE.md  next-env.d.ts  next.config.ts  package.json
pnpm-workspace.yaml  postcss.config.mjs  public/*.svg  README.md
src/app/{favicon.ico, globals.css, layout.tsx, page.tsx}  tsconfig.json
```

| 관측 | 설계 영향 |
| --- | --- |
| `--no-eslint`가 실제로 동작한다 | ESLint 설정이 아예 없는 상태에서 깨끗하게 얹는다 |
| **`pnpm-workspace.yaml`을 생성한다** (`ignoredBuiltDependencies: [sharp, unrs-resolver]`) | 모노레포에서 `apps/web/` 안에 남으면 **중첩 워크스페이스**가 된다. 3.3절 참조 |
| `AGENTS.md` + `CLAUDE.md`를 생성한다 | devkit 판으로 교체한다 |
| `src/app/`만 존재하고 FSD 레이어가 없다 | `eslint-plugin-fsd` 규칙을 켜도 검사할 폴더가 없다 |
| `next: 16.2.12`(캐럿 없음), `react: 19.2.4` | 버전 고정 정책은 create-next-app을 따른다 |

`pnpm-workspace.yaml`은 문서 어디에도 없고 **실행해야만 나온다**. `create-next-app`이 `onlyBuiltDependencies` 승인 문제 때문에 최근 넣기 시작한 파일이다.

### 2.3 pnpm `catalog:`는 `link:`를 지원하지 않는다

모노레포에서 버전을 한 곳에 모으려 `catalog:`에 `link:` 스펙을 넣는 방안을 검토했고, 실측으로 기각했다.

```
ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC  The entry for '@devbak/prettier-config' in catalog
'default' declares a dependency using the 'link' protocol. This is not yet supported,
but may be in a future version of pnpm.
```

따라서 **모노레포의 각 `package.json`이 `link:`를 직접 선언한다.** 루트와 `apps/web`은 툴킷까지의 깊이가 다르므로 상대경로가 다르다 — 이것이 `linkDeps` 연산이 경로를 **계산**해야 하는 이유다(4절).

`catalog:`는 `next`·`react`·`typescript` 같은 **일반 패키지에는 그대로 쓴다.** 기각된 것은 `@devbak/*`에 대한 사용뿐이다.

### 2.4 참조 레퍼런스

`~/Documents/develop/nextjs-monorepo`가 이미 Turborepo + pnpm `catalog:` + flat config + `packages/typescript-config` 구조를 갖췄다. 특히 그 `packages/typescript-config`는 `@devbak/tsconfig`와 **같은 역할의 실물**이다. 모노레포 오버레이와 tsconfig 패키지는 이를 기준선으로 삼고 상상해서 설계하지 않는다.

---

## 3. 범위 결정

### 3.1 확정된 결정 5건

| 항목 | 결정 | 기각한 대안 |
| --- | --- | --- |
| 형태 | 전체 생성형 CLI | 설정 주입형 `devkit init` |
| 뼈대 | **공식 CLI에 위임 + 후처리** | 뼈대 파일을 우리가 소유 |
| 순서 | 설정 패키지 먼저 → 바로 템플릿 | 로드맵대로 Phase 1 완주 후 / 템플릿이 설정을 직접 작성 |
| 유형 | NestJS + Next.js + Turborepo 모노레포 | 단일 유형 |
| 실행 | 로컬 전용, 생성물은 `link:` 상대경로 | npm 배포 / 전역 링크 |

### 3.2 왜 뼈대를 소유하지 않는가

`src/main.ts`·`app.module.ts`·`next.config.ts`를 우리가 가지면 NestJS 12, Next 17이 나올 때마다 diff를 따라가야 한다. 로드맵 2.1절이 정한 규모(소비자 = 작성자 본인의 개인 프로젝트 3~5개)에서 프레임워크 뼈대 추적은 명백한 과부하다.

대가는 있다. 공식 CLI의 대화형 프롬프트와 기본 생성물을 제압하는 후처리 로직이 필요하고, 공식 CLI가 바뀌면 후처리가 어긋난다. 후자는 6절의 `required` 규약으로 **침묵 대신 에러**가 되게 한다.

### 3.3 로컬 실행 모델의 제약

배포하지 않으므로 생성물은 `link:` 상대경로로 툴킷을 참조한다. 이는 **생성 위치가 `~/Documents/develop/` 바로 아래로 고정된다**는 뜻이다. 로드맵 4.2절이 소비자 프로젝트에 대해 이미 받아들인 제약과 같다.

이 제약은 문서화하고 CLI가 검사한다 — 대상 경로가 툴킷과 형제 관계가 아니면 경고한다(중단하지는 않는다. 상대경로는 여전히 계산 가능하다).

---

## 4. 아키텍처

```
packages/
├── devkit-cli/                    @devbak/devkit-cli
│   ├── src/
│   │   ├── bin.ts                 진입점 — 인자 파싱, dist 신선도 검사
│   │   ├── run.ts                 레시피 실행기
│   │   ├── ops/                   원자 연산 6종
│   │   │   ├── delegate.ts
│   │   │   ├── remove-files.ts
│   │   │   ├── copy-overlay.ts
│   │   │   ├── merge-json.ts
│   │   │   ├── link-deps.ts
│   │   │   └── make-dirs.ts
│   │   └── recipes/
│   │       ├── nest.ts
│   │       ├── next.ts
│   │       └── monorepo.ts
│   ├── templates/                 정적 오버레이 파일 (실물)
│   │   ├── nest/
│   │   ├── next/
│   │   └── monorepo/
│   └── tests/
├── tsconfig/                      @devbak/tsconfig
├── jest-config/                   @devbak/jest-config
└── vitest-config/                 @devbak/vitest-config
```

실행:
```bash
pnpm devbak create my-api       --type nest
pnpm devbak create my-app       --type next
pnpm devbak create my-platform  --type monorepo
```

루트 `package.json`에 `"devbak": "node packages/devkit-cli/dist/bin.js"`를 추가한다.

### 4.1 왜 레시피 파이프라인인가

각 프로젝트 유형을 **원자 연산의 순서 목록**으로 선언한다. 정적 설정 파일은 `templates/<type>/` 아래 실물 파일로 두고 `copyOverlay`가 복사한다.

이 저장소는 성급한 추상화를 명시적으로 거부해 왔다 — 로드맵 5.5절은 `create-rule.ts` 재사용을 "두 플러그인에서 세 번째 import 규칙이 필요해지는 시점에" 하기로 미뤘다. 여기서 공유 연산을 두는 것은 그 원칙과 충돌하지 않는다. **모노레포 레시피가 Next 레시피를 실제로 합성하므로**(5.3절) 재사용은 추측이 아니라 처음부터 관측된 사실이다.

기각한 대안:

| 대안 | 기각 사유 |
| --- | --- |
| 유형별 독립 절차 스크립트 | `package.json` 병합·`link:` 배선·파일 삭제가 세 번 복제되고, 모노레포가 Next 로직을 통째로 다시 쓴다 |
| 순수 오버레이 (파일 복사만) | 프로젝트명 치환·조건부 파일에서 템플릿 문법이 필요해져 결국 파이프라인으로 수렴한다. 좋은 점(정적 파일 실물 보관)은 `copyOverlay`로 흡수했다 |

### 4.2 원자 연산 6종

모든 연산은 `(ctx) => Promise<void>` 시그니처를 갖는다.
`ctx = { targetDir, toolkitRoot, name, log }`

| 연산 | 하는 일 | 제약 |
| --- | --- | --- |
| `delegate(cmd, args, opts)` | 공식 CLI / `pnpm install` 실행 | 비대화형 플래그 강제. exit code ≠ 0이면 즉시 중단 |
| `removeFiles(paths, opts)` | 생성물 정리 | `targetDir` 밖 경로는 **거부**. `required: true`면 대상 부재 시 실패 |
| `copyOverlay(type, opts)` | `templates/<type>/` 복사 | 기존 파일을 **덮어쓴다**. `__NAME__` 치환만, 조건 분기 문법 없음 |
| `mergeJson(file, patch, opts)` | JSON 병합 | 값이 `null`이면 **키 삭제**. `required: [...]`로 키 존재 요구 |
| `linkDeps(pkgs, opts)` | `@devbak/*`를 `link:`로 배선 | 상대경로를 `targetDir → toolkitRoot`로 **계산**한다. 하드코딩 금지 |
| `makeDirs(paths)` | 디렉토리 생성 | 빈 디렉토리는 git에 남지 않으므로 `.gitkeep` 동반 |

`mergeJson`의 `null = 삭제` 규약이 2.1절의 정리 작업을 선언적으로 만든다.

```ts
mergeJson('package.json', {
  devDependencies: {
    'eslint-plugin-prettier': null,
    'eslint-config-prettier': null,
    '@eslint/eslintrc': null,
    '@eslint/js': null,
    globals: null,
    eslint: '^10.8.0',                  // ^9.18.0 → ^10
    'typescript-eslint': '^8.65.0',
    'eslint-plugin-zod': '^4.9.0',
    zod: '^4.4.3',
  },
  jest: null,                            // 인라인 블록 제거
  prettier: '@devbak/prettier-config',   // .prettierrc 대신
  scripts: { lint: 'eslint .', format: 'prettier --write .' },
}, { required: ['jest', 'devDependencies.eslint-plugin-prettier'] })
```

### 4.3 왜 설정 패키지 3개에 빌드가 없는가

`@devbak/tsconfig`는 JSON, `jest-config`는 CJS 객체, `vitest-config`는 ESM 함수다. 전부 소스 그대로 export할 수 있다.

이는 편의가 아니라 **위험 제거**다. 로드맵 4.2절은 `link:` 소비에서 `dist`가 낡으면 "소비자가 조용히 옛 규칙으로 린트한다 — 이쪽이 더 위험하다"고 경고했다. 빌드가 없는 패키지는 이 실패 모드가 **구조적으로 불가능**하다. `@devbak/prettier-config`가 이미 이 선례다(빌드 없음, JSON 단일 파일).

빌드가 필요한 것은 `devkit-cli` 하나뿐이며, 그것은 6절에서 자체 방어한다.

---

## 5. 레시피

### 5.1 `nest`

```
1  delegate    pnpm dlx @nestjs/cli@latest new <name>
                 --skip-git --skip-install -p pnpm --strict
2  removeFiles .prettierrc                            (required)
3  copyOverlay eslint.config.mjs · tsconfig.json · jest.config.ts
               test/jest-e2e.config.ts · .gitignore · CLAUDE.md
4  mergeJson   package.json — 4.2절 참조                (required)
5  linkDeps    eslint-config-nest · prettier-config · tsconfig · jest-config
6  makeDirs    src/modules · src/common
7  delegate    pnpm install
8  delegate    pnpm lint && pnpm build          (자가검증, 5.4절)
```

- 2단계: `.prettierrc`는 `package.json`의 `"prettier": "@devbak/prettier-config"` 키로 대체한다. 파일이 하나 줄어든다.
- 3단계: `eslint.config.mjs`는 **덮어쓴다**(2.1절). 내용은 `@devbak/eslint-config-nest` spread 한 줄이 기본이다.
- 6단계: `src/modules`·`src/common`은 로드맵 1.3절이 3개 프로젝트에서 실측한 관용 구조다. 상상이 아니다.

### 5.2 `next`

```
1  delegate    pnpm dlx create-next-app@latest <name>
                 --ts --app --src-dir --tailwind --no-eslint
                 --use-pnpm --skip-install --disable-git --import-alias '@/*'
2  removeFiles AGENTS.md · CLAUDE.md                   (required)
3  copyOverlay eslint.config.mjs · vitest.config.ts · CLAUDE.md
4  mergeJson   package.json — scripts, prettier 키, devDeps
5  linkDeps    eslint-plugin-fsd · prettier-config · tsconfig · vitest-config
6  makeDirs    src/{views,widgets,features,entities,shared} + .gitkeep
7  delegate    pnpm install
8  delegate    pnpm lint && pnpm build          (자가검증, 5.4절)
```

- 6단계: FSD의 `pages` 레이어를 **`views`**로 만든다. App Router가 `src/app/`을 라우팅에 쓰므로 이름이 충돌하고, `eslint-plugin-fsd`가 이미 `views`/`screens` 별칭을 지원한다(그 설계 문서).
- 단일 앱에서는 `pnpm-workspace.yaml`을 **남긴다** — `sharp` 빌드 승인에 필요하다. 제거는 모노레포에서만 한다.

### 5.3 `monorepo`

```
1  copyOverlay 루트: package.json · pnpm-workspace.yaml(catalog) · turbo.json
                     eslint.config.mjs · .gitignore · CLAUDE.md
2  run(next)   apps/web 에 next 레시피 실행 (7·8단계 install·자가검증 제외)
3  removeFiles apps/web/pnpm-workspace.yaml            (required)
4  mergeJson   apps/web 의 ignoredBuiltDependencies 를 루트로 이관
5  delegate    pnpm install (루트)
6  delegate    pnpm lint && pnpm build          (자가검증, 5.4절)
```

- 2단계가 4.1절에서 파이프라인을 택한 이유의 실현이다. 한 줄이다.
- 3단계가 2.2절에서 발견한 함정의 대응이다. **`required: true`가 필수다** — 이 방어가 조용히 무력화되면 안 된다(6절).
- `@devbak/*` 의존은 루트와 `apps/web`이 **각자 `link:`로 선언**한다(2.3절). 상대경로 깊이가 다르므로 `linkDeps`가 계산한다.
- `catalog:`는 `next`·`react`·`typescript` 등 일반 패키지에만 쓴다. 기준선은 `nextjs-monorepo/pnpm-workspace.yaml`이다(2.4절).

### 5.4 자가검증 단계

세 레시피 모두 마지막에 생성물에서 `pnpm lint`와 `pnpm build`를 돌린다. 실패하면 종료 코드를 non-zero로 내되 **생성물은 지우지 않는다**(6.3절).

이 단계가 필요한 이유는 이 작업의 검증 논리 전체가 여기 걸려 있기 때문이다 — 1.3절이 "갓 생성된 프로젝트에서 `pnpm lint`가 exit 0이 아니면 그것은 무조건 설정의 문제다"라고 주장했다. 그 주장을 CLI가 매 실행마다 실제로 시험하게 만든다.

**`pnpm test`는 포함하지 않는다.** `nest new`는 샘플 spec을 함께 만들지만 `create-next-app`은 테스트를 하나도 만들지 않아, 갓 생성된 Next 앱에서 vitest는 "테스트 0개"로 실패한다. 이 저장소 루트가 같은 이유로 `--passWithNoTests`를 붙인 전례가 있다(work-log 2026-07-26). 생성물의 `test` 스크립트에 그 플래그를 넣어 실패를 감추는 것보다, 자가검증에서 빼고 8절 완료 기준에서 사람이 확인하는 편이 정직하다.

`--no-verify` 플래그로 건너뛸 수 있다. 오프라인이거나 위임 대상만 빠르게 확인할 때 쓴다.

---

## 6. 에러 처리

### 6.1 가장 위험한 실패는 조용한 성공이다

이 저장소는 이 부류를 이미 두 번 겪었다.

- 로드맵 4.2절: `link:`의 낡은 `dist` — "조용히 옛 규칙으로 린트한다. 이쪽이 더 위험하다"
- `fsd-react-preset` 설계 2.1절: 구조 단언 테스트 9개가 전부 초록인 상태에서 런타임 크래시

여기서의 구체적 시나리오는 이렇다. 내년에 `create-next-app`이 `pnpm-workspace.yaml` 생성을 멈추면 `removeFiles(['pnpm-workspace.yaml'])`가 **아무 말 없이 통과**한다. 모노레포는 정상 생성되고, 우리는 방어가 살아 있다고 믿는다. 나중에 파일명만 바뀌어 부활하면 그때는 못 잡는다.

### 6.2 대응 — 연산이 기대를 선언한다

```ts
removeFiles(['pnpm-workspace.yaml'], { required: true })
// 부재 시:
//   [monorepo:3] create-next-app이 pnpm-workspace.yaml을 만들지 않았습니다.
//   위임 대상이 바뀌었을 수 있습니다. next 레시피(5.2절)를 재검증하세요.
```

`required`가 붙은 연산은 대상이 없으면 **실패한다.** 공식 CLI의 변화가 침묵이 아니라 에러로 드러난다.

### 6.3 실패 목록

| 실패 | 처리 |
| --- | --- |
| 대상 디렉토리가 이미 존재 | 시작 전 거부. 덮어쓰기 없음 |
| 공식 CLI가 non-zero 종료 | 즉시 중단. **생성물은 지우지 않는다** — 지우면 디버깅이 불가능해진다 |
| 경로 탈출 (`../`) | `removeFiles`·`copyOverlay`가 `targetDir` 밖이면 거부 |
| `required` 위반 | 레시피명 · 단계 번호 · 기대한 대상 · 다음 행동을 출력 |
| `pnpm install` 실패 | 생성물 유지 + 수동 `pnpm install` 안내. **부분 성공을 성공이라 말하지 않는다** |
| `devkit-cli`의 `dist`가 `src`보다 오래됨 | 시작 시 mtime 비교 → **중단**하고 `pnpm build` 요구 |
| 대상이 툴킷과 형제 디렉토리가 아님 | 경고만. 상대경로는 여전히 계산 가능하다 |

마지막에서 두 번째 항목이 로드맵 4.2절 함정의 CLI판 대응이다. 설정 패키지 3개는 빌드가 없어 애초에 해당되지 않는다(4.3절).

---

## 7. 테스트 전략

| 층 | 대상 | 속도 | 실행 |
| --- | --- | --- | --- |
| 1. 원자 연산 단위 | `mergeJson`의 `null` 삭제, `linkDeps` 경로 계산, 경로 탈출 거부, `required` 위반 | 빠름 | `pnpm test` |
| 2. 레시피 스냅샷 | `delegate` 스텁 + 실행될 명령·파일 조작 목록 스냅샷 | 빠름 | `pnpm test` |
| 3. 실생성 통합 | 3개 유형을 실제 생성 → `lint`/`build`/`test` 통과 확인 | 느림·네트워크 | `pnpm test:e2e` |

**2층의 값어치**: 공식 CLI 없이 "nest 레시피가 `eslint-plugin-prettier`를 지우는가"를 검증한다. 레시피 변경의 영향이 diff로 보인다.

**3층이 유일하게 진짜를 증명한다.** 2층이 전부 초록이어도 공식 CLI 산출물이 바뀌면 실제 프로젝트는 깨진다 — `eslint-plugin-react` 사건의 교훈이 그대로 적용된다. 느리므로 기본 `test`에서 분리하되, **분리 자체가 위험**이므로 완료 기준에 명시한다(8절).

`linkDeps` 경로 계산은 **깊이 2종을 반드시 덮는다.**

| 위치 | 기대 |
| --- | --- |
| `~/develop/my-api` | `link:../eslint/packages/tsconfig` |
| `~/develop/my-platform/apps/web` | `link:../../../eslint/packages/tsconfig` |

설정 패키지 3개는 각자 자체 테스트를 갖는다 — `tsconfig`는 실제 `tsc`, `jest-config`는 실제 `jest`, `vitest-config`는 실제 `vitest`를 픽스처에 돌린다. 형식만 단언하지 않는다(`eslint-config-nest`가 픽스처 런타임 검증으로 세운 선례).

---

## 8. 완료 기준

1. 3개 유형이 실제로 생성되고, 각 생성물에서 `pnpm lint` exit 0 · `pnpm build` 성공. `pnpm test`는 nest 생성물(샘플 spec 존재)에서만 통과를 요구한다 — Next 생성물은 테스트가 0개다(5.4절)
2. 모노레포 생성 후 `pnpm install`이 **중첩 워크스페이스 경고 없이** 완료
3. 생성된 Next 앱에서 **FSD 규칙이 실제로 발화**함 — 고의 위반 코드로 확인한다. 레이어 폴더만 있고 규칙이 안 걸리면 아무것도 한 것이 아니다
4. 생성된 Nest 앱에서 `@typescript-eslint/no-floating-promises`가 발화함 — `eslint-config-nest`가 "존재 이유"로 지목한 규칙
5. 툴킷 `dist`를 지우고 다시 빌드해도 생성물이 정상 동작 (로드맵 4.7절과 동일 기준)
6. 설정 패키지 4개가 **전부 실제로 소비됨** — 선언만 하고 미사용인 패키지 0
7. `pnpm lint`(oxlint + eslint) · `pnpm build` · `tsc --noEmit`이 툴킷 저장소에서 통과

---

## 9. 미결 사항 / follow-up

- **`eslint-config-nest`가 Nest 런타임 전역을 담는가** — `nest new`의 기본 config는 `sourceType: 'commonjs'`와 `globals.node`+`globals.jest`를 설정한다(2.1절). 우리 config가 이를 담지 않으면 생성물이 `no-undef` 등으로 깨질 수 있다. 구현 첫 단계에서 확인한다
- 로드맵 Phase 1 Task 2~10 (기존 3개 프로젝트 마이그레이션) — 이 작업 후로 미뤄졌을 뿐 취소되지 않았다
- `devkit generate` 서브커맨드 (로드맵 Phase 3의 제너레이터) — CLI 구조가 수용하도록 설계했으나 구현하지 않는다
- 모노레포에 NestJS 앱을 함께 두는 유형(`apps/api` + `apps/web`) — 수요가 실제로 생길 때 추가한다. 현재는 Next 단일 앱 모노레포만 지원한다
