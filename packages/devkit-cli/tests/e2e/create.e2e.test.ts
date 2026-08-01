import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const TOOLKIT = resolve(import.meta.dirname, '../../../..');
const PARENT = resolve(TOOLKIT, '..');
const created: string[] = [];

// pid를 접미어로 쓴다 — 실행마다 다르면서(재실행 시 새 디렉토리 이름을 얻어
// "이미 존재합니다" 연쇄 실패를 피한다) 로그와 대조 가능하다(Math.random()은
// 재현·추적이 안 돼 디버깅에 도움이 안 된다). 같은 실행(같은 프로세스) 안의
// 여러 create() 호출은 같은 접미어를 공유하지만 base name이 서로 달라
// 충돌하지 않는다 — 단, '안전장치' 테스트처럼 의도적으로 같은 이름을 두 번
// 쓰는 경우는 여전히 같은 디렉토리를 가리켜 원래 의도(중복 감지)를 그대로
// 검증한다.
const RUN_ID = process.pid;

function create(name: string, type: string): string {
  const dir = join(PARENT, `${name}-${RUN_ID}`);
  created.push(dir);
  execFileSync('node', ['packages/devkit-cli/dist/bin.js', 'create', basename(dir), '--type', type], {
    cwd: TOOLKIT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return dir;
}

/** 생성물에서 스크립트를 돌리고 종료 코드를 반환한다. */
function runIn(dir: string, script: string): number {
  try {
    execFileSync('pnpm', [script], { cwd: dir, stdio: 'pipe' });
    return 0;
  } catch (error) {
    return (error as { status: number }).status;
  }
}

const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'out', '.git']);

/**
 * dir 아래 모든 파일의 상대경로(POSIX `/`)를 모은다. node_modules·빌드
 * 산출물(.next·dist·.turbo·out)은 우리가 만든 소스가 아니라 훑을 이유가
 * 없고, 특히 .next/**에는 번들된 .js 청크가 수백 개 있어 그대로 훑으면
 * 아래 검사들이 무의미해지고 느려진다.
 */
function walkFiles(dir: string): string[] {
  const found: string[] = [];

  function walk(current: string, relBase: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = join(current, entry.name);
      const rel = relBase === '' ? entry.name : `${relBase}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        found.push(rel);
      }
    }
  }

  walk(dir, '');
  return found;
}

/**
 * 이월 (6): next 레시피는 package.json에 "type": "module"을 추가하면서
 * "create-next-app 산출물에 .js 파일이 없으므로(전부 .ts/.tsx/.mjs) 안전하다"고
 * 가정한다(src/recipes/next.ts 주석). 이 가정이 미래 create-next-app 버전에서
 * 깨지면(예: 어떤 설정 파일이 .js로 나오기 시작하면) "type": "module" 아래
 * 그 파일이 의도치 않게 ESM으로 취급돼 조용히 망가질 수 있다 — 이 함수가
 * 그 재발을 기계적으로 잡는다.
 */
function collectStrayJs(dir: string): string[] {
  return walkFiles(dir).filter((rel) => /\.(js|cjs)$/.test(rel));
}

/**
 * 정리 정책: 통과했을 때만 지운다(설계 6.3절 — 공식 CLI가 non-zero로 죽으면
 * "생성물은 지우지 않는다. 지우면 디버깅이 불가능해진다"). 테스트가 실패하면
 * 유일한 조사 대상인 생성물을 남긴다.
 *
 * `context.task.result?.state`로 방금 끝난 테스트가 'fail'인지 확인한다 —
 * afterEach 시점에는 테스트 본문이 이미 실행을 마쳤으므로 result가 확정돼
 * 있다(vitest의 TaskContext 문서). 실행마다 다른 접미어(RUN_ID = pid) 덕에
 * 보존된 디렉토리가 있어도 다음 실행은 새 이름으로 시작해 막히지 않는다.
 */
afterEach((context) => {
  const failed = context.task.result?.state === 'fail';
  for (const dir of created.splice(0)) {
    if (failed) {
      process.stderr.write(`[e2e] 실패로 보존됨: ${dir} (조사 후 수동 삭제 필요)\n`);
      continue;
    }
    if (process.env.DEVKIT_E2E_KEEP === '1') {
      process.stderr.write(`[e2e] DEVKIT_E2E_KEEP=1 — 정리하지 않고 남깁니다: ${dir}\n`);
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('devkit create --type nest', () => {
  it('생성물에서 lint·build·test가 통과하고 템플릿이 실제로 배선된다', () => {
    const dir = create('devkit-e2e-nest', 'nest');
    expect(runIn(dir, 'lint')).toBe(0);
    expect(runIn(dir, 'build')).toBe(0);
    // nest new는 샘플 spec을 만들므로 test도 통과해야 한다
    expect(runIn(dir, 'test')).toBe(0);

    // 이월 (1): copyOverlay('nest', ...).run()의 배선 검증. 단위 테스트는
    // assertNoDrift를 직접 호출할 뿐 copyOverlay가 실제로 파일을 쓰는 경로는
    // 덮지 않는다(templatesRoot()가 dist 전제라 vitest에서 ENOENT) — 여기서
    // 처음 실행으로 검증한다.
    expect(existsSync(join(dir, '_gitignore'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain(`# ${basename(dir)}`);
    expect(claude).not.toContain('__NAME__');
    const eslintConfig = readFileSync(join(dir, 'eslint.config.mjs'), 'utf8');
    expect(eslintConfig).toContain('@devbak/eslint-config-nest');
  });

  it('eslint-plugin-prettier가 남아 있지 않다', () => {
    const dir = create('devkit-e2e-nest-deps', 'nest');
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
      jest?: unknown;
    };
    expect(pkg.devDependencies).not.toHaveProperty('eslint-plugin-prettier');
    expect(pkg.devDependencies).not.toHaveProperty('eslint-config-prettier');
    expect(pkg.devDependencies.eslint).toMatch(/^\^10\./);
    expect(pkg.jest).toBeUndefined();
    expect(existsSync(join(dir, '.prettierrc'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
  });
});

