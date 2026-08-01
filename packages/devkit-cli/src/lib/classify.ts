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
/** 파일이 없어서 읽기가 실패한 것인가. 그 외의 오류와 구분해야 한다. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}

export async function classifyFiles(
  targetDir: string,
  planned: PlannedFile[],
): Promise<ClassifiedFile[]> {
  return Promise.all(
    planned.map(async ({ relPath, content, category }): Promise<ClassifiedFile> => {
      const existing = await readFile(join(targetDir, relPath), 'utf8').catch(
        (error: unknown) => {
          // ENOENT 만 "신규"로 본다. 나머지를 삼키면 사전 고지가 거짓이 된다 —
          // EISDIR(경로가 디렉토리)은 쓰기 단계에서야 드러나고, EACCES(읽기만
          // 막힌 파일)는 "새로 만듭니다"라고 고지한 뒤 쓰기가 성공해 기존 파일을
          // 조용히 덮어쓴다.
          if (isNotFound(error)) {
            return null;
          }
          throw error;
        },
      );
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

  // 세 섹션 모두 항목이 없으면 머리말 두 줄뿐인 화면이 나간다. `deps`처럼
  // 파일 패턴이 하나도 없는 카테고리로 --only 를 걸면 곧바로 이 경로다.
  // 명시하지 않으면 빈 화면에 "계속할까요? (y/N)"만 붙어 사용자가 아무
  // 일도 없는 것을 성공으로 받아들인다.
  if (lines.length === 2) {
    lines.push('  변경 없음 — 이 카테고리에 해당하는 파일이 없습니다');
  }

  return lines.join('\n');
}
