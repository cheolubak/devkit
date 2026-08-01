import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findToolkitRoot } from '../src/bin.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('findToolkitRoot', () => {
  it('pnpm-workspace.yaml이 있는 상위 디렉토리를 찾는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'devbak-root-'));
    created.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    const deep = join(root, 'packages', 'devkit-cli', 'dist');
    mkdirSync(deep, { recursive: true });

    expect(findToolkitRoot(deep)).toBe(root);
  });

  it('찾지 못하면 던진다 — 조용히 cwd로 폴백하지 않는다', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'devbak-orphan-'));
    created.push(orphan);
    expect(() => findToolkitRoot(orphan)).toThrow(/pnpm-workspace\.yaml/);
  });
});
