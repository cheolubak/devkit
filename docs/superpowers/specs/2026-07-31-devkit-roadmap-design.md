# @devbak devkit — 로드맵 및 Phase 1·2 설계 문서

- 날짜: 2026-07-31
- 개정: 2026-07-31 — 초판은 `packages/eslint-config-nest`가 없는 저장소 상태를 전제로 작성됐다. 작성 중 `git rebase origin/main`으로 해당 패키지와 그 설계 문서가 들어오면서 로드맵 순서를 뒤집었다(3.2절). 초판의 Phase 1(`eslint-plugin-nest-arch`)은 Phase 2로 내려갔다.
- 개정: 2026-07-31 — **배포를 목표에서 제외**한다. npm publish 대신 로컬 링크로 소비한다(2.1·4.3절). 이로써 초판이 유일한 블로커로 지목했던 배포 경로 미결이 해소됐다.
- 상태: 확정
- 목표: 이 저장소를 ESLint 패키지 모음에서, Next.js/React 프론트엔드와 NestJS 백엔드를 함께 지원하는 개발 표준 툴킷(`@devbak/*`) 모노레포로 확장한다.

이 문서는 두 층위를 담는다. 3절은 **전체 로드맵**이고, 4~5절은 **Phase 1·2의 상세 설계**다. Phase 3~4는 각 단계에 도달할 때 자체 설계 문서를 갖는다(3.4절).

---

## 1. 배경 & 실측 근거

### 1.1 저장소 현재 자산

| 패키지 | 상태 | 역할 |
| --- | --- | --- |
| `@devbak/eslint-plugin-fsd` | 완성, 배포 대기 | 프론트엔드 FSD 경계 강제 규칙 3개 + `/react`·`/next` 프리셋 |
| `@devbak/eslint-config-nest` | 완성, 배포 대기 | NestJS용 타입 인식 ESLint 공유 설정 + `eslint-plugin-zod` |

두 패키지 모두 `npm login` 미완료로 아직 배포되지 않았고, **소비자 프로젝트가 하나도 없다.** 이것이 로드맵 순서를 결정한 핵심 사실이다(3.2절).

### 1.2 소비자 프로젝트 스캔 (2026-07-31, `~/Documents/develop` 28개 프로젝트)

| 항목 | 실태 |
| --- | --- |
| `prettier@3` | 16개 프로젝트가 각자 설정을 보유 — 공통분모 1위 |
| `typescript@5` | 사실상 전부. `tsconfig`는 전부 제각각 |
| ESLint | **8(6개) / 9(9개) / 10(2개)로 3중 파편화** |
| NestJS | `@nestjs/core@10` 3개(`account-api`, `devlog-api`, `eungam-api`) — **전부 `eslint@8` + legacy `.eslintrc.js`** |
| 테스트 러너 | 프론트 = `vitest@3~4`, 백엔드 = `jest@29~30`으로 깔끔히 갈림 |
| ORM | Prisma 6·7 + TypeORM 0.x 혼재 |
| 모던 프론트 클러스터 | `next@16 + react@19 + tailwind@4` 5개 vs 레거시 `next@14 + react@18 + tailwind@3` 2개 |

### 1.3 NestJS 프로젝트 실측 (규칙 설계의 직접 근거)

세 프로젝트를 계측한 결과가 규칙 후보를 크게 걸러냈다.

- **파일 네이밍은 Nest CLI 관습을 따른다** — `*.controller.ts`(12), `*.service.ts`(26), `*.module.ts`(19), `*.dto.ts`(21), `*.entity.ts`(14), `*.guard.ts`(4). 다만 `devlog-api/src/posts/services/`처럼 하위 폴더로 갈리는 경우가 있어 **경로 기반 판정은 취약하다**.
- **배럴(`index.ts`)이 세 프로젝트 통틀어 0개다.** → FSD의 `no-public-api-sidestep`에 대응하는 "모듈 Public API 경유 강제" 규칙은 현실과 정면으로 어긋난다. **채택하지 않는다**(5.4절).
- **`class-validator`를 아예 쓰지 않는다.** 대신 `@Body(new ZodValidationPipe(schema)) dto: SocialLoginDto` 패턴이 지배적이다. 이는 `eslint-config-nest` 설계 문서 3절이 zod를 전제로 삼은 것과 독립적으로 같은 결론에 도달한 실측이며, 두 문서가 서로를 뒷받침한다.
- **`AppController`가 `PrismaService`를 직접 주입한다**(`devlog-api/src/app.controller.ts`). 헬스체크 목적이라 회색지대이지만, 규칙 R1의 실제 검출 사례이자 탈출구 설계의 근거다.
- `process.env` 직접 접근은 생성 코드를 빼면 `main.ts`, `telemetry/setup.ts`, `prisma.service.ts` 세 곳뿐이며 대부분 정당한 부트스트랩이다. → 규칙 R4의 실효는 예방적이며, `recommended`에서 **`warn`**으로 둔다.

---

## 2. 범위 결정

### 2.1 소비자 · 배포 모델

