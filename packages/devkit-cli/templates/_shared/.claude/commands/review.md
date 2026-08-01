---
description: devkit 표준 기준으로 변경분을 리뷰한다
---

`git diff`와 `git diff --cached` 범위를 `.claude/agents/devkit-reviewer.md`의 기준으로 리뷰한다.

시작 전에 그 문서의 **"지적하지 않는 것"** 절을 먼저 읽는다. 포맷·import 정렬·타입 오류는 `pnpm lint`와 `tsc`가 담당하므로 리뷰에서 다루지 않는다.

변경이 없으면 그 사실만 알리고 끝낸다.
