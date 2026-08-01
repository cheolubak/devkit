import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertNoDrift } from '../src/ops/copy-overlay.js';

const created: string[] = [];

function makeTargetDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-drift-'));
  created.push(dir);
  return dir;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('assertNoDrift', () => {
  it('실제 내용이 기대 해시와 같으면 통과한다', async () => {
    const dir = makeTargetDir();
    const content = "console.log('hello');\n";
    writeFileSync(join(dir, 'main.ts'), content);
    await expect(assertNoDrift(dir, { 'main.ts': sha256(content) })).resolves.toBeUndefined();
  });

  it('실제 내용이 기대 해시와 다르면 던진다 — 위임 대상 산출물이 바뀌었다는 뜻이다', async () => {
    const dir = makeTargetDir();
    writeFileSync(join(dir, 'main.ts'), '// 공식 CLI가 내용을 바꿨다고 가정\n');
    const wrongExpected = sha256("console.log('hello');\n");
    await expect(assertNoDrift(dir, { 'main.ts': wrongExpected })).rejects.toThrow(/main\.ts/);
  });

  it('대상 파일이 아직 없으면 던지지 않는다 — 오버레이가 새 파일을 만드는 정상 경우다', async () => {
    const dir = makeTargetDir();
    await expect(assertNoDrift(dir, { 'nope.ts': sha256('anything') })).resolves.toBeUndefined();
  });

  it('중첩 경로(src/main.ts)도 검사한다', async () => {
    const dir = makeTargetDir();
    mkdirSync(join(dir, 'src'), { recursive: true });
    const content = 'async function bootstrap() {}\nvoid bootstrap();\n';
    writeFileSync(join(dir, 'src', 'main.ts'), content);
    await expect(assertNoDrift(dir, { 'src/main.ts': sha256(content) })).resolves.toBeUndefined();
    await expect(assertNoDrift(dir, { 'src/main.ts': sha256('다른 내용') })).rejects.toThrow(/src\/main\.ts/);
  });
});
