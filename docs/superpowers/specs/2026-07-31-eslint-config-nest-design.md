# eslint-config-nest — 설계 문서

- 날짜: 2026-07-31
- 상태: 확정 (구현 대기)
- 목표: NestJS 백엔드용 ESLint 공유 설정을 모노레포의 새 패키지 `eslint-config-nest`로 제공한다. 검증 라이브러리는 zod를 전제하며, ESLint 10 전용이다.

---

## 1. 배경 & 범위

이 모노레포는 지금까지 `eslint-plugin-fsd`(프론트엔드 Feature-Sliced Design 강제) 하나만 담고 있었다. NestJS 백엔드에도 쓸 린트 설정이 필요해졌다.

### 범위

- 새 패키지 `packages/eslint-config-nest`
- 단일 export — flat config 배열 하나
- `typescript-eslint` 타입 인식 베이스라인 + Nest 관용구 조정 + `eslint-plugin-zod`
- 픽스처 기반 런타임 테스트
- **저장소 자체 린트 설정 수정** — `eslint.config.mjs`와 `.oxlintrc.json` 양쪽의 무시 목록에 테스트 픽스처를 추가한다(7절)
- README

### 명시적 비범위

- **`eslint-plugin-fsd` 규칙 포함** — NestJS 구조에서 오탐한다(2절)
- **`class-validator` 기반 린팅** — 이 스택은 zod를 쓴다(3절)
- oxlint 설정 동봉 — `eslint-plugin-zod`가 oxlint jsPlugins를 지원하지만 JSON 설정은 조립 방식이 달라 스코프가 두 배가 된다. 향후 과제(9절)
- ESLint 9 지원 — 10 전용
- 커스텀 아키텍처 규칙(`Controller는 thin` 등) — 기성 규칙으로 불가능하며 config가 아니라 plugin 규모의 별도 프로젝트다

---

## 2. 왜 `eslint-plugin-fsd`에 서브패스로 넣지 않는가

`/react`·`/next` 프리셋과 같은 패턴을 쓸 수 없다. FSD 규칙이 NestJS의 전형적인 폴더 구조에서 **실제로 오탐하기 때문**이다.

`plugin.configs.recommended`를 NestJS 형태 경로에 실제로 돌려 확인했다(추측 아님):

| 경로 / import | 결과 |
|---|---|
| `src/entities/user.entity.ts` → `./order.entity` | ❌ `fsd/no-cross-imports` |
| `src/entities/user/user.entity.ts` → `../order/order.entity` | ❌ `no-cross-imports`, `no-public-api-sidestep` |
| `src/features/billing/billing.service.ts` → `../user/user.service` | ❌ 2건 |
| `src/shared/util.ts` → `../features/billing/billing.service` | ❌ `no-higher-level-imports`, `no-public-api-sidestep` |
| `src/modules/user/user.service.ts` → `../order/order.service` | ✅ 무반응 |
| `src/common/`, `src/app.module.ts` | ✅ 무반응 |

원인: **`entities`와 `shared`는 FSD 레이어명이면서 동시에 NestJS에서 가장 흔한 폴더명**이다. TypeORM 프로젝트는 거의 항상 `src/entities/`를 두고, 엔티티끼리 서로 참조하는 것은 관계 매핑에 필수다. FSD는 그것을 "형제 슬라이스 간 직접 import"로 보고 에러를 낸다.

FSD는 프론트엔드 방법론이고 `pages`·`widgets` 레이어는 백엔드에서 의미가 없다. 따라서 별도 패키지로 분리한다. `eslint-config-nest`를 쓰는 사람이 FSD 플러그인을 설치할 이유도 없다.

---

## 3. 상류 조사 결과 (2026-07-31 기준)

| 패키지 | 버전 | ESLint 10 peer | 채택 |
|---|---|---|---|
| `typescript-eslint` | 8.65.0 | ✅ `^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` | ✅ |
| `eslint-plugin-zod` | 4.9.0 | ✅ `^9 \|\| ^10` | ✅ |
| `@darraghor/eslint-plugin-nestjs-typed` | 7.2.9 | `>=9.18.0` (무제한) | ❌ 제외 |

