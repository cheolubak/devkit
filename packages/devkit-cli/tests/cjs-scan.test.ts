import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findCommonJsFiles } from '../src/update/cjs-scan.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 상대경로 → 내용 맵으로 임시 트리를 만든다. */
function makeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-cjs-'));
  created.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, ...rel.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe('findCommonJsFiles', () => {
  it('CommonJS 문법을 쓰는 .js 를 찾는다 — 중첩 디렉토리까지', async () => {
    const dir = makeTree({
      'handler.js': "const x = require('node:fs');\n",
      'cache-handlers/logging.js': 'module.exports = {};\n',
      'lib/legacy.js': 'exports.name = 1;\n',
    });

    const found = await findCommonJsFiles(dir);

    expect(found.sort()).toEqual(['cache-handlers/logging.js', 'handler.js', 'lib/legacy.js']);
  });

  it('ESM .js 와 .ts 는 세지 않는다 — 재해석되어 깨지는 것만 알려야 한다', async () => {
    const dir = makeTree({
      'esm.js': "import fs from 'node:fs';\nexport default fs;\n",
      'next.config.ts': "const p = require('x');\n",
      'already.cjs': "require('x');\n",
    });

    expect(await findCommonJsFiles(dir)).toEqual([]);
  });

  it('node_modules·빌드 산출물·public 은 걸어 내려가지 않는다', async () => {
    // 의존성의 CJS 는 자기 package.json 의 type 을 따르므로 대상의 변경과
    // 무관하고, public 은 Node 가 실행하지 않는 브라우저 스크립트 자리다.
    // 이것들이 섞이면 경고가 길어져 진짜 항목이 묻힌다.
    const dir = makeTree({
      'node_modules/dep/index.js': 'module.exports = {};\n',
      '.next/server/chunk.js': 'module.exports = {};\n',
      'dist/bundle.js': 'module.exports = {};\n',
      'public/analytics.js': 'module.exports = {};\n',
      'real.js': 'module.exports = {};\n',
    });

    expect(await findCommonJsFiles(dir)).toEqual(['real.js']);
  });

  it('limit 에서 멈춘다 — 경고가 화면을 채우지 않게 한다', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i += 1) files[`f${i}.js`] = 'module.exports = {};\n';

    expect(await findCommonJsFiles(makeTree(files), 3)).toHaveLength(3);
  });
});