- 소비자는 **작성자 본인의 개인 프로젝트들**이고, 부차 목표는 **설계 깊이를 보여주는 포트폴리오**다.
- 사내 표준화나 타인 강제는 목표가 아니다. 따라서 **옵션을 최소화하고 취향을 명시적으로 박은(opinionated) 설계**를 택한다. 범용성을 위한 확장점은 실제 필요가 생길 때만 추가한다(YAGNI).
- **배포하지 않는다.** npm publish는 목표가 아니며, 소비는 로컬 링크로 한다(4.2절). 이 결정이 갖는 실질적 의미는 두 가지다.
  - **버전 관리 부담이 사라진다.** semver, 변경 로그, 하위 호환 유지, 배포 전 검증 매트릭스가 전부 불필요해진다. 규칙을 바꾸고 싶으면 바꾸고 소비자 3개를 고치면 끝이다.
  - **대신 "빌드 산출물이 최신인가"라는 새 운영 요구사항이 생긴다**(4.2절). 레지스트리가 하던 일을 사람이 해야 한다.
- `package.json`의 `publishConfig.access`·`prepublishOnly`·`files`는 **그대로 둔다.** 지금은 휴면 상태지만 제거 비용과 나중에 되살리는 비용이 둘 다 있고, 남겨두는 비용은 0이다.

### 2.2 명시적 비범위

- **npm 배포 및 그에 딸린 일체** — semver 정책, 변경 로그, CI 배포 파이프라인, ESLint 버전 지원 매트릭스
- private registry / Verdaccio 같은 로컬 레지스트리 — 소비자가 3~5개뿐이라 링크로 충분하다
- 타인을 위한 광범위한 설정 옵션 · 마이그레이션 가이드
- ESLint 9 이하 지원 — 소비자 프로젝트를 10으로 올리는 쪽을 택한다(Phase 1). `eslint-config-nest`가 이미 `^10.0.0` 전용이므로 선택의 여지가 없다.

---

## 3. 전체 로드맵

### 3.1 단계

```
Phase 1  소비자 활성화                       (2~3일)
         NestJS 3개 프로젝트를 link: 로 연결 + ESLint 8 → 10 flat config 마이그레이션
         + @devbak/{tsconfig, prettier-config, jest-config}
         (vitest-config는 프론트를 손대는 시점에 — 4.6절)
   │
   └─▶ Phase 2  @devbak/eslint-plugin-nest-arch   (1~2주)
          │        아키텍처 경계 규칙 4개
          │
          └─▶ Phase 3  @devbak/devkit-cli          (3~5일)
                 │        코드 제너레이터
                 │
                 └─▶ Phase 4  create-devbak-app     (2~3일)
                          프로젝트 스캐폴딩
```

### 3.2 왜 순서를 뒤집었는가

이 문서 초판은 `eslint-plugin-nest-arch`를 Phase 1로 놓았다. `eslint-config-nest`의 존재를 확인한 뒤 뒤집었고, 이유는 세 가지다.

1. **이미 만든 물건이 아무 데서도 쓰이지 않고 있다.** `eslint-config-nest`는 픽스처 런타임 테스트까지 갖춘 완성품인데 소비자가 0이다. 소비자를 만들기 전에 새 패키지를 하나 더 만들면 **쓰이지 않는 패키지가 둘**이 된다. 툴킷의 가치는 패키지 수가 아니라 적용된 프로젝트 수다.
2. **마이그레이션이 Phase 2의 필수 입력을 만든다.** `eslint-config-nest` 설계 문서 4.2절은 "어떤 규칙이 충돌하는지는 추측으로 정하지 않고 픽스처 실측으로 정한다"는 원칙을 세웠고, 같은 문서 4.2절 말미에서 **픽스처가 노출하지 못하는 위험군이 미시험으로 남는다**고 스스로 한계를 적었다. 실제 3개 프로젝트에 돌리는 것이 그 공백을 메우는 유일한 방법이며, 동시에 Phase 2의 오탐 기준선(6.3절)을 만든다.
3. **Phase 1이 훨씬 싸다.** 2~3일 대 1~2주다. 싸고 선행 정보를 만드는 작업을 뒤로 미룰 이유가 없다.

### 3.3 Phase 3·4를 뒤에 두는 이유

1. **스캐폴딩은 설정 패키지의 소비자다.** Phase 1 없이 Phase 4를 만들면 CLI 템플릿 안에 `tsconfig`·`eslint.config.mjs` 내용을 하드코딩하게 되고, 나중에 Phase 1을 하면 전부 다시 써야 한다.
2. **스캐폴딩은 제너레이터의 얇은 래퍼다.** `create-devbak-app`은 본질적으로 "빈 디렉토리에서 제너레이터를 여러 번 돌리는 것"이다. Phase 3을 먼저 만들면 Phase 4는 작아지고, 반대로 하면 템플릿 로직을 두 번 쓴다.

### 3.4 각 단계는 자체 스펙을 갖는다

이 문서는 Phase 1·2만 구현 가능한 수준으로 상세화한다. Phase 3~4를 지금 같은 깊이로 쓰지 않는 이유는, **앞 단계를 수행하며 얻는 정보가 뒤 단계의 설계를 바꾸기 때문**이다. Phase 2를 이 문서에 함께 담는 것은 초판에서 이미 상세 설계를 마쳤고 Phase 1의 산출물이 그 설계를 뒤집지는 않기 때문이다 — 다만 6.3절의 드라이런 결과에 따라 규칙이 좁혀지거나 기각될 수 있다.

---

## 4. Phase 1 — 소비자 활성화

### 4.1 목표

`@devbak/eslint-config-nest`가 실제 프로젝트에서 돌아가게 만들고, 그 과정에서 반복적으로 필요해지는 설정을 패키지로 추출한다. **패키지를 먼저 설계하고 적용하는 것이 아니라, 적용하면서 중복을 발견해 추출한다.** 순서가 반대면 쓰이지 않는 옵션이 붙는다.

