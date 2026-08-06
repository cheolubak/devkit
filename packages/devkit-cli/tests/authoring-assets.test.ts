import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

/** 각 유형의 CLAUDE.md 가 문자열로 가리키는 경로. 결합을 테스트로 고정한다. */
const IMPLEMENTER_PATH = '.claude/agents/devkit-implementer.md';

const FORBIDDEN_HEADER = '## 손으로 하지 않는 것';
const DECISIONS_HEADER = '## 쓸 때 결정하는 것';

const ALL_TYPES = ['nest', 'next', 'monorepo'] as const;
const FRONTEND_TYPES = ['next', 'monorepo'] as const;

async function readImplementer(type: string): Promise<string> {
  return readFile(`${TEMPLATES_DIR}${type}/${IMPLEMENTER_PATH}`, 'utf8');
}

/** `## 쓸 때 결정하는 것` 이후만 잘라낸다. 스코프 없이 검사하면 금지 목록에
 * 우연히 같은 단어가 있을 때 결정 절을 통째로 지워도 통과한다. */
function decisionsOf(doc: string): string {
  return doc.slice(doc.indexOf(DECISIONS_HEADER));
}

function forbiddenOf(doc: string): string {
  return doc.slice(doc.indexOf(FORBIDDEN_HEADER), doc.indexOf(DECISIONS_HEADER));
}

describe.each(ALL_TYPES)('%s 작성자 에이전트 공통 구조', (type) => {
  it('frontmatter의 name이 devkit-implementer 다', async () => {
    const doc = await readImplementer(type);
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-implementer\n/);
  });

  it('두 헤더를 모두 갖는다', async () => {
    // 순서 단언 indexOf(A) < indexOf(B)는 A가 없을 때 -1 < N으로 통과한다.
    // 헤더 자체의 존재를 따로 단언해야 "헤더 삭제" 변형을 잡는다.
    const doc = await readImplementer(type);
    expect(doc).toContain(FORBIDDEN_HEADER);
    expect(doc).toContain(DECISIONS_HEADER);
  });

  it('금지 목록이 결정 절차보다 먼저 온다', async () => {
    // 작성자는 문서를 위에서부터 읽는다. 금지 목록이 뒤에 있으면 이미
    // 린터가 할 일을 손으로 하고 난 뒤에 읽게 된다(설계 3.1절).
    const doc = await readImplementer(type);
    expect(doc.indexOf(FORBIDDEN_HEADER)).toBeLessThan(doc.indexOf(DECISIONS_HEADER));
  });

  it('린터가 담당하는 항목을 금지 목록에 명시한다', async () => {
    const doc = await readImplementer(type);
    const forbidden = forbiddenOf(doc);
    expect(forbidden).toContain('prettier');
    expect(forbidden).toContain('oxlint');
    expect(forbidden).toContain('import 순서');
    expect(forbidden).toContain('tsc');
  });

  it('설계 3.2절의 다섯 결정을 모두 갖는다', async () => {
    // 리뷰어의 관점과 1:1 대칭이다. 하나가 빠지면 리뷰에서 지적될 것을
    // 작성 시점에는 아무도 말해주지 않는 구멍이 된다.
    const doc = await readImplementer(type);
    const decisions = decisionsOf(doc);
    expect(decisions).toContain('실패를 어떻게 드러낼 것인가');
    expect(decisions).toContain('어떤 테스트를 함께 쓸 것인가');
    expect(decisions).toContain('마치기 전에 무엇을 돌릴 것인가');
  });

  it('버그 수정 시 재현 테스트를 먼저 쓰라고 지시한다', async () => {
    const doc = await readImplementer(type);
    expect(decisionsOf(doc)).toContain('재현 테스트를 먼저');
  });
});

