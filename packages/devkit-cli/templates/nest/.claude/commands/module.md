---
description: src/modules/ 아래에 NestJS 모듈 한 벌을 배치한다
---

`$ARGUMENTS`가 가리키는 이름으로 `src/modules/<이름>/`에 모듈 한 벌을 만든다.

배치와 계층 방향은 `.claude/skills/clean-architecture`와
`.claude/agents/devkit-implementer.md`를 따른다. CRUD 형태와 페이지네이션·
에러 매핑 관용은 `.claude/skills/nestjs-crud`를 본다.

**입력 검증은 zod다.** `.claude/skills/nestjs-validation`은 `class-validator`
기반으로 쓰여 있으므로 검증 부분만 `.claude/skills/devkit-stack`의 zod 형태로
바꿔 읽는다. `class-validator`·`class-transformer`를 설치하지 않는다.

만든 클래스는 반드시 해당 `@Module`의 `providers`/`controllers`에 등록하고,
다른 모듈이 쓸 것이면 `exports`에도 넣는다. 등록을 빠뜨리면 린터가 잡지 못하고
런타임에야 드러난다.

새로 생긴 분기와 에러 경로에는 테스트를 함께 만든다 —
`.claude/skills/nestjs-testing`을 따른다.
