---
name: fsd-architecture
description: "Feature-Sliced Design(FSD) 프론트엔드 아키텍처 가이드. 레이어(app·pages·widgets·features·entities·shared)·슬라이스·세그먼트 구조, import 경계 규칙, Public API, Next.js App Router 통합.\nAPPLIES: 프론트엔드에서 새 코드를 어느 폴더에 둘지 정할 때, `app`/`pages`/`widgets`/`features`/`entities`/`shared` 구조를 쓰거나 도입할 때, steiger가 설정돼 있을 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"FSD\", \"Feature-Sliced Design\", \"feature sliced\", \"레이어 아키텍처\", \"폴더 구조 설계\", \"프로젝트 구조 잡아줘\", \"features/entities/shared\", \"슬라이스\", \"레이어 분리\", \"아키텍처 정리\", \"어느 폴더에 둬야\", 프론트엔드 폴더/레이어 아키텍처를 FSD로 설계·정리·마이그레이션할 때.\nSKIP: 컴포넌트 단위 패턴(서버/클라이언트 컴포넌트, 렌더링/리렌더 최적화)은 react-best-practices. 멀티 패키지 워크스페이스(Turborepo/pnpm workspace) 구성은 nextjs-monorepo. 백엔드 도메인 계층·의존성 방향 설계(\"레이어 분리\"가 백엔드 의도일 때)는 clean-architecture, 백엔드 모듈/패키지 물리 배치는 nestjs-monorepo."
version: 1.0.0
---

> 참조:
> - [references/layers-slices-segments.md](references/layers-slices-segments.md) - 레이어·슬라이스·세그먼트 상세 정의와 배치 기준
> - [references/import-rules.md](references/import-rules.md) - import 경계 규칙, Public API(index.ts), cross-import(@x)
> - [references/lint-enforcement.md](references/lint-enforcement.md) - 격리(레이어 방향·슬라이스·Public API)를 린트로 자동 강제 (Steiger / eslint-plugin-boundaries)
> - [references/nextjs-integration.md](references/nextjs-integration.md) - Next.js App Router와 FSD 통합 (app/pages 이름 충돌 해결) **CRITICAL**
> - [references/migration.md](references/migration.md) - 기존 프로젝트를 FSD로 점진 마이그레이션하는 전략

# Feature-Sliced Design (FSD)

프론트엔드 프로젝트의 **폴더 구조와 모듈 경계**를 표준화하는 아키텍처 방법론. 코드를 "기술 종류"(components/hooks/utils)가 아니라 **비즈니스 도메인과 책임 계층**으로 나눈다. 목표는 *어디에 무엇을 둘지*를 규칙으로 만들어 팀 규모가 커져도 구조가 무너지지 않게 하는 것.

## 핵심 3층 구조

FSD는 세 단계 계층으로 코드를 조직한다:

```
Layer (레이어)  →  Slice (슬라이스)  →  Segment (세그먼트)
책임 계층           비즈니스 도메인       기술 종류
```

예: `features/auth/ui/` = features 레이어 · auth 슬라이스 · ui 세그먼트.

## 1. 레이어 (Layer)

책임 수준에 따라 위에서 아래로 정렬된 최상위 폴더. **위 레이어일수록 앱에 특화되고, 아래 레이어일수록 추상적·재사용 가능**하다.

| 레이어 | 역할 | 슬라이스 | 예시 |
|--------|------|:--------:|------|
| `app` | 라우팅, 프로바이더, 전역 스타일, 앱 진입점 | ✕ | Provider 조립, 전역 CSS, 스토어 초기화 |
| `pages` | 라우트별 완성된 페이지(또는 페이지 큰 조각) | ○ | 홈 페이지, 상품 상세 페이지 |
| `widgets` | 독립적으로 동작하는 큰 UI 블록 | ○ | 헤더, 사이드바, 상품 카드 리스트 |
| `features` | 사용자가 수행하는 "행위"(재사용되는 기능) | ○ | 로그인, 장바구니 담기, 좋아요 토글 |
| `entities` | 비즈니스 개체(데이터 + 그 표현) | ○ | User, Product, Order |
| `shared` | 프로젝트에 종속되지 않는 재사용 코드 | ✕ | UI 키트, API 클라이언트, 유틸, 설정 |

- **`app`·`shared`만 슬라이스가 없다.** 나머지 4개 레이어는 반드시 슬라이스로 나눈다.
- `processes` 레이어는 **폐기(deprecated)** 되었다. 새로 만들지 말 것 — 해당 로직은 `pages`/`features`로 흡수.
- 모든 레이어를 다 쓸 필요는 없다. 작은 앱은 `app`/`pages`/`shared`만으로 시작해도 된다.

## 2. 슬라이스 (Slice)

레이어 안을 **비즈니스 도메인**으로 나눈 폴더. 이름은 도메인 언어를 그대로 쓴다(`user`, `product`, `cart`, `auth`). 슬라이스는 **높은 응집도, 낮은 결합도**가 원칙 — 한 슬라이스를 지웠을 때 다른 슬라이스가 함께 무너지면 경계가 잘못된 것.

