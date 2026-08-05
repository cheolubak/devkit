import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  categoryOf,
  categoryOfJsonPath,
  DEFAULT_EXCLUDED_CATEGORIES,
  JSON_KEY_CATEGORIES,
  MARKER_KEY,
  parseOnly,
  PROJECT_OWNED_KEYS,
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
    ['jest.config.js', 'test'],
    ['jest-e2e.config.js', 'test'],
    ['test/jest-e2e.config.ts', 'test'],
    ['vitest.config.ts', 'test'],
    ['.gitignore', 'repo'],
    ['pnpm-workspace.yaml', 'repo'],
    ['turbo.json', 'repo'],
    ['package.json', 'repo'],
    ['src/main.ts', 'scaffold'],
    ['src/app/page.tsx', 'scaffold'],
  ])('%s → %s', (relPath, expected) => {
    expect(categoryOf(relPath)).toBe(expected);
  });

  it.each([
    // 템플릿은 언더스코어 접두로 담고 copyOverlay 가 점 이름으로 되돌린다.
    // 오버레이 커버리지와 실제 소비자 경로가 모두 걸려야 한다.
    ['_gitignore', 'repo'],
    ['_prettierignore', 'lint'],
    ['.prettierignore', 'lint'],
  ])('언더스코어 접두 템플릿 %s → %s', (relPath, expected) => {
    expect(categoryOf(relPath)).toBe(expected);
  });

  it('devkit이 소유하지 않는 경로는 null을 반환한다', () => {
    expect(categoryOf('README.md')).toBeNull();
    expect(categoryOf('docs/guide.md')).toBeNull();
  });

  it('scaffold 는 update 기본 제외 대상이다', () => {
    // src/ 아래는 생성 시점에 한 번 놓이고 그 뒤로는 사람이 고쳐 쓴다.
    // 표준 재적용이 덮어쓰면 사용자의 작업이 사라진다.
    expect(DEFAULT_EXCLUDED_CATEGORIES).toContain('scaffold');
    expect(categoryOf('src/main.ts')).toBe('scaffold');
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
  it('설계 5.4절의 8종을 갖는다', () => {
    expect([...CATEGORIES]).toEqual([
      'claude',
      'ci',
      'lint',
      'ts',
      'test',
      'deps',
      'repo',
      'scaffold',
    ]);
  });
});

describe('JSON_KEY_CATEGORIES', () => {
  it('설계 6.2절과 일치한다', () => {
    expect(JSON_KEY_CATEGORIES).toEqual({
      dependencies: 'deps',
      devDependencies: 'deps',
      prettier: 'lint',
      jest: 'test',
      'scripts.lint': 'lint',
      'scripts.format': 'lint',
      'scripts.format:check': 'lint',
      'scripts.test': 'test',
      'scripts.test:watch': 'test',
      'scripts.test:e2e': 'test',
      'scripts.build': 'repo',
      'scripts.dev': 'repo',
      'scripts.typecheck': 'repo',
      packageManager: 'repo',
      private: 'repo',
      type: 'repo',
    });
  });

  it('모든 값이 CATEGORIES 안에 있다', () => {
    const known: readonly string[] = CATEGORIES;
    for (const category of Object.values(JSON_KEY_CATEGORIES)) {
      expect(known).toContain(category);
    }
  });
});

describe('categoryOfJsonPath', () => {
  it.each([
    ['dependencies', 'deps'],
    ['devDependencies', 'deps'],
    ['devDependencies.eslint', 'deps'],
    ['devDependencies.@cheolubak/tsconfig', 'deps'],
    ['prettier', 'lint'],
    ['jest', 'test'],
    ['scripts.lint', 'lint'],
    ['scripts.format', 'lint'],
    ['scripts.format:check', 'lint'],
    ['scripts.test', 'test'],
    ['scripts.test:watch', 'test'],
    ['scripts.test:e2e', 'test'],
    ['scripts.build', 'repo'],
    ['scripts.dev', 'repo'],
    ['scripts.typecheck', 'repo'],
    ['packageManager', 'repo'],
    ['private', 'repo'],
    ['type', 'repo'],
  ])('%s → %s', (path, expected) => {
    expect(categoryOfJsonPath(path)).toBe(expected);
  });

  it('중간 노드는 null을 반환해 더 내려가게 한다', () => {
    // scripts 자체에는 카테고리가 없다 — 하위 키마다 다르기 때문이다.
    expect(categoryOfJsonPath('scripts')).toBeNull();
  });

  it('표에 없는 경로도 null이다 — 던지는 것은 호출자의 몫이다', () => {
    expect(categoryOfJsonPath('nonsense')).toBeNull();
  });

  it('더 긴 prefix가 이긴다', () => {
    // 'scripts.test'와 'scripts.test:e2e'가 둘 다 있을 때 후자가 이겨야
    // 한다. 'scripts.test'가 이기면 'scripts.test:e2e'는 영영 안 걸린다.
    expect(categoryOfJsonPath('scripts.test:e2e')).toBe('test');
  });
});

describe('마커·프로젝트 고유 키', () => {
  it('마커 키는 devkit이다', () => {
    expect(MARKER_KEY).toBe('devkit');
  });

  it('name·version은 프로젝트 고유값이라 재적용 대상이 아니다', () => {
    expect([...PROJECT_OWNED_KEYS]).toEqual(['name', 'version']);
  });
});