describe('devkit create --type next', () => {
  it('생성물에서 lint·build·test가 통과하고 FSD 레이어와 오버레이가 배선된다', () => {
    const dir = create('devkit-e2e-next', 'next');
    expect(runIn(dir, 'lint')).toBe(0);
    expect(runIn(dir, 'build')).toBe(0);
    // 이월 (2): create-next-app은 테스트를 만들지 않으므로 @devbak/vitest-config의
    // next 프리셋이 passWithNoTests: true를 켠다 — 그 배선이 실제로 통하는지
    // 여기서 확인한다. Task 11에서 "type" 필드 누락 때문에 이 스크립트가 실제로
    // 죽었던 결함이 있었다(ESM 전용 @devbak/vitest-config를 CJS로 require()).
    expect(runIn(dir, 'test')).toBe(0);

    for (const layer of ['views', 'widgets', 'features', 'entities', 'shared']) {
      expect(existsSync(join(dir, 'src', layer))).toBe(true);
    }
    expect(existsSync(join(dir, 'src', 'pages'))).toBe(false);

    // 이월 (1): 오버레이 배선 검증.
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain(`# ${basename(dir)}`);
    expect(claude).not.toContain('__NAME__');
    const eslintConfig = readFileSync(join(dir, 'eslint.config.mjs'), 'utf8');
    expect(eslintConfig).toContain('@devbak/eslint-plugin-fsd/next');
    expect(existsSync(join(dir, 'vitest.config.ts'))).toBe(true);

    // 이월 (6): "type": "module"이 안전하다는 근거(.js/.cjs 파일 0개)의 기계적 확인.
    expect(collectStrayJs(dir)).toEqual([]);
  });
});

