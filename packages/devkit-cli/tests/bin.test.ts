import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findToolkitRoot, main } from '../src/bin.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('findToolkitRoot', () => {
  it('pnpm-workspace.yaml이 있는 상위 디렉토리를 찾는다', () => {
    const root = mkdtempSync(join(tmpdir(), 'devbak-root-'));
    created.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    const deep = join(root, 'packages', 'devkit-cli', 'dist');
    mkdirSync(deep, { recursive: true });

    expect(findToolkitRoot(deep)).toBe(root);
  });

  it('찾지 못하면 던진다 — 조용히 cwd로 폴백하지 않는다', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'devbak-orphan-'));
    created.push(orphan);
    expect(() => findToolkitRoot(orphan)).toThrow(/pnpm-workspace\.yaml/);
  });
});

describe('--help', () => {
  it('사용법을 내고 정상 종료한다 — 커맨드 앞뒤 어디에 와도', async () => {
    // parseArgs 는 strict 가 기본이라 옵션 테이블에 help 가 없으면
    // `Unknown option '--help'` 로 죽는다. 서브커맨드가 둘인 CLI 에서
    // 사용법에 도달하는 표준 경로가 없으면 안 된다.
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

    try {
      await expect(main(['--help'])).resolves.toBeUndefined();
      await expect(main(['update', '--help'])).resolves.toBeUndefined();
    } finally {
      write.mockRestore();
    }

    expect(written).toHaveLength(2);
    for (const output of written) {
      expect(output).toContain('pnpm devbak create <name> --type');
      expect(output).toContain('pnpm devbak update [path]');
    }
  });
});

describe('--type 검증', () => {
  it('Object.prototype이 물려주는 키(constructor 등)를 유효한 --type으로 받아들이지 않는다', async () => {
    // `type in RECIPES`였다면 RECIPES가 상속하는 Object.prototype.constructor와
    // 매칭되어 통과한 뒤 recipe(...)가 Object(...)를 호출하는 꼴이 되어
    // run() 내부에서야 "steps.entries is not a function" 같은 낯선 에러로
    // 죽는다. Object.hasOwn으로 고쳐 이 케이스가 여기서 바로 거부돼야 한다.
    await expect(main(['create', 'x', '--type', 'constructor'])).rejects.toThrow(
      /--type은 nest · next · monorepo 중 하나여야 합니다/,
    );
  });
});
