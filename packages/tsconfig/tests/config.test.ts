import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import base from '../base.json';
import nest from '../nest.json';

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

describe('@cheolubak/tsconfig/nest', () => {
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

describe('@cheolubak/tsconfig/next', () => {
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

describe('@cheolubak/tsconfig/lib', () => {
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

describe('exclude 회귀', () => {
  // 프리셋에 "exclude": ["dist"] 같은 상대 경로를 두면, extends 시 그 경로는
  // 프리셋 파일 자신의 위치(packages/tsconfig) 기준으로 해석되어 소비자의
  // dist는 전혀 보호하지 못한다(리뷰에서 실측 확인됨). 그래서 프리셋에서
  // exclude를 제거하고, 소비자가 자신의 include로 범위를 정하도록 했다.
  // 이 테스트는 그 문서화된 사용법(README 참고)이 실제로 dist를 프로그램
  // 밖으로 빼내는지를 검증한다.
  it('base·nest는 exclude를 두지 않는다', () => {
    // extends로 상속되는 상대 경로 exclude는 프리셋 파일 위치 기준으로
    // 해석되어 소비자를 보호하지 못한다(위 설명 참고). 겉보기엔 안전해
    // 보이는 이 필드를 실수로 되돌리는 것을 막는다.
    expect(base).not.toHaveProperty('exclude');
    expect(nest).not.toHaveProperty('exclude');
  });

  const brokenDist = {
    'src/ok.ts': 'export const ok: number = 1;',
    'dist/stale.ts': 'export const bad: string = 123;',
  };

  it('base: 소비자가 include를 지정하면 dist의 낡은 산출물이 프로그램에서 빠진다', () => {
    const result = typecheck('base', brokenDist, { include: ['src'] });
    expect(result.output).toBe('');
    expect(result.code).toBe(0);
  });

  it('nest: 소비자가 include를 지정하면 dist의 낡은 산출물이 프로그램에서 빠진다', () => {
    const result = typecheck('nest', brokenDist, { include: ['src'] });
    expect(result.output).toBe('');
    expect(result.code).toBe(0);
  });
});
