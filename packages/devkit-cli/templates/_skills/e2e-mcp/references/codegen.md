# codegen — 탐색한 플로우를 커밋 가능한 Playwright spec으로 고정

MCP로 탐색·검증한 플로우는 휘발성이다. 회귀를 막으려면 검증된 플로우를 **커밋 가능한 Playwright spec(`e2e/*.spec.ts`)**으로 옮겨 CI에 고정한다. MCP 탐색에서 얻은 `ref`/텍스트를 안정적 로케이터로 치환하는 것이 핵심이다.

## 설치

새 프로젝트라면 스캐폴딩:

```bash
pnpm create playwright
```

기존 프로젝트에 추가:

```bash
pnpm add -D @playwright/test
pnpm exec playwright install
```

## playwright.config.ts

`webServer`로 `pnpm dev`를 자동 기동하고 `baseURL`을 지정해 spec을 상대 경로로 작성한다.

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

## spec 예시 — 로그인 (런북 A를 코드로)

```typescript
import { expect, test } from '@playwright/test';

test('로그인 성공 후 대시보드로 이동', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
});
```

## MCP ref/텍스트 → 안정적 로케이터 치환 팁

| MCP 탐색에서 본 것 | spec 로케이터 |
|--------------------|---------------|
| 스냅샷의 button "Submit" | `page.getByRole('button', { name: 'Submit' })` |
| 입력 라벨 "Email" | `page.getByLabel('Email')` |
| `browser_wait_for`로 기다린 문구 "저장되었습니다" | `await expect(page.getByText('저장되었습니다')).toBeVisible()` |
| 네비게이션 후 URL | `await expect(page).toHaveURL('/dashboard')` |

- `ref`/`uid`는 **런타임 전용**이라 spec에 그대로 옮기지 않는다. 접근성 이름(role+name)·라벨·텍스트 등 사람이 읽는 신호를 로케이터로 쓴다.
- CSS 클래스·nth 인덱스 의존은 피하고 `getByRole`/`getByLabel`/`getByText`를 우선한다.
- 폼은 필드별 `getByLabel(...).fill(...)`로 옮긴다(`browser_fill_form`의 일괄 입력에 대응).

## 실행

```bash
pnpm exec playwright test            # 전체 실행
pnpm exec playwright test --headed   # 브라우저 표시
pnpm exec playwright show-report     # 리포트 확인
```

## GitHub Actions CI

```yaml
name: e2e
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm exec playwright test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

`webServer.command`가 `pnpm dev`를 CI에서 자동 기동하므로 별도 서버 스텝은 필요 없다(프로덕션 빌드 검증이 필요하면 `pnpm build && pnpm start`로 바꾼다).
