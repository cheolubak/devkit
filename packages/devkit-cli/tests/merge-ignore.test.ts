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

  describe('block 의 부정 패턴을 무력화하는 조상 제외 줄', () => {
    // 회귀 재현(최종 리뷰 Critical 1): 대상에 `.claude/` 가 이미 있으면
    // "기존 내용 유지" 원칙에 따라 그 줄이 살아남는데, git 은 제외된
    // 디렉토리 안으로 내려가지 않아 block 의 `!.claude/agents/` 가 아무
    // 효력이 없다 — 리뷰가 `git check-ignore` 로 직접 재현했다.

    it('대상의 .claude/ 줄을 지워 block 의 부정 패턴이 실제로 살게 한다', () => {
      const result = mergeIgnore('.claude/\n', ['node_modules/'], BLOCK);
      // .claude/ 단독 줄(조상 제외)은 사라졌고
      expect(result.split('\n')).not.toContain('.claude/');
      // block 자체와 그 안의 부정 패턴은 그대로 남는다
      expect(result).toContain('.claude/*');
      expect(result).toContain('!.claude/agents/');
      // 무관한 기존 내용은 그대로 유지된다 — 조상 줄만 골라 지운다
      expect(result).toContain('node_modules/');
    });

    it('트레일링 슬래시가 없는 .claude 도 같은 조상으로 취급한다', () => {
      const result = mergeIgnore('.claude\n', [], BLOCK);
      expect(result.split('\n')).not.toContain('.claude');
      expect(result).toContain('!.claude/agents/');
    });

    it('.claude/foo 처럼 자식을 가리키는 줄은 건드리지 않는다 — 정확히 일치할 때만 지운다', () => {
      const result = mergeIgnore('.claude/foo\n', [], BLOCK);
      expect(result).toContain('.claude/foo');
      expect(result).toContain('!.claude/agents/');
    });

    it('block 에 부정 패턴이 없으면 아무 조상 줄도 지우지 않는다', () => {
      const result = mergeIgnore('.claude/\n', [], ['.claude/*']);
      expect(result).toContain('.claude/');
    });

    it('조상 제외 줄을 지운 뒤에도 두 번 돌리면 커지지 않는다 — 멱등이다', () => {
      const once = mergeIgnore('.claude/\nnode_modules/\n', [], BLOCK);
      expect(mergeIgnore(once, [], BLOCK)).toBe(once);
    });
  });
});