## 3. 세그먼트 (Segment)

슬라이스 내부를 **기술적 목적**으로 나눈 폴더. 표준 세그먼트:

| 세그먼트 | 내용 |
|----------|------|
| `ui` | 컴포넌트, 스타일, 포매터 등 표현 계층 |
| `api` | 백엔드 요청, 데이터 타입, 매핑 |
| `model` | 스토어, 스키마, 비즈니스 로직(상태/도메인 규칙) |
| `lib` | 이 슬라이스에서만 쓰는 헬퍼/훅 |
| `config` | 설정값, 피처 플래그, 상수 |

세그먼트는 고정 목록이 아니다. 필요 없으면 만들지 않고(로직 없는 순수 UI 슬라이스는 `ui`만), 필요하면 커스텀 세그먼트를 둘 수도 있다.

## 폴더 구조 예시

```text
src/
├── app/                      # 앱 조립 (라우팅·프로바이더·전역)
│   ├── providers/
│   └── styles/
├── pages/
│   ├── home/
│   │   ├── ui/
│   │   └── index.ts          # Public API
│   └── product-details/
│       ├── ui/
│       └── index.ts
├── widgets/
│   └── header/
│       ├── ui/
│       └── index.ts
├── features/
│   ├── auth/
│   │   ├── ui/
│   │   ├── model/
│   │   ├── api/
│   │   └── index.ts
│   └── add-to-cart/
├── entities/
│   ├── user/
│   │   ├── ui/               # UserAvatar 등 개체의 "표현"
│   │   ├── model/            # User 타입·스토어
│   │   ├── api/
│   │   └── index.ts
│   └── product/
└── shared/
    ├── ui/                   # 프로젝트 무관 UI 키트 (Button, Input)
    ├── api/                  # 공통 fetch 클라이언트
    ├── lib/                  # 순수 유틸
    └── config/
```

## import 규칙 (가장 중요)

> **한 모듈은 자신보다 "엄격히 아래" 레이어에서만 import할 수 있다.**

- `features`는 `entities`·`shared`를 import할 수 있지만, `pages`·`widgets`는 import 불가.
- **같은 레이어의 다른 슬라이스끼리는 서로 import 금지** (`entities/user`가 `entities/product`를 직접 import ✕). 예외적 참조는 cross-import(`@x`) 규칙을 따른다.
- 다른 슬라이스는 항상 그 슬라이스의 **Public API(`index.ts`)** 를 통해서만 접근한다. 내부 파일 경로를 직접 파고들지 않는다.

세부 규칙(Public API 작성법, cross-import `@x`)은 → [references/import-rules.md](references/import-rules.md). 이 격리를 **린트로 자동 강제**하는 법(Steiger / eslint-plugin-boundaries)은 → [references/lint-enforcement.md](references/lint-enforcement.md).

## 배치 의사결정 가이드

새 코드를 어느 레이어에 둘지 헷갈릴 때 위에서부터 자문:

1. **특정 라우트에서만 쓰는 페이지 조립인가?** → `pages`
2. **여러 페이지에서 재사용되는 독립 UI 블록인가?** → `widgets`
3. **사용자의 "행위"(동사)인가?** (로그인하기, 담기, 토글하기) → `features`
4. **비즈니스 "개체"(명사)와 그 데이터/표현인가?** (User, Product) → `entities`
5. **도메인과 무관한 순수 재사용 코드인가?** (Button, formatDate) → `shared`

> 팁: **명사는 entities, 동사는 features.** 이 한 줄이 배치 논쟁의 절반을 해결한다.

## 흔한 실수

- **`shared`를 잡동사니 폴더로 방치** — `shared`는 "도메인 지식이 없는" 코드만. User를 아는 컴포넌트는 `entities/user`로.
- **entities 간 직접 결합** — `Order`가 `User`를 알아야 하면 cross-import(`@x`)를 쓰거나 상위 레이어(features/widgets)에서 조합한다.
- **features를 너무 크게** — 하나의 feature = 하나의 사용자 행위. "user 관리" 같은 거대 feature는 여러 feature로 쪼갠다.
- **Public API 우회** — `features/auth/model/store.ts`를 직접 import하면 리팩터링 시 전부 깨진다. 항상 `features/auth`(index)만.
- **Next.js에서 라우팅을 pages 레이어에 그대로 두려는 시도** — 이름은 같지만 역할이 다르다. → [references/nextjs-integration.md](references/nextjs-integration.md) 필독.

## Next.js App Router 사용 시

Next.js의 `app/`·`pages/` 라우팅 디렉토리와 FSD의 `app`·`pages` 레이어는 **이름이 겹치지만 별개**다. 라우트 파일은 얇게 유지하고 실제 화면은 FSD `pages` 레이어에 두는 것이 핵심. 구체적 폴더 배치와 `src/` 분리 전략은 → [references/nextjs-integration.md](references/nextjs-integration.md).
