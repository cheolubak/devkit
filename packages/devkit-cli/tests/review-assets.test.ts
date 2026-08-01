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
    const doc = await readReviewer('nest');
    expect(doc).toContain('크로스 파일 아키텍처');
    expect(doc).toContain('조용한 실패');
    expect(doc).toContain('테스트 공백');
    expect(doc).toContain('의도와 구현의 불일치');
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
