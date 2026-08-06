# devkit — 코드 작성 참고 자산(`devkit-implementer`) 설계 문서

- 날짜: 2026-08-06
- 대상: `packages/devkit-cli` 의 템플릿 자산
- 선행 문서: `2026-08-01-devkit-claude-review-design.md` (리뷰 자산 설계)

## 0. 요약

`devbak create` / `devbak update` 가 놓는 `.claude/` 자산은 현재 **리뷰 쪽만**
있다. 리뷰어 에이전트(`devkit-reviewer`)와 `/review` 커맨드, PR 자동 리뷰
워크플로가 전부다. 코드를 **쓰는** 시점에 참고할 기준은 어디에도 없고,
`CLAUDE.md` 가 담은 몇 줄(레이어 표, 규칙 2~4개)이 사실상 전부다.

이 설계는 리뷰어와 대칭인 **작성자 에이전트** `devkit-implementer` 를 유형별로
추가하고, `CLAUDE.md` 에 그것을 가리키는 포인터 절을 둔다.

### 0.1 왜 리뷰만으로는 부족한가

리뷰어 문서는 "무엇을 지적할 것인가"의 언어로 쓰여 있다. 그것은 코드가 이미
쓰인 뒤에만 쓸모가 있다. 같은 지식을 작성 시점에 쓰려면 **결정 절차**의
형태여야 한다 — "`shared/` 에 재사용 안 되는 게 있으면 지적한다"가 아니라
"이 코드를 어느 레이어에 둘지 이 순서로 정한다".

리뷰 기준과 작성 기준이 갈라지면 매 PR 에서 뒤늦게 재작업이 생긴다. 그래서
작성자 문서는 **리뷰어의 관점과 1:1 대칭**으로 만든다(3절).

## 1. 실측 (2026-08-06)

### 1.1 현재 템플릿의 `.claude` 자산

```
templates/_shared/.claude/commands/review.md          유형 공통
templates/_shared/.github/workflows/claude-review.yml  유형 공통
templates/{nest,next,monorepo}/.claude/agents/devkit-reviewer.md  유형별 3벌
templates/{nest,next,monorepo}/CLAUDE.md                          유형별 3벌
```

### 1.2 create/update 는 파일 목록을 코드에 갖지 않는다

- create: 레시피의 `copyOverlay('<type>')` 가 `templates/<type>/` 트리를
  **재귀 복사**한다(`src/ops/copy-overlay.ts`). 새 파일을 등록할 목록이 없다.
- update: `src/lib/categories.ts` 의 `FILE_PATTERNS` 가 **경로 정규식**으로
  카테고리를 정한다. `.claude/agents/.+` 는 이미 `claude` 카테고리다.

따라서 **템플릿에 파일을 두는 것만으로 create·update 양쪽이 배선된다.**
`src/` 아래 소스 변경이 필요 없다. 이것은 우연이 아니라 설계 5.4절(리뷰
설계 문서)이 "카테고리는 레시피 태그가 아니라 경로 패턴"으로 정한 결과다.

### 1.3 드리프트 방어가 이미 걸려 있다

`tests/overlay-coverage.test.ts` 가 템플릿의 모든 파일이 카테고리에 매칭되는지
검사한다. 매칭 안 되는 파일은 어떤 `--only` 로도 갱신되지 않으면서 update 가
성공을 보고하므로, 그 조용한 실패를 이 테스트가 막는다. 새 에이전트는
`claude` 에 걸리므로 통과한다.

### 1.4 모노레포는 앱 하위의 `.claude` 를 통째로 지운다

`src/recipes/monorepo.ts` 는 next 레시피를 `apps/web` 에 합성한 뒤
`apps/web/.claude` 를 `required: true` 로 제거한다. 즉 모노레포에서는
**루트의 monorepo 판 1벌만** 남는다. 새 에이전트도 같은 규칙을 그대로 탄다.

### 1.5 저장소 `.gitignore` 가 템플릿의 `.claude` 를 삼키고 있었다 (구현 중 발견)

루트 `.gitignore` 의 `.claude/`(로컬 에이전트 스크래치용)가
`packages/devkit-cli/templates/<type>/.claude/` 까지 함께 무시하고 있었다.
기존 `devkit-reviewer.md` 들은 `-f` 로 강제 추가돼 추적 중이라 이 사실이
드러나지 않았다.

증상이 위험한 이유는 **아무것도 실패하지 않기** 때문이다. 테스트 스위트는
디스크를 읽으므로 전부 통과하고, `git add -A` 는 조용히 건너뛰며, 커밋도
성공한다. clone·CI·게시본에는 파일이 없는데 로컬 검증은 초록불이다.

