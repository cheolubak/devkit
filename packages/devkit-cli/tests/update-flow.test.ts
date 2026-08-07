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

/**
 * 출력을 [변경 목록, 경고]로 가른다. 경고가 없으면 뒤가 빈 문자열이다.
 *
 * describe 안에 두면 unicorn(consistent-function-scoping)이 걸린다 —
 * 부모 스코프에서 잡는 것이 없기 때문이다(74fe700 의 관행).
 */
function splitAtWarning(output: string): [string, string] {
  const at = output.indexOf('통째로 교체됩니다');
  return at === -1 ? [output, ''] : [output.slice(0, at), output.slice(at)];
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

  it('monorepo인데 apps/web/package.json이 없으면 경고를 남긴다', async () => {
    // 대상이 apps/web을 apps/site로 개명했다면 apps/web 트리 전체가
    // "신규"로 계획에 들어온다. 데이터 손실은 아니지만 변경 목록만으로는
    // 놓치기 쉬워, 사람이 알아채도록 경고를 한 줄 남긴다.
    const dir = makeProject();
    const lines: string[] = [];
    await runUpdate({ ...base(dir), type: 'monorepo', only: 'claude', log: (m) => lines.push(m) });

    expect(lines.join('\n')).toContain('apps/web/package.json이 없습니다');
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

  it('--force여도 저장소가 아니라는 경고는 남긴다 — 확인 프롬프트만 건너뛴다', async () => {
    // README는 --force를 "git 관련 거부만 우회"라고 적는다. 이전에는
    // gitGate가 force에서 통째로 조기 반환해 이 경고까지 사라졌었다.
    const dir = makeProject({}, false);
    const lines: string[] = [];
    await runUpdate({
      ...base(dir),
      type: 'nest',
      only: 'claude',
      force: true,
      log: (m) => lines.push(m),
    });

    expect(lines.join('\n')).toContain('git 저장소가 아닙니다');
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

  /**
   * 실측 회귀(2026-08-07 소비자): 기존 프로젝트에 devkit 을 처음 붙였을 때
   * eslint.config.mjs 가 통째로 교체돼 그 안의 ignores 가 증발했고, 저장소
   * 안의 라이브 worktree 를 린트하다 린트가 크래시로 끝났다. 변경 목록에는
   * 그냥 "덮어쓰기"로만 보여 사람이 놓쳤다.
   */
  describe('통째 교체 경고', () => {
    /** 기존 eslint.config.mjs 와 .gitignore 를 가진, 마커 없는 프로젝트. */
    function projectWithOwnConfigs(pkg: Record<string, unknown> = {}): string {
      const dir = makeProject(pkg, false);
      writeFileSync(
        join(dir, 'eslint.config.mjs'),
        "export default [{ ignores: ['.claude/**'] }];\n",
      );
      writeFileSync(join(dir, '.gitignore'), 'my-own-rule\n');
      execFileSync('git', ['init', '-q'], { cwd: dir });
      commitAll(dir);
      return dir;
    }

    /** 마커가 있으면 --type 을 주지 않는다 — 마커로 유형을 찾는 경로를 탄다. */
    async function messagesFrom(dir: string, hasMarker = false): Promise<string> {
      const lines: string[] = [];
      await runUpdate({
        ...base(dir),
        ...(hasMarker ? {} : { type: 'next' }),
        only: 'lint,repo',
        dryRun: true,
        log: (message) => lines.push(message),
      });
      return lines.join('\n');
    }

    it('마커가 없으면 통째로 교체되는 파일을 이름 붙여 알린다', async () => {
      const output = await messagesFrom(projectWithOwnConfigs());

      expect(output).toContain('통째로 교체됩니다');
      expect(output).toContain('eslint.config.mjs');
    });

    it('병합·패치되는 파일은 그 경고에 넣지 않는다', async () => {
      const output = await messagesFrom(projectWithOwnConfigs());
      const [changeList, warning] = splitAtWarning(output);

      // 먼저 이 둘이 실제로 덮어쓰기 대상이라는 것부터 확인한다. 계획에
      // 아예 없으면 아래 not.toContain 은 아무것도 증명하지 못한다.
      expect(changeList).toContain('.gitignore');
      expect(changeList).toContain('package.json');

      // .gitignore 는 mergeIgnore 가, package.json 은 JSON 패치가 기존 내용을
      // 살린다. 이것까지 "사라진다"고 말하면 경고가 늑대소년이 된다.
      expect(warning).not.toContain('.gitignore');
      expect(warning).not.toContain('package.json');
    });

    it('마커가 있으면 알리지 않는다 — devkit 자신의 이전 산출물 갱신이다', async () => {
      const dir = projectWithOwnConfigs({ devkit: { type: 'next', version: '0.1.0' } });
      const output = await messagesFrom(dir, true);

      // 같은 파일이 여전히 덮어쓰기 대상인데도 경고만 빠졌음을 본다 —
      // "경고가 없다"가 "할 일이 없었다"로 설명되지 않게 한다.
      expect(output).toContain('eslint.config.mjs');
      expect(output).not.toContain('통째로 교체됩니다');
    });
  });

  /**
   * 실측 회귀(2026-08-07 소비자): update 가 "type": "module" 을 심자
   * cache-handlers/logging-handler.js 의 require/module.exports 가 ESM 으로
   * 재해석돼 죽었다. 레시피 주석의 "안전하다"는 근거는 갓 생성된 프로젝트에만
   * 성립하는데 update 는 오래 쓴 프로젝트에도 같은 키를 심는다.
   */
  describe('type: module 경고', () => {
    async function messagesFrom(dir: string): Promise<string> {
      const lines: string[] = [];
      await runUpdate({
        ...base(dir),
        type: 'next',
        dryRun: true,
        log: (message) => lines.push(message),
      });
      return lines.join('\n');
    }

    it('CommonJS .js 가 있으면 무엇이 깨질지 이름 붙여 알린다', async () => {
      const dir = makeProject();
      writeFileSync(join(dir, 'logging-handler.js'), 'module.exports = () => {};\n');
      commitAll(dir);

      const output = await messagesFrom(dir);

      expect(output).toContain('"type": "module"');
      expect(output).toContain('logging-handler.js');
    });

    it('이미 type: module 이면 조용하다 — 바뀌는 것이 없다', async () => {
      const dir = makeProject({ type: 'module' });
      // 있더라도 재해석될 것이 없다. 파일 존재가 아니라 "해석이 뒤집히는가"가 기준이다.
      writeFileSync(join(dir, 'logging-handler.js'), 'module.exports = () => {};\n');
      commitAll(dir);

      expect(await messagesFrom(dir)).not.toContain('ESM 으로 재해석');
    });

    it('CommonJS .js 가 없으면 조용하다', async () => {
      const dir = makeProject();

      expect(await messagesFrom(dir)).not.toContain('ESM 으로 재해석');
    });
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

describe('toolkitRoot가 null일 때 (게시본 실행)', () => {
  it('자기보호 가드가 발동하지 않는다 — 소비자 워크스페이스 루트를 막으면 안 된다', async () => {
    // 게시본에는 툴킷 저장소가 없다. 예전처럼 findToolkitRoot 로 위를 뒤지면
    // 소비자가 모노레포일 때 소비자의 루트를 toolkitRoot 로 잡아버리고,
    // 사용자가 바로 그 루트에서 update 를 돌릴 때 거부당한다.
    const target = mkdtempSync(join(tmpdir(), 'devbak-consumer-'));
    created.push(target);
    writeFileSync(join(target, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeFileSync(
      join(target, 'package.json'),
      `${JSON.stringify({ name: 'consumer', devkit: { type: 'nest', version: '0.1.0' } }, null, 2)}\n`,
    );

    await expect(
      runUpdate({
        targetDir: target,
        toolkitRoot: null,
        dryRun: true,
        yes: true,
        skipInstall: true,
        log: () => {},
      }),
    ).resolves.toBeUndefined();
  });

  it('toolkitRoot가 있으면 그 디렉토리를 대상으로 삼는 것은 여전히 막는다', async () => {
    const toolkit = mkdtempSync(join(tmpdir(), 'devbak-toolkit-'));
    created.push(toolkit);
    writeFileSync(join(toolkit, 'package.json'), '{"name":"eslint-workspace"}\n');

    await expect(
      runUpdate({
        targetDir: toolkit,
        toolkitRoot: toolkit,
        dryRun: true,
        yes: true,
        skipInstall: true,
        log: () => {},
      }),
    ).rejects.toThrow(/툴킷 저장소 자신은 update 대상이 될 수 없습니다/);
  });
});
