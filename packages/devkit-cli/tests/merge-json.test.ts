import { describe, expect, it } from 'vitest';
import { applyPatch, hasPath } from '../src/ops/merge-json.js';

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
