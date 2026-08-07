import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectVersionReport, sortWorkspaces } from '../src/version/collect.js';
import { isBrokenMarker } from '../src/version/types.js';
import type { WorkspaceReport } from '../src/version/types.js';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'devbak-version-'));
  created.push(dir);
  return dir;
}

function writeProject(dir: string, pkg: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
}

/** node_modules 에 설치된 패키지를 흉내낸다. */
function writeInstalled(base: string, name: string, version: string): void {
  const dir = join(base, 'node_modules', ...name.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }));
}

const NEST_PKG = {
  name: 'my-api',
  devkit: { type: 'nest', version: '0.1.0' },
  devDependencies: { '@cheolubak/tsconfig': '^0.1.0', typescript: '^5.6.0' },
};

describe('collectVersionReport', () => {
  it('CLI 버전을 semver 형태로 낸다', () => {
    // 구체적 값을 단언하지 않는다 — 실제 package.json 에서 읽으므로
    // 릴리스마다 바뀌고, 단언하면 릴리스가 테스트를 깨뜨린다.
    expect(collectVersionReport(sandbox()).cli).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('마커 · 선언 · 설치본을 모두 수집한다', () => {
    const dir = sandbox();
    writeProject(dir, NEST_PKG);
    writeInstalled(dir, '@cheolubak/tsconfig', '0.1.1');

    const report = collectVersionReport(dir);

    expect(report.workspaces).toHaveLength(1);
    expect(report.workspaces[0]).toMatchObject({
      relPath: '.',
      marker: { type: 'nest', version: '0.1.0' },
      packages: [{ name: '@cheolubak/tsconfig', declared: '^0.1.0', installed: '0.1.1' }],
    });
  });

  it('@cheolubak 스코프가 아닌 의존은 담지 않는다', () => {
    const dir = sandbox();
    writeProject(dir, NEST_PKG);

    const names = collectVersionReport(dir).workspaces[0].packages.map((pkg) => pkg.name);
    expect(names).toEqual(['@cheolubak/tsconfig']);
  });

  it('node_modules 가 없으면 installed 가 null 이다 — 죽지 않는다', () => {
    const dir = sandbox();
    writeProject(dir, NEST_PKG);

    expect(collectVersionReport(dir).workspaces[0].packages[0].installed).toBeNull();
  });

  it('앱에 없으면 저장소 루트의 node_modules 에서 찾는다', () => {
    const root = sandbox();
    writeProject(root, { name: 'root', devkit: { type: 'monorepo', version: '0.1.0' } });
    writeProject(join(root, 'apps', 'web'), {
      name: 'web',
      devkit: { type: 'next', version: '0.1.0' },
      devDependencies: { '@cheolubak/vitest-config': '^0.1.0' },
    });
    writeInstalled(root, '@cheolubak/vitest-config', '0.1.1');

    const web = collectVersionReport(root).workspaces.find((ws) => ws.relPath === 'apps/web');
    expect(web?.packages[0]?.installed).toBe('0.1.1');
  });

  it('모노레포의 루트와 apps/web 을 모두, 루트를 앞에 두고 수집한다', () => {
    const root = sandbox();
    writeProject(root, { name: 'root', devkit: { type: 'monorepo', version: '0.1.0' } });
    writeProject(join(root, 'apps', 'web'), {
      name: 'web',
      devkit: { type: 'next', version: '0.1.0' },
    });

    const report = collectVersionReport(root);

    expect(report.workspaces.map((ws) => ws.relPath)).toEqual(['.', 'apps/web']);
    expect(report.workspaces[1]?.marker).toMatchObject({ type: 'next' });
  });

  it('node_modules 안의 package.json 은 워크스페이스로 잡지 않는다', () => {
    const dir = sandbox();
    writeProject(dir, NEST_PKG);
    writeProject(join(dir, 'node_modules', 'sneaky'), {
      name: 'sneaky',
      devkit: { type: 'next', version: '9.9.9' },
    });

    expect(collectVersionReport(dir).workspaces.map((ws) => ws.relPath)).toEqual(['.']);
  });

  it('숨김 디렉토리를 훑지 않는다', () => {
    const dir = sandbox();
    writeProject(dir, NEST_PKG);
    writeProject(join(dir, '.cache', 'hidden'), {
      name: 'hidden',
      devkit: { type: 'next', version: '9.9.9' },
    });

    expect(collectVersionReport(dir).workspaces.map((ws) => ws.relPath)).toEqual(['.']);
  });

  it('마커가 없으면 워크스페이스가 비어 있다 — 던지지 않는다', () => {
    const dir = sandbox();
    writeProject(dir, { name: 'plain' });

    expect(collectVersionReport(dir).workspaces).toEqual([]);
  });

  it('마커가 깨졌으면 던지지 않고 broken 으로 담는다', () => {
    const dir = sandbox();
    writeProject(dir, { name: 'bad', devkit: { type: 'php', version: '0.1.0' } });

    const workspace = collectVersionReport(dir).workspaces[0];
    expect(workspace?.relPath).toBe('.');
    expect(workspace?.marker).toHaveProperty('broken');
    // readMarker(marker.ts)가 "알 수 없는 프로젝트 유형" 에러에서 실제로
    // 여러 줄 메시지를 던진다 — format.ts 가 이 값을 한 줄로 접어야 하는
    // 이유가 여기서 나온다(version-format.test.ts). marker.ts 의 메시지가
    // 바뀌면 이 단언이 먼저 깨져 두 파일이 만나는 지점을 고정한다.
    const marker = workspace?.marker;
    if (marker === undefined || !isBrokenMarker(marker)) {
      throw new Error('broken 마커를 기대했지만 아니었습니다.');
    }
    expect(marker.broken).toContain('\n');
  });

  it('깨진 JSON 을 만나도 나머지를 정상 수집한다', () => {
    const root = sandbox();
    writeProject(root, { name: 'root', devkit: { type: 'monorepo', version: '0.1.0' } });
    mkdirSync(join(root, 'apps', 'broken'), { recursive: true });
    writeFileSync(join(root, 'apps', 'broken', 'package.json'), '{ not json');

    expect(collectVersionReport(root).workspaces.map((ws) => ws.relPath)).toEqual(['.']);
  });

  it('깊이 3 을 넘는 곳은 훑지 않는다', () => {
    const root = sandbox();
    writeProject(root, { name: 'root', devkit: { type: 'monorepo', version: '0.1.0' } });
    writeProject(join(root, 'a', 'b', 'c', 'deep'), {
      name: 'deep',
      devkit: { type: 'next', version: '0.1.0' },
    });

    expect(collectVersionReport(root).workspaces.map((ws) => ws.relPath)).toEqual(['.']);
  });

  it('깊이 3 에 있는 마커는 포함한다 — 경계값', () => {
    // 깊이 4 케이스만으로는 MAX_DEPTH 가 0 이어도 통과한다. 경계인 3 을
    // 양쪽에서 고정해야 off-by-one 이 잡힌다.
    const root = sandbox();
    writeProject(root, { name: 'root', devkit: { type: 'monorepo', version: '0.1.0' } });
    writeProject(join(root, 'a', 'b', 'c'), {
      name: 'boundary',
      devkit: { type: 'next', version: '0.1.0' },
    });

    expect(collectVersionReport(root).workspaces.map((ws) => ws.relPath)).toEqual(['.', 'a/b/c']);
  });

  it('같은 깊이의 형제를 상대경로 순으로 낸다 — readdir 순서에 기대지 않는다', () => {
    // 통합 경로가 정렬된 결과를 낸다는 확인일 뿐, 정렬 자체의 방어는
    // sortWorkspaces 테스트가 한다 — readdir 순서에 기대는 이 경로로는
    // .sort() 를 지워도 통과할 수 있다(실측).
    const root = sandbox();
    writeProject(root, { name: 'root', devkit: { type: 'monorepo', version: '0.1.0' } });
    for (const name of ['zebra', 'alpha', 'middle']) {
      writeProject(join(root, 'apps', name), {
        name,
        devkit: { type: 'next', version: '0.1.0' },
      });
    }

    expect(collectVersionReport(root).workspaces.map((ws) => ws.relPath)).toEqual([
      '.',
      'apps/alpha',
      'apps/middle',
      'apps/zebra',
    ]);
  });

  it('존재하지 않는 경로를 만나면 던진다 — 오타와 "devkit 프로젝트 아님"을 구분한다', () => {
    const root = sandbox();
    const missing = join(root, 'nope');

    expect(() => collectVersionReport(missing)).toThrow(/읽을 수 없습니다/);
  });

  it('디렉토리가 아닌 경로를 만나면 던진다', () => {
    const root = sandbox();
    const file = join(root, 'not-a-dir');
    writeFileSync(file, 'plain file');

    expect(() => collectVersionReport(file)).toThrow(/읽을 수 없습니다/);
  });

  it('읽을 수 없는 하위 디렉토리를 만나도 나머지를 정상 수집한다 — 남의 디렉토리 하나 때문에 죽지 않는다', () => {
    const root = sandbox();
    writeProject(root, { name: 'root', devkit: { type: 'monorepo', version: '0.1.0' } });
    writeProject(join(root, 'apps', 'web'), {
      name: 'web',
      devkit: { type: 'next', version: '0.1.0' },
    });
    const locked = join(root, 'apps', 'locked');
    mkdirSync(locked, { recursive: true });
    // 실행 권한까지 뺏어 readdirSync 가 EACCES 로 던지게 만든다. rmSync 가
    // 정리할 수 있도록 afterEach 전에 반드시 되돌린다.
    chmodSync(locked, 0o000);

    try {
      expect(collectVersionReport(root).workspaces.map((ws) => ws.relPath)).toEqual([
        '.',
        'apps/web',
      ]);
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});

describe('sortWorkspaces', () => {
  it('루트를 맨 앞에 두고 나머지를 상대경로 순으로 낸다 — 입력 순서와 무관하게', () => {
    const make = (relPath: string): WorkspaceReport => ({
      relPath,
      marker: { type: 'next', version: '0.1.0' },
      packages: [],
    });
    // 일부러 뒤섞어 넣는다. 파일시스템 순회로는 이 순서를 강제할 수 없어
    // 정렬이 실제로 도는지 확인할 방법이 없다.
    const sorted = sortWorkspaces([
      make('apps/zebra'),
      make('apps/alpha'),
      make('.'),
      make('apps/middle'),
    ]);

    expect(sorted.map((ws) => ws.relPath)).toEqual([
      '.',
      'apps/alpha',
      'apps/middle',
      'apps/zebra',
    ]);
  });
});
