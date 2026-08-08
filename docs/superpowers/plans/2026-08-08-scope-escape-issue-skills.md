# 범위 이탈 이슈 발행·처리 스킬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 작업 중 범위를 벗어난 발견을 이슈로 빼는 스킬과, 그 이슈를 읽어 PR 까지 가는 스킬을 devkit 템플릿과 전역 gstack 양쪽에 놓는다.

**Architecture:** 스킬 두 개는 **이슈 본문의 정형**으로만 이어진다. 발행이 쓰고 처리가 읽으며, 두 문서에 손으로 적히는 그 정형이 어긋나지 않도록 마커로 구획해 테스트가 대조한다. 발행 스킬의 범위 판정은 새 선언 절차를 만들지 않고 **브랜치 이름**을 재사용한다. devkit 판과 전역판은 작업 공간 확보 방식 한 군데만 다르며, 동일성은 강제하지 않는다.

**Tech Stack:** TypeScript(ESM, strict) · vitest · oxlint + ESLint 10 · pnpm workspace · `gh` CLI

**설계 문서:** `docs/superpowers/specs/2026-08-08-scope-escape-issue-skills-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm** 이다. `npm` 을 쓰지 않는다.
- 들여쓰기 2칸, TypeScript strict, `.then()` 대신 `async/await`.
- 소스의 모든 상대 import 는 **`.js` 확장자**를 붙인다(ESM). `../types.js` 처럼 쓴다.
- 커밋 메시지는 한글 imperative mood. 본문에 **왜**를 남긴다.
- 작업 브랜치는 `worktree-cozy-painting-sparkle` 이다. `main` 으로 체크아웃하지 않는다.
- 검증 명령은 저장소 루트에서 돌린다: `pnpm --filter @cheolubak/devkit-cli test`, `pnpm lint:es`, `pnpm build`.
  `pnpm lint` 는 단락 평가라 ESLint 단독 결과를 보려면 `pnpm lint:es` 를 쓴다.
- **이 저장소는 병렬 세션이 많아 작업 중 HEAD 가 움직인다.** 커밋 직전 `git log --oneline -1` 로 재확인한다.
- 검증용 임시 파일을 **저장소 안에 만들지 않는다.** 자동 훅이 커밋한다.

---

## File Structure

| 파일 | 책임 |
| --- | --- |
| `packages/devkit-cli/templates/_skills/scope-escape-issue/SKILL.md` | 신규. 범위 판정 → 묻기 → `gh issue create`. **이슈 본문 정형의 원본** |
| `packages/devkit-cli/templates/_skills/issue-to-pr/SKILL.md` | 신규. 이슈 읽기 → 좌표 확인 → 구현·검증·커밋 → 승인 후 PR |
| `packages/devkit-cli/src/lib/skill-sets.ts` | 수정. `COMMON` 에 두 이름 추가 |
| `packages/devkit-cli/templates/_shared/.claude/commands/issue.md` | 신규. 발행을 강제 호출하는 얇은 래퍼 |
| `packages/devkit-cli/templates/_shared/.claude/commands/issue-work.md` | 신규. 이슈 번호를 인자로 받는 얇은 래퍼 |
| `packages/devkit-cli/tests/skill-assets.test.ts` | 수정. 개수 갱신 + 계약 드리프트 가드 + 새 커맨드 단언 |
| `packages/devkit-cli/tests/plan-ops.test.ts` | 수정. `_shared` 오버레이 경로 목록에 커맨드 2개 |
| `packages/devkit-cli/tests/update-plan.test.ts` | 수정. `--only claude` 경로 목록에 커맨드 2개 |
| `packages/devkit-cli/tests/e2e/create.e2e.test.ts` | 수정. 생성 결과에 스킬·커맨드 실재 단언 |
| `packages/devkit-cli/tests/__snapshots__/recipe-{nest,next,monorepo}.test.ts.snap` | 갱신 |
| `/Users/dabot/Documents/develop/claude-skills/skills/scope-escape-issue/SKILL.md` | 신규. 전역판 |
| `/Users/dabot/Documents/develop/claude-skills/skills/issue-to-pr/SKILL.md` | 신규. 전역판(worktree 사용) |

### 이슈 본문 계약의 표현 방식

설계 7.2 절은 "두 문서의 코드 블록에서 `## ` 제목을 뽑아 대조"라고 적었다. 구현에서는 그것을 **마커로 구획**한다 — 코드 블록은 문서에 여러 개 생길 수 있어 "그 블록"을 특정할 수 없다.

두 `SKILL.md` 모두 정형을 다음 마커 사이에 둔다:

```
<!-- ISSUE-BODY-CONTRACT:START -->
<!-- ISSUE-BODY-CONTRACT:END -->
```

테스트는 마커 사이에서 `^## ` 를 뽑아 두 목록을 **순서까지** 비교한다.

---

## Task 1: 발행 스킬 `scope-escape-issue`

스킬을 풀에만 넣고 `SKILL_SETS` 에 안 넣으면 기존 단언 **"풀의 모든 스킬이 최소 한 유형에 선택된다"** 가 즉시 깨진다. 그래서 저작·배선·개수 갱신을 한 태스크로 묶는다.

**Files:**
- Create: `packages/devkit-cli/templates/_skills/scope-escape-issue/SKILL.md`
- Modify: `packages/devkit-cli/src/lib/skill-sets.ts`
- Modify: `packages/devkit-cli/tests/skill-assets.test.ts`
- Update: `packages/devkit-cli/tests/__snapshots__/recipe-{nest,next,monorepo}.test.ts.snap`

