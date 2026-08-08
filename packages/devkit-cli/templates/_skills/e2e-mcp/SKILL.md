---
name: e2e-mcp
description: "Playwright MCP + chrome-devtools-mcp로 실제 브라우저 e2e를 구동·검증. 앱 기동→탐색→상호작용→어서션→성능/네트워크 검증, Playwright spec 코드젠.\nAPPLIES: 실제 브라우저를 띄워 기능이 동작하는지 어서션하거나 Playwright spec을 만들 때. 아래 문구와 정확히 일치하지 않아도 이 상황이면 적용한다.\nTRIGGER when: \"e2e 돌려줘\", \"e2e 테스트\", \"브라우저 테스트\", \"playwright mcp\", \"chrome devtools mcp\", \"실제 브라우저로 검증\", \"사이트 동작 확인\", \"e2e 시나리오\", MCP로 실제 브라우저 e2e를 구동할 때.\nSKIP: 유닛/컴포넌트 테스트와 Cypress 기반 e2e는 nextjs-testing. TDD 방법론은 tdd. NestJS 유닛/e2e(supertest)는 nestjs-testing. 기능 어서션이 아니라 주관적 UX 체험·1인칭 사용자 재연(감정·마찰 지점)은 ux-walkthrough."
---

# MCP로 실제 브라우저 e2e 구동·검증

이 스킬은 **Claude가 직접 MCP 도구를 호출**해 실행 중인 앱에 대해 e2e를 구동·검증하는 절차형 런북이다. Playwright MCP로 플로우를 구동/어서션하고, chrome-devtools-mcp로 성능·네트워크·콘솔을 심층 검증한 뒤, 검증된 플로우를 커밋 가능한 Playwright spec으로 고정한다.

> 참조:
> - [references/setup.md](references/setup.md) - chrome-devtools-mcp 설치·등록, Playwright MCP 확인, 두 MCP 역할 분담
> - [references/playwright-mcp.md](references/playwright-mcp.md) - Playwright MCP 도구 카탈로그·상호작용/어서션 패턴
> - [references/chrome-devtools-mcp.md](references/chrome-devtools-mcp.md) - 성능 트레이스·네트워크·콘솔·에뮬레이션 도구
> - [references/flows.md](references/flows.md) - 로그인·폼 제출 등 워크드 e2e 런북(절차)
> - [references/codegen.md](references/codegen.md) - 탐색한 플로우를 커밋 가능한 Playwright spec(*.spec.ts)로 고정 + CI

## 두 MCP의 역할 분담 (핵심)

| 목적 | 도구 | 언제 |
|------|------|------|
| 상호작용·어서션·스냅샷 중심 e2e 구동 | **Playwright MCP** | 플로우를 클릭/입력으로 구동하고 접근성 스냅샷(`ref`)으로 상태를 검증할 때 |
| 성능 트레이스·네트워크·콘솔·스로틀링 심층 검증 | **chrome-devtools-mcp** | 성능/네트워크 실패/JS 에러/저사양 조건을 파고들 때 |
| 커밋 가능한 회귀 방지 테스트 | **Playwright spec (`*.spec.ts`)** | 검증된 플로우를 CI에 고정할 때 |

실무 흐름: **Playwright MCP로 구동/어서션 → chrome-devtools-mcp로 심층 검증 → Playwright spec으로 코드젠해 CI에 고정.**

## 절차 (이 순서대로 도구를 실제 호출)

### 1. 준비

- [ ] 대상 URL 확인(로컬이면 예: `http://localhost:3000`).
- [ ] 앱을 백그라운드로 기동: `pnpm dev`(또는 프로젝트의 dev 스크립트)를 background로 실행.
- [ ] 헬스 확인: 서버가 응답할 때까지 대기(포트 리슨/HTTP 200). 아직 chrome-devtools가 미연결이면 [references/setup.md](references/setup.md)로 먼저 등록.

### 2. 탐색 (Playwright MCP)

- [ ] `browser_navigate`로 대상 URL 진입.
- [ ] `browser_snapshot`으로 접근성 스냅샷을 찍어 페이지 구조와 각 요소의 `ref`를 파악.
- [ ] 상호작용할 요소(버튼/입력/링크)의 `ref`와 사람이 읽는 element 설명을 메모.

### 3. 구동 (Playwright MCP)

- [ ] 시나리오대로 `browser_click` / `browser_fill_form` / `browser_type` / `browser_select_option`을 `ref` 기반으로 호출(폼은 `browser_fill_form`로 일괄 입력 우선).
- [ ] 각 액션 뒤 `browser_wait_for`로 기대 텍스트 등장/사라짐 또는 시간을 대기해 flakiness를 줄인다.

### 4. 어서션 (Playwright MCP)

- [ ] 새 `browser_snapshot` / 보이는 텍스트 / URL로 기대 상태를 검증.
- [ ] 실패 시 증거 수집: `browser_take_screenshot` + `browser_console_messages`(JS 에러) + `browser_network_requests`(실패 요청).

### 5. 심층 검증 (chrome-devtools-mcp)

- [ ] 성능: `performance_start_trace` → 대상 상호작용 재현 → `performance_stop_trace` → `performance_analyze_insight`로 병목/Core Web Vitals 확인(필요 시 `lighthouse_audit`).
- [ ] 네트워크: `list_network_requests`로 실패 요청·4xx/5xx 확인, 개별 요청은 `get_network_request`.
- [ ] 콘솔: `list_console_messages`로 JS 에러/경고 수집(개별 `get_console_message`).
- [ ] 저사양 재현: `emulate`로 CPU 4x/6x 슬로우다운(`cpuThrottlingRate`)·네트워크 스로틀링(`networkConditions: "Slow 3G"`)로 조건 재현 후 재검증.

> chrome-devtools-mcp는 Playwright MCP와 **별개 브라우저 세션**이다. 심층 검증할 페이지는 `navigate_page`로 다시 진입하고 `take_snapshot`으로 `uid`를 얻어 상호작용한다.

### 6. 고정 (codegen)

- [ ] 검증된 플로우를 [references/codegen.md](references/codegen.md)를 따라 `e2e/*.spec.ts` Playwright 테스트로 옮긴다.
- [ ] MCP 탐색에서 얻은 `ref`/텍스트를 `getByRole`/`getByLabel` 등 **안정적 로케이터**로 치환.
- [ ] `pnpm exec playwright test`로 통과 확인 후 CI 잡에 연결.

## 체크리스트

- [ ] 앱이 기동되어 대상 URL이 응답하는가.
- [ ] Playwright MCP·chrome-devtools-mcp가 `claude mcp list`에서 모두 연결됨.
- [ ] 상호작용 전 `browser_snapshot`으로 `ref`를 확보했는가(요소를 추측하지 않는다).
- [ ] 각 어서션이 스냅샷/텍스트/URL로 명시적으로 검증되는가.
- [ ] 실패 시 스크린샷 + 콘솔 + 네트워크 증거를 남겼는가.
- [ ] 성능/네트워크/콘솔 심층 검증을 chrome-devtools-mcp로 수행했는가.
- [ ] 검증된 플로우를 커밋 가능한 `*.spec.ts`로 고정하고 CI에 넣었는가.