조치 2건:

1. `.gitignore` 에 `!packages/devkit-cli/templates/*/.claude/` 를 더한다.
   git 은 무시된 **디렉토리** 아래로 내려가지 않으므로 파일 하나만 되살릴 수
   없다 — 디렉토리 자체를 되살려야 한다. 루트 `.claude/` 는 계속 무시된다.
2. `tests/overlay-coverage.test.ts` 에 "템플릿의 모든 파일이 git 에 추적된다"
   관문을 더한다. 이 사고의 재발을 잡는 유일한 자동 검증이다.

## 2. 범위 결정

### 2.1 확정된 결정 3건

1. **형태**: 유형별 `.claude/agents/devkit-implementer.md` + `CLAUDE.md` 에
   한 절짜리 포인터. `.claude/agents/` 는 서브에이전트를 띄울 때만 읽히므로,
   항상 로드되는 `CLAUDE.md` 에서 가리켜 두 경로 모두에서 걸리게 한다.
2. **내용 수준**: 리뷰어의 관점과 1:1 대칭인 **결정 절차**. 코드 골격 예시는
   싣지 않는다 — 실제 코드와 낡아 갈라질 위험이 이득보다 크다.
3. **배치**: `_shared` 가 아니라 유형별 3벌. 작성 규칙은 유형마다 실제로
   다르다(FSD vs NestJS 계층 vs 워크스페이스).

### 2.2 비범위

- **`CLAUDE.md` 통째 덮어쓰기 문제**(4.3절)는 이번에 고치지 않는다.
- 작성용 슬래시 커맨드(`/implement` 류)는 만들지 않는다. `CLAUDE.md` 포인터가
  항상 걸리므로 별도 진입점이 없어도 동작한다. 필요해지면 그때 만든다.
- 전역(`~/.claude`) 자산은 건드리지 않는다. 이 설계는 생성물 안쪽만 다룬다.

## 3. 문서 구조 — 이 설계의 핵심

### 3.1 원칙: 린터가 하는 일을 손으로 흉내내지 않는다

리뷰어 문서의 발명은 "지적하지 않는 것"을 **먼저** 못 박은 것이었다. 작성자
문서에는 그 대응물이 필요하다. 그러지 않으면 에이전트가 import 를 손으로
정렬하고 세미콜론을 맞추는 데 시간을 쓴다 — 저장 후 `prettier` 와
`eslint --fix` 가 1초 만에 할 일이다.

그래서 문서는 **「손으로 하지 않는 것」이 「쓸 때 결정하는 것」보다 먼저**
온다. 순서를 테스트로 고정한다(5절).

### 3.2 다섯 개의 결정 (리뷰어 관점과 1:1)

| # | 작성 시점의 결정 | 대칭되는 리뷰어 관점 |
| --- | --- | --- |
| 1 | 이 코드를 어느 레이어/계층에 둘 것인가 | 크로스 파일 아키텍처 |
| 2 | 경계를 어디에 그을 것인가 (Server/Client, 검증·트랜잭션) | Server/Client 경계 |
| 3 | 실패를 어떻게 드러낼 것인가 | 조용한 실패 |
| 4 | 어떤 테스트를 함께 쓸 것인가 | 테스트 공백 |
| 5 | 마치기 전 무엇을 돌리고 무엇을 확인할 것인가 | 의도와 구현의 불일치 |

### 3.3 유형별 고유 내용

- **next / monorepo**: FSD 레이어 결정 절차(`views` 는 FSD 의 페이지 레이어,
  라우팅은 `src/app/`), 슬라이스의 public API(`index.ts`) 를 먼저 정하는 습관,
  `'use client'` 는 잎(leaf)에만, Server Action 은 입력을 zod 로 검증.
- **nest**: Controller 는 thin, 로직은 Service, 입력 검증은 zod
  (`class-validator` 금지), 트랜잭션 경계는 Service 안에서 명시,
  유닛 테스트 + supertest e2e.
- **monorepo**: 위 프론트엔드 내용 + 워크스페이스 — 새 의존은 `catalog:` 로
  선언, 앱 간 직접 import 금지(공유는 `packages/` 를 거친다), 린트·빌드는
  루트에서 한 번.

## 4. 산출물

### 4.1 파일

```
templates/next/.claude/agents/devkit-implementer.md      (신규)
templates/nest/.claude/agents/devkit-implementer.md      (신규)
templates/monorepo/.claude/agents/devkit-implementer.md  (신규)
templates/{next,nest,monorepo}/CLAUDE.md                 (포인터 절 추가)
```