**Interfaces:**
- Produces: 풀 디렉토리 이름 `scope-escape-issue`. `SKILL_SETS.nest/next/monorepo` 가 모두 이 이름을 포함한다.
- Produces: `SKILL.md` 안의 `<!-- ISSUE-BODY-CONTRACT:START -->` … `END` 구획. Task 2 가 이 구획의 `## ` 제목 목록과 대조한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/skill-assets.test.ts` 의 `describe('devkit-stack 스킬', ...)` 블록 **바로 아래**에 새 describe 를 추가한다.

```ts
describe('scope-escape-issue 스킬', () => {
  it('frontmatter의 name이 scope-escape-issue 다', async () => {
    const doc = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: scope-escape-issue\n/);
  });

  it('브랜치 이름을 범위 판정의 근거로 삼는다', async () => {
    // 새 선언 절차를 만들지 않고 이미 있는 선언을 재사용하는 것이 이 스킬의
    // 핵심 결정이다(설계 5.2절). 이 줄이 빠지면 판정 기준 자체가 사라진다.
    const doc = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    expect(doc).toContain('git rev-parse --abbrev-ref HEAD');
  });

  it('본문을 stdin 으로 넘긴다 — 임시 파일을 만들지 않는다', async () => {
    // 저장소 안에 임시 파일을 만들면 자동 훅이 커밋한다(실제 사고 기록).
    const doc = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    expect(doc).toContain('--body-file -');
  });

  it('중복 이슈를 먼저 훑는다', async () => {
    const doc = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    expect(doc).toContain('gh issue list');
  });

  it('발행 후 원래 작업으로 돌아오라고 지시한다', async () => {
    // 이 문장이 없으면 스킬이 막으려던 바로 그 일(범위 이탈)을 스킬이 한다.
    const doc = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    expect(doc).toContain('## 5. 원래 작업으로 돌아온다');
  });

  it('gh 를 쓸 수 없을 때 발견을 대화에 남기라고 지시한다', async () => {
    const doc = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    expect(doc).toContain('유실 방지');
  });
});
```

같은 파일에서 기존 개수 단언 세 곳을 고친다.

```ts
    expect(dirs).toHaveLength(44);
```

```ts
    expect(tracked.length).toBeGreaterThan(44);
```

```ts
    expect(SKILL_SETS.nest).toHaveLength(24);
    expect(SKILL_SETS.next).toHaveLength(27);
    expect(SKILL_SETS.monorepo).toHaveLength(44);
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL. `scope-escape-issue/SKILL.md` 를 못 읽어 `ENOENT`, 그리고 개수 단언이 `44 != 43` 으로 깨진다.

- [ ] **Step 3: `scope-escape-issue/SKILL.md` 를 쓴다**

`packages/devkit-cli/templates/_skills/scope-escape-issue/SKILL.md` 를 만들고 아래를 그대로 넣는다.

````markdown
---
name: scope-escape-issue
description: "지금 브랜치가 하려던 일의 범위를 벗어난 발견을 이슈로 빼낸다. 발견을 보고하고 물어본 뒤, 승낙하면 gh 로 이슈를 발행하고 곧바로 원래 작업으로 돌아온다.\nAPPLIES: 작업 단위를 마치고 사용자에게 보고하기 직전 — 커밋 직전, 검증을 통과한 뒤, 턴을 끝내기 전. 그 시점에 지금 작업과 무관한 결함·개선점을 발견해 두었다면 적용한다. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"이건 나중에\", \"이슈로 빼\", \"이슈로 만들어\", \"범위 밖\", \"지금 할 일은 아닌데\", \"딴 게 보이는데\", \"별개로\", \"따로 처리\", 지금 브랜치와 무관한 버그·문서 불일치·없는 가드·같은 결함의 다른 사례·리팩터 기회를 발견했을 때.\nSKIP: 발견한 것이 지금 작업을 막고 있으면 이슈로 빼지 말고 지금 고친다. 이미 열려 있는 이슈를 처리하는 것은 issue-to-pr 이다."
---

# 범위를 벗어난 발견을 이슈로 뺀다

작업 중에는 지금 하는 일과 무관한 것이 자주 눈에 띈다. 그것을 그 자리에서
고치면 브랜치가 부풀어 리뷰가 어려워지고, 그냥 넘기면 아무도 기억하지 않는다.
이 문서는 그 사이를 지킨다 — **발견을 이슈로 옮겨 두고 하던 일로 돌아온다.**

## 언제 이 문서를 여는가

"발견하는 즉시"가 아니다. 그 시점은 특정되지 않아 실제로는 지켜지지 않는다.

**작업 단위를 마치고 사용자에게 보고하기 직전에 한 번 점검한다.** 커밋 직전,
검증을 통과한 뒤, 턴을 끝내기 전 — 이미 멈춰 서서 돌아보는 지점이다.

## 1. 지금 작업의 범위를 확인한다

```bash
git rev-parse --abbrev-ref HEAD
```

브랜치 이름이 주제를 담으면 **그것이 선언된 범위**다.

- `fix/devbak-symlink-entrypoint` → "전역 devbak 진입점 수정"
- `feature/auto-merge-workflow` → "자동 머지 워크플로 추가"

이름이 주제를 담지 않으면(`main`, 자동 생성된 `worktree-*` 등) 그 세션에서
**한 번만** 묻는다.

> 지금 작업을 한 문장으로 뭐라고 할까요?

받은 답은 **대화 맥락에만 유지한다.** 파일로 저장하지 않는다 — 저장하면 그
파일이 다음 작업에서 낡은 범위를 주장하게 되고, 아무도 갱신하지 않는다.

## 2. 발견이 범위 밖인지 판정한다

| 유형 | 이슈로 | 지금 한다 |
| --- | --- | --- |
| 무관한 버그 | 지금 작업과 코드 경로가 겹치지 않음 | 그 버그가 지금 작업을 **막고 있음** |
| 문서-실물 불일치 | 다른 문서·다른 유형의 이야기 | 지금 고치는 코드가 그 문서의 근거임 |
| 없는 가드·테스트 | 지금 결함과 다른 종류를 막는 것 | 지금 고친 결함의 **재발 방지** |
| 같은 결함의 다른 사례 | 다른 패키지·다른 유형에도 있음 | 같은 파일·같은 함수 안 |
| 리팩터 기회 | 파일이 커졌다, 이름이 나쁘다 | 지금 편집하는 그 자리가 걸림돌 |

오른쪽 열을 무시하고 전부 이슈로 빼면 작업이 끝나지 않는다. 특히 **재발 방지
테스트는 지금 같이 쓴다** — 그것이 지금 고친 결함의 일부다.

## 3. 묻는다

발견을 한두 문장으로 보고하고 세 갈래로 묻는다.

1. 지금 고친다
2. 이슈로 발행한다
3. 넘어간다

**묻는 도구는 이 문서가 규정하지 않는다.** 환경에 따라 쓸 수 있는 것이
다르다 — 로컬 터미널과 원격 채널의 제약이 같지 않다. 현재 환경의 규칙을
따른다.

## 4. 발행한다

먼저 같은 이슈가 이미 있는지 훑는다.

