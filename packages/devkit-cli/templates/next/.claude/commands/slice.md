---
description: FSD 슬라이스와 Public API 배럴을 만든다
---

`$ARGUMENTS`가 가리키는 `<레이어>/<이름>`으로 FSD 슬라이스를 만든다.

레이어·슬라이스·세그먼트 구조와 Public API 규약은
`.claude/skills/fsd-architecture`를 따른다. 다만 두 가지가 다르다 —
`.claude/skills/devkit-stack`을 함께 읽는다.

- FSD의 `pages` 레이어는 이 프로젝트에서 **`views`**다 (`src/views/`).
  Next.js App Router의 `app/`과 이름이 충돌하지 않게 하기 위한 것이다.
- 경계 위반은 `steiger`가 아니라 `eslint.config.mjs`의
  `@cheolubak/eslint-plugin-fsd`가 잡는다. `steiger`를 설치하지 않는다.

슬라이스를 만들면 **Public API 배럴(`index.ts`)을 함께 만든다.** 배럴 없이
내부 파일을 직접 import 하면 플러그인이 막고, 막히지 않더라도 그 슬라이스의
내부 구조를 바꿀 수 없게 된다.

만든 뒤 `pnpm lint`를 돌려 경계 규칙을 실제로 통과하는지 확인한다.
