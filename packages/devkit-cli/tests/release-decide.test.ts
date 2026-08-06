import { describe, expect, it } from 'vitest';
import {
  axisOf,
  bumpOf,
  decideRelease,
  isReleasePath,
  type CommitInfo,
} from '../src/release/decide.js';

function commit(subject: string, files: string[], body = ''): CommitInfo {
  return { subject, body, files };
}

describe('isReleasePath', () => {
  it('게시되는 것에 영향을 주는 변경만 센다', () => {
    expect(isReleasePath('packages/tsconfig/base.json')).toBe(true);
    expect(isReleasePath('packages/devkit-cli/src/bin.ts')).toBe(true);
    expect(isReleasePath('packages/devkit-cli/templates/nest/CLAUDE.md')).toBe(true);
  });

  it('tarball 에 안 들어가거나 동작을 안 바꾸는 것은 세지 않는다', () => {
    // 테스트·설정은 files 화이트리스트 밖이고, README 는 실려도 동작이 같다.
    expect(isReleasePath('packages/devkit-cli/tests/bin.test.ts')).toBe(false);
    expect(isReleasePath('packages/tsconfig/README.md')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/eslint.config.mjs')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/vitest.config.ts')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/tsup.config.ts')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/tsconfig.json')).toBe(false);
    expect(isReleasePath('packages/devkit-cli/turbo.json')).toBe(false);
  });

  it('templates/ 안은 IRRELEVANT와 이름이 겹쳐도 게시물이라 릴리스 대상이다', () => {
    // devkit-cli 의 files 가 ["dist","templates"] 라 템플릿 전체가 tarball 에 실린다.
    // eslint.config.mjs·tsconfig.json·vitest.config.ts 는 툴킷 저장소 설정으론 무관하지만
    // 템플릿 안에서는 사용자에게 나가는 산출물 그 자체다.
    expect(isReleasePath('packages/devkit-cli/templates/monorepo/eslint.config.mjs')).toBe(true);
    expect(isReleasePath('packages/devkit-cli/templates/nest/tsconfig.json')).toBe(true);
    expect(isReleasePath('packages/devkit-cli/templates/next/vitest.config.ts')).toBe(true);
  });
});

describe('axisOf', () => {
  it('devkit-cli 는 cli 축이다', () => {
    expect(axisOf('packages/devkit-cli/src/bin.ts')).toBe('cli');
  });

  it('나머지 패키지는 config 축이다', () => {
    expect(axisOf('packages/tsconfig/base.json')).toBe('config');
    expect(axisOf('packages/vitest-config/next.js')).toBe('config');
  });

  it('패키지 밖은 어느 축도 아니다 — 루트 변경으로 릴리스하지 않는다', () => {
    expect(axisOf('turbo.json')).toBe(null);
    expect(axisOf('docs/superpowers/specs/x.md')).toBe(null);
  });
});

describe('bumpOf', () => {
  it('접두로 크기를 정한다', () => {
    expect(bumpOf(commit('feat: 무엇을 더한다', []))).toBe('minor');
    expect(bumpOf(commit('fix: 무엇을 고친다', []))).toBe('patch');
    expect(bumpOf(commit('refactor: 정리한다', []))).toBe('patch');
    expect(bumpOf(commit('build: 스크립트를 바꾼다', []))).toBe('patch');
  });

  it('문서·테스트·잡무는 릴리스를 부르지 않는다', () => {
    expect(bumpOf(commit('docs: 문서를 쓴다', []))).toBe(null);
    expect(bumpOf(commit('test: 테스트를 더한다', []))).toBe(null);
    expect(bumpOf(commit('chore: 정리', []))).toBe(null);
  });

  it('BREAKING CHANGE 는 major 다 — 본문에도 제목의 ! 에도 반응한다', () => {
    expect(bumpOf(commit('feat: 바꾼다', [], 'BREAKING CHANGE: 시그니처가 바뀐다'))).toBe('major');
    expect(bumpOf(commit('feat!: 바꾼다', []))).toBe('major');
  });

  it('아는 접두가 아니면 릴리스하지 않는다 — 병합 커밋 등이 여기 걸린다', () => {
    expect(bumpOf(commit('Merge branch main', []))).toBe(null);
  });
});

describe('decideRelease', () => {
  it('축마다 가장 큰 올림을 고른다', () => {
    const decision = decideRelease([
      commit('fix: cli 를 고친다', ['packages/devkit-cli/src/bin.ts']),
      commit('feat: cli 에 더한다', ['packages/devkit-cli/templates/nest/CLAUDE.md']),
      commit('fix: 설정을 고친다', ['packages/tsconfig/base.json']),
    ]);
    expect(decision).toEqual({ config: 'patch', cli: 'minor' });
  });

  it('설정 패키지 하나만 바뀌어도 config 축 전체가 대상이다 — 락스텝', () => {
    const decision = decideRelease([
      commit('fix: vitest 설정을 고친다', ['packages/vitest-config/next.js']),
    ]);
    expect(decision).toEqual({ config: 'patch', cli: null });
  });

  it('릴리스 대상 경로가 없으면 아무 축도 안 올린다', () => {
    const decision = decideRelease([
      commit('test: 테스트를 더한다', ['packages/devkit-cli/tests/bin.test.ts']),
      commit('docs: 문서를 쓴다', ['README.md']),
    ]);
    expect(decision).toEqual({ config: null, cli: null });
  });

  it('경로는 걸렸는데 접두가 릴리스를 안 부르면 올리지 않는다', () => {
    // 이 갈래가 없으면 docs: 커밋이 소스를 건드릴 때 조용히 릴리스가 난다.
    const decision = decideRelease([
      commit('docs: 주석을 고친다', ['packages/devkit-cli/src/bin.ts']),
    ]);
    expect(decision).toEqual({ config: null, cli: null });
  });
});
