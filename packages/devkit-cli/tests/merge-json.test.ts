import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyPatch, hasPath, mergeJson } from '../src/ops/merge-json.js';
import type { Ctx } from '../src/types.js';

describe('applyPatch', () => {
  it('중첩 객체를 재귀 병합한다', () => {
    const result = applyPatch(
      { scripts: { build: 'nest build', lint: 'old' }, name: 'x' },
      { scripts: { lint: 'eslint .' } },
    );
    expect(result).toEqual({ scripts: { build: 'nest build', lint: 'eslint .' }, name: 'x' });
  });

  it('null 값은 키를 삭제한다', () => {
    const result = applyPatch(
      { devDependencies: { eslint: '^9.18.0', 'eslint-plugin-prettier': '^5.2.2' } },
      { devDependencies: { 'eslint-plugin-prettier': null, eslint: '^10.8.0' } },
    );
    expect(result).toEqual({ devDependencies: { eslint: '^10.8.0' } });
    expect(result.devDependencies).not.toHaveProperty('eslint-plugin-prettier');
  });

  it('최상위 키도 null로 삭제한다 — nest new의 인라인 jest 블록 제거용', () => {
    const result = applyPatch({ name: 'x', jest: { rootDir: 'src' } }, { jest: null });
    expect(result).toEqual({ name: 'x' });
  });

  it('배열은 병합하지 않고 교체한다', () => {
    const result = applyPatch({ files: ['dist', 'old'] }, { files: ['dist'] });
    expect(result).toEqual({ files: ['dist'] });
  });

  it('원본을 변경하지 않는다', () => {
    const original = { scripts: { lint: 'old' } };
    applyPatch(original, { scripts: { lint: 'new' } });
    expect(original.scripts.lint).toBe('old');
  });

  it('없는 키에 null을 줘도 던지지 않는다', () => {
    expect(applyPatch({ a: 1 }, { b: null })).toEqual({ a: 1 });
  });

  describe('회귀 테스트: 중첩 null 삭제', () => {
    it('부모 경로 부재 시 중첩 null을 삭제한다', () => {
      const result = applyPatch({}, { a: { b: null } });
      expect(result).toEqual({ a: {} });
      expect(result.a).toEqual({});
    });

    it('신규 키에 중첩 null 패치 후 value가 null이 되지 않는다', () => {
      const result = applyPatch({ name: 'x' }, { devDependencies: { eslint: null } });
      expect(result).toEqual({ name: 'x', devDependencies: {} });
      expect(result.devDependencies).not.toHaveProperty('eslint');
      expect(result.devDependencies).not.toEqual({ eslint: null });
    });

    it('기존 키의 중첩 null이 삭제되고 다른 항목은 유지된다', () => {
      const result = applyPatch(
        { a: { b: 1, c: 2 } },
        { a: { b: null } },
      );
      expect(result).toEqual({ a: { c: 2 } });
    });
  });
});

describe('hasPath', () => {
  it('점 표기 경로를 따라간다', () => {
    const obj = { devDependencies: { 'eslint-plugin-prettier': '^5.2.2' } };
    expect(hasPath(obj, 'devDependencies.eslint-plugin-prettier')).toBe(true);
    expect(hasPath(obj, 'devDependencies.nonexistent')).toBe(false);
    expect(hasPath(obj, 'jest')).toBe(false);
  });

  it('중간 경로가 객체가 아니면 false다', () => {
    expect(hasPath({ a: 'string' }, 'a.b')).toBe(false);
  });
});

describe('mergeJson (run 함수)', () => {
  let fixtureDir: string;

  beforeEach(async () => {
    fixtureDir = join(__dirname, '.fixtures', `test-${Date.now()}`);
    await mkdir(fixtureDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('실제 파일을 읽어 병합하고 다시 쓴다', async () => {
    const packageJsonPath = join(fixtureDir, 'package.json');
    const original = { name: 'test', version: '1.0.0', scripts: { build: 'tsc' } };
    await writeFile(packageJsonPath, JSON.stringify(original, null, 2));

    const step = mergeJson({ scripts: { lint: 'eslint .' } });
    const ctx: Ctx = {
      targetDir: fixtureDir,
      toolkitRoot: '/fake',
      name: 'test',
      log: () => {},
    };

    await step.run(ctx);

    const result = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
    expect(result).toEqual({
      name: 'test',
      version: '1.0.0',
      scripts: { build: 'tsc', lint: 'eslint .' },
    });
  });

  it('required 경로가 없으면 에러를 던진다', async () => {
    const packageJsonPath = join(fixtureDir, 'package.json');
    const original = { name: 'test' };
    await writeFile(packageJsonPath, JSON.stringify(original, null, 2));

    const step = mergeJson(
      { scripts: { lint: 'eslint .' } },
      { required: ['devDependencies.eslint'] },
    );
    const ctx: Ctx = {
      targetDir: fixtureDir,
      toolkitRoot: '/fake',
      name: 'test',
      log: () => {},
    };

    await expect(step.run(ctx)).rejects.toThrow(
      /package\.json에 'devDependencies\.eslint'가 없습니다/,
    );
  });

  it('required 경로가 있으면 에러를 던지지 않는다', async () => {
    const packageJsonPath = join(fixtureDir, 'package.json');
    const original = { name: 'test', devDependencies: { eslint: '^9.0.0' } };
    await writeFile(packageJsonPath, JSON.stringify(original, null, 2));

    const step = mergeJson(
      { scripts: { lint: 'eslint .' } },
      { required: ['devDependencies.eslint'] },
    );
    const ctx: Ctx = {
      targetDir: fixtureDir,
      toolkitRoot: '/fake',
      name: 'test',
      log: () => {},
    };

    await expect(step.run(ctx)).resolves.toBeUndefined();

    const result = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
    expect(result).toEqual({ name: 'test', devDependencies: { eslint: '^9.0.0' }, scripts: { lint: 'eslint .' } });
  });

  it('options.file이 기본값이 아닌 경로를 가리킬 때 그 파일을 대상으로 한다', async () => {
    const customPath = join(fixtureDir, 'tsconfig.json');
    const original = { compilerOptions: { strict: true } };
    await writeFile(customPath, JSON.stringify(original, null, 2));

    const step = mergeJson(
      { compilerOptions: { esModuleInterop: true } },
      { file: 'tsconfig.json' },
    );
    const ctx: Ctx = {
      targetDir: fixtureDir,
      toolkitRoot: '/fake',
      name: 'test',
      log: () => {},
    };

    await step.run(ctx);

    const result = JSON.parse(await readFile(customPath, 'utf8')) as unknown;
    expect(result).toEqual({
      compilerOptions: { strict: true, esModuleInterop: true },
    });
  });
});
