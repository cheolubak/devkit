import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 마커에 심을 devkit 버전.
 *
 * 하드코딩하면 릴리스마다 갱신을 잊고, 그러면 마커가 옛 버전을 가리킨 채
 * 굳는다 — 훗날 마이그레이션 판단의 근거가 조용히 오염된다.
 *
 * 고정된 상위 단계 수로 package.json을 찾지 않는다(실측: `pnpm build` 후
 * dist 트리를 보면 tsup이 src/lib/version.ts를 엔트리(bin.ts)에 통째로
 * 번들링해 dist/lib/version.js라는 파일 자체가 없다 — dist/bin.js 하나로
 * 평탄화된다). 그러면 import.meta.url이 가리키는 깊이가 실행 방식마다
 * 다르다: vitest는 src/lib/version.ts(패키지 루트에서 두 단계 아래)를
 * 그대로 싣지만, 빌드 산출물은 dist/bin.js(한 단계 아래)뿐이다. 두 단계로
 * 고정하면 빌드 산출물에서 packages/package.json(존재하지 않음)을 가리켜
 * ENOENT로 죽는다. bin.ts의 findToolkitRoot와 같은 방식으로 package.json을
 * 찾을 때까지 위로 걷는다.
 */
export function devkitVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
      if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
        throw new Error(`${pkgPath} 에 version 문자열이 없습니다.`);
      }
      return parsed.version;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('devkit-cli의 package.json을 찾지 못했습니다.');
    }
    dir = parent;
  }
}
