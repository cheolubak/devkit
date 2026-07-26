# eslint-plugin-fsd — 설계 문서

- 날짜: 2026-07-26
- 상태: 확정 (구현 대기)
- 목표: Feature-Sliced Design(FSD)의 모듈 경계를 ESLint로 자동 강제하는 커스텀 플러그인 + 바로 쓰는 flat config 프리셋 제공. Next.js(App/Pages Router) 레이어명 변형까지 지원.

---

## 1. 배경 & 범위

FSD 아키텍처는 세 가지 격리 규칙이 지켜져야 유지된다:

1. **레이어 방향** — 자신보다 엄격히 아래 레이어만 import (상위 참조 금지)
2. **슬라이스 격리** — 같은 레이어의 형제 슬라이스 간 직접 import 금지
3. **Public API** — 다른 슬라이스/세그먼트는 진입점(`index.ts` = 폴더 루트 경로)으로만 접근, 내부 경로 직접 참조 금지

기존 도구(Steiger, eslint-plugin-boundaries)가 있으나, 본 패키지는 **ESLint 네이티브 + 관습 기반 zero-config**(레이어/슬라이스 수동 매핑 불필요)를 지향한다.

### 첫 릴리스(v0.1) 범위

- 규칙 3개: `no-higher-level-imports`, `no-cross-imports`, `no-public-api-sidestep`
- `recommended` flat config 프리셋
- 레이어 별칭 지원: `pages` 레이어 = `pages | views | screens`
- 관습 기반 경로 인식(zero-config), alias만 옵션(`@`, `~` 기본)

### 명시적 비범위(v0.1 제외, 확장 지점만 확보)

- FSD `@x` cross-import 예외 문법
- `public-api` **존재** 강제(index.ts 파일이 실제로 있는지) — 파일시스템 접근이 필요하므로 제외
- 자동 수정(fix) / suggestion
- oxlint 통합

---

## 2. 저장소 구조 (pnpm 모노레포)

```text
eslint/                          # 워크스페이스 루트 (private)
├── pnpm-workspace.yaml
├── package.json                 # 루트 스크립트 (build, test, lint)
├── tsconfig.base.json           # 공유 TS 설정 (strict)
├── vitest.config.ts
├── docs/superpowers/specs/      # 본 설계 문서
└── packages/
    └── eslint-plugin-fsd/
        ├── package.json         # name: eslint-plugin-fsd, peer: eslint>=9
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts         # 플러그인 진입점 (meta, rules, configs)
        │   ├── lib/
        │   │   ├── layers.ts        # 레이어 정의(정규명+별칭+rank+sliced)
        │   │   ├── parse-path.ts    # 절대경로 → FsdLocation | null
        │   │   ├── resolve-import.ts# import 소스 → 절대경로 (relative/alias)
        │   │   └── types.ts         # FsdLocation 등 공유 타입
        │   ├── rules/
        │   │   ├── no-higher-level-imports.ts
        │   │   ├── no-cross-imports.ts
        │   │   └── no-public-api-sidestep.ts
        │   └── configs/
        │       └── recommended.ts   # flat config 프리셋
        └── tests/
            ├── parse-path.test.ts
            ├── no-higher-level-imports.test.ts
            ├── no-cross-imports.test.ts
            └── no-public-api-sidestep.test.ts
```

- 앞으로 다른 eslint 패키지를 `packages/` 아래 추가.
- git 미초기화 상태 → 구현 첫 단계에서 `git init` 후 커밋. 병합은 rebase 방식(merge commit 금지).

---

## 3. 레이어 모델 (`lib/layers.ts`)

레이어를 "이름"이 아니라 **rank를 가진 엔티티 + 별칭**으로 모델링한다.

