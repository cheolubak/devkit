import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runUpdate } from '../src/update/index.js';

const TOOLKIT = resolve(import.meta.dirname, '../../..');
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * 최소한의 대상 프로젝트. os.tmpdir() 를 쓰는 것이 여기서는 안전하다 —
 * 이 테스트는 대상 안에서 pnpm 이나 Node 모듈 해석을 돌리지 않는다
 * (skipInstall: true). 반대로 설정 패키지 픽스처는 워크스페이스 트리
 * 안에 둬야 한다.
 */
function makeProject(pkg: Record<string, unknown> = {}, init = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-update-'));
  created.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'demo', ...pkg }, null, 2)}\n`);
  if (init) {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    commitAll(dir);
  }
  return dir;
}

function commitAll(dir: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'wip'], {
    cwd: dir,
  });
}

const base = (targetDir: string) => ({
  targetDir,
  toolkitRoot: TOOLKIT,
  skipInstall: true,
  yes: true,
  log: () => {},
});

describe('runUpdate', () => {
  it('--type으로 외부 프로젝트에 리뷰 자산을 놓는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude' });

    expect(existsSync(join(dir, '.claude', 'commands', 'review.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'agents', 'devkit-reviewer.md'))).toBe(true);
  });

  it('--dry-run은 아무것도 쓰지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude', dryRun: true });

    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  /**
   * 실측 회귀: git 게이트가 --dry-run 보다 앞이라, 저장소가 아닌 대상에
   * `--dry-run` 을 돌리면 "그래도 계속할까요?"에서 응답을 기다리며 멈춰 섰다.
   * bin 의 비대화형 가드는 --dry-run 을 통과시키므로 CI 가 그대로 정지한다.
   */
  it('--dry-run은 확인을 묻지 않는다 — 저장소가 아니어도, dirty 여도', async () => {
    const never = () => {
      throw new Error('--dry-run 에서 확인을 물었다');
    };

    const noRepo = makeProject({}, false);
    await runUpdate({ ...base(noRepo), yes: false, ask: never, type: 'nest', dryRun: true });

    const dirty = makeProject();
    writeFileSync(join(dirty, 'dirty.txt'), 'x');
    await runUpdate({ ...base(dirty), yes: false, ask: never, type: 'nest', dryRun: true });

    expect(existsSync(join(noRepo, '.claude'))).toBe(false);
    expect(existsSync(join(dirty, '.claude'))).toBe(false);
  });

  it('멱등적이다 — 두 번째는 전부 동일로 잡힌다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude' });
    // 첫 실행이 파일을 놓으면 워킹트리가 dirty 가 된다. 실제 워크플로대로
    // 커밋해 둔다 — 커밋 없이 다시 돌리면 git 게이트가 막는 것이 옳은
    // 동작이고(설계 4.1절), --force 로 우회하면 그 게이트를 검증에서 빼게 된다.
    commitAll(dir);

    const lines: string[] = [];
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude', log: (m) => lines.push(m) });

    const output = lines.join('\n');
    expect(output).toContain('동일 — 건너뜀');
    expect(output).not.toContain('덮어쓰기 (');
  });

  it('dirty한 워킹트리는 거부한다', async () => {
    const dir = makeProject();
    writeFileSync(join(dir, 'dirty.txt'), 'x');

    await expect(runUpdate({ ...base(dir), type: 'nest', only: 'claude' })).rejects.toThrow(
      /커밋되지 않은 변경/,
    );
  });

  it('--force는 dirty를 우회한다', async () => {
    const dir = makeProject();
    writeFileSync(join(dir, 'dirty.txt'), 'x');

    await runUpdate({ ...base(dir), type: 'nest', only: 'claude', force: true });
    expect(existsSync(join(dir, '.claude'))).toBe(true);
  });

  it('확인에서 아니오면 아무것도 쓰지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({
      ...base(dir),
      yes: false,
      ask: () => Promise.resolve(false),
      type: 'nest',
      only: 'claude',
    });

    expect(existsSync(join(dir, '.claude'))).toBe(false);
  });

  it('전체 update는 마커를 심는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest' });

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      devkit?: { type: string };
    };
    expect(pkg.devkit?.type).toBe('nest');
  });

  it('--only는 마커를 심지 않는다 — 부분 적용을 최신으로 표시하지 않는다', async () => {
    const dir = makeProject();
    await runUpdate({ ...base(dir), type: 'nest', only: 'claude' });

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { devkit?: unknown };
    expect(pkg.devkit).toBeUndefined();
  });

  it('마커가 있으면 --type 없이 돈다', async () => {
    const dir = makeProject({ devkit: { type: 'nest', version: '0.1.0' } });
    await runUpdate({ ...base(dir), only: 'claude' });

    expect(existsSync(join(dir, '.claude'))).toBe(true);
  });

  it('package.json이 없으면 던진다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-empty-'));
    created.push(dir);

    await expect(runUpdate({ ...base(dir), type: 'nest' })).rejects.toThrow(/package\.json/);
  });

  it('툴킷 저장소 자신은 거부한다', async () => {
    await expect(runUpdate({ ...base(TOOLKIT), type: 'nest' })).rejects.toThrow(/툴킷 저장소/);
  });
});
