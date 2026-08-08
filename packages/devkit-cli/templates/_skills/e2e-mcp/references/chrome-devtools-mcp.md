# chrome-devtools-mcp — 성능·네트워크·콘솔·에뮬레이션 도구

chrome-devtools-mcp는 **심층 디버깅/성능 검증**을 담당한다. Playwright MCP로 플로우를 구동/어서션한 뒤, 여기서 성능 트레이스·네트워크 실패·JS 에러·저사양 조건을 파고든다. 요소 지정은 `take_snapshot`이 부여하는 `uid`를 쓴다(Playwright의 `ref`와 유사).

## 도구 카탈로그

| 용도 | 도구 | 비고 |
|------|------|------|
| 페이지/네비 | `list_pages`, `select_page`, `new_page`, `close_page`, `navigate_page`, `wait_for`, `resize_page` | `navigate_page`의 type: `url`\|`back`\|`forward`\|`reload` |
| 입력 | `click`, `fill`, `fill_form`, `hover`, `drag`, `upload_file`, `handle_dialog`, `press_key` | `click`은 `dblClick?` 지원, 폼은 `fill_form` 우선 |
| 스냅샷/스크린샷 | `take_snapshot`, `take_screenshot` | `take_snapshot`이 요소마다 `uid` 부여 |
| 콘솔/스크립트 | `list_console_messages`, `get_console_message`, `evaluate_script` | `evaluate_script`는 function 문자열 |
| 네트워크 | `list_network_requests`, `get_network_request` | 실패/4xx·5xx 요청 조사 |
| 성능 | `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`, `lighthouse_audit` | 트레이스·인사이트·Lighthouse |
| 에뮬레이션 | `emulate`(cpuThrottlingRate / networkConditions) | CPU 슬로우다운·네트워크 스로틀링 |

## 요소 지정 모델: take_snapshot → uid

`take_snapshot`으로 a11y 트리 텍스트 스냅샷을 얻으면 각 요소에 `uid`가 붙는다. 이 `uid`를 `click`/`fill`/`fill_form`에 넘긴다. 페이지가 바뀌면 다시 `take_snapshot`으로 새 `uid`를 얻는다.

## 성능 트레이스 워크플로

1. `performance_start_trace`로 트레이싱 시작.
2. 측정 대상 상호작용을 재현(`navigate_page` 진입, `click`/`fill` 등).
3. `performance_stop_trace`로 트레이싱 종료.
4. `performance_analyze_insight`로 병목/Core Web Vitals(LCP·CLS·INP 등) 인사이트 확인.
5. 종합 점수/권장사항이 필요하면 `lighthouse_audit`.

## 네트워크 검사

- `list_network_requests`로 전체 요청을 훑어 실패·4xx/5xx·느린 요청을 식별.
- 문제 요청은 `get_network_request`로 상태 코드·헤더·타이밍 상세 확인.

## 콘솔 에러 수집

- `list_console_messages`로 JS 에러/경고를 모은다.
- 개별 메시지 상세는 `get_console_message`. 어서션 실패나 화면 이상의 원인 추적에 사용.

## 저사양 조건 재현

- `emulate`(`cpuThrottlingRate: 4|6`): 저사양 CPU 재현 → 성능 트레이스 재측정.
- `emulate`(`networkConditions: "Slow 3G"` 등): 느린 네트워크로 로딩·스피너·타임아웃 동작 검증. CPU·네트워크 모두 이 단일 도구가 담당한다.
- 에뮬레이션 적용 후 다시 상호작용을 재현해 저사양에서의 체감 성능·실패를 확인한다.
