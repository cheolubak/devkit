# devbak version 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `devbak version [path]` 로 설치된 CLI 버전 · 프로젝트 devkit 마커 · 설치된 `@cheolubak/*` 설정 패키지 버전을 한 번에 볼 수 있게 한다.

**Architecture:** 새 버전 계산 로직은 없다. 이미 있는 `devkitVersion()`·`readMarker()`·`packageRoot()` 를 조합한다. `src/version/` 에 데이터 수집(`collect.ts`, fs 접근)과 출력 포맷(`format.ts`, 순수 함수)을 나눠 두고, `bin.ts` 가 둘을 이어 stdout 에 쓴다. 워크스페이스는 `pnpm-workspace.yaml` 을 파싱하는 대신 `devkit` 마커를 찾아 스캔한다.

**Tech Stack:** TypeScript (ESM, `node:` 내장 모듈만) · vitest · tsup · pnpm

설계 문서: `docs/superpowers/specs/2026-08-07-devbak-version-design.md`

## Global Constraints

- **런타임 의존성 0개를 유지한다.** 이 패키지의 `devDependencies` 는 `@types/node` 하나뿐이고 `dependencies` 는 없다. 어떤 태스크도 패키지를 추가하지 않는다. `node:` 내장 모듈만 쓴다.
- **`fs.glob` 을 쓰지 않는다.** `engines` 가 `^20.19.0 || ^22.13.0 || >=24` 인데 Node 20 에 없다.
- **스코프는 `@cheolubak/` 다.** `@devbak/` 가 아니다. `devbak` 은 bin 이름일 뿐이다.
- **`devbak version` 의 종료 코드는 항상 0 이다.** devkit 프로젝트가 아닌 것도, 마커가 깨진 것도 정당한 답이지 실패가 아니다.
- **스냅샷 테스트(`toMatchSnapshot`)를 쓰지 않는다.** 버전 문자열이 박힌 스냅샷은 릴리스마다 깨지고, 그러면 사람이 내용을 안 보고 `-u` 로 갱신해 단언이 죽는다(커밋 `36a2042` 가 그 수정이다).
- **`report.cli` 의 구체적 값을 단언하지 않는다.** 실제 `package.json` 에서 읽으므로 릴리스마다 바뀐다. 형태(`/^\d+\.\d+\.\d+/`)만 본다.
- **테스트 픽스처는 `mkdtempSync(join(tmpdir(), 'devbak-version-'))`** 를 쓰고 `afterEach` 에서 지운다. 이 패키지의 기존 관습이다(`tests/update-flow.test.ts:22`).
- **주석과 커밋 메시지는 한글, 커밋은 imperative mood.** 저장소 관습이다.
- 검증 명령은 저장소 루트에서 실행한다: `pnpm test` · `pnpm typecheck` · `pnpm lint`.
- 단일 테스트 파일 실행: `pnpm --filter @cheolubak/devkit-cli exec vitest run tests/<파일>.test.ts`

## File Structure

| 파일 | 책임 |
| --- | --- |
| `packages/devkit-cli/src/version/types.ts` (신설) | 데이터 모델. fs·포맷 양쪽이 의존하지만 어느 쪽도 import 하지 않는다 |
| `packages/devkit-cli/src/version/format.ts` (신설) | `VersionReport` → 출력 문자열. **fs 접근 없음**, 표시 폭 기준 정렬 |
| `packages/devkit-cli/src/version/collect.ts` (신설) | 파일시스템을 읽어 `VersionReport` 를 만든다 |
| `packages/devkit-cli/src/bin.ts` (수정) | `version` 서브커맨드 · `--version` 플래그 · `USAGE` · `runVersionCommand` |
| `packages/devkit-cli/tests/version-format.test.ts` (신설) | 순수 함수 테스트. 픽스처 디렉토리 불필요 |
| `packages/devkit-cli/tests/version-collect.test.ts` (신설) | 임시 디렉토리 픽스처로 수집 검증 |
| `packages/devkit-cli/tests/bin.test.ts` (수정) | 명령 배선 검증 |
| `packages/devkit-cli/README.md` (수정) | 사용법 문서 |

`types.ts` 를 따로 두는 이유는 `format.ts` 테스트가 `collect.ts`(fs 의존)를 로드하지 않게 하기 위해서다. 설계의 "포맷은 순수 함수" 원칙을 import 그래프로 강제한다.

---

### Task 1: 데이터 모델과 출력 포맷 (순수 함수)

수집 없이 포맷만 먼저 만든다. 픽스처 데이터로 열 정렬을 확정해 두면, Task 2 에서 수집이 붙을 때 출력 문제와 수집 문제가 섞이지 않는다.

**Files:**
- Create: `packages/devkit-cli/src/version/types.ts`
- Create: `packages/devkit-cli/src/version/format.ts`
- Test: `packages/devkit-cli/tests/version-format.test.ts`

