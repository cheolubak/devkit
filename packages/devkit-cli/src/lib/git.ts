import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type GitState =
  | { kind: 'clean' }
  | { kind: 'dirty'; changedFiles: number }
  | { kind: 'not-a-repo' };

/**
 * 워킹트리 상태를 본다.
 *
 * update 는 깨끗한 트리를 요구한다. 그러면 덮어쓴 결과가 전부
 * git diff 로 검토되고 checkout 으로 되돌아가므로, CLI 가 자체
 * 백업·머지 로직을 가질 필요가 없다(설계 2.1절).
 *
 * untracked 파일도 dirty 로 본다 — update 의 결과와 사용자의
 * 미커밋 작업이 같은 diff 에 섞이면 되돌리기가 어려워진다.
 */
export async function inspectGit(dir: string): Promise<GitState> {
  const stdout = await run('git', ['status', '--porcelain'], { cwd: dir })
    .then((result) => result.stdout)
    .catch(() => null);

  if (stdout === null) {
    return { kind: 'not-a-repo' };
  }

  const changedFiles = stdout.split('\n').filter((line) => line.trim().length > 0).length;
  return changedFiles === 0 ? { kind: 'clean' } : { kind: 'dirty', changedFiles };
}
