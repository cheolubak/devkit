# devkit 툴킷에 Turborepo 도입 설계 문서

- 작성일: 2026-08-04
- 브랜치: `feature/turbo-toolkit`
- 선행 문서: `2026-08-01-devkit-template-design.md`(이하 "템플릿 설계"), `2026-08-02-devkit-update-design.md`
- 상태: 설계 확정

---

## 0. 요약

이 저장소(`eslint-workspace`)의 빌드·검사 파이프라인을 Turborepo로 옮긴다. 지금은 루트에서 `pnpm -r build`와 단일 `vitest`·`eslint` 명령이 전부를 처리하는데, 이를 **패키지별 태스크**로 쪼개고 turbo가 오케스트레이션하게 한다.

| 태스크 | 지금 | 바뀐 뒤 |
| --- | --- | --- |
| `build` | `pnpm -r build` | `turbo run build` |
| `test` | 루트 vitest 설정 하나가 전 패키지를 훑음 | 패키지별 `vitest.config.ts` → `turbo run test` |
| `lint` | 루트에서 `oxlint && eslint .` | 패키지별 `eslint.config.mjs` → `turbo run lint` |
| `typecheck` | **없음** | 패키지별 `tsc --noEmit` → `turbo run typecheck` |
| `test:e2e` | 루트 e2e 설정 | `devkit-cli`의 태스크 → `turbo run test:e2e` |

### 0.1 이 도입이 실제로 주는 것 — 기대치를 먼저 정확히 한다

**패키지 7개 사이에 workspace 의존이 하나도 없다**(1.1절 실측). 설정 패키지들은 서로를 import하지 않고, `devkit-cli`도 그들을 템플릿 내용으로만 조립한다 — `link:`는 **생성된 프로젝트**의 선언이지 워크스페이스의 것이 아니다.

그래서 그래프가 완전히 평평하고, 그 결과:

- **`dependsOn: ["^build"]`는 아무 일도 하지 않는다.** 위상 정렬할 것이 없다.
- **스케줄링 이득이 0이다.** `pnpm -r`도 이미 독립 패키지를 동시에 돌린다.

**남는 이득은 둘뿐이다.**

1. **캐싱** — 안 바뀐 패키지의 태스크를 통째로 건너뛴다.
2. **도그푸딩** — 툴킷이 `monorepo` 레시피로 남에게 권하는 구조를 자기도 쓴다. 그 구조에서 부딪히는 문제를 먼저 겪는 값어치가 있다.

부수 효과 하나가 더 있다: **패키지 하나만 검사할 수 있게 된다.** 지금은 한 패키지만 린트하거나 테스트할 방법이 없다.

이 문서는 "빌드가 빨라진다"를 약속하지 않는다.

---

## 1. 실측 (2026-08-04)

### 1.1 패키지 간 의존이 없다

각 `package.json`의 `dependencies`·`devDependencies`·`peerDependencies`에서 `@devbak/*`를 찾은 결과 **7개 전부 없음**이다. 0.1절의 근거다.

### 1.2 빌드가 있는 패키지는 3개뿐이다

| 패키지 | build | tsconfig | 단위 테스트 | e2e |
| --- | --- | --- | --- | --- |
| `devkit-cli` | `tsup` | `tsconfig.json` + `tests/tsconfig.json` | 23 | 2 |
| `eslint-plugin-fsd` | `tsup` | 있음 | 12 | — |
| `eslint-config-nest` | `tsup` | 있음 | 1 | — |
| `jest-config` | 없음 | 있음 | 1 | — |
| `vitest-config` | 없음 | 있음 | 1 | — |
| `prettier-config` | 없음 | **없음** | 1 | — |
| `tsconfig` | 없음 | **없음** | 1 | — |

**빌드가 없는 쪽이 기본이고 있는 쪽이 예외다**(루트 README). 이 설계는 그 원칙을 바꾸지 않는다.

### 1.3 어느 패키지의 테스트도 `tsc`로 검사된 적이 없다

