import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeIgnore } from '../src/ops/merge-ignore.js';

// 문자열 toContain 은 "그 줄이 있다/없다"만 본다 — git 이 실제로 그 파일을
// 추적하는지는 다른 질문이다(최종 리뷰 Minor 3). 여기서는 mergeIgnore 의
// 출력을 진짜 git 저장소에 놓고 git 자신에게 판정을 묻는다.

const BLOCK = ['.claude/*', '!.claude/agents/', '!.claude/commands/'];

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-gitignore-check-'));
  created.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

/** git check-ignore 는 무시되면 exit 0, 아니면 exit 1(=execFileSync 가 던짐)이다. */
function isIgnored(dir: string, relPath: string): boolean {
  try {
    execFileSync('git', ['check-ignore', relPath], { cwd: dir, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

describe('mergeIgnore 결과의 실제 git 판정 (git check-ignore)', () => {
  it('.claude/ 를 통째로 무시하던 대상도 병합 후 리뷰 자산 둘은 추적되고 개인 스크래치는 계속 무시된다', () => {
    // 최종 리뷰 Critical 1 재현·확인. 리뷰어가 손으로 한 실측
    // (`git check-ignore -v` → `.gitignore:1:.claude/` 가 이긴다)을
    // 자동화된 테스트로 고정한다.
    const dir = makeGitRepo();
    const merged = mergeIgnore('.claude/\n', [], BLOCK);
    writeFileSync(join(dir, '.gitignore'), merged);

    mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'agents', 'devkit-reviewer.md'), '# reviewer\n');
    mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'commands', 'review.md'), '# review\n');
    // settings.local.json 은 devkit 이 놓지 않는 개인 스크래치다 — 완료
    // 기준 2가 요구하는 것은 이것이 계속 무시되는 것이다.
    writeFileSync(join(dir, '.claude', 'settings.local.json'), '{}\n');

    expect(isIgnored(dir, '.claude/agents/devkit-reviewer.md')).toBe(false);
    expect(isIgnored(dir, '.claude/commands/review.md')).toBe(false);
    expect(isIgnored(dir, '.claude/settings.local.json')).toBe(true);
  });

  it('조상 제외 줄이 없는 대상은 그대로 — 블록만으로도 같은 판정이다', () => {
    // 회귀 방지: 조상 스트립이 "있을 때만" 동작하고, 없을 때 엉뚱한 줄을
    // 건드리지 않는지 같은 방식으로 확인한다.
    const dir = makeGitRepo();
    const merged = mergeIgnore('', [], BLOCK);
    writeFileSync(join(dir, '.gitignore'), merged);

    mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'agents', 'devkit-reviewer.md'), '# reviewer\n');
    writeFileSync(join(dir, '.claude', 'settings.local.json'), '{}\n');

    expect(isIgnored(dir, '.claude/agents/devkit-reviewer.md')).toBe(false);
    expect(isIgnored(dir, '.claude/settings.local.json')).toBe(true);
  });
});