`src/` 소스 변경은 없다(1.2절).

### 4.2 `CLAUDE.md` 포인터

각 유형의 `CLAUDE.md` 에 다음 성격의 절을 더한다.

```markdown
## 코드를 쓰기 전에

`.claude/agents/devkit-implementer.md` 를 먼저 읽는다. 레이어 배치·경계·
실패 처리·테스트 동반 기준이 거기에 있다. 리뷰 기준은 같은 디렉토리의
`devkit-reviewer.md` 이며 둘은 같은 관점을 작성/리뷰 양쪽에서 본 것이다.
```

### 4.3 알려진 트레이드오프 — `CLAUDE.md` 는 통째로 덮어쓰인다

`PlannedChange` 의 `kind: 'file'` 은 **전체 내용 치환**이다(`src/types.ts`).
`CLAUDE.md` 는 `claude` 카테고리의 파일이므로 `devbak update` 가 사용자가
손으로 적어 둔 내용을 지운다. 이는 이번 변경이 만드는 문제가 아니라 기존
동작이며, `.gitignore` 만 병합 방식으로 예외 처리되어 있다(별도 브랜치).

이번 스코프에서는 고치지 않는다. `CLAUDE.md` 병합 또는 사용자 영역 분리는
follow-up 이다(7절).

## 5. 테스트 전략

`tests/authoring-assets.test.ts` 를 신설한다. 리뷰어 테스트
(`tests/review-assets.test.ts`) 와 같은 방식으로 **문서의 구조**를 고정한다.

1. 세 유형 모두 frontmatter 의 `name` 이 `devkit-implementer` 다.
2. 「손으로 하지 않는 것」과 「쓸 때 결정하는 것」 헤더가 **둘 다 존재**하고,
   전자가 먼저 온다. (존재를 따로 단언한다 — `indexOf(A) < indexOf(B)` 는
   A 가 없을 때 `-1 < N` 으로 통과하는 항상-통과 단언이 된다.)
3. 「손으로 하지 않는 것」 절이 각 도구를 명시한다(`prettier`, `oxlint`, `tsc`).
4. 다섯 결정이 「쓸 때 결정하는 것」 **이후로 스코프해서** 존재한다.
5. 유형별 고유 항목: next/monorepo 는 `'use client'`·`views`·`FSD`,
   nest 는 `zod`·`트랜잭션`·`e2e`, monorepo 는 `catalog:`.
6. **결합 고정**: 세 유형의 `CLAUDE.md` 가
   `.claude/agents/devkit-implementer.md` 경로를 문자열로 가리킨다.

6번이 이 테스트의 존재 이유다. 포인터 경로가 끊겨도 **아무것도 실패하지
않는다** — Claude 가 기준 문서를 못 찾고 기본 판단으로 코드를 쓴 뒤 정상
완료를 보고한다. 리뷰어 자산이 가졌던 것과 동일한 조용한 실패 구조이며,
리뷰 설계 문서가 `REVIEWER_PATH` 를 테스트로 고정한 것과 같은 이유다.

## 6. 완료 기준

1. 세 유형의 템플릿에 `devkit-implementer.md` 가 있고 3.2절의 다섯 결정을
   모두 갖는다.
2. 세 유형의 `CLAUDE.md` 가 그 경로를 가리킨다.
3. `tests/authoring-assets.test.ts` 가 위 6개 단언을 갖고 통과한다.
4. `tests/overlay-coverage.test.ts` 가 그대로 통과한다(새 파일이 `claude`
   카테고리에 매칭된다).
5. `pnpm --filter @cheolubak/devkit-cli test` 전체 그린.
6. `pnpm lint` · `pnpm format:check` 그린.
7. `src/` 아래 소스 변경이 0 이다 — 배선이 실제로 불필요했음을 증명한다.
8. 세 에이전트 문서가 **git 에 추적된다**(1.5절). `git ls-files` 로 확인되며
   `tests/overlay-coverage.test.ts` 가 자동으로 지킨다.

## 7. 미결 사항 / follow-up

- `CLAUDE.md` 를 update 가 통째로 덮어쓰는 문제(4.3절). `.gitignore` 처럼
  병합하거나, 사용자 영역을 마커로 분리하는 방식이 후보다.
- 작성자 문서와 리뷰어 문서가 같은 사실을 두 벌로 적는다. 지금은 관점이
  달라(절차 vs 판정) 중복이 정당하지만, 한쪽만 갱신되면 갈라진다. 갈라짐이
  실제로 관측되면 공통 사실을 한 파일로 빼는 것을 검토한다.