**2026-08-04 정정.** 이 절은 원래 *"`prettier-config`·`tsconfig`는 tsconfig가 없어 테스트가 검사되지 않는다"* 고 적었고, 4.3절은 그 둘에 `tests/tsconfig.json`을 신설하라고 했다. **둘 다 틀렸다** — Task 3 실행 중 실측으로 잡혔다.

`tests/tsconfig.json`은 **7개 패키지 전부에 이미 있다.** 둘은 이유가 주석으로 적힌 채 커스터마이즈돼 있다(`eslint-config-nest`는 `exclude: ["fixtures"]`, `eslint-plugin-fsd`는 `include: [".", "../src/types"]`). 바닐라 템플릿으로 덮으면 각각 TS1241·TS1270, TS7016이 난다.

**그러나 결론은 그대로다.** 파일이 있었다는 것과 `tsc`가 돌았다는 것은 다르다 — 이 저장소에는 `typecheck` 스크립트가 **아예 없었으므로** 그 tsconfig들은 ESLint `projectService`의 파싱에만 쓰였고 **타입 검사는 한 번도 실행된 적이 없다.** 그래서 `typecheck` 태스크는 여전히 **없던 검사를 처음 켜는 일**이며, 4.3절이 할 일은 파일 신설이 아니라 **스크립트 배선**이다.

이 오류가 난 이유는 사실 수집 때 패키지 **루트**의 `tsconfig.json`만 세고 `tests/` 아래는 한 패키지만 확인했기 때문이다. 두 조사가 서로를 보완한다고 착각했고, "나머지는 없다"는 어느 쪽도 확인하지 않은 명제였다.

### 1.4 oxlint는 쪼갤 이유가 없다

`packages/devkit-cli`에서 `pnpm exec oxlint`를 돌리면 루트 실행과 같은 경고 3건이 나오고 `dist/`를 훑지 않는다. 다만 그것이 `.oxlintrc.json` 탐색 덕인지 `.gitignore` 존중 덕인지 구별하지 못했다.

**구별할 필요가 없다는 것이 결론이다.** oxlint는 Rust라 저장소 전체를 훑어도 밀리초 단위다. 패키지별로 쪼개면 `-c ../../.oxlintrc.json` 같은 군더더기만 늘고 얻는 것이 없다. **oxlint는 루트 태스크 하나로 두고 ESLint만 패키지별로 나눈다**(4.1절).

### 1.5 루트 태스크를 `//#lint`로 이름 붙이면 무한 재귀한다

Turborepo 공식 문서가 루트 태스크 예시를 `//#lint`가 아니라 **`//#lint:root`**로 드는 데는 이유가 있다. 루트 `package.json`의 `lint`가 `turbo run lint`인데 `//#lint`를 등록하면, turbo가 루트 패키지의 `lint` 스크립트를 실행하려 하고 그것이 다시 turbo를 부른다.

> If the root task does call turbo, avoid depending on it directly to prevent infinite recursion.

**루트 태스크 이름은 패키지 태스크 이름과 반드시 달라야 한다.** CLI에서는 `//#` 접두사 없이 부른다 — `turbo run lint lint:root`.

---

## 2. 범위 결정

### 2.1 확정된 결정