```bash
gh issue list --state open --search "<핵심어>"
```

있으면 새로 만들지 않고 그 번호를 알린다.

없으면 발행한다. 본문은 **stdin 으로** 넘긴다.

```bash
gh issue create --title "<명령형 한 줄>" --body-file -
```

`--body` 인라인은 백틱·개행에서 깨지고, 임시 파일은 저장소 안에 만들면 자동
훅이 커밋한다. stdin 은 파일을 아예 만들지 않는다.

본문은 아래 형식을 그대로 따른다. 이 구획이 `issue-to-pr` 과의 계약이다.

<!-- ISSUE-BODY-CONTRACT:START -->
## 무엇을

한 문장. 무엇을 바꿔야 하는가.

## 왜 지금이 아닌가

현재 브랜치가 하려던 일과 어떻게 다른지. 1·2 절의 판정 근거를 그대로 남긴다.

## 발견 좌표

- 커밋: `git rev-parse HEAD` 의 값
- 브랜치: 발견 시점의 브랜치 이름
- 파일: `path/to/file.ts:120` 형태로 나열

## 제안 방향

2-3 줄. 선택하지 않은 길이 있으면 왜 아닌지도 적는다.

## 무엇으로 다 됐다고 판단하나

확인 방법. 테스트·명령·관찰 가능한 결과.
<!-- ISSUE-BODY-CONTRACT:END -->

본문 맨 끝에 서명 한 줄을 남긴다.

```
<!-- scope-escape-issue -->
```

`issue-to-pr` 이 이것으로 정형 본문임을 안다. 라벨을 쓰지 않는 이유가 이것이다 —
라벨은 저장소에 미리 존재해야 하고, 없으면 `gh` 가 거부한다. 갓 만든 저장소에는
커스텀 라벨이 없다.

## 5. 원래 작업으로 돌아온다

이슈 번호와 URL 만 보고하고 **하던 일로 즉시 복귀한다.** 방금 만든 이슈를 그
자리에서 처리하러 가지 않는다. 그러면 이 문서가 막으려던 바로 그 일을 이
문서가 하게 된다.

## `gh` 를 쓸 수 없을 때

인증이 없거나 리모트가 없으면 **멈추고 그 사실을 보고한다.** 로컬 파일로
대신 남기지 않는다.

다만 **발견 내용은 대화에 그대로 남긴다.** 이슈를 못 만들었다고 발견까지
버리면 원래 문제로 돌아간다. 이것은 폴백이 아니라 유실 방지다.
````

- [ ] **Step 4: `skill-sets.ts` 의 `COMMON` 에 이름을 더한다**

`packages/devkit-cli/src/lib/skill-sets.ts` 의 `COMMON` 배열 마지막 항목 뒤에 한 줄 추가한다.

```ts
const COMMON = [
  'devkit-stack',
  'eslint',
  'prettier',
  'oxlint-eslint-hybrid',
  'typescript-patterns',
  'tdd',
  'clean-code',
  'verify-implementation',
  'scope-escape-issue',
] as const;
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: PASS.

- [ ] **Step 6: 스냅샷을 갱신하고 삭제 줄이 0인지 본다**

Run: `pnpm --filter @cheolubak/devkit-cli test -u`

그 다음 **반드시** 확인한다:

```bash
git diff --stat packages/devkit-cli/tests/__snapshots__
git diff packages/devkit-cli/tests/__snapshots__ | grep '^-' | grep -v '^---'
```

Expected: 두 번째 명령의 출력이 **비어 있다**. `-u` 로 초록불이 된 것 자체는
검증이 아니다 — 실제 검증은 "삭제된 줄이 0인가"다. 삭제 줄이 있으면 이 태스크가
기존 자산을 지운 것이므로 멈추고 원인을 본다.

- [ ] **Step 7: 스킬 파일이 실제로 git 에 추적되는지 확인한다**

```bash
git add packages/devkit-cli/templates/_skills/scope-escape-issue
git status --short packages/devkit-cli/templates/_skills/scope-escape-issue
```

Expected: `A  packages/devkit-cli/templates/_skills/scope-escape-issue/SKILL.md` 가 보인다.
아무것도 안 보이면 무시되고 있는 것이다. `git check-ignore -v <경로>` 로 어느 줄이
잡았는지 확인한다.

- [ ] **Step 8: 전체 검증과 커밋**

```bash
pnpm --filter @cheolubak/devkit-cli test
pnpm lint:es
pnpm build
```

세 개가 전부 통과하면 커밋한다. **커밋 직전 `git log --oneline -1` 로 HEAD 를 재확인한다.**

```bash
git add packages/devkit-cli/templates/_skills/scope-escape-issue \
        packages/devkit-cli/src/lib/skill-sets.ts \
        packages/devkit-cli/tests/skill-assets.test.ts \
        packages/devkit-cli/tests/__snapshots__
