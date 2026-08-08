import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertOutsideWorkspace } from './workspace-root.js';
// 생성물이 선언하는 범위는 이 상수에서 나온다. 리터럴로 박으면 릴리스가
// 상수를 올릴 때마다 단언만 뒤처져 다음 릴리스의 검증 스텝을 막는다.
import { DEVKIT_VERSION_RANGE } from '../../src/ops/registry-deps.js';

// e2e 는 생성물에서 pnpm install 을 돌리고, 그 설치가 GitHub Packages 를
// 탄다. GitHub Packages 는 **공개 패키지도** 토큰을 요구하므로(설계 0.2절)
// 토큰이 없으면 pnpm install 깊숙한 곳에서 401 로 죽는다. 원인을 읽을 수
// 있게 여기서 먼저 멈춘다 — 조용히 건너뛰면 e2e 가 있다는 사실이 거짓
// 안심을 준다.
if (process.env.GITHUB_TOKEN === undefined || process.env.GITHUB_TOKEN === '') {
  throw new Error(
    'e2e 에는 GITHUB_TOKEN 이 필요합니다 (@cheolubak/* 를 GitHub Packages 에서 설치합니다).\n' +
      '  export GITHUB_TOKEN=$(gh auth token)\n' +
      '토큰에 read:packages 권한이 있어야 합니다.',
  );
}

