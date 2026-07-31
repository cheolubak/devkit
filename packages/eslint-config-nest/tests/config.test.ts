import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../src/index';

describe('eslint-config-nest', () => {
  it('flat config 배열을 기본 export한다', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('타입 인식을 켠다', () => {
    const withParserOptions = config.find(
      (entry) => entry.languageOptions?.parserOptions !== undefined,
    );
    expect(withParserOptions?.languageOptions?.parserOptions).toMatchObject({
      projectService: true,
    });
  });
});

const FIXTURE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/nest-app');

/**
 * 픽스처 파일을 실제 ESLint로 린트한다.
 * cwd를 픽스처 루트로 두면 projectService가 픽스처의 tsconfig를 찾는다 —
 * consumer가 프로젝트 루트에서 `eslint .`를 돌리는 상황과 같다.
 */
async function lintFixture(relativePath: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({
    cwd: FIXTURE_ROOT,
    overrideConfigFile: true,
    overrideConfig: config,
  });
  const results = await eslint.lintFiles([relativePath]);
  return results[0]?.messages ?? [];
}

describe('런타임 검증', () => {
  it('픽스처를 fatal 오류 없이 린트한다', async () => {
    const messages = await lintFixture('src/idioms.ts');
    expect(messages.filter((m) => m.fatal).map((m) => m.message)).toEqual([]);
  });

  it('await 누락을 no-floating-promises로 잡는다', async () => {
    const messages = await lintFixture('src/violations.ts');
    const ruleIds = messages.map((m) => m.ruleId);
    expect(ruleIds).toContain('@typescript-eslint/no-floating-promises');
  });

  it('zod 스키마 위반을 잡는다', async () => {
    const messages = await lintFixture('src/schema.ts');
    const ruleIds = messages.map((m) => m.ruleId);
    expect(ruleIds).toContain('zod/no-any-schema');
  });
});