### 4.2 소비 방식 — 로컬 링크

배포하지 않으므로 소비자가 패키지를 어떻게 찾을지를 설계해야 한다. 소비자 프로젝트는 전부 `~/Documents/develop/` 바로 아래에 있고 툴킷 저장소도 같은 위치(`~/Documents/develop/eslint`)이므로 **상대 경로가 안정적**이다.

**pnpm `link:` 프로토콜**을 쓴다.

```jsonc
// devlog-api/package.json
{
  "devDependencies": {
    "@devbak/eslint-config-nest": "link:../eslint/packages/eslint-config-nest"
  }
}
```

`link:`는 심볼릭 링크를 걸므로 툴킷을 고치면 **재설치 없이 즉시 반영된다.** 개발 중인 패키지를 소비하면서 동시에 고치는 지금 상황에 정확히 맞는다.

#### 반드시 지켜야 할 운영 요구사항: `dist`가 최신이어야 한다

이 방식에는 함정이 하나 있고, 반드시 문서화해야 한다.

패키지들은 `main`/`exports`가 `./dist/*`를 가리키고 **`dist`는 `.gitignore` 대상**이다. 배포 경로에서는 `prepublishOnly: "pnpm build"`가 이를 보장했지만, **`link:` 의존은 어떤 라이프사이클 스크립트도 실행하지 않는다.** 따라서:

- 툴킷 저장소에서 `pnpm build`를 하지 않으면 소비자 쪽 ESLint가 **모듈 해석 실패로 죽는다.**
- 툴킷 소스를 고치고 빌드하지 않으면 소비자는 **조용히 옛 규칙으로 린트한다.** 이쪽이 더 위험하다 — 에러가 아니라 잘못된 통과를 만든다.

대응은 두 가지다.

1. 툴킷 저장소 루트에 `dev` 스크립트(`tsup --watch`)를 두고, 소비자를 손볼 때는 켜 둔다.
2. 소비자의 `lint` 스크립트가 툴킷 빌드에 의존하게 만들지 **않는다** — 저장소 경계를 넘는 스크립트 의존은 소비자를 툴킷 없이는 못 쓰는 물건으로 만든다. 대신 4.7절 완료 기준에 "빌드 후 검증"을 명시한다.

#### 채택하지 않은 대안

| 대안 | 기각 사유 |
| --- | --- |
| `file:` 프로토콜 | pnpm에서 디렉토리 대상 `file:`은 `link:`와 사실상 같게 동작해 구분 실익이 없다. 의도가 더 분명한 `link:`를 쓴다 |
| `pnpm link --global` | 전역 상태에 의존해 어떤 프로젝트가 무엇에 연결됐는지 `package.json`에 남지 않는다. 반년 뒤 자신이 추적 불가능해진다 |
| `pnpm pack` + tarball | 재현 가능하지만 고칠 때마다 pack·재설치가 필요하다. 활발히 개발 중인 지금은 마찰이 이득보다 크다 |
| git 의존성 (`github:...`) | npm/pnpm이 저장소 **하위 디렉토리** 패키지를 안정적으로 지원하지 않는다. 모노레포라 불가 |

### 4.3 마이그레이션 대상과 순서

`devlog-api` → `account-api` → `eungam-api` 순으로 한 번에 하나씩 진행한다.

`devlog-api`를 먼저 하는 이유는 **가장 크고 가장 복잡하기 때문**이다(소스 파일 수 최다, Prisma 7, zod, e2e 테스트에 docker-compose, telemetry). 여기서 막히는 것은 나머지 둘에서도 막히므로, 가장 어려운 것을 먼저 해서 문제를 일찍 드러낸다.

각 프로젝트에서 수행할 것:

1. 툴킷 저장소에서 `pnpm build` 선행 (4.2절)
2. `eslint@8` → `^10`, `@typescript-eslint/*@7` 개별 패키지 → `typescript-eslint@^8` 통합 패키지로 교체
3. `@devbak/eslint-config-nest`를 `link:`로 추가하고, 그 패키지의 필수 peer 4개(`eslint`, `typescript-eslint`, `eslint-plugin-zod`, `zod`)를 소비자에 설치. `zod`는 세 프로젝트 중 `devlog-api`에만 이미 있다
4. `.eslintrc.js` 삭제, `eslint.config.mjs` 신규 작성 — 내용은 `@devbak/eslint-config-nest` spread 한 줄이 기본
5. **`eslint-plugin-prettier`와 `eslint-config-prettier` 제거** (4.5절)
6. `pnpm lint` 실행 후 위반 전수 분류 (4.4절)
7. `package.json`의 `lint` 스크립트를 flat config 방식으로 교체 — 현재 `eslint "{src,apps,libs,test}/**/*.ts" --fix`처럼 glob을 넘기는데, flat config에서는 `eslint .`과 설정 파일의 `files`/`ignores`로 대상을 정하는 것이 정석이다

3번은 주의가 필요하다. `eslint-config-nest`는 peer 4개가 **전부 필수**이고 `peerDependenciesMeta`가 없다(그 설계 5절). `link:` 의존은 peer 자동 설치가 레지스트리 설치와 다르게 동작할 수 있으므로, 링크 후 실제로 해석되는지 확인한 뒤 다음 단계로 넘어간다.