git commit -m "feat: 범위 이탈 발견을 이슈로 빼는 스킬을 더한다"
```

---

## Task 2: 처리 스킬 `issue-to-pr` 과 계약 드리프트 가드

**Files:**
- Create: `packages/devkit-cli/templates/_skills/issue-to-pr/SKILL.md`
- Modify: `packages/devkit-cli/src/lib/skill-sets.ts`
- Modify: `packages/devkit-cli/tests/skill-assets.test.ts`
- Update: `packages/devkit-cli/tests/__snapshots__/recipe-{nest,next,monorepo}.test.ts.snap`

**Interfaces:**
- Consumes: Task 1 이 만든 `scope-escape-issue/SKILL.md` 의 `<!-- ISSUE-BODY-CONTRACT:START -->` 구획과 그 안의 `## ` 제목 다섯 개 — `무엇을`, `왜 지금이 아닌가`, `발견 좌표`, `제안 방향`, `무엇으로 다 됐다고 판단하나`. 순서까지 같아야 한다.
- Consumes: 서명 문자열 `<!-- scope-escape-issue -->`.
- Produces: 풀 디렉토리 이름 `issue-to-pr`. `SKILL_SETS` 세 유형 모두에 포함된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/skill-assets.test.ts` 의 Task 1 에서 만든 describe 아래에 두 describe 를 추가한다.

```ts
describe('issue-to-pr 스킬', () => {
  it('frontmatter의 name이 issue-to-pr 다', async () => {
    const doc = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: issue-to-pr\n/);
  });

  it('이슈 댓글까지 읽는다', async () => {
    // 이슈는 댓글에서 방향이 뒤집힌다. 본문만 읽으면 폐기된 계획을 구현한다.
    const doc = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');
    expect(doc).toContain('comments');
  });

  it('좌표 검증을 조상 검사가 아니라 존재 확인으로 한다', async () => {
    // 이 저장소는 squash 로 머지하고 브랜치를 지운다 — 발견 시점 커밋은
    // main 의 조상이 아니다. merge-base --is-ancestor 를 게이트로 쓰면
    // 정상 상황에서 매번 오경보한다(설계 1.4절).
    const doc = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');
    expect(doc).toContain('git cat-file -e');
    expect(doc).not.toContain('merge-base --is-ancestor');
  });

  it('검증하지 못했을 때 그렇다고 말하라고 지시한다', async () => {
    const doc = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');
    expect(doc).toContain('검증한 척하지 않는다');
  });

  it('푸시·PR 전에 승인을 받는다', async () => {
    // 소비자 프로젝트에서는 PR 생성이 자동 머지까지 이어진다(설계 6.7절).
    const doc = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');
    expect(doc).toContain('## 7. 승인을 받고 푸시·PR');
  });

  it('worktree 를 지시하지 않는다 — 소비자에겐 그 규약이 없다', async () => {
    // 없는 전제를 근거로 삼는 문서가 이 저장소가 반복해서 데인 형태다.
    const doc = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');
    expect(doc).not.toContain('git worktree');
  });

  it('구현 방법론을 새로 정하지 않고 기존 스킬을 가리킨다', async () => {
    const doc = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');
    expect(doc).toContain('.claude/skills/devkit-stack');
    expect(doc).toContain('.claude/skills/verify-implementation');
  });
});

const CONTRACT_START = '<!-- ISSUE-BODY-CONTRACT:START -->';
const CONTRACT_END = '<!-- ISSUE-BODY-CONTRACT:END -->';