```ts
export interface LayerDef {
  name: string;        // 정규명 (에러 메시지/판정에 사용)
  aliases: string[];   // 대체 폴더명
  rank: number;        // 0 = 최상위(app), 클수록 하위
  sliced: boolean;     // 슬라이스 존재 여부
}

export const LAYERS: LayerDef[] = [
  { name: 'app',      aliases: [],                     rank: 0, sliced: false },
  { name: 'pages',    aliases: ['views', 'screens'],   rank: 1, sliced: true  },
  { name: 'widgets',  aliases: [],                     rank: 2, sliced: true  },
  { name: 'features', aliases: [],                     rank: 3, sliced: true  },
  { name: 'entities', aliases: [],                     rank: 4, sliced: true  },
  { name: 'shared',   aliases: [],                     rank: 5, sliced: false },
];
```

- 폴더명(정규명 또는 별칭) → `LayerDef` 조회 맵을 미리 빌드.
- `pages`/`views`/`screens`는 **동일 레이어(rank 1)**. 에러 메시지는 정규명 `pages`로 표시하되, 실제 폴더명도 함께 노출.
- 별칭 추가/변경은 이 파일만 수정 → **rule 코드는 불변**(전부 rank/slice 비교로 환원).

---

## 4. 경로 인식 & import 해석 (핵심 로직)

세 rule 모두 **importer 경로**와 **import 대상 경로**를 각각 `FsdLocation`으로 파싱한 뒤 비교하는 것으로 환원된다.

```ts
export interface FsdLocation {
  layer: string;        // 정규 레이어명
  rank: number;
  sliced: boolean;
  slice: string | null; // sliced 레이어의 슬라이스명 (없으면 null)
  segment: string | null; // 슬라이스/공유 아래 세그먼트 (없으면 null)
  depth: number;        // FSD 루트 기준 세그먼트 개수 (layer 포함)
  folderName: string;   // 실제 폴더명(별칭 원형; 메시지용)
}
```

### 4.1 FSD 루트 탐지 (`findFsdRoot`) — 오탐 방지의 핵심

절대경로에서 FSD 좌표의 원점을 **결정적으로** 찾는다. Next.js 라우팅 디렉토리(루트 `app/`, `pages/`) 오탐을 막는 장치.

규칙(우선순위):

1. **`src` 앵커(우선)**: 경로에 `src` 세그먼트가 있으면, **가장 마지막** `src`까지를 FSD 루트로 삼는다. → 그 아래(`src/...`)만 FSD로 인식.
2. **no-src 폴백**: `src`가 없으면, **가장 앞(top-most)** 의 레이어명 세그먼트를 찾아 그 **부모**를 FSD 루트로 삼는다. (레이어를 루트에 직접 두는 소규모 앱/라이브러리용)
3. 둘 다 실패하면 `null` → FSD 아님.

> **결정 사항(오탐 처리)**: Next.js 권장 레이아웃은 "FSD 전체를 `src/` 안에, 라우팅 `app/`·`pages/`는 프로젝트 루트에" 둔다. `src` 앵커 규칙에 의해 루트 라우팅 폴더는 FSD 루트 밖 → **importer로서 스킵, 대상으로서 외부 취급**. 따라서:
> - App Router `app/**/page.tsx`가 `@/pages/home`을 re-export → **valid**
> - Pages Router `pages/**/*.tsx`가 `@/screens/product-details`를 re-export → **valid** (루트 `pages/`는 `src` 밖)
>
> **알려진 한계**: `src/` 없이 루트에 레이어를 두면서 동시에 Pages Router 루트 `pages/`를 쓰는 조합은 오탐 가능. → 문서에서 **Next.js 프로젝트는 `src/` 레이아웃 사용**을 권장. (추후 rule option으로 `rootDir` override 여지 확보)
>
> **정정(2026-07-27, 최종 리뷰 반영)**: 위 "루트 라우팅 폴더는 importer로서 스킵" 서술은 정확하지 않다. `findFsdRoot`는 경로에 `src`가 없으면 top-most 레이어 세그먼트로 폴백하므로, 프로젝트 루트의 라우팅 `pages/`는 FSD `pages` 레이어로 파싱된다(App Router 루트 `app/`는 non-sliced·rank 0이라 무해하지만, Pages Router 루트 `pages/`는 `no-cross-imports` 오탐을 유발). 이 오탐은 파싱 단계가 아니라 `recommended` 프리셋의 `ignores: ['app/**','pages/**']`로 차단한다.

