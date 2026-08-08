import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));
const POOL_DIR = `${TEMPLATES_DIR}_skills/`;

describe('devkit-stack 스킬', () => {
  it('frontmatter의 name이 devkit-stack 이다', async () => {
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toMatch(/^---\n(?:.*\n)*?name: devkit-stack\n/);
  });

  it('검증이 zod 임을 명시하고 class-validator 를 이름으로 배제한다', async () => {
    // 원본 nestjs-validation·nestjs-crud 가 class-validator 를 가르치고,
    // devkit-reviewer 는 그 지적을 금지한다. 이 봉인이 없으면 아무도 못 잡는다.
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('zod');
    expect(doc).toContain('class-validator');
    expect(doc).toContain('nestjs-validation');
  });

  it('린트 설정 출처가 @cheolubak/eslint-config-nest 임을 명시한다', async () => {
    // 원본 eslint 스킬은 @eslint/js·eslint-config-prettier 직접 설치를
    // 가르치는데, recipes/nest.ts 는 그 둘을 null 로 제거한다.
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('@cheolubak/eslint-config-nest');
    expect(doc).toContain('@eslint/js');
  });

  it('FSD 강제가 eslint-plugin-fsd 임을 명시하고 steiger 를 배제한다', async () => {
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('@cheolubak/eslint-plugin-fsd');
    expect(doc).toContain('steiger');
  });

  it('우선순위 선언을 갖는다 — 다른 스킬과 어긋나면 이 문서가 이긴다', async () => {
    const doc = await readFile(`${POOL_DIR}devkit-stack/SKILL.md`, 'utf8');
    expect(doc).toContain('## 우선순위');
  });
});