**Interfaces:**
- Consumes: `DevkitMarker` (`src/lib/marker.ts` 의 기존 export — `{ type: ProjectType; version: string }`)
- Produces:
  - `interface DevkitPackage { name: string; declared: string; installed: string | null }`
  - `interface BrokenMarker { broken: string }`
  - `function isBrokenMarker(marker: DevkitMarker | BrokenMarker): marker is BrokenMarker`
  - `interface WorkspaceReport { relPath: string; marker: DevkitMarker | BrokenMarker; packages: DevkitPackage[] }`
  - `interface VersionReport { cli: string; workspaces: WorkspaceReport[] }`
  - `function displayWidth(text: string): number`
  - `function padTo(text: string, width: number): string`
  - `function formatVersionReport(report: VersionReport): string` — 끝에 개행 하나를 포함한 완성된 출력

- [ ] **Step 1: 타입 파일을 만든다**

`packages/devkit-cli/src/version/types.ts`:

```ts
import type { DevkitMarker } from '../lib/marker.js';

/** 한 워크스페이스에서 발견한 devkit 설정 패키지 하나. */
export interface DevkitPackage {
  /** 완전한 패키지 이름. 예: '@cheolubak/tsconfig' */
  name: string;
  /** package.json 에 적힌 범위. 예: '^0.1.0' */
  declared: string;
  /** node_modules 에서 읽은 실제 버전. 찾지 못하면 null. */
  installed: string | null;
}

/**
 * 마커가 있는데 형태가 틀린 경우.
 *
 * 던지지 않고 값으로 담는 이유는 진단 명령이기 때문이다 — 한 워크스페이스의
 * 마커가 깨졌다고 나머지 워크스페이스 정보까지 못 보게 되면 거꾸로다.
 */
export interface BrokenMarker {
  broken: string;
}

export function isBrokenMarker(marker: DevkitMarker | BrokenMarker): marker is BrokenMarker {
  return 'broken' in marker;
}

export interface WorkspaceReport {
  /** 스캔 시작 지점 기준 상대경로. 시작 지점 자신은 '.' 이고 구분자는 항상 '/'. */
  relPath: string;
  marker: DevkitMarker | BrokenMarker;
  packages: DevkitPackage[];
}

export interface VersionReport {
  /** 설치된 CLI 자신의 버전. */
  cli: string;
  /** 상대경로 오름차순('.' 이 항상 맨 앞). 빈 배열이면 devkit 프로젝트가 아니다. */
  workspaces: WorkspaceReport[];
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/version-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { displayWidth, formatVersionReport, padTo } from '../src/version/format.js';
import type { VersionReport } from '../src/version/types.js';

/** 어떤 토큰이 그 줄에서 시작하는 표시 폭 위치. 열 정렬 단언에 쓴다. */
function startOf(line: string, token: string): number {
  const index = line.indexOf(token);
  if (index < 0) throw new Error(`'${token}' 가 줄에 없습니다: ${line}`);
  return displayWidth(line.slice(0, index));
}

function lineWith(output: string, token: string): string {
  const line = output.split('\n').find((candidate) => candidate.includes(token));
  if (line === undefined) throw new Error(`'${token}' 가 출력에 없습니다:\n${output}`);
  return line;
}

const REPORT: VersionReport = {
  cli: '0.2.0',
  workspaces: [
    {
      relPath: '.',
      marker: { type: 'monorepo', version: '0.1.0' },
      packages: [
        { name: '@cheolubak/eslint-plugin-fsd', declared: '^0.1.0', installed: '0.1.1' },
        { name: '@cheolubak/prettier-config', declared: '^0.1.0', installed: null },
      ],
    },
  ],
};

describe('displayWidth', () => {
  it('ASCII 는 1칸, 한글은 2칸으로 센다', () => {
    expect(displayWidth('devbak')).toBe(6);
    expect(displayWidth('패키지')).toBe(6);
    expect(displayWidth('a패b')).toBe(4);
    expect(displayWidth('')).toBe(0);
  });
});

describe('padTo', () => {
  it('표시 폭 기준으로 채운다 — 코드포인트 기준이 아니다', () => {
    expect(padTo('패키지', 10)).toBe('패키지    ');
    expect(displayWidth(padTo('패키지', 10))).toBe(10);
    expect(displayWidth(padTo('devbak', 10))).toBe(10);
  });

  it('이미 폭을 넘으면 자르지 않고 그대로 낸다', () => {
    expect(padTo('@cheolubak/eslint-plugin-fsd', 3)).toBe('@cheolubak/eslint-plugin-fsd');
  });
});

describe('formatVersionReport', () => {
  it('워크스페이스가 없으면 CLI 한 줄만 낸다', () => {
    const output = formatVersionReport({ cli: '0.2.0', workspaces: [] });
    expect(output).toBe('devbak  0.2.0\n');
  });

  it('CLI · 마커 · 패키지 세 층을 모두 낸다', () => {
    const output = formatVersionReport(REPORT);
    expect(lineWith(output, 'devbak')).toContain('0.2.0');
    expect(lineWith(output, '(monorepo)')).toContain('0.1.0');
    expect(lineWith(output, '@cheolubak/eslint-plugin-fsd')).toContain('0.1.1');
  });

  it('설치본이 없으면 미설치로 낸다', () => {
    expect(lineWith(formatVersionReport(REPORT), '@cheolubak/prettier-config')).toContain('미설치');
  });

  it('한글 헤더가 있어도 열이 표시 폭 기준으로 맞는다', () => {
    // padEnd 로 구현하면 실패한다 — '패키지' 는 코드포인트 3개지만 6칸이라
    // 헤더 행의 다음 열만 오른쪽으로 밀린다.
    const output = formatVersionReport(REPORT);
    const header = lineWith(output, '선언');
    const row = lineWith(output, '@cheolubak/eslint-plugin-fsd');

    expect(startOf(header, '선언')).toBe(startOf(row, '^0.1.0'));
    expect(startOf(header, '설치본')).toBe(startOf(row, '0.1.1'));
  });

  it('값에 한글이 섞여도 그 행이 다른 행과 어긋나지 않는다', () => {
    const output = formatVersionReport(REPORT);
    const installed = lineWith(output, '0.1.1');
    const notInstalled = lineWith(output, '미설치');

    expect(startOf(notInstalled, '미설치')).toBe(startOf(installed, '0.1.1'));
  });

  it('여러 워크스페이스의 열이 서로 어긋나지 않는다', () => {
    const output = formatVersionReport({
      cli: '0.2.0',
      workspaces: [
        REPORT.workspaces[0]!,
        {
          relPath: 'apps/web',
          marker: { type: 'next', version: '0.1.0' },
          packages: [{ name: '@cheolubak/vitest-config', declared: '^0.1.0', installed: '0.1.1' }],
        },
      ],
    });

    expect(startOf(lineWith(output, '@cheolubak/vitest-config'), '^0.1.0')).toBe(
      startOf(lineWith(output, '@cheolubak/eslint-plugin-fsd'), '^0.1.0'),
    );
  });

  it('마커가 깨진 워크스페이스를 표시하고 나머지 행을 계속 낸다', () => {
    const output = formatVersionReport({
      cli: '0.2.0',
      workspaces: [
        { relPath: '.', marker: { broken: 'devkit 마커가 객체가 아닙니다.' }, packages: [] },
        REPORT.workspaces[0]!,
      ],
    });

    expect(output).toContain('마커 손상');
    expect(output).toContain('devkit 마커가 객체가 아닙니다.');
    expect(output).toContain('@cheolubak/eslint-plugin-fsd');
  });

  it('패키지가 없는 워크스페이스는 표 머리를 내지 않는다', () => {
    const output = formatVersionReport({
      cli: '0.2.0',
      workspaces: [{ relPath: '.', marker: { type: 'nest', version: '0.1.0' }, packages: [] }],
    });

    expect(output).not.toContain('선언');
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli exec vitest run tests/version-format.test.ts`
Expected: FAIL — `Failed to resolve import "../src/version/format.js"`

