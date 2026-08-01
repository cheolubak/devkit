import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { categoryOf } from '../src/lib/categories.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates', import.meta.url));

/** templates/<type>/ 아래의 모든 파일을 프로젝트 상대 경로로 수집한다. */
async function collectOverlayFiles(): Promise<{ type: string; relPath: string }[]> {
  const collected: { type: string; relPath: string }[] = [];
  const types = await readdir(TEMPLATES_DIR, { withFileTypes: true });

  for (const type of types) {
    if (!type.isDirectory()) continue;
    const root = `${TEMPLATES_DIR}/${type.name}`;
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absDir = entry.parentPath ?? entry.path;
      const relPath = `${absDir}/${entry.name}`.slice(root.length + 1);
      collected.push({ type: type.name, relPath });
    }
  }

  return collected;
}

describe('오버레이 카테고리 커버리지', () => {
  it('templates 아래에 파일이 실제로 존재한다', async () => {
    // 수집이 0건이면 아래 단언이 공허하게 통과한다.
    const files = await collectOverlayFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  it('모든 오버레이 파일이 카테고리에 매칭된다', async () => {
    // 매칭되지 않는 파일은 어떤 --only 로도 갱신되지 않으면서
    // update 가 성공을 보고한다. 설계 5.4절의 드리프트 방어.
    const files = await collectOverlayFiles();
    const unmatched = files
      .filter(({ relPath }) => categoryOf(relPath) === null)
      .map(({ type, relPath }) => `${type}/${relPath}`);

    expect(unmatched).toEqual([]);
  });
});