| # | 결정 | 근거 |
| --- | --- | --- |
| 1 | **전 태스크를 패키지별로 재편한다**(`build`·`typecheck`·`test`·`lint`) | 도그푸딩이 목적이다. `build`만 옮기면 툴킷이 권하는 구조와 여전히 다르다 |
| 2 | **`dependsOn: ["^build"]`를 쓰지 않는다** | 1.1절 — 의존이 없어 no-op이다. 없는 관계를 선언하면 다음 사람이 있다고 오해한다 |
| 3 | **`test:e2e`는 캐시하지 않는다** | 네트워크(`pnpm dlx`)·디스크·외부 상태에 의존한다. 캐시하면 "돌았다"는 거짓 신호가 된다 |
| 4 | **루트 ESLint 설정이 `packages/**`를 무시한다** | 3.1절. 스코프에 설정이 하나뿐이어야 `tsconfigRootDir` 충돌이 원천 차단된다 |
| 5 | **루트 `vitest.config.ts`·`vitest.e2e.config.ts`를 삭제한다** | 같은 사실이 두 곳에 있으면 갈라지는 순간 어느 쪽이 진짜인지 알 수 없다 |
| 6 | **`lint:ox`·`lint:es` 진단 스크립트를 유지한다** | 두 린터를 각각 돌려야 한다는 것이 이 저장소의 실측 교훈이다. 그 경로를 turbo 뒤로 숨기면 안 된다 |
| 7 | **oxlint는 쪼개지 않고 루트 태스크로 둔다** | 1.4절 — Rust라 전체를 훑어도 밀리초다. 쪼개면 설정 참조 군더더기만 늘고 얻는 것이 없다 |
| 8 | **루트 태스크 이름은 패키지 태스크와 다르게 짓는다**(`lint:root`·`lint:ox`) | 1.5절 — 같으면 루트 스크립트가 turbo를 다시 불러 무한 재귀한다 |

### 2.2 비범위

- **원격 캐시(Vercel Remote Cache)** — 1인 로컬 저장소다. 필요해지면 그때.
- **`dev`·`watch` 태스크** — 이 저장소에 개발 서버가 없다.
- **생성되는 `monorepo` 레시피 개선** — 별도 작업으로 분리했다. 이 작업이 끝난 뒤 여기서 얻은 관습을 반영한다.
- **패키지 간 의존 신설** — 지금 평평한 것이 설계 의도다(설정 패키지는 서로를 import하지 않는다).

---

## 3. 함정 — 이 설계에서 위험한 것은 ESLint 하나다

### 3.1 중첩 ESLint 설정은 저장소 전체 린트를 죽인다

`monorepo` 레시피가 `apps/web/eslint.config.mjs`를 **지우는** 이유가 이것이다(템플릿 설계 실측):

> ESLint가 이 파일도 중첩 설정으로 로드해 `typescript-eslint`의 `tsconfigRootDir` 자동추론이 루트·`apps/web` 두 후보를 동시에 등록하면서 **"multiple candidate TSConfigRootDirs" 에러로 전체 린트가 죽는다.**

패키지마다 `eslint.config.mjs`를 두면 같은 조건이 이 저장소 안에 생긴다.

**해소는 겹치지 않게 만드는 것이다.**

```
eslint.base.mjs                    공유 설정 배열을 export — 실행 설정이 아니다
eslint.config.mjs                  루트 전용. ignores 에 packages/** 를 넣는다
packages/<pkg>/eslint.config.mjs   base 를 import + tsconfigRootDir: import.meta.dirname
```

핵심은 **루트 설정이 `packages/**`를 무시**한다는 것이다. 어떤 실행에서도 스코프 안의 설정이 정확히 하나뿐이라 후보가 갈릴 수 없다.

**파일 이름이 `eslint.base.mjs`인 것은 요구다.** `eslint.config.*`이면 ESLint가 설정으로 자동 탐색해 의도치 않은 중첩이 다시 생긴다. 그 파일은 라이브러리이지 설정이 아니다.

### 3.2 루트 파일은 누가 린트하는가

`eslint.base.mjs`·`turbo.json`·설정류 등 루트 파일은 패키지 태스크의 대상이 아니다. turbo의 **루트 태스크 `//#lint:root`**가 맡는다(이름이 `//#lint`가 아닌 이유는 1.5절). 루트 설정이 `packages/**`를 무시하므로 이 실행도 후보 충돌을 만들지 않는다.

### 3.3 vitest의 한 단계 매칭은 의도다

지금 루트 설정이 `packages/*/tests/*.test.ts`로 **한 단계만** 매칭하는 이유:

> `**`로 재귀 매칭하면 기본 `pnpm test`가 e2e를 물어 개발 루프가 죽는다(수 분~수십 분).

