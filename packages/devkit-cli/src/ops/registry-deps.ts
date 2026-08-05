import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ctx, Step } from '../types.js';
import { applyPatch, type JsonObject } from './merge-json.js';

/**
 * 소비자가 선언할 버전 범위.
 *
 * 게시 대상 6개(devkit-cli 는 private 이라 아무도 이 범위로 선언하지 않는다)를
 * 락스텝으로 굴리는 것이 **기본값**이다 — 서로 import 하지 않아 따로 굴릴 이유가
 * 없다(설계 2.1-4). 다만 규칙은 아니다: 개별 패키지가 패치를 앞서 갈 수 있고,
 * 실제로 vitest-config 는 타입 선언 누락을 고치느라 0.1.1 로 먼저 나갔다.
 * 그래도 캐럿 범위 하나로 충분한 이유가 여기 있다 — 0.x 에서 `^0.1.0` 은
 * `>=0.1.0 <0.2.0` 이라 패치 선행을 그대로 흡수한다. 마이너가 올라가는 순간
 * 이 상수도 함께 올려야 하며, 그것을 registry-version.test.ts 가 강제한다.
 */
export const DEVKIT_VERSION_RANGE = '^0.1.0';

export interface RegistryDepsOptions {
  /** targetDir 기준 상대 경로. 기본값 'package.json' */
  file?: string;
}

/**
 * @cheolubak/* 를 레지스트리 버전 범위로 선언한다.
 *
 * link: 시절에는 소비자에서 툴킷까지의 **상대경로를 계산**해야 했다 —
 * 모노레포 루트와 apps/web 의 깊이가 다르고 pnpm catalog: 가 link: 를
 * 거부했기 때문이다. 레지스트리 설치에는 그 계산이 통째로 필요 없다:
 * 대상이 어디에 있든 값이 같다.
 */
export function registryDeps(packages: string[], options: RegistryDepsOptions = {}): Step {
  const file = options.file ?? 'package.json';

  const patch = (): JsonObject => {
    const devDependencies: JsonObject = {};
    for (const pkg of packages) {
      devDependencies[`@cheolubak/${pkg}`] = DEVKIT_VERSION_RANGE;
    }
    return { devDependencies };
  };

  return {
    kind: 'registryDeps',
    label: `의존 선언 — ${packages.map((p) => `@cheolubak/${p}`).join(', ')}`,
    describe: () => ({ file, packages }),
    plan: () => Promise.resolve([{ kind: 'json', file, patch: patch() }]),
    run: async (ctx: Ctx) => {
      const path = join(ctx.targetDir, file);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonObject;
      const merged = applyPatch(parsed, patch());
      await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
      for (const pkg of packages) ctx.log(`  의존: @cheolubak/${pkg}@${DEVKIT_VERSION_RANGE}`);
    },
  };
}