const TOOLKIT = resolve(import.meta.dirname, '../../../..');
// 생성물은 워크스페이스와 무관한 임시 디렉토리에 만든다. 이유와 예전에
// 무엇이 깨졌는지는 workspace-root.ts 의 assertOutsideWorkspace 주석 참고.
const WORKDIR = tmpdir();
assertOutsideWorkspace(WORKDIR);
// bin.js는 절대경로로 부른다 — cwd가 TOOLKIT이 아니게 되므로(아래 참고)
// 상대경로 'packages/devkit-cli/dist/bin.js'는 더 이상 안전하지 않다.
const BIN = join(TOOLKIT, 'packages/devkit-cli/dist/bin.js');
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
  const dir = join(WORKDIR, `${name}-${RUN_ID}`);
  created.push(dir);
  // create는 위치 제약이 없다 — 실행한 cwd 기준으로 <name>을 만든다(Task 6).
  // 그래서 여기서도 cwd를 명시적으로 WORKDIR로 세운다. 툴킷 저장소 안이나
  // 그 부모를 cwd로 쓰지 말 것 — 워크스페이스 안이면 @cheolubak/* 설치가
  // 조용히 건너뛰어진다(workspace-root.ts 주석).
  execFileSync('node', [BIN, 'create', basename(dir), '--type', type], {
    cwd: WORKDIR,
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

    // 이월 (1): copyOverlay('nest', ...).run()의 배선 검증. plan()이 읽는
    // 내용은 단위 테스트(plan-ops.test.ts)가 덮지만, run()이 그 내용을
    // 실제로 targetDir에 쓰는 경로는 여기 e2e가 처음 검증한다.
    expect(existsSync(join(dir, '_gitignore'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    // 아래는 병합이 "실행됐는지"만 본다 — "보존"은 이 케이스로 검증되지
    // 않는다. `@nestjs/cli new --skip-git`(이 레시피가 쓰는 옵션)는
    // .gitignore 자체를 만들지 않는다(실측 확인: 격리 환경에서 직접 실행해
    // CREATE 로그에 .gitignore 가 없음을 확인했다) — 즉 이 케이스에선
    // "지킬 기존 줄"이 애초에 없다. 스캐폴딩 CLI 가 쓴 줄을 병합이 실제로
    // 지키는지는 create-next-app 이 확실히 .gitignore 를 만드는 아래 next
    // 케이스가 담당한다.
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# >>> devkit >>>');
    expect(gitignore).toContain('.claude/*');
    expect(gitignore).toContain('!.claude/agents/');
    expect(gitignore).toContain('node_modules');
    const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain(`# ${basename(dir)}`);
    expect(claude).not.toContain('__NAME__');
    const eslintConfig = readFileSync(join(dir, 'eslint.config.mjs'), 'utf8');
    expect(eslintConfig).toContain('@cheolubak/eslint-config-nest');

    // 스킬은 디스크 검사만으로는 부족하다 — create 가 실제로 복사했는지,
    // 그리고 유형에 맞는 것만 갔는지를 함께 본다.
    expect(readFileSync(join(dir, '.claude/skills/devkit-stack/SKILL.md'), 'utf8')).toContain(
      'name: devkit-stack',
    );
    expect(readFileSync(join(dir, '.claude/skills/nestjs-validation/SKILL.md'), 'utf8')).toContain(
      'name: nestjs-validation',
    );
    // next 전용 스킬은 오면 안 된다 — 없는 구조를 가정한 코드를 유도한다.
    expect(existsSync(join(dir, '.claude/skills/fsd-architecture'))).toBe(false);
    // 커맨드는 판정 기준을 복제하지 않고 스킬을 가리키는 얇은 래퍼다.
    expect(readFileSync(join(dir, '.claude/commands/module.md'), 'utf8')).toContain('.claude/skills/');
    expect(existsSync(join(dir, '.claude/commands/verify.md'))).toBe(true);
    // 이슈 스킬 두 개는 COMMON 이라 유형과 무관하게 놓인다.
    expect(existsSync(join(dir, '.claude/skills/scope-escape-issue/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/skills/issue-to-pr/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/commands/issue.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/commands/issue-work.md'))).toBe(true);

    // 계약 구획이 복사 과정에서 잘리지 않았는가. 스킬 본문이 통째로
    // 옮겨졌다는 것을 파일 존재만으로는 알 수 없다.
    expect(readFileSync(join(dir, '.claude/skills/issue-to-pr/SKILL.md'), 'utf8')).toContain(
      '<!-- ISSUE-BODY-CONTRACT:START -->',
    );
    // 생성물은 git 저장소가 아니므로(`--skip-git`) 여기서는 줄이 실렸는지만
    // 본다. git 이 실제로 그 판정을 내리는지는 merge-ignore-git.test.ts 가
    // 진짜 저장소에서 check-ignore 로 확인한다.
    expect(gitignore).toContain('!.claude/skills/');
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
    // 이월 (2): create-next-app은 테스트를 만들지 않으므로 @cheolubak/vitest-config의
    // next 프리셋이 passWithNoTests: true를 켠다 — 그 배선이 실제로 통하는지
    // 여기서 확인한다. Task 11에서 "type" 필드 누락 때문에 이 스크립트가 실제로
    // 죽었던 결함이 있었다(ESM 전용 @cheolubak/vitest-config를 CJS로 require()).
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
    expect(eslintConfig).toContain('@cheolubak/eslint-plugin-fsd/next');
    expect(existsSync(join(dir, 'vitest.config.ts'))).toBe(true);

    // next 는 이번 작업에서 처음 .gitignore 오버레이를 받는다 — 병합이라
    // create-next-app 의 줄이 보존되는지가 핵심이다(통째 덮어쓰기였다면
    // 전부 날아갔을 것이다).
    const gitignore = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# >>> devkit >>>');
    expect(gitignore).toContain('.claude/*');
    // create-next-app 이 쓴 줄이 남아 있어야 한다 — 병합이지 교체가 아니다.
    // 이 저장소의 create 경로에서 "보존"을 검증하는 유일한 케이스라(nest는
    // 위 케이스의 주석 참고) 하나만 보지 않는다 — devkit 템플릿에 전혀
    // 없는 문자열만 골랐다(`.next`는 뺐다 — 템플릿에도 `.next/`가 있어
    // `toContain('.next')`가 부분 문자열로 걸려 이 줄이 전부 사라져도
    // 통과했을 것이다 — 최종 리뷰 Minor 1).
    expect(gitignore).toContain('.vercel');
    expect(gitignore).toContain('*.tsbuildinfo');
    expect(gitignore).toContain('next-env.d.ts');

    // 이월 (6): "type": "module"이 안전하다는 근거(.js/.cjs 파일 0개)의 기계적 확인.
    expect(collectStrayJs(dir)).toEqual([]);
  });
});

describe('devkit create --type monorepo', () => {
  it('중첩 워크스페이스 없이 생성되고 lint·build·test가 통과하며 FSD가 실제로 발화한다', () => {
    const dir = create('devkit-e2e-mono', 'monorepo');
    expect(existsSync(join(dir, 'apps', 'web', 'pnpm-workspace.yaml'))).toBe(false);
    expect(existsSync(join(dir, 'apps', 'web', 'node_modules', '.pnpm'))).toBe(false);

    // apps/web은 루트보다 두 단계 깊다. link: 시절에는 이 깊이 차이 때문에
    // 깊이별 상대경로를 계산해야 했고(linkSpec), 이 단언도 그 경로 모양을
    // 확인했다. 레지스트리 설치로 바꾼 뒤로는 깊이가 무의미하다 — 루트든
    // apps/web이든 같은 버전 범위를 선언한다. 그것이 여기서 확인할 것이다.
    const webPkg = readFileSync(join(dir, 'apps', 'web', 'package.json'), 'utf8');
    expect(webPkg).toContain(`"@cheolubak/eslint-plugin-fsd": "${DEVKIT_VERSION_RANGE}"`);
    expect(webPkg).not.toContain('link:');

    expect(runIn(dir, 'lint')).toBe(0);
    expect(runIn(dir, 'build')).toBe(0);
    // 이월 (2): 세 유형 전부에서 pnpm test를 돌린다. 루트 "test": "turbo run test"가
    // apps/web의 vitest(passWithNoTests)까지 위임한다.
    expect(runIn(dir, 'test')).toBe(0);

    // 이월 (1): 루트 오버레이 배선 검증(templates/monorepo).
    expect(existsSync(join(dir, '_gitignore'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    // nest·next 케이스와 대칭 — monorepo도 루트에서 copyOverlay('_shared')를
    // 부르므로 같은 코드 경로다(최종 리뷰 Minor 3, 완료 기준 1의 "세 유형
    // 전부"에 monorepo도 포함된다).
    const monoGitignore = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(monoGitignore).toContain('# >>> devkit >>>');
    expect(monoGitignore).toContain('.claude/*');
    expect(monoGitignore).toContain('!.claude/agents/');
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