function contractHeadings(doc: string, label: string): string[] {
  const start = doc.indexOf(CONTRACT_START);
  const end = doc.indexOf(CONTRACT_END);
  expect(start, `${label} 에 계약 시작 마커가 없다`).toBeGreaterThanOrEqual(0);
  expect(end, `${label} 에 계약 끝 마커가 없다`).toBeGreaterThan(start);
  return [...doc.slice(start, end).matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

describe('이슈 본문 계약', () => {
  it('발행 스킬과 처리 스킬이 같은 섹션 제목을 같은 순서로 쓴다', async () => {
    // 두 문서에 손으로 적히는 유일한 인터페이스다. 한쪽이 `## 발견 좌표`,
    // 다른 쪽이 `## 발견 위치` 여도 둘 다 문법적으로 멀쩡하고, 실패는 실제로
    // 이슈를 처리할 때야 드러난다.
    const publisher = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    const worker = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');

    const written = contractHeadings(publisher, 'scope-escape-issue');
    const read = contractHeadings(worker, 'issue-to-pr');

    expect(written.length, '발행 스킬의 계약 구획이 비어 있다').toBeGreaterThan(0);
    expect(read).toEqual(written);
  });

  it('처리 스킬이 발행 스킬의 서명을 그대로 안다', async () => {
    const publisher = await readFile(`${POOL_DIR}scope-escape-issue/SKILL.md`, 'utf8');
    const worker = await readFile(`${POOL_DIR}issue-to-pr/SKILL.md`, 'utf8');

    expect(publisher).toContain('<!-- scope-escape-issue -->');
    expect(worker).toContain('<!-- scope-escape-issue -->');
  });
});
```

같은 파일의 개수 단언을 다시 고친다.

```ts
    expect(dirs).toHaveLength(45);
```

```ts
    expect(tracked.length).toBeGreaterThan(45);
```

```ts
    expect(SKILL_SETS.nest).toHaveLength(25);
    expect(SKILL_SETS.next).toHaveLength(28);
    expect(SKILL_SETS.monorepo).toHaveLength(45);
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL. `issue-to-pr/SKILL.md` 가 없어 `ENOENT`, 개수 단언은 `45 != 44`.

- [ ] **Step 3: `issue-to-pr/SKILL.md` 를 쓴다**

`packages/devkit-cli/templates/_skills/issue-to-pr/SKILL.md` 를 만들고 아래를 그대로 넣는다.

````markdown
---
name: issue-to-pr
description: "이슈 번호를 받아 그 이슈를 읽고, 좌표가 아직 유효한지 확인한 뒤, 브랜치를 파고 구현·검증·커밋한다. 푸시와 PR 생성은 승인을 받고 한다.\nAPPLIES: 열려 있는 이슈를 실제로 처리해 코드를 바꿔야 할 때. 이슈 번호나 URL 이 주어졌을 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"이슈 처리해줘\", \"이슈 12 해줘\", \"이거 고쳐줘 (이슈 링크)\", \"백로그 처리\", \"이슈 읽고 작업\", \"issue\", 이슈 번호를 지목해 작업을 시작할 때.\nSKIP: 아직 이슈가 없고 지금 발견한 것을 이슈로 빼는 것은 scope-escape-issue 다. 이슈와 무관한 일반 구현은 이 문서를 열지 않는다."
---

# 이슈를 읽어 PR 까지 간다

## 1. 읽는다

```bash
gh issue view <N> --json title,body,state,url,comments
```

- `state` 가 `CLOSED` 면 **멈춘다.** 이미 처리된 것을 다시 하지 않는다.
- **댓글도 읽는다.** 이슈는 댓글에서 방향이 뒤집히는 일이 흔하다. 본문만
  읽으면 이미 폐기된 계획을 그대로 구현한다.

본문에 서명 `<!-- scope-escape-issue -->` 가 있으면 아래 정형으로 적혀 있다.

<!-- ISSUE-BODY-CONTRACT:START -->
## 무엇을

한 문장. 무엇을 바꿔야 하는가.

## 왜 지금이 아닌가

발행 시점의 브랜치가 하려던 일과 어떻게 다른지.

## 발견 좌표

- 커밋: 발견 시점의 `HEAD`
- 브랜치: 발견 시점의 브랜치 이름
- 파일: `path/to/file.ts:120` 형태

## 제안 방향

2-3 줄. 선택하지 않은 길이 있으면 그 이유도.

## 무엇으로 다 됐다고 판단하나

확인 방법. 테스트·명령·관찰 가능한 결과.
<!-- ISSUE-BODY-CONTRACT:END -->

서명이 없으면 **사람이 손으로 연 이슈**다. 자유 본문으로 읽고, 위 다섯 가지 중
빠진 것이 있으면 묻는다. 정형이 아니라고 거부하지 않는다.

## 2. 좌표가 아직 유효한지 확인한다

`발견 좌표` 의 커밋을 그대로 믿지 않는다.

```bash
git cat-file -e <발견SHA>
```

**커밋이 있으면** — 그 뒤로 해당 파일들이 바뀌었는지 본다.

```bash
git log <발견SHA>..HEAD -- <파일들>
```

출력이 있으면 본문의 라인 번호를 믿지 않고 다시 찾는다.

**커밋이 없으면** — squash 머지 후 브랜치가 삭제됐거나 GC 됐다. 이때는
**"좌표를 검증할 수 없다"고 말하고** 본문을 단서로만 써서 처음부터 탐색한다.
**검증한 척하지 않는다.**

> 조상 검사(`merge-base`)를 쓰지 않는 이유: squash 로 머지하면 원래 커밋은
> 내용이 전부 반영돼 있어도 조상이 아니다. 게이트로 쓰면 정상 상황에서 매번
> "낡았다"고 오경보한다.

## 3. 브랜치를 판다

```bash
git fetch origin
git switch -c <접두>/<슬러그> origin/main
```

접두는 이슈의 성격을 따른다 — 결함이면 `fix/`, 새 기능이면 `feature/`, 그 밖은
`chore/`. 슬러그는 이슈 제목에서 만든다.

브랜치 이름이 주제를 담아야 한다. 그 이름이 곧 `scope-escape-issue` 가 읽는
"선언된 범위"가 되기 때문이다 — 작업 중 또 딴 것이 보이면 그 문서가 이 이름을
근거로 판정한다.

## 4. 구현한다

**구현 방법을 이 문서가 새로 정하지 않는다.** 프로젝트에 이미 있는 것을 쓴다.

- 테스트를 먼저 쓰는 절차는 `.claude/skills/tdd`
- 고치고 확인하는 절차는 `.claude/skills/verify-implementation`
- 의존성·설정을 건드려야 하면 **먼저** `.claude/skills/devkit-stack` 을 읽는다.
  그 영역은 이미 결정돼 있고, 되돌리면 다른 곳이 깨진다.

## 5. 검증한다

`/verify` 를 쓴다. `pnpm lint` → `pnpm build` → `pnpm test` 를 순서대로 돌리고
실패 지점에서 멈춘다.

각 단계의 **실제 출력**을 근거로 판정한다. 종료 코드 0 이라는 것만으로 통과를
보고하지 않는다.

## 6. 커밋한다

한글 imperative mood. 본문에 **왜** 를 남긴다.

## 7. 승인을 받고 푸시·PR

여기서 한 번 멈춘다. 무엇을 바꿨는지 요약하고 푸시해도 되는지 묻는다.

이 프로젝트에는 `claude-review.yml` 과 `auto-merge.yml` 이 함께 있다. PR 을
열면 리뷰가 돌고, 통과 신호가 남으면 **자동으로 머지된다.** 즉 PR 생성은
사람이 개입할 수 있는 마지막 지점이다.

승인받으면:

```bash
git push -u origin <브랜치>
gh pr create --title "<제목>" --body-file -
```

PR 본문에 `Closes #<N>` 을 넣는다.

## 실패했을 때

검증이 깨지면 **멈추고 보고한다.** 이슈를 닫지 않고, PR 도 열지 않고,
"일부는 됐다"고 뭉개지 않는다.
````

- [ ] **Step 4: `skill-sets.ts` 의 `COMMON` 에 이름을 더한다**

```ts
const COMMON = [
  'devkit-stack',
  'eslint',
  'prettier',
  'oxlint-eslint-hybrid',
  'typescript-patterns',
  'tdd',
  'clean-code',
  'verify-implementation',
  'scope-escape-issue',
  'issue-to-pr',
] as const;
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: PASS.

- [ ] **Step 6: 계약 가드가 실제로 막는지 변이로 확인한다**

통과하는 테스트는 증거가 아니다. `issue-to-pr/SKILL.md` 의 계약 구획에서
`## 발견 좌표` 를 `## 발견 위치` 로 **잠시** 바꾼다.

Run: `pnpm --filter @cheolubak/devkit-cli test skill-assets`
Expected: FAIL. `이슈 본문 계약 > 발행 스킬과 처리 스킬이 같은 섹션 제목을 같은
순서로 쓴다` 가 깨지고, 차이가 diff 로 보인다.

확인했으면 **원래대로 되돌리고** 다시 돌려 PASS 를 본다. 되돌리는 것을 잊으면
다음 단계가 붉은 상태로 진행된다.

- [ ] **Step 7: 스냅샷을 갱신하고 삭제 줄이 0인지 본다**

```bash
pnpm --filter @cheolubak/devkit-cli test -u
git diff packages/devkit-cli/tests/__snapshots__ | grep '^-' | grep -v '^---'
```

Expected: 두 번째 명령의 출력이 비어 있다.

- [ ] **Step 8: 전체 검증과 커밋**

```bash
pnpm --filter @cheolubak/devkit-cli test
pnpm lint:es
pnpm build
```

통과하면 커밋한다. **커밋 직전 `git log --oneline -1` 로 HEAD 를 재확인한다.**

```bash
git add packages/devkit-cli/templates/_skills/issue-to-pr \
        packages/devkit-cli/src/lib/skill-sets.ts \
        packages/devkit-cli/tests/skill-assets.test.ts \
        packages/devkit-cli/tests/__snapshots__
git commit -m "feat: 이슈를 읽어 PR 까지 가는 스킬과 계약 가드를 더한다"
```

---

## Task 3: 슬래시 커맨드 두 개

**Files:**
- Create: `packages/devkit-cli/templates/_shared/.claude/commands/issue.md`
- Create: `packages/devkit-cli/templates/_shared/.claude/commands/issue-work.md`
- Modify: `packages/devkit-cli/tests/skill-assets.test.ts`
- Modify: `packages/devkit-cli/tests/plan-ops.test.ts:29-30`
- Modify: `packages/devkit-cli/tests/update-plan.test.ts:86-95`

**Interfaces:**
- Consumes: Task 1·2 의 스킬 이름 `scope-escape-issue`, `issue-to-pr`. 커맨드는
  `.claude/skills/<이름>` 형태로 이 둘을 가리킨다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/skill-assets.test.ts` 의 `describe('유형별 커맨드', ...)`
안, `it('_shared 가 verify 커맨드를 갖는다', ...)` **바로 아래**에 추가한다.

```ts
  it('_shared 가 이슈 커맨드 두 개를 갖고 각자 자기 스킬을 가리킨다', async () => {
    // 커맨드는 판정 기준을 자기 안에 복제하지 않고 스킬을 가리키는 얇은
    // 래퍼여야 한다. 끊긴 경로를 가리키면 근거 없이 일하고 성공을 보고한다.
    const issue = await readFile(`${TEMPLATES_DIR}_shared/.claude/commands/issue.md`, 'utf8');
    expect(issue).toContain('.claude/skills/scope-escape-issue');

    const issueWork = await readFile(`${TEMPLATES_DIR}_shared/.claude/commands/issue-work.md`, 'utf8');
    expect(issueWork).toContain('.claude/skills/issue-to-pr');
  });

  it('issue-work 커맨드가 이슈 번호를 인자로 받는다', async () => {
    // 인자를 받는 것이 이 커맨드가 스킬과 별개로 존재하는 유일한 이유다.
    // 인자가 없으면 /issue-to-pr 로 스킬을 직접 부르는 것과 다를 게 없다.
    const doc = await readFile(`${TEMPLATES_DIR}_shared/.claude/commands/issue-work.md`, 'utf8');
    expect(doc).toContain('$ARGUMENTS');
  });
```

`packages/devkit-cli/tests/plan-ops.test.ts` 의 경로 목록과 개수를 고친다.

```ts
    expect(paths).toEqual([
      '.claude/commands/issue-work.md',
      '.claude/commands/issue.md',
      '.claude/commands/review.md',
      '.claude/commands/verify.md',
      '.github/workflows/auto-merge.yml',
      '.github/workflows/claude-review.yml',
      '.gitignore',
      '.npmrc',
    ]);
    // .gitignore 는 병합 대상이라 kind 가 다르다 — 나머지 일곱은 그대로 file 이다.
    expect(changes.filter((c) => c.kind === 'file')).toHaveLength(7);
```

> 정렬은 `sort()` 결과다. `.` 보다 `-` 가 앞서므로 `issue-work.md` 가 `issue.md` 보다
> 먼저 온다. 순서가 헷갈리면 실패 메시지의 실제 배열을 그대로 옮긴다.

`packages/devkit-cli/tests/update-plan.test.ts` 의 `rest` 목록을 고친다.

```ts
    expect(rest).toEqual(
      [
        '.claude/agents/devkit-implementer.md',
        '.claude/agents/devkit-reviewer.md',
        '.claude/commands/api-test.md',
        '.claude/commands/issue-work.md',
        '.claude/commands/issue.md',
        '.claude/commands/module.md',
        '.claude/commands/review.md',
        '.claude/commands/verify.md',
        'CLAUDE.md',
      ].sort(),
    );
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test`
Expected: FAIL 세 곳 — `skill-assets`(파일 없음), `plan-ops`(경로 목록 불일치),
`update-plan`(경로 목록 불일치).

- [ ] **Step 3: `_shared/.claude/commands/issue.md` 를 쓴다**

```markdown
---
description: 지금 브랜치의 범위를 벗어난 발견이 있는지 점검하고 이슈로 뺀다
---

`.claude/skills/scope-escape-issue` 의 절차를 그대로 따른다.

지금까지 한 작업을 돌아보고, 현재 브랜치가 하려던 일의 범위를 **벗어난**
발견이 있는지 점검한다. 있으면 그 스킬의 판정표로 "이슈로 뺄 것"과 "지금 할 것"을
가르고, 이슈로 뺄 것만 사용자에게 물어 발행한다.

발견이 없으면 없다고 보고하고 끝낸다. 없는 것을 만들어내지 않는다.
```

- [ ] **Step 4: `_shared/.claude/commands/issue-work.md` 를 쓴다**

```markdown
---
description: 이슈 번호를 받아 읽고, 구현·검증·커밋한 뒤 승인을 받아 PR 을 연다
---

처리할 이슈: $ARGUMENTS

`.claude/skills/issue-to-pr` 의 절차를 그대로 따른다.

인자가 비어 있으면 어떤 이슈를 처리할지 먼저 묻는다. 임의로 고르지 않는다 —
열린 이슈 중 아무거나 집으면 사용자가 의도하지 않은 작업이 시작된다.

푸시와 PR 생성 전에는 반드시 멈춰 승인을 받는다. 이 프로젝트는 PR 이 열리면
리뷰를 거쳐 자동으로 머지된다.
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test`
Expected: PASS.

- [ ] **Step 6: 커맨드 파일이 실제로 git 에 추적되는지 확인한다**

```bash
git add packages/devkit-cli/templates/_shared/.claude/commands
git status --short packages/devkit-cli/templates/_shared/.claude/commands
```

Expected: `issue.md` 와 `issue-work.md` 가 `A` 로 보인다. 안 보이면
`git check-ignore -v <경로>` 로 어느 줄이 잡았는지 본다.

- [ ] **Step 7: 전체 검증과 커밋**

```bash
pnpm --filter @cheolubak/devkit-cli test
pnpm lint:es
pnpm build
```

통과하면 커밋한다. **커밋 직전 `git log --oneline -1` 로 HEAD 를 재확인한다.**

```bash
git add packages/devkit-cli/templates/_shared/.claude/commands \
        packages/devkit-cli/tests/skill-assets.test.ts \
        packages/devkit-cli/tests/plan-ops.test.ts \
        packages/devkit-cli/tests/update-plan.test.ts
git commit -m "feat: 이슈 발행·처리를 부르는 슬래시 커맨드를 더한다"
```

---

## Task 4: 생성 결과를 e2e 로 확인한다

디스크의 템플릿이 초록불이어도 실제로 생성된 프로젝트에 파일이 놓이는지는 별개
사실이다. 이 태스크가 그 사이를 잇는다.

**Files:**
- Modify: `packages/devkit-cli/tests/e2e/create.e2e.test.ts:160-181`

**Interfaces:**
- Consumes: Task 1·2·3 의 산출물 전부. 생성된 프로젝트의
  `.claude/skills/scope-escape-issue/SKILL.md`, `.claude/skills/issue-to-pr/SKILL.md`,
  `.claude/commands/issue.md`, `.claude/commands/issue-work.md` 를 확인한다.

- [ ] **Step 1: 실패하는 e2e 단언을 쓴다**

`packages/devkit-cli/tests/e2e/create.e2e.test.ts` 에서 기존
`expect(existsSync(join(dir, '.claude/commands/verify.md'))).toBe(true);` 줄
**바로 아래**에 추가한다.

```ts
    // 이슈 스킬 두 개는 COMMON 이라 유형과 무관하게 놓인다.
    expect(existsSync(join(dir, '.claude/skills/scope-escape-issue/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/skills/issue-to-pr/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/commands/issue.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/commands/issue-work.md'))).toBe(true);

    // 계약 구획이 복사 과정에서 잘리지 않았는가. 스킬 본문이 통째로
    // 옮겨졌다는 것을 파일 존재만으로는 알 수 없다.
    expect(readFileSync(join(dir, '.claude/skills/issue-to-pr/SKILL.md'), 'utf8')).toContain(
      '<!-- ISSUE-BODY-CONTRACT:START -->',
    );
```

- [ ] **Step 2: e2e 를 돌려 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli test e2e/create`
Expected: PASS. Task 1-3 이 끝나 있으므로 통과해야 한다.

**통과하면 그것이 곧 검증은 아니다.** 단언이 실제로 무언가를 지키는지 확인한다 —
`scope-escape-issue` 를 `SKILL_SETS` 의 `COMMON` 에서 **잠시** 빼고 다시 돌린다.

Expected: FAIL. 확인했으면 되돌리고 다시 돌려 PASS 를 본다.

- [ ] **Step 3: 생성 결과에서 gitignore 가 새 파일을 삼키지 않는지 확인한다**

e2e 가 만든 프로젝트에서 직접 git 에 묻는다. **저장소 밖 경로**에서 돌린다.

```bash
cd "$(mktemp -d)" && \
  node /Users/dabot/Documents/develop/eslint/.claude/worktrees/cozy-painting-sparkle/packages/devkit-cli/dist/bin.js create demo --type nest --no-install && \
  cd demo && git init -q && git add -A && \
  git status --short | grep -E 'issue(-work)?\.md|scope-escape-issue|issue-to-pr'
```

Expected: 네 경로가 전부 `A` 로 보인다. 하나라도 안 보이면
`git check-ignore -v <경로>` 로 어느 줄이 잡았는지 본다.

> 이 명령은 반드시 저장소 **밖**(`mktemp -d`)에서 돌린다. 저장소 안에 만들면
> 자동 훅이 그 생성물을 커밋한다.

- [ ] **Step 4: 전체 검증과 커밋**

```bash
pnpm --filter @cheolubak/devkit-cli test
pnpm lint:es
pnpm build
```

통과하면 커밋한다. **커밋 직전 `git log --oneline -1` 로 HEAD 를 재확인한다.**

```bash
git add packages/devkit-cli/tests/e2e/create.e2e.test.ts
git commit -m "test: 생성된 프로젝트에 이슈 스킬·커맨드가 놓이는지 확인한다"
```

---

## Task 5: 전역 gstack 판

devkit 판과 **동일성을 강제하지 않는다**(설계 5 번 결정·7.4절). 이 태스크는
별개 저장소에서 돌며, 그 저장소에는 테스트 인프라가 없다.

**Files:**
- Create: `/Users/dabot/Documents/develop/claude-skills/skills/scope-escape-issue/SKILL.md`
- Create: `/Users/dabot/Documents/develop/claude-skills/skills/issue-to-pr/SKILL.md`

**Interfaces:**
- Consumes: Task 1·2 가 쓴 devkit 판 두 문서를 출발점으로 삼는다.

- [ ] **Step 1: 발행 스킬을 그대로 옮긴다**

`packages/devkit-cli/templates/_skills/scope-escape-issue/SKILL.md` 의 내용을
`/Users/dabot/Documents/develop/claude-skills/skills/scope-escape-issue/SKILL.md`
로 **그대로** 복사한다. 이 문서는 devkit 고유 전제가 없다 — 고칠 곳이 없다.

- [ ] **Step 2: 처리 스킬을 옮기고 3절만 바꾼다**

`packages/devkit-cli/templates/_skills/issue-to-pr/SKILL.md` 를
`/Users/dabot/Documents/develop/claude-skills/skills/issue-to-pr/SKILL.md` 로
복사한 뒤, `## 3. 브랜치를 판다` 절 전체를 아래로 **교체**한다.

````markdown
## 3. worktree 를 만든다

전역 규칙은 격리된 worktree 에서 작업하고, 시작 전에 `main` 기준으로 base 를
최신화할 것을 요구한다.

```bash
git fetch origin
git worktree add ../<슬러그> -b <접두>/<슬러그> origin/main
```

접두는 이슈의 성격을 따른다 — 결함이면 `fix/`, 새 기능이면 `feature/`, 그 밖은
`chore/`. 슬러그는 이슈 제목에서 만든다.

브랜치 이름이 주제를 담아야 한다. 그 이름이 곧 `scope-escape-issue` 가 읽는
"선언된 범위"가 되기 때문이다.

worktree 안에서 작업하는 동안에는 **그 브랜치에서만** 작업한다. 사용자가
명시적으로 요청하기 전까지 `main` 으로 체크아웃하거나 머지하지 않는다.
````

이어서 `## 4. 구현한다` 절의 스킬 경로 세 개에서 `.claude/skills/` 접두를 없앤다 —
전역에서는 그 경로가 존재하지 않는다.

```markdown
- 테스트를 먼저 쓰는 절차는 `tdd` 스킬
- 고치고 확인하는 절차는 `verify-implementation` 스킬
- 프로젝트에 `devkit-stack` 스킬이 있으면 의존성·설정을 건드리기 **전에** 읽는다.
```

그리고 `## 5. 검증한다` 의 `/verify` 를 아래로 바꾼다 — 전역에는 그 커맨드가 없다.

```markdown
프로젝트의 `package.json` 의 `scripts` 를 직접 읽어 무엇이 있는지 확인하고,
린트 → 빌드 → 테스트 순서로 돌린다. 실패하면 그 지점에서 멈춘다.

각 단계의 **실제 출력**을 근거로 판정한다. 종료 코드 0 이라는 것만으로 통과를
보고하지 않는다.
```

마지막으로 `## 7. 승인을 받고 푸시·PR` 에서 자동 머지 문단을 아래로 바꾼다 —
전역 대상 저장소에 그 워크플로가 있다는 보장이 없다.

```markdown
대상 저장소에 자동 머지 워크플로가 있으면 PR 생성이 곧 머지로 이어진다.
`.github/workflows/` 를 확인하고, 있으면 그 사실을 승인 요청에 함께 알린다.
```

- [ ] **Step 3: 두 파일이 실제로 놓였는지 확인한다**

```bash
ls -1 /Users/dabot/Documents/develop/claude-skills/skills/scope-escape-issue/
ls -1 /Users/dabot/Documents/develop/claude-skills/skills/issue-to-pr/
```

Expected: 각각 `SKILL.md` 하나.

- [ ] **Step 4: devkit 판이 오염되지 않았는지 확인한다**

전역판을 고치다 devkit 판을 건드렸을 수 있다. devkit 저장소에서 확인한다.

```bash
pnpm --filter @cheolubak/devkit-cli test skill-assets
git status --short packages/devkit-cli/templates/_skills
```

Expected: 테스트 PASS, `git status` 출력이 비어 있다. 특히 devkit 판
`issue-to-pr/SKILL.md` 에 `git worktree` 가 들어가면 Task 2 의 단언이 깨진다.

- [ ] **Step 5: claude-skills 저장소에 커밋한다**

```bash
git -C /Users/dabot/Documents/develop/claude-skills status --short
```

`skills/gstack` 서브모듈 변경이 함께 보일 수 있다. **그것은 스테이징하지 않는다.**

```bash
git -C /Users/dabot/Documents/develop/claude-skills add skills/scope-escape-issue skills/issue-to-pr
git -C /Users/dabot/Documents/develop/claude-skills commit -m "feat(skills): 범위 이탈 이슈 발행·처리 스킬을 더한다"
```

---

## Task 6: 최종 확인

**Files:** 없음. 검증만 한다.

- [ ] **Step 1: 전체 스위트를 돌린다**

```bash
pnpm --filter @cheolubak/devkit-cli test
pnpm lint:es
pnpm build
```

Expected: 셋 다 통과. 테스트 파일 수와 통과 개수를 **요약 줄이 아니라 종료
코드로** 확인한다.

```bash
pnpm --filter @cheolubak/devkit-cli test; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 2: oxlint 가 조용한지 변이로 확인한다**

`pnpm lint:ox` 는 깨끗하면 출력이 0 줄이다. 무경고를 보고하려면 변이가 필요하다.
아무 테스트 파일에 미사용 변수를 한 줄 넣고 돌려 **에러가 나는지** 본 뒤 되돌린다.

- [ ] **Step 3: 커밋 이력을 확인한다**

```bash
git log --oneline origin/main..HEAD
```

Expected: 설계 문서 1개 + Task 1-4 커밋 4개 = 5개.
(Task 5 는 다른 저장소라 여기 안 나온다.)

- [ ] **Step 4: 작업 기록을 memory 에 남긴다**

worktree 에서 작업했으므로 **본체 저장소 기준 경로**에 저장한다.

```
~/.claude/projects/-Users-dabot-Documents-develop-eslint/memory/
```

`project` 타입으로, 무엇을 왜 바꿨는지와 판단 근거를 남긴다. 코드나 git
히스토리를 읽으면 알 수 있는 것은 제외한다. `MEMORY.md` 인덱스에 한 줄 추가한다.

---

## Self-Review 결과

**스펙 커버리지** — 설계의 8개 절을 태스크에 대응시켰다.

| 설계 절 | 태스크 |
| --- | --- |
| 3.1 devkit 배치 | Task 1·2(스킬), Task 3(커맨드) |
| 3.2 gstack 배치 | Task 5 |
| 3.3 프론트매터 규약 | Task 1 Step 3, Task 2 Step 3 |
| 4.1-4.2 본문 계약 | Task 1 Step 3 의 계약 구획, Task 2 Step 1 의 대조 가드 |
| 4.3 SHA 는 단서 | Task 2 Step 1 의 `merge-base` 배제 단언, Step 3 의 2 절 |
| 4.4 라벨 안 씀 | Task 1 Step 3 본문. `--label` 실패 동작 확인은 **Task 1 Step 3 에서 문서로만 다루고 실호출은 하지 않는다** — 실호출은 실제 이슈를 만든다 |
| 5.1-5.5 발행 스킬 | Task 1 |
| 6.1-6.8 처리 스킬 | Task 2 |
| 7.1 배선 변경 | Task 1·2 Step 4, Task 3 |
| 7.2 새 가드 ① 계약 | Task 2 Step 1·6 |
| 7.2 새 가드 ② 이름 실재 | 기존 단언이 이미 함(`선택된 이름이 전부 풀에 실재한다`) + 개수 갱신 |
| 7.2 새 가드 ③ git 추적 | Task 1 Step 7, Task 3 Step 6, Task 4 Step 3 |
| 7.2 새 가드 ④ e2e | Task 4 |
| 7.3 gstack | Task 5 |
| 7.4 동일성 미검증 | Task 5 서두에 명시 |
| 8 하지 않는 것 | Task 2 Step 1 이 `merge-base`·`git worktree` 부재를 단언으로 고정 |

**설계와 달라진 점 1건** — 설계 4.4 절은 "구현 계획에서 `--label` 의 실패 동작을
실제 호출로 확인한다"고 적었으나, 실호출은 저장소에 실제 이슈를 만든다. 계획은
그 확인을 **넣지 않는다.** 라벨을 안 쓴다는 결정 자체는 "저장소 설정을 바꾸는
부작용을 피한다"만으로 이미 성립하므로, 검증하지 못한 전제에 결정을 기대지
않는다.

**타입·이름 일관성** — `SKILL_SETS`·`COMMON`·`POOL_DIR`·`TEMPLATES_DIR` 는 기존
파일에서 그대로 가져왔다. 계약 마커 문자열은 세 곳(Task 1 본문, Task 2 본문,
Task 2 테스트)에서 동일하다.
