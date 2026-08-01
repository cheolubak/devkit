import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  it('새로 생긴 미추적 디렉토리 안의 파일을 개별로 센다', async () => {
    // git status --porcelain 은 기본값(-unormal)에서 미추적 디렉토리를
    // "?? nested/" 한 줄로 접는다. devkit 이 .claude/agents/ 를 통째로
    // 만드는 상황이 정확히 이 경우라, 접힌 채로 세면 이 모듈이 보호하려는
    // 바로 그 시나리오에서 위험을 과소 보고한다.
    await run('git', ['init', '-q'], { cwd: dir });
    await mkdir(join(dir, 'nested'));
    await writeFile(join(dir, 'nested', 'a.txt'), 'a', 'utf8');
    await writeFile(join(dir, 'nested', 'b.txt'), 'b', 'utf8');
    await writeFile(join(dir, 'nested', 'c.txt'), 'c', 'utf8');
    expect(await inspectGit(dir)).toEqual({ kind: 'dirty', changedFiles: 3 });
  });
});
