import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * 이 패키지가 실행되는 형태.
 *
 * `source` 는 이 저장소에서 직접 실행하는 경우(개발·e2e), `bundled` 는 게시된
 * tarball 을 소비자가 설치해 실행하는 경우다. `files: ["dist", "templates"]`
 * 이므로 게시본에는 `src` 가 없고, 그것이 두 레이아웃을 가르는 사실이다.
 */
export type Layout = 'source' | 'bundled';

/**
 * `from` 에서 위로 올라가며 `package.json` 이 있는 첫 디렉토리를 낸다.
 *
 * 파일 위치를 기준으로 상대 깊이를 세지 않는 이유는 tsup 번들 때문이다 —
 * `src/ops/copy-overlay.ts` 는 번들되면 `dist/chunk-*.js` 가 되어 깊이가
 * 달라진다. 패키지 루트를 찾아 거기서부터 잡으면 번들 여부와 무관해진다.
 *
 * 못 찾으면 던진다. 조용히 상위 아무 디렉토리나 고르면 템플릿을 엉뚱한 곳에서
 * 읽으려 하다 원인을 알 수 없는 실패가 된다.
 */
export function packageRoot(from: string): string {
  let dir = resolve(from);
  if (existsSync(dir) && !statSync(dir).isDirectory()) dir = dirname(dir);
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`${from} 에서 위로 탐색했지만 package.json을 찾지 못했습니다.`);
    }
    dir = parent;
  }
}

/** 패키지 루트를 보고 레이아웃을 판정한다. */
export function packageLayout(pkgRoot: string): Layout {
  return existsSync(join(pkgRoot, 'src')) ? 'source' : 'bundled';
}
