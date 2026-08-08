import { join } from 'node:path';
import type { Category } from '../lib/categories.js';
import { pathExists } from '../ops/path-exists.js';

/**
 * 템플릿에서 은퇴한 파일 — `update` 가 소비자에게서도 지운다.
 *
 * 레시피의 `removeFiles` 를 쓰지 않는다. 그쪽은 **생성 시점의 뼈대 정리**용이고
 * 목록에 `apps/web/.claude` 같은 디렉토리가 들어 있다 — 소비자가 그 아래에
 * 자기 커맨드를 넣어 뒀다면 update 가 그것을 날린다. 은퇴는 그것과 다른 일이라
 * 다른 목록에 둔다: "devkit 이 예전에 놓았고, 이제는 놓지 않으며, 남아 있으면
 * 해로운" 파일만 담는다.
 *
 * `reason` 을 요구하는 것이 요구다. 이유 없이 파일을 지우면 사용자는 update 가
 * 왜 자기 파일을 없앴는지 알 길이 없다.
 */
export interface RetiredFile {
  /** 프로젝트 상대 경로. POSIX `/` 로 쓴다. */
  relPath: string;
  category: Category;
  reason: string;
}

export const RETIRED_FILES: readonly RetiredFile[] = [
  {
    relPath: '.github/workflows/auto-merge.yml',
    category: 'ci',
    reason:
      '머지 판정이 .github/scripts/wait-and-merge.sh 로 옮겨졌습니다. 남아 있으면 그쪽이 먼저 머지합니다.',
  },
];

/**
 * 대상에 실제로 존재하고 카테고리 필터를 통과한 은퇴 파일.
 *
 * 없으면 조용히 뺀다 — 없는 것이 정상 상태이고, 이미 지운 사람에게 매번
 * 알릴 이유가 없다.
 */
export async function retiredTargets(
  targetDir: string,
  categories: ReadonlySet<Category>,
): Promise<RetiredFile[]> {
  const candidates = RETIRED_FILES.filter((file) => categories.has(file.category));
  const present = await Promise.all(
    candidates.map(async (file) => ({
      file,
      exists: await pathExists(join(targetDir, ...file.relPath.split('/'))),
    })),
  );
  return present.filter((item) => item.exists).map((item) => item.file);
}
