import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * `dir` 자신부터 위로 올라가며 처음 만나는 pnpm 워크스페이스 루트. 없으면 null.
 *
 * pnpm 이 워크스페이스를 찾는 방식과 같은 방향이다 — 그래서 이 함수가 무언가를
 * 찾아내면 pnpm 도 같은 것을 찾는다.
 */
export function findEnclosingWorkspace(dir: string): string | null {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * e2e 생성물을 만들 기준 디렉토리. **어떤 pnpm 워크스페이스 안에도 있으면 안 된다.**
 *
 * 워크스페이스 하위이면서 그 워크스페이스의 `packages` glob 에는 걸리지 않는
 * 자리에 프로젝트를 만들면, pnpm 이 상위 `pnpm-workspace.yaml` 을 찾고 이
 * 프로젝트를 멤버로 보지 않아 **`@cheolubak/*` 설치를 조용히 건너뛴다**
 * (`node_modules/@cheolubak` 자체가 안 생긴다). `pnpm install` 은 성공으로 끝나고,
 * 실패는 한참 뒤 `pnpm lint` 의 `ERR_MODULE_NOT_FOUND` 로 나타난다.
 *
 * 예전에는 툴킷 루트의 부모(`resolve(TOOLKIT, '..')`)를 기준으로 썼다. 그건
 * **메인 체크아웃에서만** 저장소 밖이다. git worktree 에서 돌리면 TOOLKIT 이
 * `<repo>/.claude/worktrees/<name>` 이라 부모가 `<repo>/.claude/worktrees` —
 * 저장소 **안**이면서 워크스페이스 glob(`packages/*`) **밖**이라 위 함정에
 * 그대로 빠졌다. 더 나쁜 건 실패가 부분적이라는 점이었다: `next`·`monorepo` 는
 * `create-next-app` 이 자체 `pnpm-workspace.yaml` 을 만들어 독립 루트가 되므로
 * 통과하고 `nest` 3건만 죽어, 위치 문제가 아니라 nest 회귀처럼 보였다.
 *
 * 그래서 위치를 워크스페이스와 무관한 임시 디렉토리로 고정하고, 그 전제가
 * 깨지면 **여기서 이름을 붙여 던진다.** 조용히 다른 곳으로 옮기지 않는 이유는
 * 그 경우 진짜 환경 문제가 숨기 때문이다. `packed.e2e.test.ts` 가 같은 이유로
 * 이미 임시 디렉토리를 쓰고 있었다.
 */
export function assertOutsideWorkspace(dir: string): void {
  const workspace = findEnclosingWorkspace(dir);
  if (workspace === null) return;

  throw new Error(
    `e2e 생성물 기준 디렉토리가 pnpm 워크스페이스 안입니다.\n` +
      `  기준:       ${resolve(dir)}\n` +
      `  워크스페이스: ${workspace}\n` +
      '여기에 만들면 워크스페이스 멤버가 아니라서 @cheolubak/* 설치가 조용히 건너뛰어지고, ' +
      '한참 뒤 pnpm lint 가 ERR_MODULE_NOT_FOUND 로 죽습니다.',
  );
}
