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

  it('빈 줄과 주석은 중복 판정에서 무시한다 — 그대로 더한다', () => {
    // 빈 줄을 "이미 있다"로 보면 템플릿의 구획 빈 줄이 영영 안 들어간다.
    const result = mergeIgnore('\n# 내 주석\n', ['# devkit 구획', 'dist/'], BLOCK);
    expect(result).toContain('# 내 주석');
    expect(result).toContain('# devkit 구획');
  });

  it('닫는 구분자가 없으면 던진다 — 조용히 파일 끝까지 삼키지 않는다', () => {
    const broken = `node_modules/\n${DEVKIT_BLOCK_START}\n.claude/*\n`;
    expect(() => mergeIgnore(broken, [], BLOCK)).toThrow(/구분자/);
  });
});
