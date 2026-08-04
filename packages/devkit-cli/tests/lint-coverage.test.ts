import { access, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * pnpm-workspace.yaml의 `packages:` 목록에서 glob 패턴을 뽑는다.
 *
 * yaml 파서는 이 저장소의 의존성이 아니라서 최소 파싱을 한다. 대신
 * **모르는 형태를 만나면 조용히 빈 배열을 주지 않고 던진다** — 패턴을 하나도
 * 못 읽으면 아래 테스트가 "검사할 패키지가 없으니 통과"로 끝나 방어가
 * 방어하려던 것을 놓친다.
 */
async function readWorkspaceGlobs(): Promise<string[]> {
  const text = await readFile(`${REPO_ROOT}/pnpm-workspace.yaml`, 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^packages:\s*$/.test(l));
  if (start === -1) {
    throw new Error(
      'pnpm-workspace.yaml에서 `packages:` 키를 찾지 못했다. 파일 형식이 바뀌었다면 ' +
        '이 파서를 함께 고쳐라 — 못 읽은 채로 두면 아래 커버리지 방어가 공허하게 통과한다.',
    );
  }

  const globs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // 들여쓰기가 끝나면 `packages:` 블록도 끝이다
    const match = /^\s+-\s*['"]?([^'"#]+?)['"]?\s*$/.exec(line);
    if (match) globs.push(match[1]);
  }

  if (globs.length === 0) {
    throw new Error('pnpm-workspace.yaml의 `packages:` 아래에서 glob을 하나도 읽지 못했다.');
  }
  return globs;
}

/** `<dir>/*` 형태의 glob을 실제 디렉토리 스캔으로 펼친다. */
async function expandGlob(glob: string): Promise<string[]> {
  const suffix = '/*';
  if (!glob.endsWith(suffix)) {
    throw new Error(
      `이 테스트는 '<dir>/*' 형태의 워크스페이스 glob만 펼칠 수 있다: '${glob}'. ` +
        '패턴을 추가했다면 expandGlob을 함께 확장하라 — 처리 못 하는 패턴을 조용히 ' +
        '건너뛰면 그 아래 패키지 전체가 린트 커버리지 검사에서 빠진다.',
    );
  }
  const parent = glob.slice(0, -suffix.length);
  const entries = await readdir(`${REPO_ROOT}/${parent}`, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => `${parent}/${e.name}`);
}

/** 워크스페이스 패키지(= package.json을 가진 디렉토리)의 저장소 상대 경로 목록. */
async function findWorkspacePackages(): Promise<string[]> {
  const globs = await readWorkspaceGlobs();
  const dirs = (await Promise.all(globs.map(expandGlob))).flat();
  const checked = await Promise.all(
    dirs.map(async (dir) => {
      try {
        await access(`${REPO_ROOT}/${dir}/package.json`);
        return dir;
      } catch {
        return null; // package.json이 없으면 워크스페이스 패키지가 아니다
      }
    }),
  );
  return checked.filter((d): d is string => d !== null).sort();
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(`${REPO_ROOT}/${path}`);
    return true;
  } catch {
    return false;
  }
};

describe('ESLint 커버리지', () => {
  it('모든 워크스페이스 패키지가 eslint.config.mjs와 lint 스크립트를 갖는다', async () => {
    // 루트 eslint.config.mjs가 packages/**를 무시하므로(격리를 위해 필요하다)
    // 루트 실행은 패키지를 **절대** 보지 않고, `turbo run lint`는 lint 스크립트가
    // **있는** 패키지만 실행한다. 따라서 새 패키지를 추가하면서 둘 중 하나만
    // 빠뜨려도 그 패키지는 타입 인식 ESLint를 한 줄도 받지 않은 채
    // `pnpm lint`가 초록으로 통과한다 — 조용한 실패다.
    //
    // oxlint는 //#lint:ox가 루트에서 전 저장소를 훑으므로 계속 덮는다.
    // 즉 이 방어가 없을 때 잃는 것은 **타입 인식 규칙 전부**다.
    const packages = await findWorkspacePackages();

    // 스캔이 0건이면 아래 단언이 공허하게 통과한다.
    expect(packages.length).toBeGreaterThan(0);

    // expect()에 커스텀 메시지를 실으면 oxlint의 vitest/valid-expect가 toEqual과
    // 조합될 때 막으므로, 설명을 실패 배열의 각 항목에 싣는다(json-coverage.test.ts와
    // 같은 관용). toEqual 실패 시 vitest가 이 배열을 diff에 그대로 찍는다.
    const perPackage = await Promise.all(
      packages.map(async (dir) => {
        const [hasConfig, manifest] = await Promise.all([
          exists(`${dir}/eslint.config.mjs`),
          readFile(`${REPO_ROOT}/${dir}/package.json`, 'utf8'),
        ]);
        const scripts = (JSON.parse(manifest) as { scripts?: Record<string, string> }).scripts;

        const problems: string[] = [];
        if (!hasConfig) {
          problems.push(
            `${dir}/eslint.config.mjs 가 없다 — 루트 설정이 packages/**를 무시하므로 ` +
              '이 패키지는 타입 인식 ESLint를 전혀 받지 못한다. ' +
              "`import { baseConfig } from '../../eslint.base.mjs'; " +
              'export default baseConfig(import.meta.dirname);` 두 줄을 넣어라.',
          );
        }
        if (!scripts?.lint) {
          problems.push(
            `${dir}/package.json 에 lint 스크립트가 없다 — turbo run lint가 이 패키지를 ` +
              '건너뛰므로 설정이 있어도 실행되지 않는다. `"lint": "eslint ."`를 넣어라.',
          );
        }
        return problems;
      }),
    );

    expect(perPackage.flat()).toEqual([]);
  });
});
