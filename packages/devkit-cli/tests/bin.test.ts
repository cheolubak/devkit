import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertDistFresh, findToolkitRoot, main } from '../src/bin.js';

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('create 대상 경로', () => {
  it('기준 디렉토리 아래에 만든다 — 툴킷의 형제로 강제하지 않는다', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'devbak-cwd-'));
    created.push(sandbox);
    // 존재하는 대상으로 부딪혀 "어느 경로를 대상으로 잡았는지"를 에러에서 읽는다.
    // 레시피를 실제로 돌리면 네트워크·설치가 붙어 단위 테스트가 아니게 된다.
    mkdirSync(join(sandbox, 'taken'));

    await expect(
      main(['create', 'taken', '--type', 'nest'], { cwd: sandbox }),
    ).rejects.toThrow(new RegExp(`${escapeRegExp(join(sandbox, 'taken'))}.*이미 존재합니다`));
  });

  it('기준을 안 주면 process.cwd()를 쓴다 — CLI 의 기본 경로', async () => {
    // 툴킷 저장소 안에서 돌리므로 대상은 <저장소>/taken-here 가 된다.
    // 브리프 원문은 이 디렉토리를 미리 만들지 않았는데, 그러면 존재 검사를
    // 통과해 레시피가 실제로 실행된다 — 실제 저장소 루트에 네트워크·설치가
    // 붙은 프로젝트가 생성되는 부작용이 실측으로 확인됐다(RI Task 6 보고서
    // 참고). 첫 번째 테스트와 같은 방식으로 미리 만들어 존재 검사에서
    // 막히게 한다.
    const target = join(process.cwd(), 'taken-here');
    mkdirSync(target);
    created.push(target);

    await expect(main(['create', 'taken-here', '--type', 'nest'])).rejects.toThrow(
      new RegExp(`${escapeRegExp(target)}.*이미 존재합니다`),
    );
  });
});

describe('assertDistFresh', () => {
  it('source 레이아웃에서 dist가 src보다 오래되면 던진다', () => {
    const pkg = mkdtempSync(join(tmpdir(), 'devbak-fresh-'));
    created.push(pkg);
    mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(join(pkg, 'dist', 'bin.js'), '');
    // dist 를 먼저 쓰고 src 를 나중에 써서 src 가 더 새롭게 만든다.
    mkdirSync(join(pkg, 'src'), { recursive: true });
    writeFileSync(join(pkg, 'src', 'bin.ts'), '');

    expect(() => assertDistFresh(pkg)).toThrow(/pnpm build/);
  });

  it('bundled 레이아웃에서는 검사하지 않는다 — src가 없어도 죽지 않는다', () => {
    // 게시본의 실제 모양: dist 와 templates 만 있고 src 가 없다.
    // 이 방어가 없으면 readdirSync 가 ENOENT 로 던져 CLI 가 첫 줄에서 죽는다.
    const pkg = mkdtempSync(join(tmpdir(), 'devbak-bundled-'));
    created.push(pkg);
    mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(join(pkg, 'dist', 'bin.js'), '');
    mkdirSync(join(pkg, 'templates'), { recursive: true });

    expect(() => assertDistFresh(pkg)).not.toThrow();
  });
});
