import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Category } from './categories.js';

export type ChangeKind = 'created' | 'overwritten' | 'unchanged';

export interface PlannedFile {
  relPath: string;
  content: string;
  category: Category;
}

export interface ClassifiedFile {
  kind: ChangeKind;
  relPath: string;
  category: Category;
}

/**
 * 쓰기 전에 각 파일이 신규인지·덮어쓰기인지·동일한지 판정한다.
 *
 * update 는 이 결과를 사람에게 보여주고 확인을 받은 뒤에야 쓴다(설계 5.2절).
 */
export async function classifyFiles(
  targetDir: string,
  planned: PlannedFile[],
): Promise<ClassifiedFile[]> {
  return Promise.all(
    planned.map(async ({ relPath, content, category }): Promise<ClassifiedFile> => {
      const existing = await readFile(join(targetDir, relPath), 'utf8').catch(() => null);
      if (existing === null) {
        return { kind: 'created', relPath, category };
      }
      return { kind: existing === content ? 'unchanged' : 'overwritten', relPath, category };
    }),
  );
}

const SECTIONS: ReadonlyArray<readonly [ChangeKind, string]> = [
  ['overwritten', '덮어쓰기'],
  ['created', '신규'],
  ['unchanged', '동일 — 건너뜀'],
];

/**
 * 설계 5.5절의 변경 목록.
 *
 * "동일 — 건너뜀"을 반드시 출력한다. 여기 있어야 할 파일이 목록
 * 어디에도 없으면 곧바로 눈에 띄지만, 침묵하면 그 사실이 숨는다.
 */
export function formatChangeList(
  items: ClassifiedFile[],
  projectName: string,
  type: string,
): string {
  const lines = [`devkit update — ${projectName} (${type})`, ''];

  for (const [kind, label] of SECTIONS) {
    const matching = items.filter((item) => item.kind === kind);
    if (matching.length === 0) continue;
    lines.push(`  ${label} (${matching.length})`);
    for (const item of matching) {
      lines.push(`    ${item.relPath}`);
    }
  }

  return lines.join('\n');
}
