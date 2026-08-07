import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertOutsideWorkspace, findEnclosingWorkspace } from './e2e/workspace-root.js';

// e2e 파일이 아니라 여기(기본 스위트)에 둔다 — 가드 자체는 GITHUB_TOKEN 도
// pnpm install 도 필요 없고, e2e 를 돌리지 않는 개발 루프에서도 깨지면
// 바로 알아야 하기 때문이다.

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTree(relDirs: string[], workspaceAt?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'devbak-ws-'));
  created.push(root);
  for (const rel of relDirs) mkdirSync(join(root, ...rel.split('/')), { recursive: true });
  if (workspaceAt !== undefined) {
    const at = workspaceAt === '' ? root : join(root, ...workspaceAt.split('/'));
    writeFileSync(join(at, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  }
  return root;
}

describe('findEnclosingWorkspace', () => {
  it('조상에 pnpm-workspace.yaml 이 있으면 그 루트를 낸다', () => {
    const root = makeTree(['.claude/worktrees/gen'], '');

    expect(findEnclosingWorkspace(join(root, '.claude', 'worktrees', 'gen'))).toBe(root);
  });

  it('자기 자신이 워크스페이스 루트여도 잡는다', () => {
    const root = makeTree([], '');

    expect(findEnclosingWorkspace(root)).toBe(root);
  });

  it('가장 가까운 루트를 낸다 — 중첩이면 안쪽', () => {
    const root = makeTree(['apps/web'], 'apps/web');
    // 바깥에도 하나 둔다. 안쪽이 먼저 잡혀야 pnpm 의 탐색 방향과 같다.
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');

    expect(findEnclosingWorkspace(join(root, 'apps', 'web'))).toBe(join(root, 'apps', 'web'));
  });

  it('워크스페이스가 없으면 null — 루트까지 올라가도 멈춘다', () => {
    expect(findEnclosingWorkspace(makeTree(['a/b/c']))).toBeNull();
  });
});

describe('assertOutsideWorkspace', () => {
  /**
   * 이 단언이 실제로 잡아야 하는 그 상황을 그대로 만든다: worktree 에서 e2e 를
   * 돌리면 기준 디렉토리가 `<repo>/.claude/worktrees` 가 되는데, 저장소 안이면서
   * 워크스페이스 glob(`packages/*`) 밖이라 pnpm 이 생성물을 멤버로 보지 않고
   * @cheolubak/* 설치를 조용히 건너뛴다.
   */
  it('워크스페이스 안이면 던진다 — 경로를 함께 알린다', () => {
    const root = makeTree(['.claude/worktrees'], '');
    const inside = join(root, '.claude', 'worktrees');

    expect(() => assertOutsideWorkspace(inside)).toThrow(/pnpm 워크스페이스 안입니다/);
    // 경로는 정규식이 아니라 문자열로 대조한다 — toThrow(string) 은 부분 문자열
    // 매칭이다. 경로를 정규식으로 만들면 `.` 같은 메타문자가 그대로 살아 단언이
    // 조용히 헐거워지고, Windows 의 역슬래시 경로에서는 패턴 자체가 깨진다.
    expect(() => assertOutsideWorkspace(inside)).toThrow(root);
  });

  it('워크스페이스 밖이면 조용하다', () => {
    expect(() => assertOutsideWorkspace(makeTree(['a']))).not.toThrow();
  });

  it('e2e 가 실제로 쓰는 os.tmpdir() 은 워크스페이스 밖이다', () => {
    // e2e 두 파일이 이 값을 기준으로 삼는다. 여기서 전제를 고정해 두면,
    // 환경이 바뀌어 tmpdir 이 워크스페이스 안에 들어가는 날 e2e 가 아니라
    // 이 빠른 테스트가 먼저 알려 준다.
    expect(() => assertOutsideWorkspace(tmpdir())).not.toThrow();
  });
});
