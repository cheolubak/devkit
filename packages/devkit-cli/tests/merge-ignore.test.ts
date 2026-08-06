import { describe, expect, it } from 'vitest';
import { DEVKIT_BLOCK_END, DEVKIT_BLOCK_START, mergeIgnore } from '../src/ops/merge-ignore.js';

const BLOCK = ['.claude/*', '!.claude/agents/'];

describe('mergeIgnore', () => {
  it('빈 대상에는 템플릿 줄과 블록을 쓴다', () => {
    expect(mergeIgnore('', ['node_modules/'], BLOCK)).toBe(
      `node_modules/\n\n${DEVKIT_BLOCK_START}\n.claude/*\n!.claude/agents/\n${DEVKIT_BLOCK_END}\n`,
    );
  });

  it('대상의 기존 줄을 그대로 둔다 — 사용자가 넣은 규칙이 사라지면 안 된다', () => {
    const result = mergeIgnore('내-비밀-폴더/\n', ['node_modules/'], BLOCK);
    expect(result).toContain('내-비밀-폴더/');
    expect(result).toContain('node_modules/');
  });

  it('대상에 이미 있는 템플릿 줄은 다시 넣지 않는다', () => {
    const result = mergeIgnore('node_modules/\ndist/\n', ['node_modules/', 'coverage/'], BLOCK);
    expect(result.split('\n').filter((l) => l === 'node_modules/')).toHaveLength(1);
    expect(result).toContain('coverage/');
  });

  it('두 번 돌려도 커지지 않는다 — 멱등이다', () => {
    const once = mergeIgnore('node_modules/\n', ['dist/'], BLOCK);
    expect(mergeIgnore(once, ['dist/'], BLOCK)).toBe(once);
  });

  it('lines에 주석·빈 줄이 섞여도 두 번 돌리면 커지지 않는다 — 멱등이다', () => {
    // 회귀 재현: significant() 가 주석·빈 줄에 null 을 반환하는데 존재 판정 없이
    // 무조건 추가되면, 같은 lines 로 두 번 돌릴 때마다 주석이 계속 쌓인다.
    const linesWithComment = ['# devkit 안내', '', 'node_modules/'];
    const once = mergeIgnore('', linesWithComment, BLOCK);
    expect(mergeIgnore(once, linesWithComment, BLOCK)).toBe(once);
  });

  it('블록이 이미 있으면 안쪽만 갈아끼운다', () => {
    const before = mergeIgnore('node_modules/\n', [], ['.claude/*']);
    const after = mergeIgnore(before, [], ['.claude/*', '!.claude/commands/']);
    expect(after).toContain('!.claude/commands/');
    expect(after.split(DEVKIT_BLOCK_START)).toHaveLength(2);
    expect(after).toContain('node_modules/');
  });

  it('블록 바깥에 사용자가 쓴 것은 블록을 갈아끼워도 남는다', () => {
    const before = `${mergeIgnore('a/\n', [], ['.claude/*'])}b/\n`;
    const after = mergeIgnore(before, [], ['.claude/*', 'c/']);
    expect(after).toContain('a/');
    expect(after).toContain('b/');
    expect(after).toContain('c/');
  });

  it('서로 다른 빈 줄·주석은 유의미 중복 판정을 타지 않는다 — 그대로 더한다', () => {
    // significant() 는 빈 줄·주석에 null 을 반환해 trim 키 기반 중복 판정
    // 대상에서 빠진다. 하지만 원문이 다르면(내 주석 ≠ devkit 구획) 원문 일치
    // 판정도 걸리지 않으므로 둘 다 남는다. 완전히 같은 문구가 이미 있을 때만
    // 생략된다(멱등성 테스트가 그 경로를 덮는다).
    const result = mergeIgnore('\n# 내 주석\n', ['# devkit 구획', 'dist/'], BLOCK);
    expect(result).toContain('# 내 주석');
    expect(result).toContain('# devkit 구획');
  });

  it('닫는 구분자가 없으면 던진다 — 조용히 파일 끝까지 삼키지 않는다', () => {
    const broken = `node_modules/\n${DEVKIT_BLOCK_START}\n.claude/*\n`;
    expect(() => mergeIgnore(broken, [], BLOCK)).toThrow(/구분자/);
  });
});