### 4.4 위반 분류 — 이 단계의 진짜 산출물

마이그레이션 후 나오는 위반을 **한 건씩** 세 갈래로 판정하고 기록한다.

| 판정 | 조치 |
| --- | --- |
| (a) 실제 결함 | 코드를 고친다 |
| (b) Nest 관용구 오탐 | `eslint-config-nest`의 규칙 조정에 반영하고, 픽스처에 해당 관용구를 추가한다 |
| (c) 프로젝트 고유 사정 | 해당 프로젝트의 `eslint.config.mjs`에서 로컬 완화. 공유 설정을 건드리지 않는다 |

(b)가 나오면 `eslint-config-nest`가 개정되므로, 이 단계는 **그 패키지의 실전 검증이기도 하다.** 특히 그 문서 4.2절이 미시험으로 남겨둔 `@Body()` DTO 경로의 `no-unsafe-*` 계열이 실제로 어떻게 나오는지가 여기서 처음 드러난다.

`no-floating-promises`(그 문서가 "이 패키지의 존재 이유"로 지목한 규칙)가 실제 프로젝트에서 몇 건을 잡는지는 이 단계의 가장 흥미로운 지표다. 결과를 `work-log.md`에 남긴다.

### 4.5 `eslint-plugin-prettier` 제거의 근거

`devlog-api`는 `eslint-plugin-prettier` + `eslint-config-prettier` 조합으로 포맷 위반을 ESLint 에러로 띄운다. 이를 걷어내는 것은 취향이 아니다.

- 린터가 포매터 일을 대신하면서 린트를 느리게 만드는 알려진 안티패턴이다. 포맷 차이 하나마다 ESLint 에러 객체가 생성된다.
- 이 저장소가 이미 채택한 oxlint 하이브리드의 방향(빠른 린터를 먼저 실패시켜 느린 ESLint를 아낀다)과 정면으로 어긋난다.
- `eslint-config-nest`는 타입 인식 설정이라 이미 느리다. 여기에 포맷 검사를 얹으면 체감이 나빠진다.

포맷은 `prettier --check`(CI)와 `prettier --write`(로컬)로 분리한다.

### 4.6 추출할 설정 패키지

마이그레이션 중 **세 프로젝트에서 반복되는 것만** 패키지로 뽑는다. 한 곳에서만 필요한 것은 뽑지 않는다.

| 패키지 | 서브패스 | 근거 |
| --- | --- | --- |
| `@devbak/tsconfig` | `/nest`, `/next`, `/lib` | 28개 프로젝트가 전부 제각각(1.2절) |
| `@devbak/prettier-config` | 단일 | 16개 프로젝트가 각자 보유 — 공통분모 1위 |
| `@devbak/jest-config` | `/nest`, `/nest-e2e` | NestJS 3개 모두 jest이며 e2e 설정이 별도 파일로 중복 |
| `@devbak/vitest-config` | `/next`, `/node` | 프론트 4개가 vitest. **Phase 1에서는 만들지 않는다** — 이번 마이그레이션 대상이 백엔드뿐이라 반복을 실측할 수 없다. 프론트 프로젝트를 손대는 시점에 만든다 |

`@devbak/prettier-config`는 `prettier-plugin-tailwindcss` 포함 여부에서 프론트/백엔드가 갈린다. 백엔드에는 불필요하므로 **Phase 1에서는 플러그인 없는 단일 export만** 만들고, 프론트용 변형은 필요해질 때 서브패스로 추가한다.

### 4.7 Phase 1 완료 기준

- 툴킷 저장소에서 `pnpm build` 후, NestJS 3개 프로젝트에서 `pnpm lint` exit 0, `pnpm build` 성공, 기존 테스트 전부 통과
- **`dist`를 지우고 다시 빌드해도 3개 프로젝트가 정상 동작함** — `link:` 배선이 우연히 캐시된 산출물에 기대고 있지 않은지 확인하는 유일한 방법이다(4.2절)
- 위반 분류 결과가 `work-log.md`에 기록됨 — (a)/(b)/(c) 건수와 대표 사례
- (b)로 판정된 항목이 `eslint-config-nest` 픽스처에 회귀 테스트로 추가됨
- 추출한 설정 패키지가 3개 프로젝트에서 실제로 소비됨 (선언만 하고 미사용인 패키지가 없을 것)

---

## 5. Phase 2 — `@devbak/eslint-plugin-nest-arch`

`eslint-config-nest` 설계 문서 9절이 후속 과제로 명시한 것이다: *"커스텀 아키텍처 규칙(`Controller는 thin`, `Controller가 Repository를 직접 주입받지 않는다`)은 plugin 규모의 별도 프로젝트다."*

**config가 아니라 plugin인 이유**는 그 문서 1절 비범위가 적은 대로, 기성 규칙 조합으로는 불가능하고 AST를 직접 순회하는 커스텀 규칙이 필요하기 때문이다. 두 패키지의 역할 분담은 명확하다 — `eslint-config-nest`는 **기성 규칙을 어떻게 켜고 끄는가**를 담고, `nest-arch`는 **없는 규칙을 만든다**.

### 5.1 핵심 설계 결정: 데코레이터가 진실이다

`eslint-plugin-fsd`는 **경로 문자열**을 파싱해 레이어를 판정했다. FSD에서는 디렉토리가 곧 아키텍처이기 때문에 옳은 선택이었다.

