# 레이어 · 슬라이스 · 세그먼트 상세

FSD의 3층 구조를 실제로 어떻게 나누고 배치하는지에 대한 심화 가이드.

## 목차

- [레이어별 상세](#레이어별-상세)
- [슬라이스 설계 원칙](#슬라이스-설계-원칙)
- [세그먼트 상세](#세그먼트-상세)
- [entities vs features 구분](#entities-vs-features-구분)
- [widgets vs pages 구분](#widgets-vs-pages-구분)

## 레이어별 상세

### app (슬라이스 없음)

앱 전체를 "조립"하는 곳. 라우팅, 전역 프로바이더(Store, QueryClient, Theme), 전역 스타일, 초기화 로직. **비즈니스 로직을 두지 않는다.**

```text
app/
├── providers/          # <QueryProvider>, <ThemeProvider> 등 조립
│   └── index.tsx
├── styles/
│   └── globals.css
└── index.tsx           # 프로바이더들을 합쳐 앱 루트 구성
```

### pages (슬라이스 있음)

라우트 하나에 대응하는 완성된 화면. **여러 widgets/features/entities를 조합**해서 페이지를 구성하는 것이 주 역할이며, 페이지 고유 로직은 최소로.

```text
pages/
└── product-details/
    ├── ui/
    │   └── ProductDetailsPage.tsx   # widgets/entities를 조합
    └── index.ts
```

### widgets (슬라이스 있음)

여러 페이지에서 재사용되는 **자기완결적 UI 블록**. 내부적으로 features/entities를 조합할 수 있다. "이 블록만 떼서 다른 페이지에 붙여도 동작하는가?"가 판단 기준.

예: 사이트 헤더(검색 feature + user entity + 네비게이션), 상품 그리드, 댓글 섹션.

### features (슬라이스 있음)

**사용자가 수행하는 하나의 행위**. 보통 "동사"로 이름 짓는다: `add-to-cart`, `toggle-like`, `auth`(login/logout). 재사용되는 상호작용 단위.

```text
features/
└── add-to-cart/
    ├── ui/
    │   └── AddToCartButton.tsx
    ├── model/
    │   └── useAddToCart.ts
    └── index.ts
```

> 판단: 재사용되지 않고 한 페이지에서만 쓰는 사소한 상호작용은 굳이 feature로 승격하지 않아도 된다. FSD는 "재사용성"을 승격의 신호로 본다.

### entities (슬라이스 있음)

**비즈니스 개체**와 그 데이터·표현. "명사": `user`, `product`, `order`. 개체의 타입/스토어(model), 개체를 그리는 컴포넌트(ui: `UserAvatar`, `ProductCard`), 개체 관련 API를 담는다.

```text
entities/
└── user/
    ├── ui/
    │   └── UserAvatar.tsx
    ├── model/
    │   ├── types.ts          # User 타입
    │   └── store.ts
    ├── api/
    │   └── getUser.ts
    └── index.ts
```

### shared (슬라이스 없음)

**프로젝트/도메인 지식이 전혀 없는** 재사용 코드. 이 프로젝트가 아닌 다른 프로젝트에 복사해도 그대로 동작해야 한다.

```text
shared/
├── ui/          # Button, Input, Modal (도메인 무관 디자인 시스템)
├── api/         # baseFetch, axios 인스턴스
├── lib/         # formatDate, debounce, cn()
├── config/      # env, 상수
└── types/       # 공용 유틸 타입
```

> shared 안에서는 슬라이스가 없으므로 세그먼트가 곧 최상위다. `shared/ui`, `shared/lib`를 직접 import한다(단, 각 세그먼트의 index를 Public API로 둘 수 있음).

## 슬라이스 설계 원칙

- **응집도 우선**: 함께 바뀌는 것은 한 슬라이스에. 로그인 폼·로그인 API·로그인 상태는 `features/auth` 하나로.
- **낮은 결합도**: 슬라이스를 지웠을 때 파급이 그 슬라이스에 국한되어야 한다.
- **도메인 언어로 명명**: 기술 용어(`utils`, `helpers`)가 아니라 제품 용어(`checkout`, `wishlist`).
- **슬라이스 그룹**: 관련 슬라이스가 많으면 폴더로 묶을 수 있다(예: `entities/user/`, `entities/product/`를 그대로 두되, 필요 시 하위 그룹핑). 과도한 중첩은 피한다.

## 세그먼트 상세

세그먼트는 "이 파일이 기술적으로 무엇인가"로 나눈다. 표준 5종(`ui`/`api`/`model`/`lib`/`config`) 외 커스텀도 가능하지만, 표준을 벗어날 땐 이유가 분명해야 한다.

- `ui` — 렌더링되는 모든 것. 컴포넌트, 스타일, 이 슬라이스 전용 포매터.
- `api` — 서버 통신. 요청 함수, DTO 타입, 응답→도메인 매핑.
- `model` — 상태와 규칙. 스토어(zustand/redux), 스키마(zod), 도메인 타입, 셀렉터.
- `lib` — 이 슬라이스에서만 쓰는 내부 유틸/훅. (범용이면 `shared/lib`로 내려야 함)
- `config` — 상수, 피처 플래그, 슬라이스 설정.

## entities vs features 구분

가장 자주 헷갈리는 경계. **명사 = entities, 동사 = features.**

| 대상 | 레이어 | 이유 |
|------|--------|------|
| `User` 타입, `UserAvatar` | `entities/user` | 개체(명사) |
| 로그인/로그아웃 | `features/auth` | 행위(동사) |
| `Product` 카드 | `entities/product` | 개체 표현 |
| "장바구니에 담기" 버튼 | `features/add-to-cart` | 행위 |
| `Cart` 데이터 모델 | `entities/cart` | 개체 |

> feature가 entity를 import하는 건 정상(하위 레이어). 반대로 entity가 feature를 알면 규칙 위반.

## widgets vs pages 구분

- **widgets**: 재사용되는 블록. 여러 페이지에 등장. 라우트에 묶이지 않음.
- **pages**: 특정 라우트의 완성 화면. widgets/features/entities를 "배치·조합"하는 것이 주 업무.

한 페이지에서만 쓰는 큰 블록이라면 굳이 widget으로 빼지 않고 page의 ui에 둬도 된다. 두 곳 이상에서 쓰이기 시작하면 widget으로 승격.
