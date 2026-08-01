import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type GitState =
  | { kind: 'clean' }
  | { kind: 'dirty'; changedFiles: number }
  | { kind: 'not-a-repo' };

/**
 * "여긴 git 저장소가 아니다"로 접어도 되는 실패인가.
 *
 * 저장소가 있는데 다른 이유로 못 읽은 것까지 not-a-repo 로 보고하면,
 * 실제로는 지켜야 할 미커밋 변경이 있는데 안전망이 없다고 잘못 알리게 된다.
 */
function isMissingRepo(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, stderr } = error as { code?: unknown; stderr?: unknown };
  // git 미설치이거나 dir 자체가 없으면 spawn 이 ENOENT 로 실패한다
  if (code === 'ENOENT') {
    return true;
  }
  // 저장소가 아니면 git 이 비정상 종료하며 stderr 에 명시한다
  return typeof stderr === 'string' && stderr.includes('not a git repository');
}

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
  const stdout = await run('git', ['status', '--porcelain', '-uall'], {
    cwd: dir,
    maxBuffer: 64 * 1024 * 1024,
  })
    .then((result) => result.stdout)
    .catch((error: unknown) => {
      if (isMissingRepo(error)) {
        return null;
      }
      throw error;
    });

  if (stdout === null) {
    return { kind: 'not-a-repo' };
  }

  const changedFiles = stdout.split('\n').filter((line) => line.trim().length > 0).length;
  return changedFiles === 0 ? { kind: 'clean' } : { kind: 'dirty', changedFiles };
}