NestJS는 다르다. 클래스의 역할을 선언하는 것은 경로가 아니라 **데코레이터**다 — `@Controller()`, `@Injectable()`, `@Module()`. 파일명 `*.controller.ts`는 Nest CLI의 관습일 뿐 프레임워크가 강제하지 않으며, 실측에서도 `src/posts/services/` 같은 변형이 나타났다(1.3절). `eslint-config-nest` 설계 2절이 보인 것처럼, NestJS 경로에 경로 기반 규칙을 들이대면 오탐이 난다.

**따라서 클래스의 역할은 오직 데코레이터로 판정한다. 파일명과 경로는 역할 판정에 쓰지 않는다.**

이 결정에는 큰 부수 효과가 있다. 데코레이터는 파일 안에 있으므로 **규칙이 단일 파일만 보면 되고, 타입 정보가 필요 없다.** 그 결과:

- 규칙이 빠르다 (`projectService` 불필요). 이는 `eslint-config-nest`가 이미 타입 인식이라 느리다는 점을 감안하면 중요하다 — 두 패키지를 함께 켜도 nest-arch가 추가로 느리게 만들지 않는다
- 소비자가 타입 인식 ESLint를 켜지 않아도 동작한다
- 크로스 파일 분석(예: `@Module.exports`에 등록됐는지 검증)은 원천적으로 범위 밖이 된다 — 이는 제약이 아니라 **의도적인 경계**다(5.4절)

#### 예외: 경로를 쓸 수밖에 없는 두 규칙

위 원칙은 **린트 중인 파일 안의 클래스**에 적용된다. 규칙 4개 중 둘은 판정 대상이 클래스가 아니라 파일 경계 자체이므로 경로를 쓴다.

- **R3(`no-cross-module-controller-import`)** 은 *import 대상*이 컨트롤러인지를 알아야 하는데, 그 클래스는 다른 파일에 있다. 데코레이터로 판정하려면 파일을 열어야 하고 그 순간 크로스 파일이 된다. 그래서 `*.controller.ts`라는 파일명 관습에 의존한다. 이 타협이 안전한 이유는 **오차가 한 방향으로만 나기 때문**이다 — 관습을 벗어난 컨트롤러는 *놓칠 뿐*(false negative), 컨트롤러가 아닌 것을 컨트롤러라고 *잘못 지목하지 않는다*(false positive). 6.3절의 오탐 0건 기준을 위협하지 않는다.
- **R4(`no-direct-env-access`)** 는 클래스가 아니라 표현식을 잡으며, 예외는 본질적으로 "부트스트랩 파일이냐"라는 파일 단위 질문이다.

R1·R2는 원칙 그대로 데코레이터만 쓴다.

### 5.2 규칙 판정에 쓰는 분류기

`lib/nest-class.ts`가 클래스 선언 하나를 받아 역할을 판정한다.

```
classifyNestClass(node: ClassDeclaration): NestRole | null

NestRole =
  | 'controller'   // @Controller() 가 붙음
  | 'provider'     // @Injectable() 이 붙고, 아래 인터페이스를 구현하지 않음
  | 'infra'        // @Injectable() 이 붙고 CanActivate / NestInterceptor /
                   // ExceptionFilter / PipeTransform / NestMiddleware 를 구현
  | 'module'       // @Module() 이 붙음
  | null           // Nest 클래스가 아님
```

`infra`를 `provider`와 분리하는 이유는, Guard·Interceptor·Filter·Pipe는 **HTTP 아티팩트를 다루는 것이 정상**이기 때문이다. 이를 구분하지 않으면 "서비스는 HTTP를 몰라야 한다" 계열 규칙이 전부 오탐이 된다. Phase 2에서는 그 계열 규칙을 채택하지 않지만(5.4절), 분류기는 follow-up을 위해 처음부터 이 구분을 갖는다.

### 5.3 규칙 목록

#### R1. `no-persistence-in-controller` (error)

- **목적**: Controller가 데이터 접근 계층을 건너뛰고 직접 호출하는 것을 막는다. `CLAUDE.md`의 "Controller는 thin"을 **객관적으로 판정 가능한 형태로 좁힌 것**이다.
- **대상**: `classifyNestClass === 'controller'`인 클래스의 생성자 파라미터 프로퍼티.
- **판정**: 파라미터의 타입 애노테이션이 `TSTypeReference`이고, 그 식별자 이름이 persistence 패턴에 매칭되면 report.
- **기본 패턴**: `PrismaService`, `PrismaClient`, `EntityManager`, `DataSource`, `Connection`, `/Repository$/`, `/^Model$/`(mongoose)
- **옵션**: `{ patterns?: string[], allow?: string[] }` — `patterns`는 기본값을 **대체**하고, `allow`는 예외 목록.

```ts
// ❌ 위반
@Controller('posts')
export class PostsController {
  constructor(private readonly prisma: PrismaService) {}
}

// ✅ 통과
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}
}
```

- **알려진 검출 사례**: `devlog-api/src/app.controller.ts`의 `AppController`가 헬스체크용으로 `PrismaService`를 주입한다. 이는 규칙이 옳게 발화한 것이며, 소비자는 `allow: ['PrismaService']`로 완화하기보다 **해당 라인에 `eslint-disable-next-line`과 사유를 적는 쪽**을 권장한다(전역 완화는 규칙을 무력화한다).
- **오탐 리스크**: 타입 이름 기반 휴리스틱이므로, 서비스 클래스 이름이 우연히 `Repository`로 끝나면 오탐이 난다. 낮은 확률이고 `allow`로 해소 가능하다.

