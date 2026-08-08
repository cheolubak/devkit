import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// 검증 '대상'은 풀린 dist/bin.js 다 — 저장소 없이 도는지가 이 파일의 주제다.
// 검증 '주체'인 테스트가 소스의 상수를 읽는 것은 그 격리와 무관하며,
// registry-version.test.ts 도 같은 방식으로 이 상수를 참조한다.
import { DEVKIT_VERSION_RANGE } from '../../src/ops/registry-deps.js';

// 다른 e2e 파일과 같은 가드다. 생성물의 pnpm install 이 GitHub Packages 를
// 타므로 토큰이 없으면 401 로 죽는다 — 조용히 건너뛰지 않고 알아볼 수 있는
// 메시지로 먼저 실패시킨다.
if (process.env.GITHUB_TOKEN === undefined || process.env.GITHUB_TOKEN === '') {
  throw new Error(
    'GITHUB_TOKEN 이 없어 e2e 를 돌릴 수 없습니다. ' +
      '`GITHUB_TOKEN=$(gh auth token) pnpm test:e2e` 로 실행하세요. ' +
      '토큰에 read:packages 권한이 있어야 합니다.',
  );
}

const PKG = resolve(import.meta.dirname, '..', '..');
const created: string[] = [];

afterAll(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** tarball 을 만들어 풀고, 풀린 패키지 루트를 낸다. */
function packAndExtract(): string {
  const out = mkdtempSync(join(tmpdir(), 'devbak-pack-'));
  created.push(out);
  execFileSync('pnpm', ['pack', '--pack-destination', out], {
    cwd: PKG,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'));
  if (tgz === undefined) {
    throw new Error(`pnpm pack 이 tarball 을 남기지 않았습니다: ${out}`);
  }
  execFileSync('tar', ['-xzf', join(out, tgz), '-C', out], { stdio: 'pipe' });
  return join(out, 'package');
}

describe('게시본(tarball) 으로 실행하기', () => {
  it('tarball 에는 dist 와 templates 만 있고 src 는 없다', () => {
    const root = packAndExtract();
    expect(existsSync(join(root, 'dist', 'bin.js'))).toBe(true);
    expect(existsSync(join(root, 'templates', 'nest'))).toBe(true);
    // nest 만 보면 files·무시 규칙이 next·monorepo 만 빼먹어도 이 관문을
    // 통과한다 — 세 유형 전부를 확인해야 "템플릿이 tarball에서 빠졌다"는
    // 회귀를 실제로 잡는다.
    expect(existsSync(join(root, 'templates', 'next'))).toBe(true);
    expect(existsSync(join(root, 'templates', 'monorepo'))).toBe(true);
    // _npmrc 는 npm 이 dot-file 을 거르므로 밑줄 이름으로 실린다.
    expect(existsSync(join(root, 'templates', '_shared', '_npmrc'))).toBe(true);
    // 워크플로는 점으로 시작하는 **디렉토리** 아래에 있다. npm 의 dot-file
    // 필터링 규칙이 바뀌거나 files 목록이 좁아지면 조용히 빠질 수 있는데,
    // 빠져도 create 는 성공하므로 생성물에서 CI 가 사라진 채 발견되지 않는다.
    expect(
      existsSync(join(root, 'templates', '_shared', '.github', 'workflows', 'claude-review.yml')),
    ).toBe(true);
    // 스크립트도 같은 dot-디렉토리 아래다. 빠지면 생성물의 머지 경로가 통째로
    // 사라지는데 create 는 그대로 성공한다.
    expect(
      existsSync(join(root, 'templates', '_shared', '.github', 'scripts', 'wait-and-merge.sh')),
    ).toBe(true);
    // src 가 실리면 assertDistFresh 가 게시본에서도 돌아 레이아웃 판별이 깨진다.
    expect(existsSync(join(root, 'src'))).toBe(false);
  });

  it('풀린 bin.js 로 nest 프로젝트를 만든다 — 툴킷 저장소 없이 동작한다', () => {
    const root = packAndExtract();
    const work = mkdtempSync(join(tmpdir(), 'devbak-packed-work-'));
    created.push(work);

    // cwd 를 임시 디렉토리로 둔다. 툴킷 워크스페이스 밖이므로
    // pnpm-workspace.yaml 범위 문제가 없고 사용자 디렉토리도 오염되지 않는다.
    execFileSync('node', [join(root, 'dist', 'bin.js'), 'create', 'packed-api', '--type', 'nest', '--no-verify'], {
      cwd: work,
      stdio: 'pipe',
      encoding: 'utf8',
    });

    const project = join(work, 'packed-api');
    const pkg = readFileSync(join(project, 'package.json'), 'utf8');
    // 리터럴로 박으면 릴리스가 DEVKIT_VERSION_RANGE 를 올릴 때마다 이 단언만
    // 뒤처져 다음 릴리스의 검증 스텝을 막는다(update-plan.test.ts 와 같은 함정).
    // 보려는 것은 "레지스트리 범위가 생성물에 실제로 심겼는가"이지 그 값이 아니다.
    expect(pkg).toContain(`"@cheolubak/tsconfig": "${DEVKIT_VERSION_RANGE}"`);
    expect(pkg).not.toContain('link:');
    expect(existsSync(join(project, '.npmrc'))).toBe(true);
    expect(existsSync(join(project, 'eslint.config.mjs'))).toBe(true);
    // 설치가 실제로 됐는지 — 레지스트리 경로가 통했다는 증거다.
    expect(existsSync(join(project, 'node_modules', '@cheolubak', 'tsconfig'))).toBe(true);
  });

  // 사용자가 실제로 치는 것은 `node .../dist/bin.js` 가 아니라 `devbak` 이다.
  // 그 이름은 npm 이 설치 때 만드는 심볼릭 링크이고, 링크를 지나면 Node 는
  // process.argv[1] 에 **링크 이름**(devbak) 을, import.meta.url 에는
  // **해석된 실제 경로**(dist/bin.js) 를 준다. 두 값이 갈리는 이 지점을
  // 지나는 실행 경로가 지금껏 어디에도 없었다 — 다른 테스트는 전부
  // main() 을 직접 부르거나 dist/bin.js 를 실경로로 실행한다.
  it('설치된 이름(devbak 심볼릭 링크) 으로 불러도 진입점이 실행된다', () => {
    const root = packAndExtract();
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      version: string;
    };

    // npm 이 만드는 것과 같은 구조·같은 상대 링크다.
    const binDir = join(root, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const link = join(binDir, 'devbak');
    symlinkSync(relative(binDir, join(root, 'dist', 'bin.js')), link);

    const out = execFileSync(link, ['--version'], { stdio: 'pipe', encoding: 'utf8' });

    // 종료 코드 0 은 증거가 못 된다 — 진입점을 아예 안 타도 0 으로 끝난다.
    // 값이 실제로 나왔는지를 봐야 "돌았다" 를 증명한다.
    expect(out.trim()).toBe(version);
  });
});