describe.each(FRONTEND_TYPES)('%s 작성자 프론트엔드 결정', (type) => {
  it('FSD 레이어 배치를 결정으로 갖는다', async () => {
    // 스코프가 필수다. 금지 목록에도 'FSD'가 나오므로(eslint-plugin-fsd가
    // 방향을 검사한다는 명시), 문서 전체를 검사하면 결정 절을 통째로
    // 지워도 통과한다.
    const doc = await readImplementer(type);
    const decisions = decisionsOf(doc);
    expect(decisions).toContain('FSD');
    expect(decisions).toContain('views');
  });

  it('Server/Client 경계를 결정으로 갖는다', async () => {
    const doc = await readImplementer(type);
    const decisions = decisionsOf(doc);
    expect(decisions).toContain("'use client'");
    expect(decisions).toContain('Server Action');
  });

  it('레이어 간 import 방향은 린터 담당임을 금지 목록에 명시한다', async () => {
    const doc = await readImplementer(type);
    expect(forbiddenOf(doc)).toContain('eslint-plugin-fsd');
  });
});

describe('nest 작성자 백엔드 결정', () => {
  it('설계 3.3절의 NestJS 고유 결정을 갖는다', async () => {
    // 공통 골격만으로는 next판과 구별되지 않는다.
    const doc = await readImplementer('nest');
    const decisions = decisionsOf(doc);
    expect(decisions).toContain('zod');
    expect(decisions).toContain('트랜잭션');
    expect(decisions).toContain('e2e');
  });

  it('Controller를 thin하게 유지하라고 지시한다', async () => {
    const doc = await readImplementer('nest');
    expect(decisionsOf(doc)).toContain('thin');
  });

  it('class-validator를 쓰지 않는다고 못 박는다', async () => {
    // 이 스택은 zod다(로드맵 1.3절). 기본 NestJS 지식으로 코드를 쓰면
    // class-validator 데코레이터가 나온다 — 그것을 앞에서 막는다.
    const doc = await readImplementer('nest');
    expect(doc).toContain('class-validator');
  });

  it('타입 검사 명령으로 존재하는 스크립트를 가리킨다', async () => {
    // nest 레시피는 typecheck 스크립트를 만들지 않는다(src/recipes/nest.ts).
    // 없는 명령을 지시하면 작성자가 실패를 보고 검증 절을 통째로 건너뛴다.
    const doc = await readImplementer('nest');
    expect(decisionsOf(doc)).not.toContain('pnpm typecheck');
    expect(decisionsOf(doc)).toContain('pnpm build');
  });
});

describe('monorepo 작성자 워크스페이스 결정', () => {
  it('워크스페이스 배치를 결정으로 갖는다', async () => {
    const doc = await readImplementer('monorepo');
    const decisions = decisionsOf(doc);
    expect(decisions).toContain('워크스페이스');
    expect(decisions).toContain('catalog:');
  });

  it('앱 간 직접 import를 금지한다', async () => {
    const doc = await readImplementer('monorepo');
    expect(decisionsOf(doc)).toContain('앱 간 직접 import');
  });
});

describe.each(ALL_TYPES)('%s CLAUDE.md 포인터', (type) => {
  // 포인터 경로가 끊겨도 **아무것도 실패하지 않는다** — Claude가 기준 문서를
  // 못 찾고 기본 판단으로 코드를 쓴 뒤 정상 완료를 보고한다. 리뷰어 자산이
  // 가졌던 것과 같은 조용한 실패 구조다(설계 5절).

  it('CLAUDE.md가 IMPLEMENTER_PATH를 가리킨다', async () => {
    const doc = await readFile(`${TEMPLATES_DIR}${type}/CLAUDE.md`, 'utf8');
    expect(doc).toContain(IMPLEMENTER_PATH);
  });

  it('리뷰어 문서도 함께 가리켜 둘의 대칭을 알린다', async () => {
    const doc = await readFile(`${TEMPLATES_DIR}${type}/CLAUDE.md`, 'utf8');
    expect(doc).toContain('devkit-reviewer.md');
  });
});
