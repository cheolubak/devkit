# flows — 워크드 e2e 런북 (절차)

각 런북은 "이 도구를 이 순서로 호출"하는 절차다. 기본은 Playwright MCP로 구동/어서션하고, 필요 시 chrome-devtools-mcp로 심층 검증한다. 모든 상호작용은 **먼저 `browser_snapshot`으로 `ref`를 얻은 뒤** 수행한다.

## 런북 A — 로그인

1. `browser_navigate`로 로그인 페이지 진입(예: `/login`).
2. `browser_snapshot`으로 email/password 입력과 Submit 버튼의 `ref` 확보.
3. `browser_fill_form`으로 email·password를 일괄 입력.
4. `browser_click`으로 Submit 버튼 클릭(해당 `ref`).
5. `browser_wait_for`로 로그인 성공 신호 대기(예: 대시보드 텍스트 등장 또는 스피너 사라짐).
6. **어서션**: 새 `browser_snapshot` + URL로 `/dashboard` 이동과 사용자 이름/로그아웃 버튼 노출 확인.
7. **실패 시 증거**: `browser_take_screenshot` + `browser_console_messages` + `browser_network_requests`(로그인 API 401/500 여부).
8. **심층(선택)**: chrome-devtools-mcp `list_network_requests`로 인증 요청 상태, `emulate`(`networkConditions: "Slow 3G"`)로 로딩 스피너/타임아웃 동작 검증.

## 런북 B — 폼 제출 + 검증 에러

1. `browser_navigate`로 폼 페이지 진입.
2. `browser_snapshot`으로 필드·Submit `ref` 확보.
3. **음성 경로(검증 에러)**: 필수값을 비우거나 잘못된 값으로 `browser_fill_form` → `browser_click` Submit.
4. `browser_wait_for`로 에러 메시지 등장 대기.
5. **어서션**: 스냅샷에 기대 에러 문구가 있고 폼이 제출되지 않았는지(URL 그대로) 확인.
6. **정상 경로**: 유효값으로 `browser_fill_form` → Submit → `browser_wait_for` 성공 문구 → 스냅샷/URL 어서션.
7. **실패 시 증거**: `browser_take_screenshot` + `browser_console_messages`.
8. **심층(선택)**: chrome-devtools-mcp `list_network_requests`로 서버 검증 응답(4xx) 확인.

## 런북 C — 목록 → 상세 네비게이션

1. `browser_navigate`로 목록 페이지 진입.
2. `browser_snapshot`으로 목록 항목 링크들의 `ref` 확보.
3. `browser_click`으로 첫 항목 링크 클릭.
4. `browser_wait_for`로 상세 페이지 콘텐츠(제목 등) 등장 대기.
5. **어서션**: URL이 상세 경로로 바뀌고 상세 필드가 스냅샷에 노출되는지 확인.
6. `browser_navigate_back`으로 목록 복귀 → `browser_snapshot`으로 목록 상태 유지 확인.
7. **실패 시 증거**: `browser_take_screenshot` + `browser_network_requests`(상세 데이터 fetch 실패 여부).
8. **심층(선택)**: chrome-devtools-mcp `performance_start_trace` → 상세 진입 재현 → `performance_stop_trace` → `performance_analyze_insight`로 상세 로딩 성능 확인.

## 공통 원칙

- 페이지 전이 후에는 `ref`가 무효화되므로 **매번 `browser_snapshot`을 다시 찍는다**.
- 어서션은 스냅샷 텍스트/보이는 텍스트/URL 중 하나 이상으로 **명시적**으로 한다.
- 실패는 반드시 스크린샷 + 콘솔 + 네트워크 증거로 남긴다.
- 검증이 끝난 플로우는 [codegen.md](codegen.md)로 `*.spec.ts`에 고정한다.
