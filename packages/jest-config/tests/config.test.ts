import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const requireModule = createRequire(import.meta.url);
const PKG_DIR = resolve(import.meta.dirname, '..');
const created: string[] = [];

// os.tmpdir()에 픽스처를 두면 안 된다: Jest는 transform의 'ts-jest' 같은
// 모듈 이름을 Node 모듈 해석(부모 디렉터리를 걸어 올라가며 node_modules를 찾는 방식)으로
// 찾는데, os.tmpdir()은 이 워크스페이스 트리 밖이라 어떤 node_modules도 찾지 못해
// "Module ts-jest ... was not found"로 실패한다(실측 확인됨). 실제 소비자는
// 자신의 프로젝트 안에 ts-jest를 설치하므로 이 문제를 겪지 않는다 — 즉 이는
// @devbak/jest-config의 결함이 아니라 픽스처 배치 문제다. 그래서 픽스처를
// 워크스페이스 트리 안(따라서 루트 node_modules를 걸어 올라가 찾을 수 있는 곳)에 둔다.
const FIXTURES_ROOT = resolve(import.meta.dirname, '.fixtures');
mkdirSync(FIXTURES_ROOT, { recursive: true });

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('@devbak/jest-config/nest', () => {
  it('nest new의 인라인 jest 블록과 같은 값을 갖는다', () => {
    const config = requireModule(join(PKG_DIR, 'nest.js')) as Record<string, unknown>;
    expect(config).toEqual({
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: 'src',
      testRegex: '.*\\.spec\\.ts$',
      transform: { '^.+\\.(t|j)s$': 'ts-jest' },
      collectCoverageFrom: ['**/*.(t|j)s'],
      coverageDirectory: '../coverage',
      testEnvironment: 'node',
    });
  });

  it('실제 jest가 이 설정으로 spec 파일을 찾아 통과시킨다', () => {
    const dir = mkdtempSync(join(FIXTURES_ROOT, 'devbak-jest-'));
    created.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });

    writeFileSync(
      join(dir, 'src', 'sample.spec.ts'),
      "it('runs', () => { expect(1 + 1).toBe(2); });\n",
    );
    writeFileSync(
      join(dir, 'jest.config.js'),
      `module.exports = require(${JSON.stringify(join(PKG_DIR, 'nest.js'))});\n`,
    );
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fx', private: true }));

    // --rootDir을 CLI로 넘기지 않는다: Jest의 CLI --rootDir은 설정 파일의
    // rootDir을 덮어써서, nest.js의 rootDir이 틀리거나 없어져도 이 테스트가
    // 그대로 통과하게 만든다(실측 확인됨). nest.js의 rootDir: 'src'가 실제로
    // 이 jest.config.js 위치를 기준으로 동작하는지를 검증하는 것이 이 테스트의
    // 목적이므로, config 파일만 넘기고 rootDir 해석을 nest.js에 맡긴다.
    const jestBin = resolve(import.meta.dirname, '../../../node_modules/.bin/jest');
    const output = execFileSync(jestBin, ['--config', join(dir, 'jest.config.js')], {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: dir,
    });
    expect(output).toBeDefined();
  });
});

describe('@devbak/jest-config/nest-e2e', () => {
  it('e2e-spec 파일만 대상으로 하는 testRegex를 갖는다', () => {
    const config = requireModule(join(PKG_DIR, 'nest-e2e.js')) as { testRegex: string };
    const re = new RegExp(config.testRegex);
    expect(re.test('test/app.e2e-spec.ts')).toBe(true);
    expect(re.test('src/app.service.spec.ts')).toBe(false);
  });
});