- [ ] **Step 4: 포맷 구현을 쓴다**

`packages/devkit-cli/src/version/format.ts`:

```ts
import { isBrokenMarker, type VersionReport, type WorkspaceReport } from './types.js';

const CLI_LABEL = 'devbak';
const HEADER_NAME = '패키지';
const HEADER_DECLARED = '선언';
const HEADER_INSTALLED = '설치본';
const NOT_INSTALLED = '미설치';

/** 열 사이 최소 간격. */
const GAP = 2;

/**
 * 동아시아 전각 문자를 2칸으로 세는 표시 폭.
 *
 * padEnd 는 코드포인트를 세지만 터미널은 표시 폭으로 그린다 —
 * '패키지'.padEnd(30) 은 코드포인트 30개지만 화면에서는 33칸이라
 * 그 행의 다음 열만 3칸 밀린다.
 *
 * 전체 유니코드 East Asian Width 표를 옮겨오지 않는다. 이 리포트에 나올 수
 * 있는 것은 한글과 CJK 기호뿐이고, 이모지·결합문자까지 다루는 범용 폭
 * 계산기를 만드는 것은 이 명령의 일이 아니다.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += isFullWidth(char.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // 한글 자모
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK 부수 ~ 이(Yi)
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0xf900 && code <= 0xfaff) || // CJK 호환 한자
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 호환 형태
    (code >= 0xff00 && code <= 0xff60) || // 전각 형태
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** displayWidth 기준으로 오른쪽을 공백으로 채운다. 넘치면 자르지 않는다. */
export function padTo(text: string, width: number): string {
  const gap = width - displayWidth(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}

function indent(text: string): string {
  return `  ${text}`;
}

function workspaceLabel(workspace: WorkspaceReport): string {
  return isBrokenMarker(workspace.marker)
    ? workspace.relPath
    : `${workspace.relPath} (${workspace.marker.type})`;
}

function workspaceValue(workspace: WorkspaceReport): string {
  return isBrokenMarker(workspace.marker)
    ? `마커 손상 — ${workspace.marker.broken}`
    : workspace.marker.version;
}

export function formatVersionReport(report: VersionReport): string {
  // 1열 폭을 워크스페이스마다 따로 재면 섹션끼리 열이 어긋나 한 화면에서
  // 계단처럼 보인다. 모든 행의 후보를 먼저 모아 한 번에 정한다.
  const firstColumn: string[] = [CLI_LABEL];
  const secondColumn: string[] = [];

  for (const workspace of report.workspaces) {
    firstColumn.push(workspaceLabel(workspace));
    if (workspace.packages.length === 0) continue;
    firstColumn.push(indent(HEADER_NAME));
    secondColumn.push(HEADER_DECLARED);
    for (const pkg of workspace.packages) {
      firstColumn.push(indent(pkg.name));
      secondColumn.push(pkg.declared);
    }
  }

  const width1 = Math.max(...firstColumn.map(displayWidth)) + GAP;
  const width2 = Math.max(0, ...secondColumn.map(displayWidth)) + GAP;

  const lines = [padTo(CLI_LABEL, width1) + report.cli];

  for (const workspace of report.workspaces) {
    lines.push('');
    lines.push(padTo(workspaceLabel(workspace), width1) + workspaceValue(workspace));
    if (workspace.packages.length === 0) continue;
    lines.push(
      padTo(indent(HEADER_NAME), width1) + padTo(HEADER_DECLARED, width2) + HEADER_INSTALLED,
    );
    for (const pkg of workspace.packages) {
      lines.push(
        padTo(indent(pkg.name), width1) +
          padTo(pkg.declared, width2) +
          (pkg.installed ?? NOT_INSTALLED),
      );
    }
  }

  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli exec vitest run tests/version-format.test.ts`
