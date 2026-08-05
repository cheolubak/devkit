import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEVKIT_VERSION_RANGE } from '../src/ops/registry-deps.js';
import { nestRecipe } from '../src/recipes/nest.js';
import { nextRecipe } from '../src/recipes/next.js';
import { monorepoRecipe } from '../src/recipes/monorepo.js';
import type { Step } from '../src/types.js';

const PACKAGES = fileURLToPath(new URL('../../', import.meta.url));

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
}

/**
 * `^0.MINOR.PATCH` 를 만족하는지 본다.
 *
 * semver 패키지를 새로 들이지 않으려고 직접 판정한다. 대신 **아는 형태가
 * 아니면 던진다** — 범위를 `^1.2.3` 이나 `>=0.1.0` 같은 것으로 바꾼 사람이
 * "판정할 줄 모르니 통과"를 받으면 이 관문이 조용히 사라진다.
 *
 * 0.x 에서 캐럿은 마이너를 고정한다: `^0.1.0` === `>=0.1.0 <0.2.0`.
 */
function satisfiesCaretZero(version: string, range: string): boolean {
  const r = /^\^0\.(\d+)\.(\d+)$/.exec(range);
  if (r === null) {
    throw new Error(
      `DEVKIT_VERSION_RANGE 가 '^0.MINOR.PATCH' 형태가 아니다: ${range}. ` +
        '이 테스트의 판정 로직을 새 형태에 맞게 고쳐라 — 그냥 통과시키면 안 된다.',
    );
  }
  const v = /^0\.(\d+)\.(\d+)$/.exec(version);
  if (v === null) return false;
  const [, rMinor, rPatch] = r;
  const [, vMinor, vPatch] = v;
  if (vMinor !== rMinor) return false;
  return Number(vPatch) >= Number(rPatch);
}

async function publishedPackages(): Promise<PackageJson[]> {
  const dirs = await readdir(PACKAGES, { withFileTypes: true });
  const found: PackageJson[] = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const raw = await readFile(`${PACKAGES}${dir.name}/package.json`, 'utf8').catch(() => null);
    if (raw === null) continue;
    const pkg = JSON.parse(raw) as PackageJson;
    if (pkg.private === true) continue;
    found.push(pkg);
  }
  // 하나도 못 찾으면 아래 단언이 "검사할 것이 없으니 통과"로 끝난다.
  if (found.length === 0) {
    throw new Error(`게시 대상 패키지를 하나도 찾지 못했다: ${PACKAGES}`);
  }
  return found;
}

/** 세 레시피가 registryDeps 로 선언하는 짧은 이름을 전부 모은다. */
function declaredShortNames(): Set<string> {
  const names = new Set<string>();
  const collect = (steps: Step[]): void => {
    for (const step of steps) {
      if (step.kind === 'registryDeps') {
        const detail = step.describe() as { packages?: string[] };
        for (const name of detail.packages ?? []) names.add(name);
      }
      if (step.kind === 'compose') {
        const detail = step.describe() as { steps?: unknown[] };
        // compose 의 describe 는 중첩 단계를 평평한 detail 로만 준다.
        // 짧은 이름은 label 에 `@cheolubak/<name>` 으로 남으므로 거기서 뽑는다.
        for (const nested of detail.steps ?? []) {
          const label = (nested as { label?: string }).label ?? '';
          for (const m of label.matchAll(/@cheolubak\/([\w-]+)/g)) names.add(m[1]);
        }
      }
    }
  };
  collect(nestRecipe());
  collect(nextRecipe());
  collect(monorepoRecipe());
  return names;
}

describe('DEVKIT_VERSION_RANGE 와 실제 게시 버전', () => {
  it('게시 대상 패키지의 version 이 전부 범위를 만족한다', async () => {
    // 어긋나면 devbak 이 심는 범위가 실제 게시본을 못 가리키고, 생성물은
    // 에러 없이 옛 버전을 설치한다 — 조용한 실패다. 마이너를 올려 게시하면
    // DEVKIT_VERSION_RANGE 도 함께 올려야 한다.
    for (const pkg of await publishedPackages()) {
      expect(
        satisfiesCaretZero(pkg.version ?? '', DEVKIT_VERSION_RANGE),
        `${pkg.name ?? '(이름 없음)'}@${pkg.version ?? '(버전 없음)'} 이 ${DEVKIT_VERSION_RANGE} 를 벗어난다`,
      ).toBe(true);
    }
  });

  it('레시피가 선언하는 이름이 전부 실재하는 게시 패키지다', async () => {
    // 오타를 내면 지금은 생성물의 pnpm install 이 404 로 죽을 때까지 아무도
    // 모른다. e2e 는 3분 걸리고 CI 에서만 돈다.
    const real = new Set(
      (await publishedPackages()).map((p) => (p.name ?? '').replace('@cheolubak/', '')),
    );
    for (const name of declaredShortNames()) {
      expect(real.has(name), `레시피가 선언한 @cheolubak/${name} 가 워크스페이스에 없다`).toBe(
        true,
      );
    }
  });
});
