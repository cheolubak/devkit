import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageLayout, packageRoot } from '../src/lib/layout.js';

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makePkg(extra: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'devbak-layout-'));
  created.push(root);
  writeFileSync(join(root, 'package.json'), '{"name":"x","version":"0.0.1"}\n');
  for (const dir of extra) mkdirSync(join(root, dir), { recursive: true });
  return root;
}

describe('packageRoot', () => {
  it('package.json이 있는 첫 조상을 낸다', () => {
    const root = makePkg(['dist']);
    expect(packageRoot(join(root, 'dist', 'bin.js'))).toBe(root);
  });

  it('중첩된 깊이에서도 같은 루트를 낸다 — 번들 여부로 답이 갈리지 않는다', () => {
    const root = makePkg(['src/ops']);
    expect(packageRoot(join(root, 'src', 'ops', 'copy-overlay.ts'))).toBe(root);
  });

  it('찾지 못하면 던진다 — 조용히 상위 아무 곳이나 고르지 않는다', () => {
    // 루트까지 올라가도 못 찾는 상황에서 "던진다"는 계약만 확인한다.
    expect(() => packageRoot('/')).toThrow(/package\.json/);
  });
});

describe('packageLayout', () => {
  it('src가 있으면 source다', () => {
    expect(packageLayout(makePkg(['src', 'dist']))).toBe('source');
  });

  it('src가 없으면 bundled다 — 게시본에는 dist와 templates만 들어간다', () => {
    expect(packageLayout(makePkg(['dist', 'templates']))).toBe('bundled');
  });
});