### 4.2 파싱 (`parsePath`)

```
parsePath(absPath):
  root = findFsdRoot(absPath)         # 4.1
  if root == null: return null
  rel = segments(absPath relative to root)   # 예: ['features','auth','ui','x.ts']
  layerFolder = rel[0]
  layerDef = lookup(layerFolder)      # 별칭 포함
  if layerDef == null: return null    # 루트 다음 첫 세그먼트가 레이어가 아니면 FSD 아님
  if layerDef.sliced:
    slice   = rel[1] ?? null
    segment = rel[2] ?? null
  else:                               # app / shared
    slice   = null
    segment = rel[1] ?? null          # shared 는 segment 가 곧 첫 단계
  return FsdLocation{ layer: layerDef.name, rank, sliced, slice, segment,
                      depth: rel.length, folderName: layerFolder }
```

- **"레이어명 스캔"이 아니라 "루트 다음 첫 세그먼트"** 를 레이어로 본다 → 슬라이스명이 우연히 `shared`여도 충돌 없음(결정적, advisor #2).
- 파일명(마지막 세그먼트)은 depth에 포함되나 slice/segment 추출엔 위치 기반으로만 사용.

### 4.3 import 해석 (`resolveImport`)

```
resolveImport(source, importerAbsPath):
  if source starts with './' or '../':
    return path.resolve(dirname(importerAbsPath), source)
  if source matches alias (기본 '@','~' with optional trailing '/'):
    base = findFsdRoot(importerAbsPath)          # advisor #3: 동일 앵커 재사용
    if base == null: return null
    rest = source 에서 alias 프리픽스 제거
    return path.join(base, rest)
  return null                                     # 외부 패키지 등 → 무시
```

- alias base를 **별도 `/src` 검색이 아니라 importer의 FSD 루트에서 재사용** → `src` 유무 무관, 4.1과 일관(advisor #3).
- alias 목록은 rule option `alias`(기본 `['@','~']`)로만 커스터마이즈. 그 외는 전부 관습 기반.
- 확장자/`index` 생략은 경로 문자열 판정에 영향 없음(파일시스템 접근 안 함).

---

## 5. 규칙 판정 로직

공통 전처리: importer를 `parsePath`. `null`이면 **모든 rule 즉시 통과**(FSD 밖 파일). 각 import 문마다 `resolveImport` → `parsePath`. 대상이 `null`이면 통과(외부/비FSD).

### 5.1 `no-higher-level-imports` (레이어 방향)

- 위반 조건: `to.rank < from.rank` (대상이 더 상위 레이어).
- 예: `entities`(4) → `features`(3) import = ❌.
- `app`(0)은 모두 하위라 자유. `shared`(5)는 위로 못 감.
- 메시지: `"{from.folderName}" 레이어는 상위 레이어 "{to.folderName}"을(를) import할 수 없습니다.`

### 5.2 `no-cross-imports` (슬라이스 격리)

- 위반 조건: `from.layer === to.layer` **AND** `from.sliced` **AND** `from.slice != null` **AND** `to.slice != null` **AND** `from.slice !== to.slice`.
- 예: `features/auth` → `features/cart` = ❌.
- 같은 슬라이스 내부(`from.slice === to.slice`)는 통과. `app`/`shared`는 슬라이스 없어 대상 아님.
- (`@x` cross-import 예외는 v0.1 제외; 조건 분기에 확장 지점 주석)
- 메시지: `"{layer}" 레이어의 슬라이스 "{from.slice}"는 형제 슬라이스 "{to.slice}"를 직접 import할 수 없습니다.`

### 5.3 `no-public-api-sidestep` (Public API 우회)

- "같은 슬라이스 내부 import"는 항상 허용. 그 외(다른 슬라이스/다른 레이어/shared)는 **대상의 Public 진입점**까지만 허용.
- 진입점 depth(레이어 인식):
  - **sliced 레이어 대상**: 진입점 = `layer/slice` → 허용 depth == 2. `to.depth > 2`(= `to.segment != null`)면 위반.
  - **shared 대상**(non-sliced): 진입점 = `shared/segment` → 허용 depth == 2. `to.depth > 2`면 위반. (`shared/ui` 허용, `shared/ui/Button` = sidestep)
  - **app 대상**: 통상 import 대상이 아니며, import 시 5.1에서 이미 상위 참조로 차단됨 → 별도 처리 불필요.
- "같은 슬라이스" 판정: `from.layer === to.layer && from.slice != null && from.slice === to.slice`.
- 메시지: `"{to.layer}/{to.slice ?? to.segment}"의 내부 경로를 직접 import했습니다. Public API(진입점)를 통해 접근하세요.`

> 세 rule 모두 **경로 문자열만으로 판정**(파일 존재 확인 없음) → RuleTester 가상 파일명으로 완전 테스트 가능(advisor 확인 사항).

---

## 6. 플러그인 export & 프리셋 (`src/index.ts`, `configs/recommended.ts`)

```ts
const plugin = {
  meta: { name: 'eslint-plugin-fsd', version: '0.1.0' },
  rules: {
    'no-higher-level-imports': noHigherLevelImports,
    'no-cross-imports': noCrossImports,
    'no-public-api-sidestep': noPublicApiSidestep,
  },
  configs: {} as Record<string, unknown>,
};

plugin.configs.recommended = {          // ESLint v9 flat config
  plugins: { fsd: plugin },
  rules: {
    'fsd/no-higher-level-imports': 'error',
    'fsd/no-cross-imports': 'error',
    'fsd/no-public-api-sidestep': 'error',
  },
};

export default plugin;
```

사용자 `eslint.config.js`:

```js
import fsd from 'eslint-plugin-fsd';
export default [ fsd.configs.recommended ];
```

---

## 7. 빌드 · 패키지 · 테스트

### 빌드/배포

- **tsup** 으로 ESM + `.d.ts` 번들 → `dist/`.
- `package.json`: `type: module`, `exports`가 `dist` 지시, `peerDependencies: { "eslint": ">=9" }`.
- 버전 0.1.0, 미발행. 스코프(`@tatoa/…`) 발행 여부는 추후 결정.

### 테스트 (Vitest + ESLint RuleTester)

- `RuleTester.it = it`(vitest) 로 구동. 각 rule valid/invalid 케이스.
- 케이스는 가상 `filename` + `import` 소스로 경로 파싱 검증.
- **필수 회귀 테스트 케이스**:
  1. `no-higher-level-imports`: `src/entities/user/ui/x.ts` 에서 `@/features/auth` → invalid. `@/shared/ui` → valid.
  2. `no-cross-imports`: `src/features/auth/ui/x.ts` 에서 `@/features/cart` → invalid. 같은 슬라이스 상대 import → valid.
  3. `no-public-api-sidestep`: `@/entities/user/model/store` → invalid. `@/entities/user` → valid. `@/shared/ui` → valid, `@/shared/ui/Button` → invalid.
  4. **Next.js 오탐 방지**: `app/products/[id]/page.tsx`(루트, src 밖) 가 `@/pages/home` re-export → **valid**. `pages/products/[id].tsx`(루트) 가 `@/screens/product-details` → **valid**.
  5. **별칭**: `src/views/home/...` 및 `src/screens/home/...` 를 `pages` 레이어로 인식하는지.
  6. **결정적 파싱**: 슬라이스명이 `shared`인 `src/features/shared/ui/x.ts` 를 features 레이어로 파싱(오탐 없음).

### 루트 스크립트 (pnpm)

```jsonc
{
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "lint": "eslint ."
  }
}
```

---

## 8. 구현 순서(개략)

1. 모노레포 스캐폴딩(`git init`, workspace, tsconfig, vitest) + 패키지 뼈대
2. `lib/layers.ts` → `lib/parse-path.ts` → `lib/resolve-import.ts` (+ 단위 테스트 먼저; TDD)
3. rule 3개 (각각 RuleTester 테스트 먼저)
4. `index.ts` + `configs/recommended.ts`
5. tsup 빌드 설정, 루트 스크립트, README
6. 전체 `pnpm test` / `pnpm build` 통과 확인