패키지별 설정도 같은 규율을 지킨다 — `include: ['tests/*.test.ts']`. `devkit-cli`만 `vitest.e2e.config.ts`를 따로 갖는다.

---

## 4. 산출물

### 4.1 `turbo.json`

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json", ".oxlintrc.json", "eslint.base.mjs"],
  "tasks": {
    "build":        { "outputs": ["dist/**"] },
    "typecheck":    {},
    "test":         {},
    "lint":         {},                                   // 패키지별 = eslint 만
    "test:e2e":     { "dependsOn": ["build"], "cache": false },
    "//#lint:ox":   {},                                   // 저장소 전체 oxlint (1.4절)
    "//#lint:root": {}                                    // 루트 파일 eslint (3.2절)
  }
}
```

`globalDependencies`의 셋은 모든 패키지의 결과에 영향을 준다 — 하나라도 바뀌면 전체 캐시가 무효화돼야 한다.

`test:e2e`만 자기 패키지의 `build`에 의존한다. 빌드된 `dist/bin.js`를 실제로 실행하기 때문이다(그리고 `assertDistFresh`가 낡은 `dist`를 거부한다).

루트 태스크 두 개의 이름이 패키지 태스크(`lint`)와 다른 것은 1.5절의 요구다.

### 4.2 패키지 스크립트

| 태스크 | 대상 | 명령 |
| --- | --- | --- |
| `build` | 3개 | `tsup` (그대로) |
| `typecheck` | tsconfig가 있는 패키지 | `tsc --noEmit -p tsconfig.json` (테스트 tsconfig가 따로 있으면 함께) |
| `test` | 7개 | `vitest run --passWithNoTests` |
| `lint` | 7개 | `eslint .` |
| `test:e2e` | `devkit-cli` | `vitest run --config vitest.e2e.config.ts` |

패키지 `lint`가 ESLint만 도는 이유는 1.4절이다 — oxlint는 루트에서 한 번에 훑는다.

turbo는 스크립트가 없는 패키지를 조용히 건너뛴다. `prettier-config`·`tsconfig`에 `build`·`typecheck`가 없는 것이 정상이다.

### 4.2.1 부수 효과 — 단락 평가 함정이 구조적으로 사라진다

지금 `pnpm lint`는 `oxlint && eslint .`라 **단락 평가**된다. oxlint가 실패하면 ESLint는 아예 돌지 않고, 그래서 "ESLint만 확인하려면 `lint:es`"라는 관습이 생겼는데 그것이 **oxlint 전담 규칙을 검증에서 통째로 빼는** 사각지대를 만들었다(`eslint-plugin-oxlint`가 중복 규칙을 ESLint 쪽에서 끄므로 `no-unused-vars`는 oxlint에만 있다). 실제로 미사용 `import type`이 `lint:es`를 통과한 채 커밋됐다가 게이트를 깼다.

turbo는 `lint:ox`와 `lint`를 **독립 태스크로 병렬 실행**한다. 하나가 실패해도 다른 하나의 결과가 나온다 — 그 사각지대가 `&&`와 함께 사라진다.

### 4.3 테스트 타입 검사를 처음 켠다

1.3절의 해소다. **파일을 신설하는 것이 아니라 스크립트를 배선하는 것이다** — `tests/tsconfig.json`은 7개 패키지에 이미 있고, 커스터마이즈된 둘(`eslint-config-nest`·`eslint-plugin-fsd`)은 **그대로 둔다.**

`typecheck` 스크립트가 각 패키지의 `tsconfig.json`과 `tests/tsconfig.json`을 **둘 다** 돌려야 테스트가 검사에 들어온다. 지금까지 `tsc`가 한 번도 돌지 않았으므로 **이 단계에서 기존 타입 오류가 드러날 수 있다** — 그것은 이 작업의 실패가 아니라 발견이다. 드러나면 완화 옵션으로 회피하지 말고 코드를 고친다.

### 4.4 루트 스크립트

```jsonc
{
  "build": "turbo run build",
  "test": "turbo run test",
  "test:e2e": "turbo run test:e2e",
  "typecheck": "turbo run typecheck",
  "lint": "turbo run lint:ox lint lint:root",
  "lint:root": "eslint .",
  "lint:ox": "oxlint",
  "lint:es": "turbo run lint lint:root",
  "lint:fix": "oxlint --fix && turbo run lint -- --fix && eslint . --fix",
  "devbak": "node packages/devkit-cli/dist/bin.js"
}
```

`lint:root`가 신설된다 — 루트 파일 전용 ESLint 실행이며 `//#lint:root` 태스크의 실체다. 이름이 `lint`가 아닌 것은 1.5절의 요구다.