#### R2. `no-untyped-payload` (error)

- **목적**: 요청 페이로드가 타입 없이 컨트롤러로 흘러드는 것을 막는다.
- **대상**: `controller` 클래스 메서드의 파라미터 중 `@Body()` 데코레이터가 붙은 것. (옵션으로 `@Query()` 추가 가능)
- **판정**: 파라미터에 타입 애노테이션이 **없거나**, 타입이 `any` / `unknown` / `object` / `Record<string, any>`이면 report.
- **옵션**: `{ decorators?: string[] }` — 기본 `['Body']`.

**이 규칙이 하지 않는 일이 설계의 핵심이다.** 애초 후보는 "`@Body()` 파라미터 타입은 class-validator 데코레이터를 가진 DTO 클래스여야 한다"였으나, 1.3절에서 세 프로젝트가 `class-validator`를 전혀 쓰지 않고 zod 파이프를 쓴다는 사실이 드러났다. 검증 라이브러리를 규칙에 못 박으면 소비자 전체가 위반이 된다. 또한 DTO 클래스의 데코레이터를 확인하려면 다른 파일을 열어야 하므로 5.1절의 단일 파일 원칙도 깨진다.

그래서 **검증 수단은 불문하고, 타입이 없거나 무의미한 경우만** 잡는다. 스키마 자체의 품질은 `eslint-config-nest`가 실어주는 `eslint-plugin-zod`(`no-any-schema`, `prefer-strict-object` 등)가 담당하므로 **두 패키지의 관심사가 겹치지 않는다.**

```ts
// ❌ 위반
@Post()
create(@Body() body: any) {}
@Post()
create(@Body() body) {}

// ✅ 통과 — zod 파이프든 class-validator든 관계없다
@Post()
create(@Body(new ZodValidationPipe(createPostSchema)) dto: CreatePostDto) {}

// ✅ 통과 — 프로퍼티를 지정한 경우 원시 타입이 정상이다
@Post()
publish(@Body('id') id: string) {}
```

마지막 예외(`@Body('id')`)는 **반드시 필요하다.** 이것이 없으면 부분 페이로드를 꺼내는 정상 코드가 전부 위반이 된다.

#### R3. `no-cross-module-controller-import` (error)

- **목적**: 모듈 경계를 넘는 부적절한 결합을 막는다.
- **대상**: 모든 파일의 import/re-export 구문.
- **판정**: import 대상이 `*.controller.ts`이고, 그것이 **importer와 다른 모듈 디렉토리**에 속하면 report. 모듈 디렉토리는 `src/` 바로 아래 1depth 폴더로 정의한다(실측상 세 프로젝트 모두 이 구조). 파일명 관습에 의존하는 이유와 그것이 오탐을 만들지 않는 근거는 5.1절의 예외 항목에 있다.
- **예외**: 같은 모듈 내부(특히 `*.module.ts`가 자기 컨트롤러를 등록하는 정상 경우), 테스트 파일(`**/*.spec.ts`, `test/**`).

**왜 "다른 모듈 것을 import 금지"가 아니라 "컨트롤러만 금지"인가.** FSD의 `no-cross-imports`를 그대로 옮기려 했으나, NestJS DI에서는 성립하지 않는다. 다른 모듈의 서비스를 쓰려면 그 모듈이 `exports`에, 이쪽이 `imports`에 등록해야 하는데, **타입 애노테이션을 위해 `*.service.ts`를 직접 import하는 것이 정상적이고 불가피하다.** 게다가 배럴이 0개다(1.3절).

반면 **컨트롤러는 다른 모듈에서 import될 이유가 실질적으로 없다.** HTTP 진입점이며 자기 모듈의 `@Module.controllers`에만 등록된다. 따라서 이 좁은 형태는 오탐이 사실상 0이면서도 "모듈 내부 구현이 새어나간다"는 냄새를 정확히 잡는다.

#### R4. `no-direct-env-access` (warn)

- **목적**: 설정 접근을 `ConfigService`로 일원화한다.
- **대상**: `process.env.X` 및 `process.env['X']` 멤버 접근.
- **예외 (기본 무시 경로)**: `**/main.ts`, `**/*.config.ts`, `**/*.module.ts`(`forRoot` 설정), `**/config/**`, `**/telemetry/**`
- **옵션**: `{ ignore?: string[] }`
- **`warn`인 이유**: 실측 위반이 부트스트랩 성격 파일 3곳뿐이라 실효가 예방적이다(1.3절). `error`로 두면 정당한 코드에 대한 마찰만 남는다.

### 5.4 채택하지 않은 규칙과 이유

이 절은 스펙의 일부다. 무엇을 안 하는지가 이 플러그인의 성격을 정의한다.

