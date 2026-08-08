import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEVKIT_BLOCK_END,
  DEVKIT_BLOCK_START,
  mergeIgnore,
} from '../src/ops/merge-ignore.js';

// 문자열 toContain 은 "그 줄이 있다/없다"만 본다 — git 이 실제로 그 파일을
// 추적하는지는 다른 질문이다(최종 리뷰 Minor 3). 여기서는 mergeIgnore 의
// 출력을 진짜 git 저장소에 놓고 git 자신에게 판정을 묻는다.

const BLOCK = ['.claude/*', '!.claude/agents/', '!.claude/commands/'];

/** 실제로 배포되는 템플릿의 devkit 블록. 손으로 옮겨 적으면 템플릿이 바뀔 때 갈라진다. */
const SHIPPED_BLOCK = ((): string[] => {
  const lines = readFileSync(new URL('../templates/_shared/_gitignore', import.meta.url), 'utf8')
    .replace(/\n$/, '')
    .split('\n');
  // 마커를 못 찾으면 indexOf 가 -1 을 주고, slice(0, -1) 이 되어 **템플릿
  // 전체(마지막 줄 제외)를 블록으로** 조용히 취급한다. `.claude/*` 와 부정
  // 패턴이 그 안에 그대로 들어 있어 테스트는 계속 통과하고, 정작 검증하려던
  // "배포되는 블록"은 검증되지 않는다. mergeIgnore 가 열린 구분자에 대해
  // 던지는 것과 같은 이유로 여기서도 던진다 — 조용한 후퇴를 만들지 않는다.
  const startAt = lines.indexOf(DEVKIT_BLOCK_START);
  const endAt = lines.indexOf(DEVKIT_BLOCK_END);
  if (startAt === -1 || endAt <= startAt) {
    throw new Error(
      `템플릿 _shared/_gitignore 에서 devkit 블록 구분자를 찾지 못했습니다(start=${startAt}, end=${endAt}).`,
    );
  }
  return lines.slice(startAt + 1, endAt);
})();

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

  // 조상 줄은 네 가지로 쓸 수 있고 넷 다 `.claude` 디렉토리 자체를 제외한다.
  // 리딩 슬래시(앵커)와 트레일링 슬래시는 표기만 다를 뿐, 루트 .gitignore
  // 에서는 부정 패턴을 죽이는 효과가 같다. 블록은 손으로 적지 않고 실제로
  // 배포되는 템플릿에서 읽는다 — 템플릿과 테스트가 갈라지지 않게 한다.
  it.each(['.claude/', '.claude', '/.claude/', '/.claude'])(
    '기존 줄 %s 가 어떤 표기든 리뷰 자산은 추적되고 개인 스크래치는 무시된다',
    (existing) => {
      const dir = makeGitRepo();
      writeFileSync(join(dir, '.gitignore'), mergeIgnore(`${existing}\n`, [], SHIPPED_BLOCK));

      mkdirSync(join(dir, '.claude', 'agents'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'agents', 'devkit-reviewer.md'), '# reviewer\n');
      mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'commands', 'review.md'), '# review\n');
      writeFileSync(join(dir, '.claude', 'settings.local.json'), '{}\n');

      expect(isIgnored(dir, '.claude/agents/devkit-reviewer.md')).toBe(false);
      expect(isIgnored(dir, '.claude/commands/review.md')).toBe(false);
      expect(isIgnored(dir, '.claude/settings.local.json')).toBe(true);
    },
  );

  it('배포되는 블록이 스킬도 추적되게 한다 — CI 리뷰가 판정 근거로 읽는다', () => {
    // devkit-reviewer.md 와 claude-review.yml 이 `.claude/skills/<name>` 을
    // 판정 근거로 가리킨다. 스킬이 무시되면 로컬 디스크에만 있고 clone·CI 에는
    // 없어서, CI 리뷰가 근거 문서를 못 읽은 채 기본 판단으로 리뷰하고 통과
    // 신호를 남긴다 — 자동 머지가 그것을 게이트로 읽는다.
    //
    // 조상 줄이 있는 경우로 확인한다. 그것이 가장 약한 고리다(부정 패턴을
    // 죽이는 표기).
    const dir = makeGitRepo();
    writeFileSync(join(dir, '.gitignore'), mergeIgnore('.claude/\n', [], SHIPPED_BLOCK));

    mkdirSync(join(dir, '.claude', 'skills', 'devkit-stack'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'devkit-stack', 'SKILL.md'), '# stack\n');
    mkdirSync(join(dir, '.claude', 'skills', 'react-best-practices', 'rules'), { recursive: true });
    // 원본 스킬의 `_` 접두 파일. 점 이름이 아니므로 무시 규칙과 무관해야 한다.
    writeFileSync(join(dir, '.claude', 'skills', 'react-best-practices', 'rules', '_template.md'), '# t\n');
    writeFileSync(join(dir, '.claude', 'settings.local.json'), '{}\n');

    expect(isIgnored(dir, '.claude/skills/devkit-stack/SKILL.md')).toBe(false);
    expect(isIgnored(dir, '.claude/skills/react-best-practices/rules/_template.md')).toBe(false);
    // 개인 스크래치는 계속 무시된다 — 스킬을 되살리느라 .claude 전체를
    // 열어버리지 않았는지 함께 본다.
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
