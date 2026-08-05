import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { win32 } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { linkSpec, linkDeps, normalizeToPosix } from '../src/ops/link-deps.js';
import type { Ctx } from '../src/types.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('linkSpec', () => {
  it('단일 앱 — 형제 디렉토리로 한 단계', () => {
    expect(linkSpec('/Users/d/develop/my-api', '/Users/d/develop/eslint', 'tsconfig')).toBe(
      'link:../eslint/packages/tsconfig',
    );
  });

  it('모노레포 내부 — apps/web은 세 단계', () => {
    expect(linkSpec('/Users/d/develop/mono/apps/web', '/Users/d/develop/eslint', 'tsconfig')).toBe(
      'link:../../../eslint/packages/tsconfig',
    );
  });

  it('모노레포 루트 — 단일 앱과 같은 깊이', () => {
    expect(linkSpec('/Users/d/develop/mono', '/Users/d/develop/eslint', 'eslint-plugin-fsd')).toBe(
      'link:../eslint/packages/eslint-plugin-fsd',
    );
  });

  it('항상 POSIX 구분자를 쓴다', () => {
    expect(linkSpec('/a/b/c', '/a/toolkit', 'x')).not.toContain('\\');
  });
});

describe('normalizeToPosix', () => {
  it('Windows 경로 백슬래시를 POSIX 슬래시로 변환한다', () => {
    const windowsPath = win32.relative('C:\\dev\\my-api', 'C:\\dev\\eslint\\packages\\tsconfig');
    expect(windowsPath).toContain('\\');
    const posix = normalizeToPosix(windowsPath);
    expect(posix).not.toContain('\\');
    expect(posix).toBe('../eslint/packages/tsconfig');
  });
});

describe('linkDeps', () => {
  it('devDependencies에 link: 스펙을 넣는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-link-'));
    created.push(dir);
    const toolkit = join(dir, 'eslint');
    const project = join(dir, 'my-api');
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify({ name: 'my-api', devDependencies: { typescript: '^5.7.3' } }, null, 2),
    );

    const ctx: Ctx = { targetDir: project, toolkitRoot: toolkit, name: 'my-api', log: () => {} };
    await linkDeps(['tsconfig', 'jest-config']).run(ctx);

    const pkg = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies['@cheolubak/tsconfig']).toBe('link:../eslint/packages/tsconfig');
    expect(pkg.devDependencies['@cheolubak/jest-config']).toBe('link:../eslint/packages/jest-config');
    expect(pkg.devDependencies.typescript).toBe('^5.7.3');
  });

  it('options.file로 비기본 경로를 지정한다 (모노레포 시나리오)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-link-monorepo-'));
    created.push(dir);
    const toolkit = join(dir, 'eslint');
    const mono = join(dir, 'mono');
    const web = join(mono, 'apps', 'web');
    mkdirSync(web, { recursive: true });
    writeFileSync(
      join(web, 'package.json'),
      JSON.stringify({ name: 'web', devDependencies: {} }, null, 2),
    );

    const ctx: Ctx = { targetDir: mono, toolkitRoot: toolkit, name: 'mono', log: () => {} };
    await linkDeps(['tsconfig'], { file: 'apps/web/package.json' }).run(ctx);

    const pkg = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies['@cheolubak/tsconfig']).toBe('link:../eslint/packages/tsconfig');
  });
});