| 후보 | 기각 사유 |
| --- | --- |
| `thin-controller` (메서드 본문의 분기·루프 금지) | **"얼마나 thin해야 thin인가"가 주관적이다.** 임계값을 정하는 순간 오탐이 나고, 소비자는 규칙을 끄게 된다. `eslint-plugin-fsd`에서 `pages/` 오탐 때문에 `ignores` 스코핑을 넣었던 것과 같은 함정이며 여기서는 더 심하다. R1이 이 의도의 **객관적으로 판정 가능한 부분만** 대신한다. |
| `no-public-api-sidestep` 대응 (모듈 배럴 강제) | 세 프로젝트 통틀어 `index.ts`가 **0개**다(1.3절). 현실과 어긋나는 규칙이다. |
| `no-http-artifacts-in-service` (Service에서 `Request`/`Response` 금지) | 정확히 판정하려면 타입 정보가 필요해 5.1절의 단일 파일 원칙을 깬다. 타입 이름 문자열 매칭으로 낮추면 오탐이 크다. **follow-up**(7절). |
| `require-injectable-on-provider` (`@Module.providers` 등록 클래스 검증) | 크로스 파일 분석이 필요하다. |
| DTO 스키마 품질 규칙 | `eslint-config-nest`의 `eslint-plugin-zod`가 이미 담당한다. 중복이다. |
| Swagger 데코레이터 강제 | 아키텍처가 아니라 문서화 관심사다. 별도 패키지 후보. |

### 5.5 패키지 구조

```
packages/eslint-plugin-nest-arch/
  src/
    lib/
      nest-class.ts        classifyNestClass — 데코레이터 기반 역할 판정
      decorator.ts         데코레이터 이름/인자 추출 유틸
      module-path.ts       src/ 하위 1depth 모듈 디렉토리 판정 (R3)
    rules/
      no-persistence-in-controller.ts
      no-untyped-payload.ts
      no-cross-module-controller-import.ts
      no-direct-env-access.ts
    index.ts               plugin + configs.recommended
  tests/
    fixtures/nest-app/     R1~R4 위반·통과 픽스처 (6.2절)
  package.json
  tsconfig.json
  tsup.config.ts
  README.md
```

`eslint-plugin-fsd`의 `lib/create-rule.ts`(`createImportRule`)는 **R3에만** 부분 재사용 가능성이 있으나, `parsePath`가 FSD 레이어 전용이라 그대로는 쓸 수 없다. Phase 2에서는 **복제하지 않고 재사용하지도 않는다** — R3용 import 순회를 독립 구현한다. 두 플러그인에서 세 번째 import 규칙이 필요해지는 시점에 공용 패키지로 추출하는 것이 옳다(성급한 추상화 회피).

### 5.6 매니페스트 및 프리셋

```jsonc
{
  "name": "@devbak/eslint-plugin-nest-arch",
  "version": "0.1.0",
  "description": "NestJS 아키텍처 경계를 강제하는 ESLint 규칙 (ESLint 10 flat config 전용)",
  "license": "MIT",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "engines": { "node": "^20.19.0 || ^22.13.0 || >=24" },
  "publishConfig": { "access": "public" },
  "peerDependencies": { "eslint": "^10.0.0" }
}
```

- **서브패스 export 없음.** `eslint-plugin-fsd`가 `/react`·`/next`를 나눈 것은 React 생태계 플러그인을 optional peer로 격리하기 위해서였다. nest-arch는 상류 플러그인 의존이 전혀 없으므로 진입점 하나면 충분하다.
- **peer는 `eslint: ^10.0.0`뿐이다.** `eslint-config-nest`의 선례를 따른다 — 검증하지 않은 버전 범위를 선언하지 않는다. `eslint-plugin-fsd`가 `^9 || ^10`을 선언하면서 v9를 검증한 적이 없다는 지적을 받았던 문제를 반복하지 않는다.
- **`publishConfig`·`prepublishOnly`는 형식만 유지한다.** 배포하지 않으므로 실행되지 않는다(2.1절). 소비자는 `link:`로 연결하며, 그에 따르는 `dist` 최신성 요구사항이 이 패키지에도 똑같이 적용된다(4.2절).
- **`@nestjs/*`에 의존하지 않는다** — 데코레이터 이름을 문자열로 판정하므로 NestJS 설치 여부와 무관하다.
- `configs.recommended`: R1·R2·R3 = `error`, R4 = `warn`. `ignores`는 두지 않는다(FSD와 달리 라우팅 폴더 같은 오탐 원천이 없다).

### 5.7 `eslint-config-nest`와의 관계

**Phase 2에서는 두 패키지를 합치지 않는다.** 소비자가 둘 다 명시적으로 조립한다.

```js
// eslint.config.mjs (NestJS 프로젝트)
import nest from '@devbak/eslint-config-nest';
import nestArch from '@devbak/eslint-plugin-nest-arch';

export default [
  ...nest,
  nestArch.configs.recommended,
];
```

`eslint-config-nest`가 nest-arch를 optional peer로 흡수하는 안은 **nest-arch가 실프로젝트에서 안정화된 뒤에 결정한다.** 지금 합치면 아직 오탐 여부가 검증되지 않은 규칙이 config 사용자 전원에게 강제된다. 순서가 중요하다 — 검증이 먼저다.

---

## 6. 테스트 전략 (Phase 2)

### 6.1 RuleTester 단위 테스트

기존 하네스(vitest + `RuleTester`, `tests/tsconfig.json`)를 그대로 쓴다. 규칙당 valid/invalid 케이스를 두되, **5.3절의 예외 케이스는 전부 valid 테스트로 고정한다** — `@Body('id') id: string`, `*.module.ts`가 자기 컨트롤러를 import하는 경우, `main.ts`의 `process.env` 등.

TypeScript 데코레이터를 파싱해야 하므로 `RuleTester`에 `@typescript-eslint/parser`를 지정한다. 이는 FSD 플러그인 테스트와 다른 점이다.

### 6.2 픽스처 기반 런타임 검증