Expected: PASS — 11개 테스트 전부

- [ ] **Step 6: 정렬 테스트가 진짜 방어하는지 실증한다**

`format.ts` 의 `padTo` 를 잠시 `return text.padEnd(width)` 로 바꾸고 같은 명령을 돌린다.

Expected: "한글 헤더가 있어도 열이 표시 폭 기준으로 맞는다" 와 "값에 한글이 섞여도…" 가 FAIL.

확인한 뒤 **원래 구현으로 되돌린다.** 되돌린 뒤 다시 돌려 PASS 를 확인한다. 이 단계를 건너뛰면 정렬 테스트가 실제로는 아무것도 막지 못하는 채로 통과할 수 있다.

- [ ] **Step 7: 타입체크와 린트를 돌린다**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과. 실패하면 고친 뒤 다음으로 간다.

- [ ] **Step 8: 커밋**

```bash
git add packages/devkit-cli/src/version/types.ts packages/devkit-cli/src/version/format.ts packages/devkit-cli/tests/version-format.test.ts
git commit -m "feat: 버전 리포트 데이터 모델과 출력 포맷을 더한다

열 정렬은 padEnd 가 아니라 표시 폭 기준으로 한다 — padEnd 는 코드포인트를
세지만 터미널은 전각 문자를 2칸으로 그려 한글 헤더가 있는 행만 밀린다."
```

---

### Task 2: 파일시스템 수집

**Files:**
- Create: `packages/devkit-cli/src/version/collect.ts`
- Test: `packages/devkit-cli/tests/version-collect.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `DevkitPackage`·`VersionReport`·`WorkspaceReport`·`BrokenMarker` (`./types.js`) / 기존 `devkitVersion()` (`../lib/version.js`) / 기존 `readMarker()`·`MissingMarkerError`·`InvalidMarkerError` (`../lib/marker.js`)
- Produces: `function collectVersionReport(targetDir: string): VersionReport`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/version-collect.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectVersionReport } from '../src/version/collect.js';

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

    const names = collectVersionReport(dir).workspaces[0]!.packages.map((pkg) => pkg.name);
    expect(names).toEqual(['@cheolubak/tsconfig']);
  });

  it('node_modules 가 없으면 installed 가 null 이다 — 죽지 않는다', () => {
    const dir = sandbox();
    writeProject(dir, NEST_PKG);

    expect(collectVersionReport(dir).workspaces[0]!.packages[0]!.installed).toBeNull();
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
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli exec vitest run tests/version-collect.test.ts`
Expected: FAIL — `Failed to resolve import "../src/version/collect.js"`

