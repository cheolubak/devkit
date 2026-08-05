import { describe, expect, it } from 'vitest';
import { registryDeps, DEVKIT_VERSION_RANGE } from '../src/ops/registry-deps.js';
import type { Ctx } from '../src/types.js';

const CTX: Ctx = {
  targetDir: '/a/b/demo',
  toolkitRoot: '/a/b/eslint',
  name: 'demo',
  log: () => {},
};

describe('registryDeps', () => {
  it('버전 범위로 devDependencies 패치를 낸다 — 경로에 의존하지 않는다', async () => {
    const changes = await registryDeps(['tsconfig', 'prettier-config']).plan!(CTX);

    expect(changes).toEqual([
      {
        kind: 'json',
        file: 'package.json',
        patch: {
          devDependencies: {
            '@cheolubak/tsconfig': DEVKIT_VERSION_RANGE,
            '@cheolubak/prettier-config': DEVKIT_VERSION_RANGE,
          },
        },
      },
    ]);
  });

  it('대상 깊이가 달라도 같은 값을 낸다 — link: 시절의 깊이 계산이 사라졌다', async () => {
    const deep: Ctx = { ...CTX, targetDir: '/a/b/mono/apps/web' };

    const shallow = await registryDeps(['tsconfig']).plan!(CTX);
    const nested = await registryDeps(['tsconfig']).plan!(deep);

    expect(nested).toEqual(shallow);
  });

  it('file 옵션을 그대로 전달한다', async () => {
    const changes = await registryDeps(['tsconfig'], { file: 'apps/web/package.json' }).plan!(CTX);
    expect(changes[0]).toMatchObject({ kind: 'json', file: 'apps/web/package.json' });
  });

  it('describe()가 파일과 패키지 목록을 낸다 — 스냅샷의 근거다', () => {
    expect(registryDeps(['tsconfig']).describe()).toEqual({
      file: 'package.json',
      packages: ['tsconfig'],
    });
  });
});
