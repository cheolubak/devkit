import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectGit } from '../src/lib/git.js';

const run = promisify(execFile);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devkit-git-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('inspectGit', () => {
  it('git 저장소가 아니면 not-a-repo 를 반환한다', async () => {
    expect(await inspectGit(dir)).toEqual({ kind: 'not-a-repo' });
  });

  it('갓 init 한 빈 저장소는 clean 이다', async () => {
    await run('git', ['init', '-q'], { cwd: dir });
    expect(await inspectGit(dir)).toEqual({ kind: 'clean' });
  });

  it('추적되지 않는 파일이 있으면 dirty 다', async () => {
    // untracked 도 dirty 로 본다. update 가 덮어쓴 결과와 사용자의
    // 미커밋 작업이 같은 diff 에 섞이면 되돌리기가 어려워진다.
    await run('git', ['init', '-q'], { cwd: dir });
    await writeFile(join(dir, 'a.txt'), 'x', 'utf8');
    expect(await inspectGit(dir)).toEqual({ kind: 'dirty', changedFiles: 1 });
  });

  it('변경 파일 수를 센다', async () => {
    await run('git', ['init', '-q'], { cwd: dir });
    await writeFile(join(dir, 'a.txt'), 'x', 'utf8');
    await writeFile(join(dir, 'b.txt'), 'y', 'utf8');
    const state = await inspectGit(dir);
    expect(state).toEqual({ kind: 'dirty', changedFiles: 2 });
  });

  it('존재하지 않는 디렉토리도 not-a-repo 로 다룬다', async () => {
    expect(await inspectGit(join(dir, 'nope'))).toEqual({ kind: 'not-a-repo' });
  });
});
