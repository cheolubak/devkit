# .gitignore 병합과 .claude 리뷰 자산 추적 설계

**날짜**: 2026-08-06
**상태**: 승인됨
**선행**: [devkit update 구현](2026-08-02-devkit-update-design.md), [devkit-cli 게시 가능화](2026-08-05-publishable-cli-design.md)

## 1. 문제

두 가지가 얽혀 있다.

### 1.1 devkit 이 놓는 `.claude` 리뷰 자산이 무시될 수 있다

`create`·`update` 는 생성물에 정확히 두 파일을 놓는다.

| 파일 | 출처 |
| --- | --- |
| `.claude/commands/review.md` | `templates/_shared` (세 유형 공통) |
| `.claude/agents/devkit-reviewer.md` | 유형별 템플릿 |

이 둘은 **팀원과 CI 가 같은 리뷰 기준을 쓰기 위한 공유 자산**이므로 커밋돼야
한다. 그런데 `.claude/` 를 통째로 무시하는 프로젝트가 흔하다(그 디렉토리에는
`settings.local.json` 같은 개인 스크래치도 들어간다). 그런 프로젝트에
`devbak update` 를 돌리면 자산이 놓이기는 하되 **git 이 보지 못한다.**

### 1.2 `update` 가 `.gitignore` 를 통째로 덮어쓴다

`update/plan.ts:113-118` 에서 비-JSON 오버레이는 `files.set(relPath,
change.content)` 로 처리된다 — 대상 내용을 읽지 않고 템플릿 내용으로 교체한다.
따라서 `devbak update` 는 **사용자가 `.gitignore` 에 추가한 규칙을 지운다.**

JSON 오버레이는 이 문제를 이미 해결했다(`reduceJsonOverlay` 가 통짜 파일을
병합 패치로 환원해 사용자의 의존성·`compilerOptions.paths` 를 보존한다).
`.gitignore` 는 JSON 이 아니라 그 경로를 타지 못한다.

### 1.3 유형별로 동작이 갈린다

`_gitignore` 템플릿이 `nest`·`monorepo` 에만 있고 `next` 에는 없다. `next`
생성물은 `create-next-app` 이 만든 `.gitignore` 를 그대로 쓴다. 같은 툴킷이
유형에 따라 다르게 동작한다.

## 2. 결정

**줄 단위 병합 오버레이를 새 종류로 도입하고, `.gitignore` 를 거기에
태운다.** `_gitignore` 는 `_shared` 로 옮겨 세 유형이 같은 처리를 받는다.

### 2.1 병합 규칙 — create 와 update 가 같다

1. **대상의 기존 내용을 유지한다.**
2. 템플릿 줄 중 **대상에 없는 것만** 추가한다(공백 제거 후 정확한 문자열
   일치로 중복 판정).
3. **devkit 블록**이 이미 있으면 통째로 교체하고, 없으면 끝에 덧붙인다.

이 규칙이 두 경로에서 같다는 것이 요점이다. 이 저장소는 update 를 도입할 때
"`plan()` 을 진실로 두면 create/update 분기가 사라진다"를 원칙으로 세웠고,
`.gitignore` 도 create 시점에 **빈 디렉토리가 아니다** — `@nestjs/cli new` 와
`create-next-app` 이 이미 `.gitignore` 를 쓴 뒤에 오버레이가 얹힌다. 두 경로
모두 "기존 파일 위에 얹는다"가 실제 상황이므로 규칙을 나눌 이유가 없다.

### 2.2 devkit 블록

```
# >>> devkit >>>
# Claude 로컬 스크래치는 무시하되 devkit 이 놓는 리뷰 자산은 추적한다 —
# 팀원과 CI 가 같은 리뷰 기준을 쓰려면 커밋돼야 한다.
.claude/*
!.claude/agents/
!.claude/commands/
# <<< devkit <<<
```

**구분자로 감싸는 이유는 갱신 가능성이다.** 구분자가 없으면 "devkit 이 넣은
줄"과 "사용자가 넣은 줄"을 구별할 방법이 없어 규칙을 바꾸는 순간 갱신이 곧
파괴가 된다. 블록이 있으면 안쪽만 갈아끼우고 바깥은 손대지 않는다.

**`.claude/*` 로 시작하는 이유**: git 은 디렉토리 자체가 제외되면 그 안으로
내려가지 않으므로 `.claude/` 를 무시한 뒤 `!.claude/agents/...` 로 되살릴 수
없다. `.claude/*`(내용물 제외) 다음에 필요한 하위 디렉토리를 되살리는 것이
유일하게 동작하는 형태다.

