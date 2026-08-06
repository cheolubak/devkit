import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyOverlay } from '../src/ops/copy-overlay.js';
import { mergeJson } from '../src/ops/merge-json.js';
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
      '.npmrc',
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

describe('mergeJson.plan', () => {
  it('패치를 그대로 낸다 — 대상 파일을 읽지 않는다', async () => {
    // 대상에 package.json이 아예 없어도 plan은 성공해야 한다. update의
    // 기준 내용은 조립자가 정하기 때문이다(가상 파일맵, 설계 5.4절).
    const step = mergeJson({ prettier: '@cheolubak/prettier-config' });
    const changes = await step.plan!(makeCtx());

    expect(changes).toEqual([
      { kind: 'json', file: 'package.json', patch: { prettier: '@cheolubak/prettier-config' } },
    ]);
  });

  it('file 옵션을 그대로 전달한다', async () => {
    const step = mergeJson({ scripts: { lint: null } }, { file: 'apps/web/package.json' });
    const changes = await step.plan!(makeCtx());

    expect(changes[0]).toMatchObject({ kind: 'json', file: 'apps/web/package.json' });
  });
});

describe('copyOverlay 의 .gitignore 처리', () => {
  it('plan 이 ignore 변경으로 낸다 — 통짜 file 이 아니다', async () => {
    const ctx = makeCtx();
    const changes = await copyOverlay('nest').plan!(ctx);
    const gitignore = changes.find(
      (c) => (c.kind === 'ignore' ? c.file : c.kind === 'file' ? c.relPath : '') === '.gitignore',
    );
    expect(gitignore?.kind).toBe('ignore');
  });

  it('run 이 대상의 기존 내용을 보존한다', async () => {
    const ctx = makeCtx();
    writeFileSync(join(ctx.targetDir, '.gitignore'), '내-비밀-폴더/\n');

    await copyOverlay('nest').run(ctx);

    const written = readFileSync(join(ctx.targetDir, '.gitignore'), 'utf8');
    // 사용자가 넣은 규칙이 보존되는가 — 이 테스트의 본질이다.
    expect(written).toContain('내-비밀-폴더/');
    // 템플릿 줄이 얹혔는가. "보존"만 보면 템플릿 줄이 아예 안 얹혀도
    // 통과하므로, 보존과 추가를 각각 고정해야 배선 전체가 덮인다.
    expect(written).toContain('node_modules/');
    // 블록 내용은 아직 비어 있다(템플릿에 블록을 넣는 것은 뒤 태스크다).
    // 구분자 쌍만 확인한다 — mergeIgnore 는 block 이 비어도 쌍을 남긴다.
    // 블록 내용 검증은 템플릿에 블록이 들어간 뒤 e2e가 실제 생성물에서 한다.
    expect(written).toContain('# >>> devkit >>>');
    expect(written).toContain('# <<< devkit <<<');
  });
});
