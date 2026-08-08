# import 경계 규칙 · Public API · 린터

FSD의 진짜 가치는 폴더 이름이 아니라 **모듈 간 의존 방향을 강제**하는 데 있다. 이 규칙이 없으면 FSD는 그냥 폴더 컨벤션에 불과하다.

## 목차

- [레이어 import 규칙](#레이어-import-규칙)
- [슬라이스 격리 규칙](#슬라이스-격리-규칙)
- [Public API (index.ts)](#public-api-indexts)
- [cross-import (@x 규칙)](#cross-import-x-규칙)
- [경로 별칭 설정](#경로-별칭-설정)
- [Steiger 린터로 자동 강제](#steiger-린터로-자동-강제)

## 레이어 import 규칙

> **한 모듈은 자신보다 엄격히 아래에 있는 레이어에서만 import한다.**

레이어 순서(위→아래): `app` → `pages` → `widgets` → `features` → `entities` → `shared`

| 이 레이어에서 | import 가능 | import 불가 |
|---------------|-------------|-------------|
| `app` | 모든 하위 | (없음) |
| `pages` | widgets, features, entities, shared | app, 다른 page |
| `widgets` | features, entities, shared | app, pages, 다른 widget |
| `features` | entities, shared | app, pages, widgets, 다른 feature |
| `entities` | shared | 상위 전부, 다른 entity(원칙) |
| `shared` | shared 내부만 | 상위 전부 |

핵심 효과: **의존은 항상 아래로만 흐른다.** `shared`를 바꿔도 위 레이어를 신경 쓸 필요 없고, `pages`를 지워도 `entities`는 멀쩡하다.

## 슬라이스 격리 규칙

**같은 레이어의 서로 다른 슬라이스는 직접 import하지 않는다.**

```ts
// ✕ 나쁨 — entities/order 가 entities/user 를 직접 import
import { User } from "entities/user";   // 같은 레이어 슬라이스 간 참조

// ○ 방법 1 — 상위 레이어에서 조합 (features/widgets가 둘을 각각 import)
// ○ 방법 2 — 꼭 필요하면 cross-import(@x) 규칙 사용 (아래 참조)
```

이유: 슬라이스 간 직접 참조를 허용하면 순환 의존과 스파게티가 생긴다. 슬라이스는 독립적으로 삭제·이동 가능해야 한다.

## Public API (index.ts)

각 슬라이스(그리고 shared의 각 세그먼트)는 **`index.ts`로 외부에 노출할 것만 공개**한다. 다른 슬라이스는 내부 파일 경로를 직접 import하지 않고 이 배럴만 사용한다.

```ts
// features/auth/index.ts  — Public API
export { LoginForm } from "./ui/LoginForm";
export { useAuth } from "./model/useAuth";
export type { AuthState } from "./model/types";
// 내부 헬퍼(./lib/*, ./api/*)는 공개하지 않음
```

```ts
// ○ 다른 슬라이스에서
import { LoginForm, useAuth } from "features/auth";

// ✕ 내부 경로 직접 접근 — 리팩터링 시 전부 깨짐
import { LoginForm } from "features/auth/ui/LoginForm";
```

> Next.js에서 배럴 파일이 번들/트리셰이킹에 주는 영향이 걱정된다면, `optimizePackageImports`나 슬라이스 단위 세분화로 완화한다. Public API 원칙 자체는 유지하는 편이 유지보수 이득이 크다.

## cross-import (@x 규칙)

같은 레이어의 두 entity가 **불가피하게** 서로를 알아야 할 때(예: `Order`가 `User`를 참조)를 위한 공식 예외. `@x` 세그먼트로 "특정 슬라이스에게만" 노출하는 전용 Public API를 만든다.

```text
entities/
└── user/
    ├── @x/
    │   └── order.ts        # order 슬라이스에게만 노출하는 API
    └── index.ts
```

```ts
// entities/user/@x/order.ts
export type { User } from "../model/types";

// entities/order/model/types.ts 에서
import type { User } from "entities/user/@x/order";
```

이렇게 하면 "어떤 슬라이스가 어떤 슬라이스에 의도적으로 결합했는지"가 코드에 명시되고, 린터로 그 외의 결합을 계속 막을 수 있다. 남용하지 말 것 — 잦은 cross-import는 경계 설계가 틀렸다는 신호.

## 경로 별칭 설정

절대경로 import를 위해 `tsconfig.json`에 별칭을 둔다.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]           // @/features/auth 형태
    }
  }
}
```

```ts
import { LoginForm } from "@/features/auth";
```

Vite는 `vite-tsconfig-paths`, Next.js는 `tsconfig`의 `paths`를 기본 인식한다.

## 린트로 자동 강제

규칙을 사람이 지키게 두면 결국 무너진다. 위의 세 규칙(레이어 방향·슬라이스 격리·Public API)은 **린트로 자동 강제**해야 살아있다.

- **Steiger**(FSD 공식 아키텍처 린터, 권장) — `recommended` 프리셋 하나로 격리·Public API·구조 위반을 설정 없이 검출.
- **eslint-plugin-boundaries** — 기존 ESLint 실행에 통합하고 싶을 때. 레이어/슬라이스 수동 매핑 필요.

두 방법의 전체 설정, 격리 규칙 대응표(`fsd/no-cross-imports`=슬라이스 격리, `fsd/no-higher-level-imports`=레이어 방향), CI/pre-commit 배선은 → [lint-enforcement.md](lint-enforcement.md).