**`lint:es`의 의미가 바뀐다.** 지금은 루트 `eslint .` 하나가 저장소 전체를 훑지만, 재편 후에는 루트 설정이 `packages/**`를 무시하므로 그것만으로는 패키지를 덮지 못한다. 따라서 `turbo run lint lint:root`로 바꿔 **"ESLint만 전부 돌린다"는 원래 의도**를 유지한다.

`lint:ox`·`lint:es`를 남기는 이유는 결정 2.1-6이다 — 두 린터를 각각 돌리는 진단 경로가 turbo 뒤로 숨으면 안 된다.

---

## 5. 에러 처리

| 상황 | 동작 |
| --- | --- |
| `multiple candidate TSConfigRootDirs` | **설계 실패다.** 3.1절의 격리가 깨졌다는 뜻이므로 되돌아가 원인을 찾는다 |
| 패키지 테스트 수 합계가 362와 다름 | `include` 패턴이 파일을 놓쳤다. 패턴을 고친다 |
| `typecheck`에서 새 타입 오류 | 4.3절 — 발견이다. 코드를 고친다 |
| turbo 캐시가 안 걸림 | `globalDependencies`·`outputs` 선언을 점검한다 |

---

## 6. 테스트 전략

turbo 도입 자체는 새 단위 테스트를 만들지 않는다. **검증은 기존 스위트의 결과가 보존되는지와, 캐시가 실제로 작동하는지로 한다.**

| 층 | 확인 |
| --- | --- |
| 1 | `pnpm test`가 **362개 전부 통과** |
| 2 | `pnpm lint` 에러 0, `multiple candidate` 없음 |
| 3 | `pnpm build` 산출물이 이전과 동일 |
| 4 | 두 번째 실행이 `>>> FULL TURBO`로 즉시 종료 |
| 5 | **한 패키지만 고치면 그 패키지 태스크만 재실행** |
| 6 | `pnpm test:e2e`가 e2e만 돌리고 기본 `pnpm test`에 섞이지 않음 |

5번이 이 작업의 존재 이유다. 캐시가 작동하지 않으면 설정 파일만 14개 늘린 셈이 된다.

---

## 7. 완료 기준

1. `turbo.json`·`eslint.base.mjs`가 있고 패키지 7개가 각자 `eslint.config.mjs`·`vitest.config.ts`를 갖는다.
2. 루트 `vitest.config.ts`·`vitest.e2e.config.ts`가 삭제됐다.
3. 6절 6개 항목이 전부 통과한다.
4. `pnpm lint:ox`·`pnpm lint:es` 진단 경로가 살아 있다.
5. 한 패키지만 골라 검사할 수 있다(`turbo run test --filter=@devbak/tsconfig`).
6. README에 새 명령과 캐시 동작이 반영됐다.

---

## 8. 미결 사항 / follow-up

- **생성되는 `monorepo` 레시피 개선** — 이 작업에서 얻은 관습(루트 태스크 분리, `test:e2e` 비캐시 등)을 템플릿에 반영할지 별도로 판단한다.
- **원격 캐시** — 협업자가 생기거나 CI가 느려지면 그때.
- **`typecheck`를 CI 게이트에 넣을지** — 지금 이 저장소에는 CI가 없다. 생기면 그때 정한다.
