import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { linkSpec, linkDeps } from '../src/ops/link-deps.js';
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
    expect(pkg.devDependencies['@devbak/tsconfig']).toBe('link:../eslint/packages/tsconfig');
    expect(pkg.devDependencies['@devbak/jest-config']).toBe('link:../eslint/packages/jest-config');
    expect(pkg.devDependencies.typescript).toBe('^5.7.3');
  });
});
