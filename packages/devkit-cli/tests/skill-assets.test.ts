import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { SKILL_SETS } from '../src/lib/skill-sets.js';
import { monorepoRecipe } from '../src/recipes/monorepo.js';
import { nestRecipe } from '../src/recipes/nest.js';
import { nextRecipe } from '../src/recipes/next.js';

const execFileAsync = promisify(execFile);

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

describe('스킬 풀 무결성', () => {
  it('풀에 43개 스킬이 있다', async () => {
    // 개수를 박는다. 원본이 하나 빠지면 유형별 목록(SKILL_SETS)과
    // 어긋나기 전에 여기서 먼저 드러난다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    expect(dirs).toHaveLength(43);
  });

  it('모든 스킬이 SKILL.md 를 갖고 frontmatter name 이 디렉토리명과 같다', async () => {
    // 이름이 어긋나면 Claude 가 스킬을 로드하지 못한다. 파일은 있으므로
    // 복사 자체는 성공하고, 소비자만 조용히 스킬 없이 일하게 된다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const broken: string[] = [];
    for (const name of dirs) {
      // oxlint-disable-next-line no-await-in-loop -- 실패 시 어느 스킬인지 순서대로 드러나는 편이 낫다
      const doc = await readFile(`${POOL_DIR}${name}/SKILL.md`, 'utf8').catch(() => null);
      if (doc === null) {
        broken.push(`${name} — SKILL.md 가 없다`);
        continue;
      }
      if (!new RegExp(`^---\\n(?:.*\\n)*?name: ${name}\\n`).test(doc)) {
        broken.push(`${name} — frontmatter 의 name 이 디렉토리명과 다르다`);
      }
    }

    expect(broken).toEqual([]);
  });

  it('풀의 모든 파일이 git 에 추적된다', async () => {
    // 디스크는 초록불인데 clone·CI·게시본에는 없는 상태를 막는다
    // (2026-08-06 devkit-implementer.md 전례).
    const { stdout } = await execFileAsync('git', ['ls-files', '-z', '--', 'templates/_skills'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
    });
    const tracked = stdout.split('\0').filter((p) => p.length > 0);
    expect(tracked.length).toBeGreaterThan(43);
  });
});

describe('유형별 스킬 선택', () => {
  it('유형별 개수가 설계와 일치한다', () => {
    expect(SKILL_SETS.nest).toHaveLength(23);
    expect(SKILL_SETS.next).toHaveLength(26);
    expect(SKILL_SETS.monorepo).toHaveLength(43);
  });

  it('선택된 이름이 전부 풀에 실재한다', async () => {
    // 오타 하나로 스킬이 조용히 빠지는 것을 막는다. copySkills 는 실행 시
    // 던지지만, 그때는 이미 사용자가 create 를 돌린 뒤다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const pool = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));

    const missing: string[] = [];
    for (const [type, names] of Object.entries(SKILL_SETS)) {
      for (const name of names) {
        if (!pool.has(name)) missing.push(`${type}/${name}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('풀의 모든 스킬이 최소 한 유형에 선택된다', async () => {
    // 아무 유형도 쓰지 않는 스킬은 게시 패키지 용량만 먹는다.
    const entries = await readdir(POOL_DIR, { withFileTypes: true });
    const pool = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const selected = new Set(Object.values(SKILL_SETS).flat());

    expect(pool.filter((name) => !selected.has(name))).toEqual([]);
  });

  it('유형별 목록에 중복이 없다', () => {
    // 공통 목록과 유형별 목록이 겹치면 copySkills 가 같은 파일을 두 번 쓴다.
    for (const [type, names] of Object.entries(SKILL_SETS)) {
      expect(new Set(names).size, `${type} 에 중복이 있다`).toBe(names.length);
    }
  });

  it('devkit-stack 이 세 유형 모두에 있다', () => {
    // 스택 충돌 봉인은 유형과 무관하다.
    expect(SKILL_SETS.nest).toContain('devkit-stack');
    expect(SKILL_SETS.next).toContain('devkit-stack');
    expect(SKILL_SETS.monorepo).toContain('devkit-stack');
  });
});

describe('레시피의 copySkills 배선', () => {
  it('세 레시피가 각각 자기 유형의 목록으로 copySkills 를 부른다', () => {
    const cases = [
      ['nest', nestRecipe] as const,
      ['next', nextRecipe] as const,
      ['monorepo', monorepoRecipe] as const,
    ];

    for (const [type, recipe] of cases) {
      const step = recipe({ skipInstall: true }).find((s) => s.kind === 'copySkills');
      expect(step, `${type} 레시피에 copySkills 단계가 없다`).toBeDefined();
      expect(step?.describe()).toEqual({ skills: [...SKILL_SETS[type]] });
    }
  });
});
