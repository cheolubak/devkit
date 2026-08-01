import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertInside, removeFiles } from '../src/ops/remove-files.js';
import { templateFileName } from '../src/ops/copy-overlay.js';
import { makeDirs } from '../src/ops/make-dirs.js';
import { pathExists } from '../src/ops/path-exists.js';
import type { Ctx } from '../src/types.js';

const created: string[] = [];

function makeCtx(logger?: (msg: string) => void): Ctx {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-fs-'));
  created.push(dir);
  return { targetDir: dir, toolkitRoot: '/toolkit', name: 'fx', log: logger ?? (() => {}) };
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('pathExists', () => {
  it('있는 경로는 true', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-exists-'));
    created.push(dir);
    expect(await pathExists(dir)).toBe(true);
  });

  it('ENOENT(없음)는 false', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-exists-'));
    created.push(dir);
    expect(await pathExists(join(dir, 'nope'))).toBe(false);
  });

  it('ENOENT·ENOTDIR 이외의 에러는 다시 던진다 — 권한 문제를 "없음"으로 읽지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-exists-'));
    created.push(dir);
    const locked = join(dir, 'locked');
    mkdirSync(locked);
    writeFileSync(join(locked, 'file.txt'), '');
    // 디렉토리의 실행(x) 권한을 빼면 그 안의 파일을 stat할 때 EACCES가 난다.
    // `.then(() => true, () => false)` 관용구라면 이것도 "없음"으로 읽었을 것이다.
    chmodSync(locked, 0o000);
    try {
      await expect(pathExists(join(locked, 'file.txt'))).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});

describe('assertInside', () => {
  it('targetDir 안의 경로를 절대경로로 돌려준다', () => {
    expect(assertInside('/a/b', 'src/main.ts')).toBe('/a/b/src/main.ts');
  });

  it('상위로 탈출하는 경로를 거부한다', () => {
    expect(() => assertInside('/a/b', '../../etc/passwd')).toThrow(/밖/);
  });

  it('절대경로를 거부한다', () => {
    expect(() => assertInside('/a/b', '/etc/passwd')).toThrow(/밖/);
  });

  it('targetDir 자기 자신을 거부한다', () => {
    expect(() => assertInside('/a/b', '.')).toThrow(/밖/);
  });
});

describe('removeFiles', () => {
  it('파일을 지운다', async () => {
    const ctx = makeCtx();
    writeFileSync(join(ctx.targetDir, '.prettierrc'), '{}');
    await removeFiles(['.prettierrc']).run(ctx);
    expect(existsSync(join(ctx.targetDir, '.prettierrc'))).toBe(false);
  });

  it('required가 아니면 없는 파일에 조용히 통과한다', async () => {
    const ctx = makeCtx();
    await expect(removeFiles(['nope']).run(ctx)).resolves.toBeUndefined();
  });

  it('required면 없는 파일에 던진다 — 위임 대상 변화를 침묵시키지 않는다', async () => {
    const ctx = makeCtx();
    await expect(removeFiles(['pnpm-workspace.yaml'], { required: true }).run(ctx)).rejects.toThrow(
      /pnpm-workspace\.yaml/,
    );
  });

  it('디렉토리도 지운다', async () => {
    const ctx = makeCtx();
    mkdirSync(join(ctx.targetDir, 'public'));
    writeFileSync(join(ctx.targetDir, 'public', 'a.svg'), '<svg/>');
    await removeFiles(['public']).run(ctx);
    expect(existsSync(join(ctx.targetDir, 'public'))).toBe(false);
  });

  it('여러 파일을 입력 순서대로 로그한다', async () => {
    const logs: string[] = [];
    const ctx = makeCtx((msg) => logs.push(msg));
    writeFileSync(join(ctx.targetDir, 'a.txt'), '');
    writeFileSync(join(ctx.targetDir, 'b.txt'), '');
    writeFileSync(join(ctx.targetDir, 'c.txt'), '');
    await removeFiles(['a.txt', 'b.txt', 'c.txt']).run(ctx);
    expect(logs).toEqual(['  삭제: a.txt', '  삭제: b.txt', '  삭제: c.txt']);
  });
});

describe('templateFileName', () => {
  it('_ 접두어를 .으로 바꾼다', () => {
    expect(templateFileName('_gitignore')).toBe('.gitignore');
    expect(templateFileName('_npmrc')).toBe('.npmrc');
  });

  it('_가 없으면 그대로 둔다', () => {
    expect(templateFileName('eslint.config.mjs')).toBe('eslint.config.mjs');
  });

  it('파일명 중간의 _는 건드리지 않는다', () => {
    expect(templateFileName('jest_e2e.js')).toBe('jest_e2e.js');
  });
});

describe('makeDirs', () => {
  it('중첩 디렉토리와 .gitkeep을 만든다', async () => {
    const ctx = makeCtx();
    await makeDirs(['src/features', 'src/entities']).run(ctx);
    expect(existsSync(join(ctx.targetDir, 'src/features/.gitkeep'))).toBe(true);
    expect(existsSync(join(ctx.targetDir, 'src/entities/.gitkeep'))).toBe(true);
  });

  it('이미 파일이 있는 디렉토리에는 .gitkeep을 넣지 않는다', async () => {
    const ctx = makeCtx();
    mkdirSync(join(ctx.targetDir, 'src'), { recursive: true });
    writeFileSync(join(ctx.targetDir, 'src', 'main.ts'), '');
    await makeDirs(['src']).run(ctx);
    expect(existsSync(join(ctx.targetDir, 'src/.gitkeep'))).toBe(false);
  });

  it('탈출 경로를 거부한다', async () => {
    const ctx = makeCtx();
    await expect(makeDirs(['../evil']).run(ctx)).rejects.toThrow(/밖/);
  });

  it('여러 디렉토리를 입력 순서대로 로그한다', async () => {
    const logs: string[] = [];
    const ctx = makeCtx((msg) => logs.push(msg));
    await makeDirs(['src/a', 'src/b', 'src/c']).run(ctx);
    expect(logs).toEqual(['  생성: src/a/', '  생성: src/b/', '  생성: src/c/']);
  });
});
