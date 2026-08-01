import { describe, expect, it, vi } from 'vitest';
import { compose, run } from '../src/run.js';
import type { Ctx, Step } from '../src/types.js';

function fakeStep(label: string, spy: (ctx: Ctx) => void): Step {
  return {
    kind: 'makeDirs',
    label,
    describe: () => ({ label }),
    run: (ctx) => {
      spy(ctx);
      return Promise.resolve();
    },
  };
}

const baseCtx: Ctx = {
  targetDir: '/target',
  toolkitRoot: '/toolkit',
  name: 'fx',
  log: () => {},
};

describe('run', () => {
  it('단계를 선언 순서대로 실행한다', async () => {
    const order: string[] = [];
    await run(
      [fakeStep('a', () => order.push('a')), fakeStep('b', () => order.push('b'))],
      baseCtx,
    );
    expect(order).toEqual(['a', 'b']);
  });

  it('한 단계가 던지면 이후 단계를 실행하지 않는다', async () => {
    const later = vi.fn<() => void>();
    const failing: Step = {
      kind: 'removeFiles',
      label: 'boom',
      describe: () => ({}),
      run: () => {
        throw new Error('boom');
      },
    };
    await expect(run([failing, fakeStep('later', later)], baseCtx)).rejects.toThrow('boom');
    expect(later).not.toHaveBeenCalled();
  });

  it('에러 메시지에 레시피 단계 번호를 붙인다', async () => {
    const failing: Step = {
      kind: 'removeFiles',
      label: 'pnpm-workspace.yaml 삭제',
      describe: () => ({}),
      run: () => {
        throw new Error('없습니다');
      },
    };
    await expect(run([fakeStep('ok', () => {}), failing], baseCtx)).rejects.toThrow(/\[2\/2\]/);
  });
});

describe('compose', () => {
  it('자식 ctx로 하위 단계를 실행한다', async () => {
    let seen: Ctx | undefined;
    const child = fakeStep('child', (ctx) => {
      seen = ctx;
    });
    const step = compose('apps/web에 next 레시피 실행', [child], (ctx) => ({
      ...ctx,
      targetDir: `${ctx.targetDir}/apps/web`,
      name: 'web',
    }));

    await step.run(baseCtx);
    expect(seen?.targetDir).toBe('/target/apps/web');
    expect(seen?.name).toBe('web');
  });

  it('describe가 하위 단계까지 직렬화한다 — 스냅샷이 합성을 들여다볼 수 있다', () => {
    const step = compose('sub', [fakeStep('child', () => {})], (ctx) => ctx);
    expect(step.describe()).toEqual({ label: 'sub', steps: [{ label: 'child' }] });
  });
});
