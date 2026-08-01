import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  categoryOf,
  parseOnly,
  UnknownCategoryError,
} from '../src/lib/categories.js';

describe('categoryOf', () => {
  it.each([
    ['.claude/agents/devkit-reviewer.md', 'claude'],
    ['.claude/commands/review.md', 'claude'],
    ['CLAUDE.md', 'claude'],
    ['.github/workflows/claude-review.yml', 'ci'],
    ['eslint.config.mjs', 'lint'],
    ['tsconfig.json', 'ts'],
    ['jest.config.ts', 'test'],
    ['test/jest-e2e.config.ts', 'test'],
    ['vitest.config.ts', 'test'],
    ['.gitignore', 'repo'],
  ])('%s → %s', (relPath, expected) => {
    expect(categoryOf(relPath)).toBe(expected);
  });

  it('devkit이 소유하지 않는 경로는 null을 반환한다', () => {
    expect(categoryOf('src/main.ts')).toBeNull();
    expect(categoryOf('README.md')).toBeNull();
  });

  it('.claude 하위라도 사용자 로컬 설정은 분류하지 않는다', () => {
    // settings.local.json은 사람이 만드는 파일이고 devkit 오버레이가 아니다.
    // 이것을 claude로 분류하면 update가 사용자 설정을 덮어쓴다.
    expect(categoryOf('.claude/settings.local.json')).toBeNull();
  });

  it('Windows 구분자를 정규화한다', () => {
    expect(categoryOf('.github\\workflows\\claude-review.yml')).toBe('ci');
  });

  it('deps 카테고리는 어떤 경로로도 매칭되지 않는다', () => {
    // deps는 package.json 패치와 linkDeps를 가리키는 논리 카테고리다.
    const everyPath = [
      '.claude/agents/devkit-reviewer.md',
      'CLAUDE.md',
      '.github/workflows/claude-review.yml',
      'eslint.config.mjs',
      'tsconfig.json',
      'jest.config.ts',
      '.gitignore',
      'package.json',
    ];
    for (const path of everyPath) {
      expect(categoryOf(path)).not.toBe('deps');
    }
  });
});

describe('parseOnly', () => {
  it('단일 카테고리를 파싱한다', () => {
    expect(parseOnly('claude')).toEqual(['claude']);
  });

  it('쉼표로 구분된 복수 카테고리를 파싱한다', () => {
    expect(parseOnly('claude,ci')).toEqual(['claude', 'ci']);
  });

  it('공백을 무시한다', () => {
    expect(parseOnly(' claude , ci ')).toEqual(['claude', 'ci']);
  });

  it('중복을 제거한다', () => {
    expect(parseOnly('claude,claude')).toEqual(['claude']);
  });

  it('알 수 없는 카테고리는 오타 하나라도 전체를 거부한다', () => {
    // 부분 실행하면 --only clade 가 아무것도 갱신하지 않고 성공을 보고한다.
    expect(() => parseOnly('claude,clade')).toThrow(UnknownCategoryError);
  });

  it('오류 메시지에 유효한 카테고리 목록을 담는다', () => {
    expect(() => parseOnly('clade')).toThrow(/claude/);
    expect(() => parseOnly('clade')).toThrow(/repo/);
  });

  it('빈 값을 거부한다', () => {
    expect(() => parseOnly('')).toThrow(UnknownCategoryError);
    expect(() => parseOnly('   ')).toThrow(UnknownCategoryError);
  });
});

describe('CATEGORIES', () => {
  it('설계 5.4절의 7종을 갖는다', () => {
    expect([...CATEGORIES]).toEqual(['claude', 'ci', 'lint', 'ts', 'test', 'deps', 'repo']);
  });
});
