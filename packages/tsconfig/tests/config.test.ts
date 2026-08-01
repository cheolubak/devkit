import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const PKG_DIR = resolve(import.meta.dirname, '..');
const TSC = resolve(import.meta.dirname, '../../../node_modules/.bin/tsc');

const created: string[] = [];

/** 임시 프로젝트를 만들고 tsc --noEmit을 돌린 뒤 { code, output }을 반환한다. */
function typecheck(preset: string, files: Record<string, string>, extra: object = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-tsconfig-'));
  created.push(dir);

  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ extends: join(PKG_DIR, `${preset}.json`), ...extra }, null, 2),
  );
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }

  try {
    execFileSync(TSC, ['--noEmit', '-p', dir], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, output: '' };
  } catch (error) {
    const err = error as { status: number; stdout: string };
    return { code: err.status, output: err.stdout };
  }
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('@devbak/tsconfig/nest', () => {
  it('데코레이터가 붙은 클래스를 통과시킨다', () => {
    const result = typecheck('nest', {
      'src/app.service.ts': [
        'declare function Injectable(): ClassDecorator;',
        '@Injectable()',
        'export class AppService {',
        '  getHello(): string {',
        "    return 'hello';",
        '  }',
        '}',
      ].join('\n'),
    });
    expect(result.output).toBe('');
    expect(result.code).toBe(0);
  });

  it('strict 위반을 잡는다', () => {
    const result = typecheck('nest', {
      'src/bad.ts': 'export function f(x) { return x; }',
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('implicitly has an');
  });
});

describe('@devbak/tsconfig/next', () => {
  it('JSX를 통과시키고 emit하지 않는다', () => {
    const result = typecheck('next', {
      // 실제 Next.js 프로젝트는 @types/react가 JSX.IntrinsicElements를 제공한다.
      // 이 임시 프로젝트에는 node_modules가 없으므로 최소 앰비언트 선언으로 대체한다.
      'jsx.d.ts': [
        'declare namespace JSX {',
        '  interface IntrinsicElements {',
        '    [elemName: string]: unknown;',
        '  }',
        '}',
      ].join('\n'),
      'src/page.tsx': 'export default function Page() { return <div>hi</div>; }',
    });
    expect(result.output).toBe('');
    expect(result.code).toBe(0);
  });
});

describe('@devbak/tsconfig/lib', () => {
  it('noUncheckedIndexedAccess를 켜서 배열 인덱싱을 undefined로 본다', () => {
    // eslint-plugin-fsd가 이 옵션 부재로 무의미한 non-null 단언을 갖게 된
    // 전례가 있다(work-log 2026-07-29). base가 이를 켜는지 고정한다.
    const result = typecheck('lib', {
      'src/index.ts': ['export function first(xs: string[]): string {', '  return xs[0];', '}'].join('\n'),
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('undefined');
  });
});
