import { describe, expect, it } from 'vitest';
import { nextRange, nextVersion } from '../src/release/apply.js';

describe('nextVersion', () => {
  it('patch 는 마지막 자리만 올린다', () => {
    expect(nextVersion('0.1.1', 'patch')).toBe('0.1.2');
  });

  it('minor 는 패치를 0 으로 되돌린다', () => {
    expect(nextVersion('0.1.5', 'minor')).toBe('0.2.0');
  });

  it('major 는 나머지를 0 으로 되돌린다', () => {
    expect(nextVersion('0.2.3', 'major')).toBe('1.0.0');
  });

  it('형식이 아니면 던진다 — 조용히 0.0.1 로 만들지 않는다', () => {
    expect(() => nextVersion('0.1', 'patch')).toThrow(/버전/);
  });
});

describe('nextRange', () => {
  it('patch 면 범위를 그대로 둔다 — 캐럿이 이미 흡수한다', () => {
    expect(nextRange('^0.1.0', '0.1.2', 'patch')).toBe('^0.1.0');
  });

  it('minor 면 새 버전으로 범위를 옮긴다', () => {
    // 이걸 안 하면 생성물이 선언한 범위가 게시본을 못 가리키고
    // registry-version.test.ts 가 다음 실행에서 막는다.
    expect(nextRange('^0.1.0', '0.2.0', 'minor')).toBe('^0.2.0');
  });

  it('major 면 새 버전으로 범위를 옮긴다', () => {
    expect(nextRange('^0.2.0', '1.0.0', 'major')).toBe('^1.0.0');
  });
});