- [ ] **Step 3: 수집 구현을 쓴다**

`packages/devkit-cli/src/version/collect.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { InvalidMarkerError, MissingMarkerError, readMarker } from '../lib/marker.js';
import { devkitVersion } from '../lib/version.js';
import type { BrokenMarker, DevkitPackage, VersionReport, WorkspaceReport } from './types.js';

const SCOPE = '@cheolubak/';

/**
 * 스캔 최대 깊이. 대상 디렉토리 자신이 0 이므로 `apps` 가 1, `apps/web` 이 2 다.
 *
 * pnpm-workspace.yaml 의 packages: glob 을 해석하지 않는 이유는 의존성이다 —
 * 이 패키지는 런타임 의존성이 0개라 YAML 파서를 넣으면 그 성질이 깨지고,
 * 직접 파싱하면 glob 엔진까지 만들어야 한다. fs.glob 은 engines 에 있는
 * Node 20 에 없다. 마커 스캔은 의존성 0으로 같은 답을 내고, 덤으로
 * 워크스페이스에 등록되지 않았지만 devkit 이 관리하는 디렉토리도 잡는다.
 */
const MAX_DEPTH = 3;

export function collectVersionReport(targetDir: string): VersionReport {
  const workspaces: WorkspaceReport[] = [];
  scan(targetDir, targetDir, 0, workspaces);

  // readdir 순서는 파일시스템마다 다르다. 고정하지 않으면 출력이 흔들리고
  // 테스트가 환경 의존적이 된다. 루트('.')는 항상 맨 앞이다.
  workspaces.sort((a, b) => {
    if (a.relPath === '.') return -1;
    if (b.relPath === '.') return 1;
    return a.relPath.localeCompare(b.relPath);
  });

  return { cli: devkitVersion(), workspaces };
}

function scan(root: string, dir: string, depth: number, out: WorkspaceReport[]): void {
  const workspace = readWorkspace(root, dir);
  if (workspace !== null) out.push(workspace);

  if (depth >= MAX_DEPTH) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // node_modules 안에는 마커를 가진 남의 package.json 이 있을 수 있고,
    // 숨김 디렉토리는 캐시·도구 상태라 프로젝트가 아니다.
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    scan(root, join(dir, entry.name), depth + 1, out);
  }
}

function readWorkspace(root: string, dir: string): WorkspaceReport | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    // 읽을 수 없는 package.json 은 마커 유무를 판단할 근거가 없다. 스캔
    // 도중 만난 남의 파일 하나 때문에 진단 명령이 죽으면 안 되므로 건너뛴다.
    return null;
  }

  let marker: WorkspaceReport['marker'];
  try {
    marker = readMarker(parsed);
  } catch (error) {
    // 마커가 아예 없는 것은 정상이다 — 모노레포의 도구 패키지 등.
    if (error instanceof MissingMarkerError) return null;
    if (!(error instanceof InvalidMarkerError)) throw error;
    marker = { broken: error.message } satisfies BrokenMarker;
  }

  return { relPath: toRelPath(root, dir), marker, packages: collectPackages(root, dir, parsed) };
}

function toRelPath(root: string, dir: string): string {
  const rel = relative(root, dir);
  // 구분자를 '/' 로 고정한다. 윈도우에서 'apps\web' 이 나오면 출력과
  // 테스트가 플랫폼마다 갈린다.
  return rel === '' ? '.' : rel.split(sep).join('/');
}

function collectPackages(root: string, dir: string, parsed: unknown): DevkitPackage[] {
  const declared = new Map<string, string>();

  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = (parsed as Record<string, unknown>)[field];
    if (typeof deps !== 'object' || deps === null || Array.isArray(deps)) continue;
    for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
      if (name.startsWith(SCOPE) && typeof range === 'string') declared.set(name, range);
    }
  }

  return [...declared.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, range]) => ({
      name,
      declared: range,
      // pnpm 워크스페이스는 공용 의존을 루트에 두므로 앱 디렉토리에는
      // 심링크조차 없을 수 있다. 자기 자리를 먼저 보고 루트로 폴백한다.
      installed: readInstalled(dir, name) ?? readInstalled(root, name),
    }));
}

function readInstalled(base: string, name: string): string | null {
  const pkgPath = join(base, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli exec vitest run tests/version-collect.test.ts`
Expected: PASS — 12개 테스트 전부

- [ ] **Step 5: 타입체크와 린트를 돌린다**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과

- [ ] **Step 6: 커밋**

