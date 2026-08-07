import { readdir, readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

/**
 * 걸어 내려가지 않는 디렉토리.
 *
 * `node_modules` 는 성능 때문만이 아니라 정확성 때문이기도 하다 — 의존성의
 * CJS 파일은 자기 package.json 의 `type` 을 따르므로 대상의 `type` 변경과
 * 무관하다. `public` 은 Node 가 실행하지 않는 브라우저 스크립트 자리다.
 */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'out',
  'build',
  'coverage',
  'public',
]);

/**
 * CommonJS 로만 성립하는 문법. ESM 에서는 셋 다 없거나 참조 에러가 된다.
 *
 * 문자열 안에 우연히 들어간 것까지 잡히지만, 방향이 안전한 쪽이다 —
 * 이 함수의 결과는 **경고 문구**이지 차단이 아니다.
 */
const CJS_SYNTAX = /\bmodule\.exports\b|\bexports\.\w|\brequire\s*\(/;

/**
 * `"type": "module"` 이 얹히면 해석이 뒤집히는 `.js` 파일을 찾는다.
 *
 * `type` 이 없는 프로젝트에서 `.js` 는 CommonJS 로 해석된다. 거기에
 * `"type": "module"` 을 심으면 같은 파일이 ESM 으로 재해석되어
 * `require is not defined` 로 죽는다. next 레시피는 vitest.config.ts 가 CJS 로
 * 번들링되는 것을 막으려 이 키를 심는데, 그 근거("create-next-app 산출물에
 * .js 가 없으므로 안전하다")는 **갓 생성된 프로젝트에만** 성립한다. update 는
 * 사람이 오래 쓴 프로젝트에도 같은 키를 심으므로 여기서 확인한다.
 *
 * 파일을 열어 문법까지 보는 이유는 오탐을 줄이기 위해서다 — 확장자만 세면
 * Node 가 실행하지도 않는 스크립트까지 경고에 올라와 금세 무시당한다.
 */
export async function findCommonJsFiles(targetDir: string, limit = 10): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, rel: string): Promise<void> {
    if (found.length >= limit) return;

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (found.length >= limit) return;
      const childRel = rel === '' ? entry.name : posix.join(rel, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // oxlint-disable-next-line no-await-in-loop -- limit 도달 즉시 멈추려면 순차여야 한다
        await walk(join(dir, entry.name), childRel);
        continue;
      }

      if (!entry.name.endsWith('.js')) continue;
      // oxlint-disable-next-line no-await-in-loop -- 위와 같은 이유
      const content = await readFile(join(dir, entry.name), 'utf8').catch(() => '');
      if (CJS_SYNTAX.test(content)) found.push(childRel);
    }
  }

  await walk(targetDir, '');
  return found;
}