부수 효과로 **`.claude/settings.local.json` 같은 개인 스크래치는 무시된다.**
지금은 `.claude` 가 통째로 추적돼 개인 설정까지 커밋된다 — 이 블록이 그것도
함께 고친다.

### 2.3 어디에 구현하는가

`PlannedChange` 에 종류를 하나 더한다.

```ts
export type PlannedChange =
  | { kind: 'file'; relPath: string; content: string }
  | { kind: 'json'; file: string; patch: JsonObject }
  | { kind: 'ignore'; file: string; lines: string[]; block: string[] };
```

`lines` 는 중복 없이 더할 템플릿 줄, `block` 은 구분자 안에 들어갈 내용이다.

**`plan()` 이 이 종류를 내면 create 와 update 양쪽이 자동으로 덮인다.** `run`
은 `plan()` 결과를 써서 실행하므로(설계 5.2절) 새 분기를 `run` 과
`update/plan.ts` 두 곳에만 더하면 된다. 오버레이 파일을 특별 취급하는 위치는
이미 셋으로 정해져 있다.

| 오버레이 종류 | 처리 | 상태 |
| --- | --- | --- |
| JSON (`package.json`, `tsconfig.json`) | 기준 내용 + 패치 | 기존 |
| **ignore (`.gitignore`)** | **기준 내용 + 줄 병합 + 블록 교체** | **신설** |
| 그 외 (`CLAUDE.md`, `eslint.config.mjs`) | 통째 덮어쓰기 | 기존 |

판정 함수는 `isJsonOverlay` 와 같은 자리에 둔다:

```ts
export function isIgnoreOverlay(relPath: string): boolean;  // basename 이 .gitignore 인가
```

### 2.4 템플릿 재배치

`templates/nest/_gitignore` 와 `templates/monorepo/_gitignore` 를
`templates/_shared/_gitignore` 하나로 합친다. 두 파일의 줄 중 한쪽에만 있는
것(`\.turbo/`, `\.next/`, `out/`, `coverage/`)은 **전부 포함한다** — 병합
규칙 2 가 대상에 이미 있는 줄을 걸러내므로 유형별로 남는 것은 무해하고,
대상이 나중에 그 도구를 쓰게 돼도 규칙이 이미 있다.

`next` 유형은 이제 처음으로 `.gitignore` 오버레이를 받지만 **덮어쓰지 않고
병합**하므로 `create-next-app` 의 규칙이 보존된다.

## 3. 대가와 한계

- **줄 삭제가 전파되지 않는다.** 템플릿에서 규칙을 지워도 기존 프로젝트에는
  남는다(블록 안은 예외 — 블록은 통째 교체된다). JSON 병합이 이미 같은 대가를
  치르고 있고, 같은 이유로 받아들인다: 남는 쪽이 사라지는 쪽보다 회복
  가능하다.
- **중복 판정은 정확한 문자열 일치다.** `node_modules` 와 `node_modules/` 는
  다른 줄로 취급돼 둘 다 남을 수 있다. 의미론적 정규화는 하지 않는다 — git
  의 무시 규칙 문법을 재구현하는 비용이 이득보다 크고, 중복 규칙은 무해하다.
- `_prettierignore` 도 같은 부류지만 이번 범위가 아니다. 같은 기전을 나중에
  확장할 수 있다.

## 4. 완료 기준

1. `create` 로 만든 세 유형 전부 `.gitignore` 에 devkit 블록이 있고,
   스캐폴딩 CLI 가 쓴 규칙이 **보존**된다.
2. `.claude/agents/devkit-reviewer.md` 와 `.claude/commands/review.md` 가
   생성물에서 **git 추적 대상**이고, `.claude/settings.local.json` 은 무시된다.
3. `.claude/` 를 무시하던 기존 프로젝트에 `update` 를 돌리면 두 자산이
   추적 대상이 된다.
4. **`update` 가 사용자가 추가한 `.gitignore` 규칙을 지우지 않는다.**
5. `update` 를 두 번 돌려도 `.gitignore` 가 커지지 않는다(멱등).
6. 블록 내용을 바꾼 뒤 `update` 를 돌리면 **블록만** 갱신되고 바깥은 그대로다.
7. `--dry-run` 이 병합 결과를 정확히 보여준다(plan/run 일치).
8. 기준선 유지: `pnpm test`·`pnpm typecheck` 7/7·`pnpm lint:ox` 에러 0·
   `pnpm lint:es` 8/8·`pnpm test:e2e` 13/13.

## 5. 범위 밖

- `_prettierignore` 의 병합
- git 무시 규칙의 의미론적 중복 제거
- `.claude` 이외의 자산에 대한 추적 정책
