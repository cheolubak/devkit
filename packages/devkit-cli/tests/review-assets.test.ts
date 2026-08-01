import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

async function readReviewer(type: string): Promise<string> {
  return readFile(`${TEMPLATES_DIR}${type}/.claude/agents/devkit-reviewer.md`, 'utf8');
}

describe('nest 리뷰어 에이전트', () => {
  it('frontmatter의 name이 devkit-reviewer 다', async () => {
    const doc = await readReviewer('nest');
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-reviewer\n/);
  });

  it('"지적하지 않는 것" 절을 갖는다', async () => {
    const doc = await readReviewer('nest');
    expect(doc).toContain('## 지적하지 않는 것');
  });

  it('금지 목록이 보는 것보다 먼저 온다', async () => {
    // 리뷰어는 문서를 위에서부터 읽는다. 금지 목록이 뒤에 있으면
    // 이미 지적을 만든 뒤에 읽게 된다.
    const doc = await readReviewer('nest');
    expect(doc.indexOf('## 지적하지 않는 것')).toBeLessThan(doc.indexOf('## 보는 것'));
  });

  it('린터가 담당하는 항목을 금지 목록에 명시한다', async () => {
    const doc = await readReviewer('nest');
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('prettier');
    expect(forbidden).toContain('import 순서');
    expect(forbidden).toContain('tsc');
  });

  it('class-validator 지적을 금지한다', async () => {
    // 세 소비자 프로젝트는 zod를 쓴다(로드맵 1.3절). 기존 코드-리뷰
    // 스킬을 계승했다면 모든 PR에서 잘못된 지적이 나왔을 것이다.
    const doc = await readReviewer('nest');
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('class-validator');
  });

  it('설계 3.2절의 4개 관점을 모두 갖는다', async () => {
    // 반드시 `## 보는 것` 이후로 스코프한다. 문서 전체를 검사하면
    // 금지 목록에 우연히 같은 단어가 있을 때 관점 절을 지워도 통과하는
    // 항상-통과 단언이 된다.
    const doc = await readReviewer('nest');
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('크로스 파일 아키텍처');
    expect(observed).toContain('조용한 실패');
    expect(observed).toContain('테스트 공백');
    expect(observed).toContain('의도와 구현의 불일치');
  });

  it('설계 3.4절의 NestJS 고유 관점을 갖는다', async () => {
    // 4관점 골격만으로는 next판과 구별되지 않는다. 설계 3.4절이
    // nest 리뷰어에 배정한 고유 관점이 실제 문서에 있어야 한다.
    const doc = await readReviewer('nest');
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('zod');
    expect(observed).toContain('트랜잭션');
    expect(observed).toContain('e2e');
  });
});

const ALL_TYPES = ['nest', 'next', 'monorepo'] as const;

describe.each(ALL_TYPES)('%s 리뷰어 공통 구조', (type) => {
  it('frontmatter의 name이 devkit-reviewer 다', async () => {
    const doc = await readReviewer(type);
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-reviewer\n/);
  });

  it('금지 목록이 보는 것보다 먼저 온다', async () => {
    const doc = await readReviewer(type);
    expect(doc.indexOf('## 지적하지 않는 것')).toBeLessThan(doc.indexOf('## 보는 것'));
  });

  it('린터가 담당하는 항목을 금지 목록에 명시한다', async () => {
    const doc = await readReviewer(type);
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('prettier');
    expect(forbidden).toContain('import 순서');
    expect(forbidden).toContain('tsc');
  });

  it('설계 3.2절의 4개 관점을 모두 갖는다', async () => {
    const doc = await readReviewer(type);
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('조용한 실패');
    expect(observed).toContain('테스트 공백');
    expect(observed).toContain('의도와 구현의 불일치');
  });
});

describe.each(['next', 'monorepo'] as const)('%s 리뷰어 프론트엔드 관점', (type) => {
  it('FSD 레이어 배치를 관점으로 갖는다', async () => {
    // 스코프가 필수다. 금지 목록에도 'FSD'가 나오므로(eslint-plugin-fsd가
    // 방향을 검사한다는 명시), 문서 전체를 검사하면 관점 절을 통째로
    // 지워도 통과한다 — 이름과 달리 아무것도 지키지 못하는 단언이 된다.
    const doc = await readReviewer(type);
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('FSD');
  });

  it('FSD import 방향 위반은 린터 담당임을 명시한다', async () => {
    // eslint-plugin-fsd 가 방향을 검사한다. 리뷰는 "이 코드가 애초에
    // 이 레이어에 있어야 하는가"를 본다.
    const doc = await readReviewer(type);
    const forbidden = doc.slice(
      doc.indexOf('## 지적하지 않는 것'),
      doc.indexOf('## 보는 것'),
    );
    expect(forbidden).toContain('eslint-plugin-fsd');
  });

  it('설계 3.4절의 프론트엔드 고유 관점을 갖는다', async () => {
    const doc = await readReviewer(type);
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain("'use client'");
    expect(observed).toContain('Server Action');
    expect(observed).toContain('views');
  });
});

describe('monorepo 리뷰어 워크스페이스 관점', () => {
  it('워크스페이스 경계를 관점으로 갖는다', async () => {
    // 의존 선언 누락·앱 간 직접 import·catalog 이탈은 모노레포에서만
    // 생기는 문제이며 전부 린터 밖이다.
    const doc = await readReviewer('monorepo');
    const observed = doc.slice(doc.indexOf('## 보는 것'));
    expect(observed).toContain('워크스페이스');
    expect(observed).toContain('catalog:');
  });
});
