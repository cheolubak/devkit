import { describe, expect, it, vi } from 'vitest';
import { compose, run } from '../src/run.js';
import type { Ctx, Step } from '../src/types.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fakeStep(label: string, spy: (ctx: Ctx) => void): Step {
  return {
    kind: 'makeDirs',
    label,
    describe: () => ({ label }),
    // 목이 async여야 spy 호출이 "완료된 Promise"로 감싸진다. run()이 잘못 병렬화되어도
    // (예: Promise.all(steps.map(s => s.run(ctx)))) .map()이 멈추지 않고 끝까지
    // 호출되므로, 아래 실패 케이스들이 이 동작 차이에 기대어 회귀를 잡는다.
    // eslint-disable-next-line @typescript-eslint/require-await -- 위 사유로 async가 필요, await는 불필요
    run: async (ctx) => {
      spy(ctx);
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
  it('단계를 선언 순서대로 실행한다 — 병렬 실행이면 순서가 뒤집힌다', async () => {
    const order: string[] = [];
    const slow: Step = {
      kind: 'makeDirs',
      label: 'a',
      describe: () => ({}),
      run: async () => {
        await delay(20);
        order.push('a');
      },
    };
    const fast: Step = {
      kind: 'makeDirs',
      label: 'b',
      describe: () => ({}),
      run: async () => {
        await delay(1);
        order.push('b');
      },
    };
    // a가 b보다 오래 걸린다. 순차 실행(run이 a를 끝까지 기다린 뒤 b를 시작)이면 ['a','b'],
    // Promise.all로 병렬 시작하면 b가 먼저 끝나 ['b','a']가 된다.
    await run([slow, fast], baseCtx);
    expect(order).toEqual(['a', 'b']);
  });

  it('한 단계가 던지면 이후 단계를 실행하지 않는다', async () => {
    const later = vi.fn<() => void>();
    const failing: Step = {
      kind: 'removeFiles',
      label: 'boom',
      describe: () => ({}),
      // eslint-disable-next-line @typescript-eslint/require-await -- fakeStep과 동일 사유: async throw여야 거부된 Promise가 되어 Promise.all 병렬화 회귀를 잡는다
      run: async () => {
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
      // eslint-disable-next-line @typescript-eslint/require-await -- 위와 동일 사유
      run: async () => {
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
