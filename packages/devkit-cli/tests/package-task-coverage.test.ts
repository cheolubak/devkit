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
        '건너뛰면 그 아래 패키지 전체가 태스크 커버리지 검사에서 빠진다.',
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

describe('패키지 태스크 커버리지', () => {
  it('모든 워크스페이스 패키지가 lint·test·typecheck 설정과 스크립트를 갖는다', async () => {
    // 루트 eslint.config.mjs는 packages/**를 무시하고(격리를 위해 필요하다),
    // 루트 vitest.config.ts·vitest.e2e.config.ts는 Task 2(vitest 분할)에서
    // 삭제됐다. 그 결과 `turbo run lint`·`turbo run test`·`turbo run typecheck`는
    // 각각 해당 스크립트가 **있는** 패키지만 실행한다. 새 패키지를 추가하면서
    // eslint.config.mjs·vitest.config.ts·세 스크립트 중 하나만 빠뜨려도 turbo는
    // 그 패키지를 조용히 건너뛰고 `pnpm lint`/`pnpm test`/`pnpm typecheck`는
    // 초록으로 통과한다.
    //
    // 셋의 무게는 다르다. lint가 빠지면 품질 손실이지만, test가 빠지면
    // **정확성 손실**이다 — 그 패키지에 테스트를 아무리 써 놓아도 0개가 돌고,
    // 개수를 세는 사람이 없으면 아무도 모른다(분할 전엔 루트 vitest.config.ts의
    // include: ['packages/*/tests/*.test.ts'] 하나가 새 패키지를 공짜로
    // 덮었다). typecheck는 이 분할에서 처음 생긴 검사라 빠져도 회귀는 아니지만,
    // 같은 사각지대를 새로 만드는 것은 같다.
    //
    // oxlint(`//#lint:ox`)는 루트에서 저장소 전체를 훑으므로 이 사각지대와
    // 무관하게 계속 덮는다.
    const packages = await findWorkspacePackages();

    // 스캔이 0건이면 아래 단언이 공허하게 통과한다.
    expect(packages.length).toBeGreaterThan(0);

    // expect()에 커스텀 메시지를 실으면 oxlint의 vitest/valid-expect가 toEqual과
    // 조합될 때 막으므로, 설명을 실패 배열의 각 항목에 싣는다(json-coverage.test.ts와
    // 같은 관용). toEqual 실패 시 vitest가 이 배열을 diff에 그대로 찍는다.
    const perPackage = await Promise.all(
      packages.map(async (dir) => {
        const [hasEslintConfig, hasVitestConfig, manifest] = await Promise.all([
          exists(`${dir}/eslint.config.mjs`),
          exists(`${dir}/vitest.config.ts`),
          readFile(`${REPO_ROOT}/${dir}/package.json`, 'utf8'),
        ]);
        const scripts = (JSON.parse(manifest) as { scripts?: Record<string, string> }).scripts;
        // 빈 문자열·공백만인 스크립트는 "있다"고 치지 않는다 — turbo는 값이
        // 비어 있어도 스크립트 키가 있으면 태스크를 스케줄하지만, 그 실행은
        // 아무것도 검사하지 않으면서 성공(exit 0)한다.
        const hasScript = (name: string): boolean => Boolean(scripts?.[name]?.trim());

        const problems: string[] = [];
        if (!hasEslintConfig) {
          problems.push(
            `${dir}/eslint.config.mjs 가 없다 — 루트 설정이 packages/**를 무시하므로 ` +
              '이 패키지는 타입 인식 ESLint를 전혀 받지 못한다. ' +
              "`import { baseConfig } from '../../eslint.base.mjs'; " +
              'export default baseConfig(import.meta.dirname);` 두 줄을 넣어라.',
          );
        }
        if (!hasScript('lint')) {
          problems.push(
            `${dir}/package.json 에 lint 스크립트가 없다 — turbo run lint가 이 패키지를 ` +
              '건너뛰므로 설정이 있어도 실행되지 않는다. `"lint": "eslint ."`를 넣어라.',
          );
        }
        if (!hasVitestConfig) {
          problems.push(
            `${dir}/vitest.config.ts 가 없다 — 루트 vitest.config.ts는 이미 삭제됐으므로 ` +
              'turbo run test가 이 패키지를 건너뛴다. tests/ 아래 파일을 아무리 써도 ' +
              '실행되지 않고(테스트 0개), pnpm test는 그 상태로 초록불이다. ' +
              "`import { defineConfig } from 'vitest/config'; export default defineConfig({ " +
              "test: { include: ['tests/*.test.ts'] } });`를 넣어라.",
          );
        }
        if (!hasScript('test')) {
          problems.push(
            `${dir}/package.json 에 test 스크립트가 없다 — turbo run test가 이 패키지를 ` +
              '건너뛰므로 vitest.config.ts가 있어도 실행되지 않는다. ' +
              '`"test": "vitest run --passWithNoTests"`를 넣어라.',
          );
        }
        if (!hasScript('typecheck')) {
          problems.push(
            `${dir}/package.json 에 typecheck 스크립트가 없다 — turbo run typecheck가 이 ` +
              '패키지를 건너뛴다. 패키지 루트에 tsconfig.json이 있으면 ' +
              '`"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tests/tsconfig.json"`을, ' +
              '없으면(예: JSON만 배포하는 패키지) `"typecheck": "tsc --noEmit -p tests/tsconfig.json"`을 넣어라.',
          );
        }
        return problems;
      }),
    );

    expect(perPackage.flat()).toEqual([]);
  });
});
