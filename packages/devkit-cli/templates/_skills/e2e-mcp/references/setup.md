# setup — 두 MCP 설치·등록·역할 분담

Playwright MCP와 chrome-devtools-mcp를 모두 연결한 상태에서 e2e를 구동한다. Playwright MCP는 보통 이미 연결되어 있고, chrome-devtools-mcp는 **현재 미연결**이므로 먼저 등록한다.

## 역할 분담

| 항목 | Playwright MCP | chrome-devtools-mcp |
|------|----------------|---------------------|
| 주 용도 | 상호작용·어서션·스냅샷 e2e 구동 | 성능 트레이스·네트워크·콘솔·스로틀링 심층 검증 |
| 요소 지정 | 접근성 스냅샷의 `ref` | 접근성 스냅샷의 `uid` |
| 대표 도구 | `browser_navigate`, `browser_click`, `browser_fill_form`, `browser_snapshot`, `browser_wait_for` | `performance_start_trace`, `list_network_requests`, `list_console_messages`, `emulate`(cpuThrottlingRate / networkConditions) |
| 결과물 | 구동/어서션, 증거 스크린샷 | 성능 인사이트, 실패 요청/에러, 저사양 재현 |

실무 흐름: **Playwright MCP로 구동/어서션 → chrome-devtools-mcp로 심층 검증 → Playwright spec으로 코드젠.**

## chrome-devtools-mcp 설치·등록 (필수)

CLI로 user 스코프에 등록:

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

또는 프로젝트 `.mcp.json`에 추가:

```json
{
  "mcpServers": {
    "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] }
  }
}
```

등록 후 연결 확인:

```bash
claude mcp list
```

`chrome-devtools`가 connected로 보이면 성공. (등록 직후에는 세션 재시작이 필요할 수 있다.)

## Playwright MCP 확인

Playwright MCP는 `npx @playwright/mcp@latest`로 동작하며 보통 이미 연결되어 있다. `claude mcp list`에서 `playwright`가 connected인지 확인한다. 미설치면 아래로 등록:

```bash
claude mcp add playwright --scope user npx @playwright/mcp@latest
```

## 헤드리스/헤드풀·프로파일 주의

- 두 MCP는 각각 **별개 브라우저 세션**을 띄운다. 같은 페이지라도 한쪽에서 로그인했다고 다른 쪽에 세션이 공유되지 않는다. 심층 검증 시 chrome-devtools 쪽에서 `navigate_page`로 다시 진입한다.
- CI/헤드리스 환경에서는 헤드리스로 동작한다. 로컬 디버깅에서 화면을 보려면 헤드풀 옵션을 쓰되, 자동화 흐름에서는 헤드리스가 기본이다.
- 격리 프로파일: 실사용 브라우저의 쿠키/세션과 섞이지 않도록 MCP는 격리된 프로파일을 사용한다. 로그인 상태가 필요한 플로우는 매 실행마다 로그인 절차를 포함하거나 사전 상태 주입을 고려한다.
