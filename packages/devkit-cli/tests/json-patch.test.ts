import { describe, expect, it } from 'vitest';
import { UnknownCategoryError, type Category } from '../src/lib/categories.js';
import {
  filterPatchByCategory,
  isJsonOverlay,
  reduceJsonOverlay,
} from '../src/update/json-patch.js';

const only = (...cats: Category[]) => new Set(cats);

describe('filterPatchByCategory — package.json (키 경로 판단)', () => {
  const PATCH = {
    prettier: '@devbak/prettier-config',
    jest: null,
    devDependencies: { eslint: '^10.8.0', 'eslint-plugin-prettier': null },
    scripts: { lint: 'eslint .', 'test:e2e': 'jest' },
  };

  it('lint만 남긴다', () => {
    expect(filterPatchByCategory(PATCH, only('lint'), null)).toEqual({
      prettier: '@devbak/prettier-config',
      scripts: { lint: 'eslint .' },
    });
  });

  it('deps만 남긴다 — 하위 키는 prefix로 따라온다', () => {
    expect(filterPatchByCategory(PATCH, only('deps'), null)).toEqual({
      devDependencies: { eslint: '^10.8.0', 'eslint-plugin-prettier': null },
    });
  });

  it('빈 객체가 되는 중간 노드는 통째로 뺀다', () => {
    // scripts 아래가 전부 걸러졌는데 `scripts: {}` 를 남기면 applyPatch가
    // 아무 일도 안 하면서 diff에는 나타나지 않아, 실제로는 변경이 없는데
    // 있는 것처럼 보이는 잡음이 된다.
    expect(filterPatchByCategory(PATCH, only('ci'), null)).toEqual({});
  });

  it('마커 키는 필터 대상이 아니라 아예 빠진다', () => {
    const withMarker = { ...PATCH, devkit: { type: 'nest', version: '0.1.0' } };
    const result = filterPatchByCategory(withMarker, only('lint', 'deps', 'test', 'repo'), null);
    expect(result).not.toHaveProperty('devkit');
  });

  it('표에 없는 잎을 만나면 던진다 — 조용히 건너뛰지 않는다', () => {
    expect(() => filterPatchByCategory({ nonsense: 1 }, only('lint'), null)).toThrow(
      UnknownCategoryError,
    );
  });
});

describe('filterPatchByCategory — 그 외 JSON (파일 카테고리 판단)', () => {
  const TSCONFIG = { extends: '@devbak/tsconfig/nest', compilerOptions: { outDir: './dist' } };

  it('파일 카테고리가 포함되면 통째로 남는다', () => {
    expect(filterPatchByCategory(TSCONFIG, only('ts'), 'ts')).toEqual(TSCONFIG);
  });

  it('포함되지 않으면 통째로 빠진다', () => {
    expect(filterPatchByCategory(TSCONFIG, only('lint'), 'ts')).toEqual({});
  });
});

describe('reduceJsonOverlay', () => {
  it('package.json의 name·version은 뺀다 — 프로젝트 고유값이다', () => {
    const content = JSON.stringify({ name: 'demo', version: '1.2.3', private: true });
    expect(reduceJsonOverlay('package.json', content)).toEqual({ private: true });
  });

  it('그 외 파일은 그대로 패치가 된다', () => {
    const content = JSON.stringify({ extends: '@devbak/tsconfig/nest' });
    expect(reduceJsonOverlay('tsconfig.json', content)).toEqual({
      extends: '@devbak/tsconfig/nest',
    });
  });

  it('중첩 경로의 package.json도 같은 규칙이다', () => {
    const content = JSON.stringify({ name: 'web', private: true });
    expect(reduceJsonOverlay('apps/web/package.json', content)).toEqual({ private: true });
  });
});

describe('isJsonOverlay', () => {
  it.each([
    ['package.json', true],
    ['tsconfig.json', true],
    ['turbo.json', true],
    ['eslint.config.mjs', false],
    ['.github/workflows/claude-review.yml', false],
  ])('%s → %s', (relPath, expected) => {
    expect(isJsonOverlay(relPath)).toBe(expected);
  });
});
