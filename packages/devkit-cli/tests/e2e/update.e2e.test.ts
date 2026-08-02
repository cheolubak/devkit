import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const TOOLKIT = resolve(import.meta.dirname, '../../../..');
const PARENT = resolve(TOOLKIT, '..');
const RUN_ID = process.pid;
const created: string[] = [];

afterEach(() => {
  if (process.env.DEVKIT_E2E_KEEP === '1') return;
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function devbak(args: string[], cwd = TOOLKIT): string {
  return execFileSync('node', ['packages/devkit-cli/dist/bin.js', ...args], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function create(name: string, type: string): string {
  const dir = join(PARENT, `${name}-${RUN_ID}`);
  created.push(dir);
  devbak(['create', basename(dir), '--type', type, '--no-verify']);
  return dir;
}

describe.each(['nest', 'next', 'monorepo'])('create → update (%s)', (type) => {
  it('갓 생성한 프로젝트에 update 를 돌리면 변경이 0건이다', () => {
    const dir = create(`devkit-e2e-update-${type}`, type);
    const output = devbak(['update', dir, '--dry-run']);

    // create 와 update 가 같은 레시피에서 갈라지면 여기서 드러난다.
    expect(output).not.toContain('덮어쓰기 (');
    expect(output).not.toContain('신규 (');
    expect(output).toContain('동일 — 건너뜀');
  });

  it('마커 덕분에 --type 없이 돈다', () => {
    const dir = create(`devkit-e2e-marker-${type}`, type);
    const output = devbak(['update', dir, '--dry-run']);

    expect(output).toContain(`(${type})`);
  });
});
