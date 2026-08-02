import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyOverlay } from '../src/ops/copy-overlay.js';
import type { Ctx } from '../src/types.js';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeCtx(): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-plan-'));
  created.push(dir);
  return { targetDir: dir, toolkitRoot: '/toolkit', name: 'demo', log: () => {} };
}

describe('copyOverlay.plan', () => {
  it('템플릿 트리를 상대경로와 최종 내용으로 낸다', async () => {
    const step = copyOverlay('_shared');
    const changes = await step.plan!(makeCtx());

    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file)).sort();
    expect(paths).toEqual([
      '.claude/commands/review.md',
      '.github/workflows/claude-review.yml',
    ]);
    expect(changes.every((c) => c.kind === 'file')).toBe(true);
  });

  it('언더스코어 접두를 점 이름으로 되돌린다', async () => {
    const step = copyOverlay('nest');
    const changes = await step.plan!(makeCtx());
    const paths = changes.map((c) => (c.kind === 'file' ? c.relPath : c.file));

    expect(paths).toContain('.gitignore');
    expect(paths).toContain('.prettierignore');
    expect(paths).not.toContain('_gitignore');
  });

  it('__NAME__을 치환한 내용을 낸다 — 계획과 실제 쓰기가 같은 바이트여야 한다', async () => {
    const step = copyOverlay('monorepo');
    const changes = await step.plan!(makeCtx());
    const pkg = changes.find((c) => c.kind === 'file' && c.relPath === 'package.json');

    expect(pkg).toBeDefined();
    expect(pkg!.kind === 'file' && pkg!.content).toContain('"name": "demo"');
    expect(pkg!.kind === 'file' && pkg!.content).not.toContain('__NAME__');
  });

  it('plan은 아무것도 쓰지 않는다', async () => {
    const ctx = makeCtx();
    await copyOverlay('_shared').plan!(ctx);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(ctx.targetDir)).toEqual([]);
  });
});
