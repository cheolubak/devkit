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

  it('언더스코어 접두 파일명을 점으로 바꾸지 않는다', async () => {
    // collectTree 의 기본 규칙(_foo → .foo)은 templates 트리가 git 에 삼켜지는
    // 것을 피하려는 이스케이프지, 스킬의 규칙이 아니다. 스킬 풀의 계약은
    // "바이트 그대로"이므로 파일명도 원문이어야 한다.
    //
    // react-best-practices/rules/_template.md 는 그 스킬의 README 가 이름으로
    // 참조하는 실제 내용 파일이다. .template.md 로 바뀌면 복사도 성공하고
    // 파일 개수도 맞은 채, 소비자가 README 를 따라가다 없는 경로에 막힌다.
    const step = copySkills(['react-best-practices']);
    const changes = await step.plan!(ctx());
    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file));

    expect(paths).toContain('.claude/skills/react-best-practices/rules/_template.md');
    expect(paths).not.toContain('.claude/skills/react-best-practices/rules/.template.md');
  });

  it('스킬 안에 숨김 파일을 만들지 않는다', async () => {
    // 위 단언은 이름 하나를 박는다. 이것은 같은 결함이 다른 파일에서 나도
    // 잡는다 — `.claude/skills/<name>/` 접두 뒤에 점으로 시작하는 조각이
    // 생기면 변환이 걸렸다는 뜻이다.
    const step = copySkills(['react-best-practices']);
    const changes = await step.plan!(ctx());
    const hidden = changes
      .map((c) => (c.kind === 'file' ? c.relPath : c.file))
      .filter((p) => p.split('/').slice(3).some((seg) => seg.startsWith('.')));

    expect(hidden).toEqual([]);
  });

  it('__NAME__ 을 치환하지 않는다', () => {
    // 스킬 본문은 프로젝트 이름과 무관하다. 우연히 그 형태의 문자열이 있으면
    // 치환이 원문을 훼손한다 — 원본 그대로 복사가 이 자산의 계약이다.
    const step = copySkills(['devkit-stack']);
    expect(step.describe()).not.toHaveProperty('vars');
  });
});
