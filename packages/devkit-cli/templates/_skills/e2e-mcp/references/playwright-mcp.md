# playwright-mcp — 도구 카탈로그·상호작용/어서션 패턴

Playwright MCP는 **접근성 트리 기반**으로 동작한다. 먼저 `browser_snapshot`을 찍어 각 요소의 `ref`를 얻고, 그 `ref`(+사람이 읽는 element 설명)를 상호작용 도구에 넘긴다. CSS 셀렉터를 추측하지 않는다.

## 도구 카탈로그

| 용도 | 도구 | 비고 |
|------|------|------|
| 네비게이션 | `browser_navigate`, `browser_navigate_back` | URL 진입 / 뒤로가기 |
| 상호작용 | `browser_click`, `browser_hover`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_press_key`, `browser_drag`, `browser_drop`, `browser_file_upload` | 폼은 `browser_fill_form` 일괄 입력 우선 |
| 관찰/어서션 | `browser_snapshot`, `browser_take_screenshot`, `browser_wait_for`, `browser_find` | `browser_snapshot`이 요소마다 `ref` 부여 |
| 진단 | `browser_console_messages`, `browser_network_requests`, `browser_network_request`, `browser_evaluate` | JS 에러·요청 목록·개별 요청·스크립트 평가 |
| 기타 | `browser_tabs`, `browser_resize`, `browser_handle_dialog`, `browser_close` | 탭 전환·뷰포트 조절·다이얼로그·종료 |

## 요소 지정 모델: snapshot → ref → 상호작용

1. `browser_snapshot`으로 접근성 스냅샷을 찍는다. 각 요소에 `ref`가 붙는다.
2. 상호작용 도구에 그 `ref`와 element 설명을 넘긴다. 예: `browser_click`에 "Submit 버튼"과 해당 `ref`.
3. 페이지가 바뀌면 `ref`는 무효화되므로 **다시 `browser_snapshot`**을 찍어 새 `ref`를 얻는다.

## 폼 일괄 입력: browser_fill_form

여러 필드를 한 번에 채울 때 `browser_fill_form`을 쓴다. 각 필드의 `ref`·값·타입을 한 번에 넘겨 개별 `browser_type` 반복보다 안정적이다. 개별 필드 포커스 동작이 필요할 때만 `browser_type`을 쓴다.

## flakiness 줄이기: browser_wait_for

액션 뒤 상태 전이를 기다릴 때 `browser_wait_for`로 기대 텍스트의 등장/사라짐 또는 시간을 대기한다. 고정 `sleep` 대신 텍스트 조건을 우선한다. 예: 폼 제출 후 "저장되었습니다" 텍스트를 `browser_wait_for`로 대기한 뒤 어서션.

## 진단·증거

- `browser_console_messages`: JS 에러/경고 수집. 어서션 실패 원인 파악의 1차 단서.
- `browser_network_requests`: 요청 목록에서 실패/느린 요청 확인. 개별 상세는 `browser_network_request`.
- `browser_evaluate`: 페이지 컨텍스트에서 값 추출/계산이 필요할 때(어서션 보조).
- `browser_take_screenshot`: 실패 상태의 시각 증거. 어서션 실패 시 스냅샷 텍스트와 함께 남긴다.

## 어서션 포인트

- **스냅샷 텍스트**: 기대 요소/텍스트가 접근성 트리에 존재하는가.
- **보이는 텍스트**: `browser_wait_for`로 특정 문구가 나타났는가.
- **URL**: 네비게이션 후 기대 경로로 이동했는가.
