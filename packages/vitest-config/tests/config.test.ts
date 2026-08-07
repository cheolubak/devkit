import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import nextConfigDefault from '../next.js';
import nodeConfigDefault from '../node.js';

// 이 파일이 속한 프로젝트는 ../tsconfig.json이 아니라 tests/tsconfig.json이다 —
// 형제 프로젝트라 allowJs·checkJs가 상속되지 않는다(실측: 없이 돌리면 TS7016).
// tests/tsconfig.json에도 allowJs: true를 켜 next.js/node.js를 읽게 하되
// checkJs는 그대로 꺼 둔다 — JS 파일 내부는 검사하지 않지만 구조는 추론되므로
// import 결과가 `any`가 아니라 실제 형태로 잡힌다. @cheolubak/jest-config가 require
// 결과를 캐스팅하는 것과 같은 이유로, 여기서도 실제로 검증할 필드만 명시한
// 타입으로 캐스팅한다.
const nextConfig = nextConfigDefault as { test: { environment: string; passWithNoTests: boolean } };
const nodeConfig = nodeConfigDefault as { test: { environment: string } };

const PKG_DIR = resolve(import.meta.dirname, '..');
const created: string[] = [];

// os.tmpdir()에 픽스처를 두면 안 된다: Task 2(@cheolubak/jest-config)에서 그렇게
// 했다가 워크스페이스 트리 밖이라 Node 모듈 해석이 실패했다(실측 확인됨). 실제
// 소비자는 자신의 프로젝트 안에서 vitest를 실행하므로 이 문제를 겪지 않는다 —
// 즉 이는 @cheolubak/vitest-config의 결함이 아니라 픽스처 배치 문제다. 그래서
// 픽스처를 워크스페이스 트리 안(따라서 루트 node_modules를 걸어 올라가 찾을 수
// 있는 곳)에 둔다. `.fixtures/`는 이미 .gitignore·oxlint ignore에 등록돼 있다.
const FIXTURES_ROOT = resolve(import.meta.dirname, '.fixtures');
mkdirSync(FIXTURES_ROOT, { recursive: true });

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('@cheolubak/vitest-config/next', () => {
  it('jsdom 환경을 쓰고 테스트 0개를 통과시킨다', () => {
    expect(nextConfig.test.environment).toBe('jsdom');
    expect(nextConfig.test.passWithNoTests).toBe(true);
  });
});

describe('@cheolubak/vitest-config/node', () => {
  it('node 환경을 쓴다 — DOM을 요구하지 않는다', () => {
    expect(nodeConfig.test.environment).toBe('node');
  });
});

describe('실제 vitest 실행', () => {
  it('node 프리셋으로 픽스처 테스트가 통과한다', () => {
    const dir = mkdtempSync(join(FIXTURES_ROOT, 'devbak-vitest-'));
    created.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });

    writeFileSync(
      join(dir, 'src', 'sample.test.ts'),
      "import { it, expect } from 'vitest';\nit('runs', () => { expect(1).toBe(1); });\n",
    );
    writeFileSync(
      join(dir, 'vitest.config.mjs'),
      `import config from ${JSON.stringify(join(PKG_DIR, 'node.js'))};\nexport default config;\n`,
    );
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', private: true, type: 'module' }));

    // include: ['src/**/*.test.ts', ...]가 어느 위치 기준으로 해석되는지를
    // 이 테스트로 실측한다. node.js의 include 상대 경로가 --root로 넘긴 이
    // 픽스처 디렉터리(소비자 위치) 기준이라면 src/sample.test.ts가 매칭돼
    // "1 passed"가 나온다. 만약 @cheolubak/vitest-config 패키지 자신의 위치
    // 기준으로 해석된다면(PKG_DIR/src는 존재하지 않으므로) 테스트를 하나도
    // 찾지 못하고, passWithNoTests 덕에 exit 0이지만 "1 passed"는 나오지 않아
    // 이 assertion이 실패한다 — 즉 이 테스트 자체가 두 가설을 구분한다.
    const bin = resolve(import.meta.dirname, '../../../node_modules/.bin/vitest');
    const output = execFileSync(bin, ['run', '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
    expect(output).toContain('1 passed');
  });

  // include 를 넓힌 대가로 반드시 지켜야 하는 두 가지를 한 번에 본다.
  //
  // (1) src/ 밖의 테스트도 수집된다 — 좁은 include 가 테스트를 통째로
  //     빠뜨리면서 passWithNoTests 가 그걸 초록불로 보고하던 침묵을 막는다.
  // (2) node_modules 는 여전히 제외된다 — vitest 의 exclude 는 기본값을
  //     병합이 아니라 **대체**하므로, configDefaults.exclude 를 펴지 않고
  //     손으로 적는 순간 의존성 안의 테스트까지 긁어온다. 그 회귀는
  //     "테스트가 갑자기 수천 개" 형태로만 드러나므로 여기서 고정한다.
  it('src 밖 테스트는 수집하고 node_modules 는 제외한다', () => {
    const dir = mkdtempSync(join(FIXTURES_ROOT, 'devbak-vitest-scope-'));
    created.push(dir);
    const pass = "import { it, expect } from 'vitest';\nit('%NAME%', () => { expect(1).toBe(1); });\n";

    for (const [sub, name] of [
      ['src', 'in-src'],
      ['components', 'outside-src'],
      ['node_modules/some-dep', 'in-node-modules'],
    ] as const) {
      mkdirSync(join(dir, sub), { recursive: true });
      writeFileSync(join(dir, sub, 'sample.test.ts'), pass.replace('%NAME%', name));
    }

    writeFileSync(
      join(dir, 'vitest.config.mjs'),
      `import config from ${JSON.stringify(join(PKG_DIR, 'node.js'))};\nexport default config;\n`,
    );
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', private: true, type: 'module' }));

    const bin = resolve(import.meta.dirname, '../../../node_modules/.bin/vitest');
    const output = execFileSync(bin, ['run', '--root', dir, '--reporter', 'verbose'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(output).toContain('in-src');
    expect(output).toContain('outside-src');
    expect(output).not.toContain('in-node-modules');
    expect(output).toContain('2 passed');
  });
});
