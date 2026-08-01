import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyFiles, formatChangeList } from '../src/lib/classify.js';
import type { ClassifiedFile, PlannedFile } from '../src/lib/classify.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'devkit-classify-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const planned = (relPath: string, content: string): PlannedFile => ({
  relPath,
  content,
  category: 'claude',
});

describe('classifyFiles', () => {
  it('대상에 없는 파일은 created 로 분류한다', async () => {
    const result = await classifyFiles(dir, [planned('CLAUDE.md', 'hello')]);
    expect(result).toEqual([{ kind: 'created', relPath: 'CLAUDE.md', category: 'claude' }]);
  });

  it('내용이 다르면 overwritten 으로 분류한다', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'old', 'utf8');
    const result = await classifyFiles(dir, [planned('CLAUDE.md', 'new')]);
    expect(result[0]?.kind).toBe('overwritten');
  });

  it('내용이 같으면 unchanged 로 분류한다', async () => {
    await writeFile(join(dir, 'CLAUDE.md'), 'same', 'utf8');
    const result = await classifyFiles(dir, [planned('CLAUDE.md', 'same')]);
    expect(result[0]?.kind).toBe('unchanged');
  });

  it('중첩 경로를 다룬다', async () => {
    await mkdir(join(dir, '.claude', 'agents'), { recursive: true });
    await writeFile(join(dir, '.claude', 'agents', 'devkit-reviewer.md'), 'old', 'utf8');
    const result = await classifyFiles(dir, [
      planned('.claude/agents/devkit-reviewer.md', 'new'),
    ]);
    expect(result[0]?.kind).toBe('overwritten');
  });

  it('입력 순서를 보존한다', async () => {
    const result = await classifyFiles(dir, [
      planned('b.md', 'x'),
      planned('a.md', 'y'),
    ]);
    expect(result.map((r) => r.relPath)).toEqual(['b.md', 'a.md']);
  });

  it('파일 부재가 아닌 오류는 삼키지 않고 던진다', async () => {
    // 대상 경로가 디렉토리면 readFile 이 EISDIR 을 던진다. 이것을
    // created 로 뭉개면 "새로 만듭니다"라고 고지한 뒤 쓰기 단계에서야
    // 실패가 드러난다 — 사전 고지가 목적인 모듈이 거짓을 보고하는 셈이다.
    await mkdir(join(dir, 'CLAUDE.md'));
    await expect(classifyFiles(dir, [planned('CLAUDE.md', 'x')])).rejects.toThrow(/EISDIR/);
  });
});

describe('formatChangeList', () => {
  const items: ClassifiedFile[] = [
    { kind: 'overwritten', relPath: 'eslint.config.mjs', category: 'lint' },
    { kind: 'overwritten', relPath: '.claude/agents/devkit-reviewer.md', category: 'claude' },
    { kind: 'created', relPath: '.claude/commands/review.md', category: 'claude' },
    { kind: 'unchanged', relPath: 'tsconfig.json', category: 'ts' },
  ];

  it('세 분류를 모두 표시한다', () => {
    const output = formatChangeList(items, 'my-api', 'nest');
    expect(output).toContain('덮어쓰기 (2)');
    expect(output).toContain('신규 (1)');
    expect(output).toContain('동일 — 건너뜀 (1)');
  });

  it('프로젝트명과 유형을 머리말에 담는다', () => {
    const output = formatChangeList(items, 'my-api', 'nest');
    expect(output).toContain('my-api');
    expect(output).toContain('nest');
  });

  it('변경이 없어도 동일 목록을 출력한다', () => {
    // 있어야 할 파일이 목록 어디에도 없으면 곧바로 눈에 띄어야 한다.
    const output = formatChangeList(
      [{ kind: 'unchanged', relPath: 'tsconfig.json', category: 'ts' }],
      'my-api',
      'nest',
    );
    expect(output).toContain('동일 — 건너뜀 (1)');
    expect(output).toContain('tsconfig.json');
  });

  it('해당 항목이 없는 분류는 표시하지 않는다', () => {
    const output = formatChangeList(
      [{ kind: 'created', relPath: 'a.md', category: 'claude' }],
      'my-api',
      'nest',
    );
    expect(output).not.toContain('덮어쓰기');
    expect(output).not.toContain('동일');
  });
});