### 3.1 `@darraghor/eslint-plugin-nestjs-typed` 제외

두 가지 이유다.

1. **가치의 대부분이 class-validator 데코레이터 DTO 규칙**이다(`validated-non-primitive-property-needs-type-decorator` 등). 이 스택은 zod를 쓰므로 그 규칙들이 발화할 대상 자체가 없다. `class-validator`를 필수 peer로 요구하는데 쓰지도 않는 라이브러리를 설치하게 된다.
2. peer가 `eslint: ">=9.18.0"`으로 **무제한 상한**이다. `eslint-plugin-fsd` 작업에서 무제한/뒤처진 peer 선언을 낙관했다가 실제로는 ESLint 10에서 크래시하는 플러그인을 만난 적이 있다(`eslint-plugin-react`). 검증 없이 신뢰하지 않는다.

### 3.2 `eslint-plugin-zod` 채택

- 규칙 40개, `configs.recommended`에 30개
- peer `eslint`/`oxlint`/`zod`가 **전부 optional** — 우리가 필수로 올려 쓰면 되고, 상류가 강요하는 의존이 없다
- peer에 `^10`을 **명시**한다. 무제한 `>=`가 아니다
- ESLint와 oxlint 양쪽에서 동작(oxlint 통합은 이번 범위 밖)

DTO 실수를 실제로 잡는 규칙 예: `no-any-schema`, `no-optional-and-default-together`, `require-error-message`, `prefer-strict-object`.

---

## 4. 핵심 설계 결정

### 4.1 단일 export, zod는 필수 peer

`eslint-plugin-fsd`는 optional peer를 모듈 경계(서브패스)로 보증해야 했다. 여기서는 그 문제가 없다 — 모든 peer가 필수이므로 `.` 하나만 내보낸다.

zod를 optional로 만들고 `.`/`./zod`로 나누는 안도 검토했으나, zod를 쓰지 않는 사람은 애초에 이 패키지를 쓰지 않는다. 쓰이지 않을 분기를 미리 만드는 것은 과설계다.

### 4.2 켜는 것만큼 **끄는 것**이 이 패키지의 값어치다

`recommendedTypeChecked`를 그대로 NestJS에 적용하면 프레임워크 관용구와 충돌한다. Nest는 생성자 파라미터 프로퍼티(`constructor(private readonly svc: Svc)`), 데코레이터만 있는 빈 클래스(`@Module({}) export class AppModule {}`), 메서드 참조 전달을 일상적으로 쓴다.

**어떤 규칙이 실제로 충돌하는지는 추측으로 정하지 않는다.** 구현 단계에서 7절의 Nest 픽스처에 베이스라인을 그대로 돌려 **실제로 발화하는 것만** 끈다. 끄는 규칙마다 주석으로 어떤 Nest 관용구 때문인지 남긴다.

이 원칙이 중요한 이유: 추측으로 규칙을 끄면 잡을 수 있었던 버그를 잃고, 추측으로 남겨두면 설정이 쓸 수 없게 된다. 둘 다 실측으로만 갈린다.

**결정 절차 (구현 단계에서 그대로 따른다):**

1. 베이스라인(`recommendedTypeChecked` + zod recommended)만 켠 상태로 픽스처의 관용구 파일을 린트한다.
2. 발화한 규칙을 전부 기록한다.
3. 각각에 대해 판단한다 — 이 발화가 (a) Nest 관용구를 잘못 지적한 오탐인가, 아니면 (b) 픽스처 코드가 실제로 나쁜가. (b)면 규칙을 끄지 말고 픽스처를 고친다.
4. (a)로 판정된 것만 끄고, 주석에 어떤 관용구 때문인지 적는다.
5. 다시 린트해 관용구 파일 에러 0건을 확인한다.

**확인 대상 후보** (발화 여부는 실측으로 확정하며, 이 목록에 없다고 넘어가지 않는다).

