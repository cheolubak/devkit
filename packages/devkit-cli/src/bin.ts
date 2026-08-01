#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * pnpm-workspace.yaml을 상위로 탐색해 툴킷 저장소 루트를 찾는다.
 *
 * 못 찾으면 던진다. cwd로 폴백하면 linkDeps가 엉뚱한 상대경로를 계산해
 * 아무 에러 없이 잘못된 프로젝트가 생성된다(설계 6.1절).
 */
export function findToolkitRoot(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `툴킷 저장소 루트를 찾지 못했습니다 (${from}에서 위로 탐색하며 pnpm-workspace.yaml을 찾았습니다).`,
      );
    }
    dir = parent;
  }
}

/** 디렉토리 트리에서 가장 최근 mtime을 반환한다. */
function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * dist가 src보다 오래됐으면 중단한다.
 *
 * link: 소비에서는 어떤 라이프사이클 스크립트도 돌지 않아, 빌드를 잊으면
 * 옛 코드가 조용히 실행된다(로드맵 4.2절). CLI만은 스스로 이를 막는다.
 */
export function assertDistFresh(pkgDir: string): void {
  const distBin = join(pkgDir, 'dist', 'bin.js');
  if (!existsSync(distBin)) return;
  if (newestMtime(join(pkgDir, 'src')) > statSync(distBin).mtimeMs) {
    throw new Error('devkit-cli의 dist가 src보다 오래됐습니다. `pnpm build`를 먼저 실행하세요.');
  }
}