describe('devkit create --type monorepo', () => {
  it('중첩 워크스페이스 없이 생성되고 lint·build·test가 통과하며 FSD가 실제로 발화한다', () => {
    const dir = create('devkit-e2e-mono', 'monorepo');
    expect(existsSync(join(dir, 'apps', 'web', 'pnpm-workspace.yaml'))).toBe(false);
    expect(existsSync(join(dir, 'apps', 'web', 'node_modules', '.pnpm'))).toBe(false);

    const webPkg = readFileSync(join(dir, 'apps', 'web', 'package.json'), 'utf8');
    expect(webPkg).toContain('link:../../../eslint/packages/');

    expect(runIn(dir, 'lint')).toBe(0);
    expect(runIn(dir, 'build')).toBe(0);
    // 이월 (2): 세 유형 전부에서 pnpm test를 돌린다. 루트 "test": "turbo run test"가
    // apps/web의 vitest(passWithNoTests)까지 위임한다.
    expect(runIn(dir, 'test')).toBe(0);

    // 이월 (1): 루트 오버레이 배선 검증(templates/monorepo).
    expect(existsSync(join(dir, '_gitignore'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain(`# ${basename(dir)}`);
    expect(claude).not.toContain('__NAME__');
    const rootPkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string };
    expect(rootPkg.name).toBe(basename(dir));

    // 이월 (4): next 레시피 산출물과 모노레포 정책이 실제로 충돌하는 지점이
    // pnpm-workspace.yaml·eslint.config.mjs 둘 외에 더 있는지 기계적으로 훑는다.
    // apps/web 아래 어디에도 중첩 eslint.config.*가 남아 있으면 안 된다
    // (Task 11이 required removeFiles로 잡은 것과 같은 부류의 회귀).
    const nestedEslintConfigs = walkFiles(join(dir, 'apps', 'web')).filter((rel) =>
      (rel.split('/').pop() ?? '').startsWith('eslint.config.'),
    );
    expect(nestedEslintConfigs).toEqual([]);
    // apps/web은 이제 pnpm-workspace.yaml도 없고 자체 eslint.config.mjs도
    // 없으므로 lint·format 스크립트가 없어야 한다 — 루트가 전담한다.
    const webPkgJson = JSON.parse(webPkg) as { scripts: Record<string, string | undefined> };
    expect(webPkgJson.scripts.lint).toBeUndefined();
    // 위 lint·build·test가 전부 exit 0이라는 사실 자체가 이 두 지점 외에 이
    // 조합을 깨는 다른 충돌이 없다는 실측 증거다 — 있었다면 여기서 이미
    // 실패했을 것이다.

    // 이월 (6): 합성된 apps/web도 동일한 "type": "module" 안전성 가정 아래 있다.
    expect(collectStrayJs(join(dir, 'apps', 'web'))).toEqual([]);

    // 이월 (3): 모노레포 루트 eslint.config.mjs가 apps/web까지 실제로 커버해
    // FSD 규칙이 발화하는지 양방향으로 확인한다(Task 10이 단일 next 앱에서
    // 한 것과 같은 검증). apps/web/eslint.config.mjs가 없으므로 이 발화는
    // 전적으로 루트 config에 의존한다 — 리뷰어의 "루트가 커버한다"는 판단이
    // 여기서 처음 실행으로 확인된다.
    const authDir = join(dir, 'apps', 'web', 'src', 'features', 'auth');
    const sharedUiDir = join(dir, 'apps', 'web', 'src', 'shared', 'ui');
    mkdirSync(authDir, { recursive: true });
    writeFileSync(join(authDir, 'index.ts'), 'export const auth = 1;\n');
    mkdirSync(sharedUiDir, { recursive: true });
    writeFileSync(join(sharedUiDir, 'index.ts'), "import { auth } from '../../features/auth';\nexport { auth };\n");
    try {
      let lintOutput = '';
      let violationExit = 0;
      try {
        execFileSync('pnpm', ['lint'], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
      } catch (error) {
        violationExit = (error as { status: number }).status;
        lintOutput =
          String((error as { stdout?: string }).stdout ?? '') + String((error as { stderr?: string }).stderr ?? '');
      }
      expect(violationExit).not.toBe(0);
      expect(lintOutput).toContain('fsd/no-higher-level-imports');
    } finally {
      rmSync(authDir, { recursive: true, force: true });
      rmSync(sharedUiDir, { recursive: true, force: true });
    }
    // 위반 제거 후 원래 생성물만으로 다시 통과해야 한다 — FSD 규칙의 오탐이 없다.
    expect(runIn(dir, 'lint')).toBe(0);
  });
});

describe('안전장치', () => {
  it('이미 존재하는 디렉토리를 덮어쓰지 않는다', () => {
    const dir = create('devkit-e2e-dup', 'nest');
    expect(existsSync(dir)).toBe(true);
    expect(() => create('devkit-e2e-dup', 'nest')).toThrow(/이미 존재합니다/);
  });
});