> **2026-07-31 정정:** 초판은 아래 여섯 개를 나란히 나열했으나, 그중 **셋은 `recommendedTypeChecked`에 애초에 포함되지 않는다**(실측 확인). 베이스라인에 없는 규칙은 발화할 수 없으므로 "발화하지 않았다"가 아무것도 증명하지 않는다. 이 구분을 흐린 채로 두면 음성 결과가 실제보다 강해 보인다.

| 후보 | 베이스라인 포함 | 대상 관용구 |
|---|---|---|
| `@typescript-eslint/unbound-method` | ✅ error | 메서드 참조 전달 |
| `@typescript-eslint/no-unsafe-*` | ✅ error | 데코레이터 메타데이터, 느슨한 요청 바디 |
| `@typescript-eslint/require-await` | ✅ error | 구현이 아직 동기인 `async` 핸들러 |
| `@typescript-eslint/no-extraneous-class` | ❌ 미포함(`strict`) | 데코레이터만 있는 `@Module` 클래스 |
| `@typescript-eslint/parameter-properties` | ❌ 미포함(`stylistic`) | 생성자 파라미터 프로퍼티 |
| `@typescript-eslint/no-empty-function` | ❌ 미포함(`stylistic`) | 빈 생성자 |

**따라서 "충돌 없음" 결과를 서술할 때는 범위를 명시해야 한다** — "베이스라인이 실제로 켜는 규칙 중, 이 픽스처가 노출하는 패턴에 대해 충돌이 없었다"이지 "NestJS와 완전히 호환됨을 증명했다"가 아니다. 픽스처가 노출하지 않는 위험군(대표적으로 `@Body()` DTO 같은 느슨한 타입 경로에서의 `no-unsafe-*`)은 미시험 상태로 남는다.

### 4.3 Nest에서 가장 값어치 있는 규칙

`@typescript-eslint/no-floating-promises`. Nest는 서비스·리포지토리 호출이 전부 `Promise`라 `await` 하나를 빠뜨리면 에러가 조용히 삼켜지고 트랜잭션 경계가 어긋난다. 컴파일은 통과하므로 타입 체커도 잡지 못한다. `no-misused-promises`, `require-await`이 같은 계열이다.

이 셋은 `recommendedTypeChecked`에 이미 들어 있지만, config에 **명시적으로 다시 적는다** — 상류가 recommended 구성을 바꿔도 이 셋만은 유지된다는 의도를 코드로 고정하기 위해서다.

### 4.4 테스트 파일 완화

`*.spec.ts`, `*.e2e-spec.ts`는 별도 config 객체로 일부 규칙을 완화한다. jest 모킹이 `@typescript-eslint/unbound-method` 같은 규칙을 건드리기 때문이다. 어떤 규칙을 완화할지도 4.2와 같이 픽스처 실측으로 정한다.

---

## 5. 패키지 매니페스트

```jsonc
{
  "name": "eslint-config-nest",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist"],
  "scripts": { "build": "tsup" },
  "peerDependencies": {
    "eslint": "^10.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-plugin-zod": "^4.0.0",
    "zod": "^4.0.0"
  }
}
```

`peerDependenciesMeta`는 없다 — optional peer가 하나도 없다.

`eslint`를 `^10.0.0`으로 못박는다. `eslint-plugin-fsd`는 `^9.0.0 || ^10.0.0`을 선언하지만 v9에서 검증한 적이 없다는 지적을 최종 리뷰에서 받았다. 이 패키지는 그 문제를 애초에 만들지 않는다.

빌드는 tsup(`entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`), tsconfig는 `tsconfig.base.json`을 extends — 기존 패키지와 동일하다.

---

## 6. 타입 인식 배선

config가 `languageOptions.parserOptions.projectService: true`를 직접 켠다. `tsconfigRootDir`는 공유 설정이 알 수 없지만 typescript-eslint v8의 기본값이 `process.cwd()`라, 프로젝트 루트에서 `eslint .`를 실행하는 통상적 사용에서 그대로 동작한다.

팩토리 함수(`nest({ tsconfigRootDir })`)도 검토했으나 API 무게 대비 이득이 작아 채택하지 않는다. README에 필요 시 consumer가 직접 얹는 법을 적는다.

