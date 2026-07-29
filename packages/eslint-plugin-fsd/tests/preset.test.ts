import { describe, it, expect } from 'vitest';
import type { Linter } from 'eslint';
import { scopeToFiles, JSX_FILES, HOOK_FILES } from '../src/lib/preset';

describe('scopeToFiles', () => {
  it('files를 씌운 새 객체를 반환한다', () => {
    const base: Linter.Config = { rules: { 'a/b': 'error' } };
    const scoped = scopeToFiles(base, JSX_FILES);
    expect(scoped.files).toEqual(['**/*.{jsx,tsx}']);
    expect(scoped.rules).toEqual({ 'a/b': 'error' });
  });

  it('원본 config를 변경하지 않는다', () => {
    const base: Linter.Config = { rules: {} };
    scopeToFiles(base, JSX_FILES);
    expect(base.files).toBeUndefined();
  });

  it('이미 files가 있으면 덮어쓴다', () => {
    const base: Linter.Config = { files: ['**/*.js'], rules: {} };
    expect(scopeToFiles(base, JSX_FILES).files).toEqual(JSX_FILES);
  });
});

describe('파일 스코프 상수', () => {
  it('JSX_FILES는 jsx/tsx만 대상으로 한다', () => {
    expect(JSX_FILES).toEqual(['**/*.{jsx,tsx}']);
  });

  it('HOOK_FILES는 JSX 없는 ts/js까지 포함한다', () => {
    expect(HOOK_FILES).toEqual(['**/*.{js,jsx,ts,tsx}']);
  });
});
