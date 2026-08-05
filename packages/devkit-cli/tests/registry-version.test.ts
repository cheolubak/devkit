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
  const raws = await Promise.all(
    dirs
      .filter((d) => d.isDirectory())
      .map((d) => readFile(`${PACKAGES}${d.name}/package.json`, 'utf8').catch(() => null)),
  );
  const found = raws
    .filter((raw): raw is string => raw !== null)
    .map((raw) => JSON.parse(raw) as PackageJson)
    .filter((pkg) => pkg.private !== true);
  // 하나도 못 찾으면 아래 단언이 "검사할 것이 없으니 통과"로 끝난다.
  if (found.length === 0) {
    throw new Error(`게시 대상 패키지를 하나도 찾지 못했다: ${PACKAGES}`);
  }
  return found;
}

/**
 * 세 레시피가 registryDeps 로 선언하는 짧은 이름을 전부 모은다.
 *
 * compose 는 실행 단위가 아니라 컨테이너다. `children.steps` 로 따라 들어가야
 * monorepo 가 apps/web 에 합성한 next 레시피의 선언까지 잡힌다 — describe() 로
 * 얻는 평평한 detail 에는 중첩 단계의 kind 가 남지 않아 걸러낼 수 없다.
 */
function declaredShortNames(): Set<string> {
  const names = new Set<string>();
  const collect = (steps: Step[]): void => {
    for (const step of steps) {
      if (step.children !== undefined) {
        collect(step.children.steps);
        continue;
      }
      if (step.kind === 'registryDeps') {
        const detail = step.describe() as { packages?: string[] };
        for (const name of detail.packages ?? []) names.add(name);
      }
    }
  };
  collect(nestRecipe());
  collect(nextRecipe());
  collect(monorepoRecipe());
  return names;
}

describe('DEVKIT_VERSION_RANGE 와 실제 게시 버전', () => {
  it('레시피가 선언하는 패키지의 version 이 전부 범위를 만족한다', async () => {
    // 대상은 "게시되는 것 전부"가 아니라 "생성물이 ^0.1.0 으로 선언하는 것"이다.
    // devkit-cli 는 아무 레시피도 선언하지 않는 도구라 여기 해당하지 않는다 —
    // 예외 목록을 손으로 들지 않아도 자동으로 빠진다.
    //
    // 어긋나면 devbak 이 심는 범위가 실제 게시본을 못 가리키고, 생성물은
    // 에러 없이 옛 버전을 설치한다 — 조용한 실패다.
    const byName = new Map(
      (await publishedPackages()).map((p) => [(p.name ?? '').replace('@cheolubak/', ''), p]),
    );
    const declared = declaredShortNames();
    // 선언이 하나도 없으면 아래 루프가 0회 돌아 "검사할 것이 없으니 통과"가 된다.
    expect(declared.size).toBeGreaterThan(0);

    for (const name of declared) {
      const pkg = byName.get(name);
      expect(pkg, `레시피가 선언한 @cheolubak/${name} 가 워크스페이스에 없다`).toBeDefined();
      expect(
        satisfiesCaretZero(pkg?.version ?? '', DEVKIT_VERSION_RANGE),
        `${pkg?.name ?? name}@${pkg?.version ?? '(버전 없음)'} 이 ${DEVKIT_VERSION_RANGE} 를 벗어난다`,
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