`eslint-config-nest`가 세운 방식을 그대로 따른다. `eslint-plugin-fsd` 작업에서 **구조 단언 9개가 모두 통과한 상태로 런타임 크래시를 놓쳤고, 뒤이은 런타임 검증조차 두 프리셋 중 하나만 돌려 나머지의 파싱 실패를 놓쳤다.** 같은 실패를 반복하지 않는다.

`tests/fixtures/nest-app/`에 Nest 형태 소스를 두고 `configs.recommended`를 실제 ESLint에 실어 린트한다. 검증 항목: fatal 0건, R1~R4가 각각 위반 파일에서 **발화하고** 관용구 파일에서 **침묵한다**.

픽스처는 저장소 자체 린트에서 제외해야 한다 — `eslint.config.mjs`의 `ignores`와 `.oxlintrc.json`의 `ignorePatterns` **양쪽 모두**. `eslint-config-nest` 작업에서 두 파일에 이미 `**/tests/fixtures/**`가 추가돼 있음을 확인했고, 패턴이 패키지 경로를 앵커하지 않으므로 **새 패키지의 픽스처도 추가 작업 없이 커버된다.**

### 6.3 실프로젝트 드라이런 (이 설계의 핵심 검증)

`devlog-api`, `account-api`, `eungam-api` 세 프로젝트에 플러그인을 걸어 위반 목록을 뽑고, **한 건씩 정당한 검출인지 오탐인지 판정한다.** Phase 1에서 이미 세 프로젝트가 ESLint 10으로 올라가 있으므로 이 단계는 설정 한 줄 추가로 끝난다 — 이것이 순서를 뒤집은 이유 중 하나다(3.2절).

- 합격 기준: **오탐 0건.** 정당한 검출(예: `AppController`의 `PrismaService`)은 개수와 무관하게 합격이다.
- 오탐이 나오면 규칙을 좁히거나 기각한다. 임계값을 완화해서 통과시키지 않는다.
- 결과를 `README.md`에 드라이런 리포트로 남긴다.

이 단계가 5.4절의 "주관적 규칙 기각" 원칙이 실제로 지켜졌는지를 검증하는 유일한 수단이다.

### 6.4 회귀 게이트

`pnpm lint`(oxlint + ESLint), 전 프로젝트 `tsc --noEmit`, `pnpm test`, `pnpm build`가 모두 통과해야 한다. 기존 **77개** 테스트가 깨지지 않아야 한다.

### 6.5 에러 처리

`eslint-plugin-fsd`의 방침을 그대로 따른다 — **가공하지 않는다.** 규칙은 판정할 수 없는 입력을 만나면 조용히 통과시킨다(`return`). 구체적으로 데코레이터가 없는 클래스는 `classifyNestClass`가 `null`을 반환해 스킵하고, 파싱 불가능한 타입 애노테이션도 스킵하며, `src/` 밖의 파일은 R3가 스킵한다.

린트 규칙이 예외를 던지면 소비자의 린트 전체가 죽는다. 확신이 없으면 발화하지 않는 쪽이 항상 옳다.

---

## 7. 미결 사항

- **저장소 이름.** 현재 `github.com/cheolubak/eslint`인데 이미 내용이 ESLint 설정·플러그인 둘 다이고 곧 CLI까지 들어온다. GitHub은 rename 시 리다이렉트를 제공하므로 안전하다. 워크스페이스 `package.json`의 `name`(`eslint-workspace` → `devkit-workspace`)과 함께 Phase 1 착수 시점에 결정한다.
- ~~**npm 배포**~~ — **해소됨(2026-07-31).** 배포하지 않기로 확정했고 `link:` 프로토콜로 소비한다(2.1·4.2절). 초판이 지목한 유일한 블로커였다.
- **`@devbak/eslint-plugin-fsd`의 남은 follow-up** — CI 매트릭스(`eslint: [9, 10]`), `/react`의 JSX `languageOptions`, `tsup` `splitting: false`. 여기에 더해 `license`·`description`·`repository`·`keywords`·`engines`가 **전부 비어 있음을 확인했다**(`eslint-config-nest`는 다섯 모두 보유).
  - 단 배포하지 않기로 한 이상 이 항목들의 우선순위는 **낮다.** `description` 정도만 저장소를 다시 열었을 때 자신에게 쓸모가 있고, 나머지는 레지스트리 소비자를 위한 것이다. CI 매트릭스도 마찬가지로 **불필요해졌다** — 지원 버전을 주장할 대상이 없고, 소비자 3개가 전부 ESLint 10이다.
  - 오히려 `eslint-plugin-fsd`의 peer가 `^9.0.0 || ^10.0.0`인데 v9를 검증한 적이 없다는 기존 지적은, **v9 지원 주장을 철회하고 `^10.0.0`으로 좁히는 것**으로 해소하는 편이 낫다. CI로 실체화하는 것보다 싸고 정직하다. Phase 1에서 처리한다.
- **R4를 `error`로 승격할지** — Phase 2 드라이런 결과를 보고 판단한다.
- **`no-http-artifacts-in-service`** — 타입 인식 규칙을 별도 서브패스(`/type-checked`)로 제공할지. `eslint-config-nest`가 이미 타입 인식이므로 소비자에게 추가 부담은 없다. Phase 2 이후 결정.
- **oxlint 통합** — `eslint-config-nest` 9절의 미결 사항이며, 커스텀 플러그인 규칙을 oxlint jsPlugins로 노출할 수 있는지는 별도 조사가 필요하다.