```bash
git add packages/devkit-cli/src/version/collect.ts packages/devkit-cli/tests/version-collect.test.ts
git commit -m "feat: devkit 마커 스캔으로 워크스페이스 버전을 수집한다

pnpm-workspace.yaml 을 파싱하지 않는다 — 런타임 의존성 0개를 지켜야 하고
fs.glob 은 engines 에 있는 Node 20 에 없다. 깊이 3까지 마커를 찾는 쪽이
같은 답을 내면서 의존성을 늘리지 않는다."
```

---

### Task 3: CLI 배선과 문서

**Files:**
- Modify: `packages/devkit-cli/src/bin.ts` (`USAGE` 73-76행 · `parseArgs` 옵션 89-101행 · `main` 분기 106-133행 · 새 `runVersionCommand`)
- Modify: `packages/devkit-cli/tests/bin.test.ts`
- Modify: `packages/devkit-cli/README.md`
- Modify: `work-log.md`

**Interfaces:**
- Consumes: Task 2 의 `collectVersionReport(targetDir)` (`./version/collect.js`) / Task 1 의 `formatVersionReport(report)` (`./version/format.js`) / 기존 `devkitVersion()` (`./lib/version.js`)
- Produces: `devbak version [path]` 서브커맨드와 `devbak --version` / `devbak -v` 플래그

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/devkit-cli/tests/bin.test.ts` 의 마지막에 아래 describe 블록을 덧붙인다. 파일 위쪽 import 는 이미 `mkdtempSync`·`mkdirSync`·`writeFileSync`·`rmSync`·`tmpdir`·`join`·`vi`·`main` 을 모두 갖고 있으므로 **import 를 바꾸지 않는다**. 픽스처 정리용 `created` 배열도 이미 있다.

```ts
describe('version', () => {
  /** stdout 을 가로채 main 을 돌리고 쓰인 것을 이어 붙여 낸다. */
  async function capture(argv: string[], cwd?: string): Promise<string> {
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      await main(argv, cwd === undefined ? {} : { cwd });
    } finally {
      write.mockRestore();
    }
    return written.join('');
  }

  function project(pkg: Record<string, unknown>): string {
    const dir = mkdtempSync(join(tmpdir(), 'devbak-version-'));
    created.push(dir);
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    return dir;
  }

  it('--version 은 버전 문자열 한 줄만 낸다', async () => {
    // 리포트 형식을 스크립트가 파싱하게 두면 형식을 영영 바꿀 수 없다.
    // 플래그가 값 하나만 내는 안정된 계약을 맡는다.
    const output = await capture(['--version']);
    expect(output).toMatch(/^\d+\.\d+\.\d+\S*\n$/);
  });

  it('-v 도 같게 동작한다', async () => {
    expect(await capture(['-v'])).toBe(await capture(['--version']));
  });

  it('마커가 있으면 CLI · 마커 · 패키지를 낸다', async () => {
    const dir = project({
      name: 'my-api',
      devkit: { type: 'nest', version: '0.1.0' },
      devDependencies: { '@cheolubak/tsconfig': '^0.1.0' },
    });

    const output = await capture(['version'], dir);

    expect(output).toContain('devbak');
    expect(output).toContain('(nest)');
    expect(output).toContain('@cheolubak/tsconfig');
    expect(output).toContain('미설치');
  });

  it('devkit 프로젝트가 아니면 CLI 한 줄만 내고 던지지 않는다', async () => {
    const dir = project({ name: 'plain' });

    const output = await capture(['version'], dir);

    expect(output.trimEnd().split('\n')).toHaveLength(1);
    expect(output).toContain('devbak');
  });

  it('경로 인자를 받는다', async () => {
    const root = mkdtempSync(join(tmpdir(), 'devbak-version-'));
    created.push(root);
    const app = join(root, 'apps', 'web');
    mkdirSync(app, { recursive: true });
    writeFileSync(
      join(app, 'package.json'),
      `${JSON.stringify({ name: 'web', devkit: { type: 'next', version: '0.1.0' } })}\n`,
    );

    expect(await capture(['version', 'apps/web'], root)).toContain('(next)');
  });

  it('사용법에 version 이 들어 있다', async () => {
    expect(await capture(['--help'])).toContain('pnpm devbak version [path]');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli exec vitest run tests/bin.test.ts`
Expected: FAIL — `--version` 은 `parseArgs` 옵션 테이블에 없어 `Unknown option '--version'` 으로, `version` 서브커맨드는 `USAGE` 를 던져 실패한다.

- [ ] **Step 3: import 를 더한다**

`packages/devkit-cli/src/bin.ts` 상단 import 블록(7-14행 부근)에 세 줄을 더한다. 기존 import 는 그대로 둔다.

```ts
import { devkitVersion } from './lib/version.js';
import { collectVersionReport } from './version/collect.js';
import { formatVersionReport } from './version/format.js';
```

- [ ] **Step 4: `USAGE` 에 version 을 더한다**

`packages/devkit-cli/src/bin.ts` 73-76행을 아래로 바꾼다.

```ts
const USAGE =
  '사용법:\n' +
  '  pnpm devbak create <name> --type <nest|next|monorepo> [--no-verify]\n' +
  '  pnpm devbak update [path] [--only <categories>] [--type <t>] [--dry-run] [--yes] [--force]\n' +
  '  pnpm devbak version [path]';
```

- [ ] **Step 5: `parseArgs` 옵션에 version 을 더한다**

`packages/devkit-cli/src/bin.ts` 의 `options` 객체에서 `help` 줄 **앞**에 한 줄을 더한다.

```ts
      version: { type: 'boolean', default: false, short: 'v' },
      help: { type: 'boolean', default: false },
```

`parseArgs` 는 strict 가 기본이라 테이블에 없는 옵션은 던진다. 그래서 플래그를 받으려면 반드시 여기에 있어야 한다.

- [ ] **Step 6: `main` 에 분기를 더한다**

`packages/devkit-cli/src/bin.ts` 의 `--help` 처리(106-109행) **바로 뒤**, `const [command, ...rest] = positionals;` 앞에 넣는다.

```ts
  // --version 은 값 하나만 내는 안정된 계약이다. 리포트 형식을 스크립트가
  // 파싱하게 두면 형식을 영영 바꿀 수 없어, 사람이 읽는 출력과 기계가 읽는
  // 출력을 처음부터 갈라 둔다.
  if (values.version === true) {
    process.stdout.write(`${devkitVersion()}\n`);
    return;
  }
```

이어서 `const [command, ...rest] = positionals;` **바로 뒤**, `if (command !== 'create' && ...)` 앞에 넣는다.

```ts
  // --help 와 같이 assertDistFresh 앞에 둔다. "내가 지금 뭘 쓰고 있나"를
  // 묻는 명령이 빌드 상태에 막히는 것은 정확히 거꾸로다. 버전 값 자체는
  // package.json 에서 직접 읽으므로 dist 신선도와 무관하게 정확하다.
  // 툴킷 저장소도 필요 없으므로 findToolkitRoot 도 부르지 않는다.
  if (command === 'version') {
    runVersionCommand(rest[0], options.cwd ?? process.cwd());
    return;
  }
```

- [ ] **Step 7: `runVersionCommand` 를 더한다**

`packages/devkit-cli/src/bin.ts` 의 `runUpdateCommand` 함수 **뒤**, 파일 끝의 `isDirectRun` 블록 앞에 넣는다.

```ts
/**
 * 진단 명령이므로 종료 코드는 항상 0 이다 — devkit 프로젝트가 아닌 것도,
 * 마커가 깨진 것도 정당한 답이지 실패가 아니다.
 */
function runVersionCommand(path: string | undefined, baseDir: string): void {
  const targetDir = resolve(baseDir, path ?? '.');
  process.stdout.write(formatVersionReport(collectVersionReport(targetDir)));
}
```

- [ ] **Step 8: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @cheolubak/devkit-cli exec vitest run tests/bin.test.ts`
Expected: PASS — 기존 테스트 포함 전부

- [ ] **Step 9: 빌드하고 실제로 돌려 본다**

```bash
pnpm build
node packages/devkit-cli/dist/bin.js --version
node packages/devkit-cli/dist/bin.js version packages/devkit-cli
node packages/devkit-cli/dist/bin.js version
```

Expected: 첫 명령은 버전 한 줄. 둘째는 `devkit` 마커가 없으므로 `devbak` 한 줄. 셋째는 저장소 루트에 마커가 없으므로 역시 한 줄. **세 명령 모두 종료 코드 0** 이어야 한다 (`echo $?` 로 확인).

빌드 산출물에서 도는지 반드시 확인한다 — `devkitVersion()` 은 `packageRoot()` 로 위로 걸어 올라가는데, 이 경로가 소스와 번들에서 다르다(그래서 `src/lib/version.ts` 에 그 주석이 길게 붙어 있다).

- [ ] **Step 10: 전체 검증을 돌린다**

Run: `pnpm build && pnpm test && pnpm typecheck && pnpm lint`
Expected: 전부 통과. 테스트 개수가 Task 1·2 에서 더한 만큼 늘었는지 확인한다.

`pnpm lint` 는 단락 평가라 앞 단계가 실패하면 뒤가 안 돈다. ESLint 만 따로 보려면 `pnpm lint:es`.

- [ ] **Step 11: 커밋**

```bash
git add packages/devkit-cli/src/bin.ts packages/devkit-cli/tests/bin.test.ts
git commit -m "feat: devbak version 명령과 --version 플래그를 배선한다

--help 와 같이 assertDistFresh 앞에 둔다 — 현재 상태를 묻는 명령이 빌드
상태에 막히면 거꾸로다. 플래그는 값 하나만 내는 안정된 계약을 맡아
리포트 형식이 스크립트 계약이 되는 것을 막는다."
```

- [ ] **Step 12: README 에 사용법을 더한다**

`packages/devkit-cli/README.md` 의 `## 사용법` 코드 블록(40-41행 부근)에 두 줄을 더한다.

```
pnpm devbak version [path]                         # 버전 확인
pnpm devbak --version                              # CLI 버전만 한 줄로
```

이어서 `## devbak update — 기존 프로젝트에 표준 재적용` 섹션(151행) **앞**에 새 섹션을 넣는다.

````markdown
## `devbak version` — 지금 무엇을 쓰고 있는지 본다

```
pnpm devbak version              # 실행한 위치(cwd) 기준
pnpm devbak version ../my-api    # 경로를 주면 그곳 기준
pnpm devbak --version            # CLI 버전만 한 줄로
```

세 층을 한 번에 낸다 — 설치된 CLI 자신, 프로젝트의 devkit 마커, 그리고
선언된 `@cheolubak/*` 의 실제 설치 버전.

```
$ pnpm devbak version
devbak                          0.2.0

. (monorepo)                    0.1.0
  패키지                         선언      설치본
  @cheolubak/eslint-plugin-fsd   ^0.1.0    0.1.1
  @cheolubak/prettier-config     ^0.1.0    0.1.1

apps/web (next)                 0.1.0
  패키지                         선언      설치본
  @cheolubak/eslint-plugin-fsd   ^0.1.0    0.1.1
  @cheolubak/vitest-config       ^0.1.0    미설치
```

**선언과 설치본을 둘 다 내는 이유**: `package.json` 에 심기는 값은 구체적
버전이 아니라 고정 캐럿 범위(`^0.1.0`)라, 선언만 보면 게시 대상이 전부
똑같아 보인다. 실제로 무엇이 깔렸는지는 `node_modules` 를 봐야 안다.

**모노레포는 마커가 있는 하위 워크스페이스까지 함께 낸다.** 루트에
`monorepo` 마커, `apps/web` 에 `next` 마커가 따로 들어가기 때문이다.

`devbak version` 은 **실패하지 않는다** — devkit 프로젝트가 아니면 CLI 한
줄만 내고 종료 코드 0 으로 끝난다. `pnpm build` 를 하지 않아 `dist` 가
낡았어도 막히지 않는다. 최신 버전이 나왔는지는 묻지 않으므로
(`pnpm outdated` 가 답한다) 네트워크를 타지 않는다.
````

- [ ] **Step 13: 작업 기록을 남긴다**

`work-log.md` 의 `## 2026-08-07` 섹션 맨 위에 항목을 더한다. 형식은 같은 파일의 기존 항목을 그대로 따른다 — **변경 파일** · **내용** · **검증** · **커밋** 네 줄. 실제로 돌린 검증 명령의 **결과 숫자**(테스트 개수 등)를 적는다.

- [ ] **Step 14: 커밋**

```bash
git add packages/devkit-cli/README.md work-log.md
git commit -m "docs: devbak version 사용법을 문서화한다"
```

---

## 완료 확인

설계 10절의 완료 기준을 하나씩 확인한다.

- [ ] `devbak version` 이 devkit 프로젝트에서 CLI·마커·패키지 3층을 모두 낸다 — Task 3 Step 9
- [ ] devkit 프로젝트가 아닌 곳에서 CLI 한 줄만 내고 종료 코드 0 으로 끝난다 — Task 3 Step 9
- [ ] 모노레포 루트에서 실행하면 루트와 `apps/web` 이 모두 나온다 — Task 2 Step 4
- [ ] `node_modules` 가 없어도 죽지 않고 전부 `미설치` 로 낸다 — Task 2 Step 4
- [ ] 마커가 깨진 워크스페이스가 있어도 나머지를 정상 출력한다 — Task 1 Step 5 · Task 2 Step 4
- [ ] `devbak --version` 이 버전 문자열 한 줄만 낸다 — Task 3 Step 8
- [ ] 한글 헤더가 있어도 열이 표시 폭 기준으로 정렬된다 — Task 1 Step 6 (실증 포함)
- [ ] `pnpm test`·`pnpm lint`·`pnpm typecheck` 가 모두 통과한다 — Task 3 Step 10
- [ ] 런타임 의존성이 0개로 유지된다 — `packages/devkit-cli/package.json` 에 `dependencies` 가 없고 `devDependencies` 가 `@types/node` 하나뿐인지 확인

## 범위 밖 (설계 9절)

- 원격 레지스트리 조회 — `pnpm outdated` 가 답한다
- 마커 버전과 CLI 버전을 비교해 `update` 를 권하는 문구 — 임계값의 근거가 없다
- `pnpm-workspace.yaml` 해석 — Task 2 Step 3 의 `MAX_DEPTH` 주석 참조
