import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copySkills } from '../src/ops/copy-skills.js';
import type { Ctx } from '../src/types.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devkit-copy-skills-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function ctx(): Ctx {
  return { targetDir: dir, toolkitRoot: null, name: 'demo', log: () => undefined };
}

describe('copySkills', () => {
  it('스킬을 .claude/skills/<name>/ 아래로 계획한다', async () => {
    const step = copySkills(['devkit-stack']);
    const changes = await step.plan!(ctx());
    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file));
    expect(paths).toContain('.claude/skills/devkit-stack/SKILL.md');
  });

  it('계획한 변경이 전부 kind: file 이다', async () => {
    // collectTree 는 .gitignore 를 만나면 kind:'ignore' 로 낸다. 스킬 안에
    // 그런 파일이 들어오면 run 이 조용히 건너뛰어 파일이 사라진다.
    const step = copySkills(['devkit-stack']);
    const changes = await step.plan!(ctx());
    expect(changes.every((c) => c.kind === 'file')).toBe(true);
  });

  it('풀에 없는 이름이면 던진다', async () => {
    // 조용히 건너뛰면 그 스킬은 어떤 유형에도 배포되지 않으면서 생성이 성공한다.
    const step = copySkills(['존재하지-않는-스킬']);
    await expect(step.plan!(ctx())).rejects.toThrow('존재하지-않는-스킬');
  });

  it('describe 가 이름 목록을 그대로 낸다', () => {
    const step = copySkills(['devkit-stack']);
    expect(step.describe()).toEqual({ skills: ['devkit-stack'] });
  });

  it('run 이 실제로 파일을 쓴다', async () => {
    await copySkills(['devkit-stack']).run(ctx());
    const written = await readFile(join(dir, '.claude', 'skills', 'devkit-stack', 'SKILL.md'), 'utf8');
    expect(written).toContain('name: devkit-stack');
  });

  it('__NAME__ 을 치환하지 않는다', () => {
    // 스킬 본문은 프로젝트 이름과 무관하다. 우연히 그 형태의 문자열이 있으면
    // 치환이 원문을 훼손한다 — 원본 그대로 복사가 이 자산의 계약이다.
    const step = copySkills(['devkit-stack']);
    expect(step.describe()).not.toHaveProperty('vars');
  });
});