**consumer는 tsconfig가 있어야 한다.** 타입 인식 설정의 본질적 요구사항이며 README에 명시한다.

---

## 7. 테스트 전략 — 픽스처 없이는 검증할 수 없다

`eslint-plugin-fsd` 작업에서 구조 단언 9개가 모두 통과한 상태로 런타임 크래시를 놓쳤고, 뒤이은 런타임 검증조차 두 프리셋 중 하나만 돌려 나머지의 파싱 실패를 놓쳤다. 같은 실패를 반복하지 않는다.

**타입 인식 규칙은 실제 파일과 tsconfig 없이 테스트할 수 없다.** `lintText`만으로는 부족하므로 디스크에 픽스처를 둔다.

```
packages/eslint-config-nest/tests/
  fixtures/nest-app/
    tsconfig.json
    src/            Nest 형태 소스 (관용구 + 의도적 위반)
  config.test.ts
```

| 검증 항목 | 지키는 것 |
|---|---|
| config 배열이 fatal 없이 로드된다 | 조립 자체 |
| `no-floating-promises`가 await 누락 서비스 호출에서 **발화한다** | 4.3 — 이 패키지의 존재 이유 |
| zod 규칙이 위반 스키마에서 발화한다 | zod 통합 |
| **Nest 관용구 파일에서 에러가 0건이다** | 4.2 오탐 가드 |

마지막 항목이 핵심이다. 생성자 파라미터 프로퍼티, `@Module` 빈 클래스, `@Controller`/`@Injectable` 데코레이터, DI 주입이 모두 깨끗해야 한다. 이 가드가 깨지면 설정 자체를 쓸 수 없다.

픽스처는 `vitest.config.ts`의 `include`(`packages/*/tests/**/*.test.ts`)에 걸리지 않는다 — 픽스처 소스는 `*.test.ts`가 아니기 때문이다.

**저장소 자체 린트에서는 반드시 제외해야 한다.** 픽스처는 의도적으로 규칙을 위반하는 파일이라 검사 대상이 되면 `pnpm lint`가 깨진다. 그리고 **두 린터 모두** 손봐야 한다:

- `eslint.config.mjs`의 `ignores`에 `**/tests/fixtures/**` 추가. ESLint는 `.gitignore`를 읽지 않고, 픽스처는 커밋되므로 반드시 명시해야 한다. 여기에 더해 픽스처가 어떤 tsconfig에도 속하지 않으면 `projectService`가 실패하므로 제외는 선택이 아니라 필수다.
- `.oxlintrc.json`의 `ignorePatterns`에 같은 패턴 추가. oxlint는 gitignore를 존중하지만 픽스처는 **git에 커밋되므로** ignore되지 않는다. 명시하지 않으면 oxlint가 픽스처를 검사한다.

---

## 8. 문서

README에 다음을 적는다.

- 설치와 필요한 peer 4개
- 사용 예시(`import nest from 'eslint-config-nest'; export default [...nest];`)
- **tsconfig가 필요하다는 요구사항**과 `tsconfigRootDir`를 직접 얹는 법
- 무엇을 켜는지: 타입 인식 베이스라인, Nest 치명 규칙 3종, zod recommended 30개
- **무엇을 왜 껐는지** — 각 항목마다 어떤 Nest 관용구 때문인지
- zod가 필수라는 점과 그 이유(class-validator 미지원)

---

## 9. 미결 사항 / 향후

- oxlint 설정 동봉. `eslint-plugin-zod`가 oxlint jsPlugins를 지원하므로 이 저장소의 하이브리드 패턴을 consumer에게도 줄 수 있다. 별도 사이클로 진행한다.
- 커스텀 아키텍처 규칙(`Controller는 thin`, `Controller가 Repository를 직접 주입받지 않는다`)은 plugin 규모의 별도 프로젝트다.
- `@darraghor/eslint-plugin-nestjs-typed`는 class-validator 스택으로 옮기거나 그쪽 규칙이 zod를 지원하면 재검토한다.
- CI 매트릭스. 이 패키지는 ESLint 10 전용이므로 매트릭스가 단순하다.
