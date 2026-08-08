# 기존 프로젝트 → FSD 점진 마이그레이션

FSD로의 전환은 "빅뱅 리팩터링"이 아니라 **아래에서 위로, 새 코드부터** 점진적으로 하는 것이 원칙이다. 한 번에 폴더를 다 뒤엎으면 리뷰 불가능한 PR과 대규모 회귀가 생긴다.

## 목차

- [마이그레이션 순서](#마이그레이션-순서)
- [1단계: shared 정착](#1단계-shared-정착)
- [2단계: entities 추출](#2단계-entities-추출)
- [3단계: features / widgets 분리](#3단계-features--widgets-분리)
- [4단계: pages / app 정리](#4단계-pages--app-정리)
- [실전 팁](#실전-팁)
- [흔한 함정](#흔한-함정)

## 마이그레이션 순서

**아래 레이어(shared)부터 위 레이어(app)로** 올라간다. 하위 레이어가 안정되어야 상위에서 안전하게 참조할 수 있기 때문.

```
shared → entities → features → widgets → pages → app
```

동시에 **"새 코드는 무조건 FSD로"** 규칙을 먼저 세운다. 기존 코드는 건드리는 김에 옮기는 보이스카웃 방식으로 서서히 이동.

## 1단계: shared 정착

가장 안전하고 이득이 큰 시작점. 기존 `utils/`, `components/common/`, `lib/`, `constants/`를 `shared/`로 재배치.

```
기존                          →  FSD
src/utils/format.ts           →  src/shared/lib/format.ts
src/components/Button.tsx      →  src/shared/ui/Button.tsx
src/api/client.ts             →  src/shared/api/client.ts
src/constants/env.ts          →  src/shared/config/env.ts
```

- 이때 "도메인 지식이 있는" 것(User를 아는 컴포넌트 등)은 shared에 넣지 말고 잠시 원위치에 둔 뒤 entities 단계에서 옮긴다.
- 경로 별칭(`@/shared/...`)을 먼저 세팅하면 이후 이동이 수월하다.

## 2단계: entities 추출

도메인 개체를 식별해 `entities/`로 모은다. 보통 타입/모델이 흩어져 있는 것부터.

```
src/types/user.ts + src/components/UserAvatar.tsx + src/api/user.ts
   → src/entities/user/{model,ui,api}/ + index.ts
```

- 각 entity에 `index.ts`(Public API)를 만들고, 나머지 코드가 그 배럴을 통해 참조하도록 import를 교체.
- entity 간 직접 참조가 발견되면 상위 레이어 조합 또는 `@x` cross-import로 전환(→ import-rules.md).

## 3단계: features / widgets 분리

사용자 행위를 `features/`로, 재사용 UI 블록을 `widgets/`로 뽑는다.

- 폼 제출·토글·필터 같은 상호작용 → `features/*`
- 헤더·사이드바·리스트 섹션 같은 조합 블록 → `widgets/*`
- 이 단계에서 "거대 컴포넌트"가 자연스럽게 여러 feature로 쪼개진다.

## 4단계: pages / app 정리

- 각 라우트 화면을 `pages/*` 슬라이스로 정리하고, 프레임워크 라우트 파일은 얇게(re-export) 만든다. Next.js는 → nextjs-integration.md.
- 전역 프로바이더·스타일·초기화를 `app/`(FSD app 레이어)로 모은다.

## 실전 팁

- **한 슬라이스씩 PR**: "entities/user 이동" 같은 작은 단위로 나눠 리뷰 가능하게.
- **Steiger를 조기 도입**하되 처음엔 경고만: 위반 목록이 곧 마이그레이션 백로그가 된다(→ import-rules.md).
- **경로 별칭 먼저**: `@/*` 별칭을 초반에 깔면 파일 이동 시 상대경로 지옥을 피한다.
- **혼재 허용**: 마이그레이션 중에는 FSD 폴더와 레거시 폴더가 공존한다. 정상이다. 새 규칙 위반만 막고, 기존은 점진 이동.
- **린트로 역행 방지**: 이미 옮긴 레이어에 대한 import 규칙을 CI에서 강제해 되돌아가지 않게 한다.

## 흔한 함정

- **한 번에 전부 옮기려는 시도** — 거대 PR은 리뷰·롤백이 불가능하다. 반드시 점진.
- **위 레이어부터 시작** — pages부터 만지면 아직 정리 안 된 하위를 참조하게 되어 규칙이 계속 깨진다. 반드시 shared부터.
- **shared 오염** — 마이그레이션 압박에 도메인 코드를 shared로 몰아넣으면 나중에 다시 다 빼야 한다.
- **Public API 생략** — 이동만 하고 index.ts를 안 만들면 내부 경로 직접 참조가 그대로 남아 격리 이점이 사라진다.
- **entity 간 결합 방치** — 옮기면서 발견된 슬라이스 간 직접 import를 미루면 순환 의존이 굳어진다. 발견 즉시 `@x` 또는 상위 조합으로 처리.
