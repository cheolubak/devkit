import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runUpdate } from '../src/update/index.js';
import { RETIRED_FILES, retiredTargets } from '../src/update/retired.js';

const TOOLKIT = resolve(import.meta.dirname, '../../..');
const TEMPLATES_DIR = fileURLToPath(new URL('../templates', import.meta.url));
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 은퇴 파일을 미리 심어 둔 최소 대상 프로젝트. */
function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-retired-'));
  created.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'demo' }, null, 2)}\n`);
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(dir, '.github', 'workflows', 'auto-merge.yml'), 'name: Auto Merge\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'wip'], {
    cwd: dir,
  });
  return dir;
}

const base = (targetDir: string) => ({
  targetDir,
  toolkitRoot: TOOLKIT,
  skipInstall: true,
  yes: true,
  log: () => {},
});

const ALL_CATEGORIES = new Set(RETIRED_FILES.map((file) => file.category));

describe('retiredTargets', () => {
  it('대상에 실제로 있는 것만 돌려준다', async () => {
    const dir = makeProject();
    const got = await retiredTargets(dir, ALL_CATEGORIES);

    expect(got.map((file) => file.relPath)).toContain('.github/workflows/auto-merge.yml');
  });

  it('없으면 비어 있다 — 없는 것이 정상 상태다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-retired-empty-'));
    created.push(dir);

    expect(await retiredTargets(dir, ALL_CATEGORIES)).toEqual([]);
  });

  it('카테고리가 맞지 않으면 대상이 아니다', async () => {
    // --only lint 로 돌린 사람이 CI 파일이 지워지는 것을 보면 안 된다.
    const dir = makeProject();

    expect(await retiredTargets(dir, new Set(['lint' as const]))).toEqual([]);
  });
});

describe('은퇴 목록 드리프트 가드', () => {
  it('은퇴한 파일이 템플릿에 다시 존재하지 않는다', async () => {
    // 이것이 어긋나면 update 가 방금 쓴 파일을 곧바로 지운다 — 실행 순서에
    // 따라 결과가 갈리는, 재현이 어려운 형태의 결함이다.
    const entries = await readdir(TEMPLATES_DIR, { recursive: true, withFileTypes: true });
    const templatePaths = new Set(
      entries
        .filter((entry) => entry.isFile())
        .map((entry) => `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/')),
    );

    for (const file of RETIRED_FILES) {
      const hits = [...templatePaths].filter((path) => path.endsWith(`/${file.relPath}`));
      expect(hits, `${file.relPath} 가 템플릿에 아직 있다: ${hits.join(', ')}`).toEqual([]);
    }
  });
});

describe('runUpdate 의 은퇴 파일 삭제', () => {
  it('--dry-run 은 목록에만 올리고 지우지 않는다', async () => {
    const dir = makeProject();
    const lines: string[] = [];
    await runUpdate({
      ...base(dir),
      log: (message) => lines.push(message),
      type: 'nest',
      only: 'ci',
      dryRun: true,
    });

    expect(lines.join('\n')).toContain('.github/workflows/auto-merge.yml');
    expect(existsSync(join(dir, '.github', 'workflows', 'auto-merge.yml'))).toBe(true);
  });

  it('실제 실행은 지운다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'ci' });

    expect(existsSync(join(dir, '.github', 'workflows', 'auto-merge.yml'))).toBe(false);
  });

  it('--only lint 로는 지우지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'lint' });

    expect(existsSync(join(dir, '.github', 'workflows', 'auto-merge.yml'))).toBe(true);
  });
});
