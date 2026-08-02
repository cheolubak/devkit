import type { Ctx, Step } from './types.js';

/** 단계를 순서대로 실행한다. 실패하면 즉시 중단하고 위치를 알린다. */
export async function run(steps: Step[], ctx: Ctx): Promise<void> {
  for (const [index, step] of steps.entries()) {
    ctx.log(`[${index + 1}/${steps.length}] ${step.label}`);
    try {
      // oxlint-disable-next-line no-await-in-loop -- 단계는 반드시 순차 실행되어야 한다 (설계상 요구사항)
      await step.run(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[${index + 1}/${steps.length}] ${step.label}\n  ${message}`, { cause: error });
    }
  }
}

/** 하위 ctx에서 다른 레시피를 실행하는 단계. 모노레포가 next를 합성할 때 쓴다. */
export function compose(label: string, steps: Step[], mapCtx: (ctx: Ctx) => Ctx): Step {
  return {
    kind: 'compose',
    label,
    describe: () => ({ label, steps: steps.map((s) => s.describe()) }),
    children: { steps, mapCtx },
    run: async (ctx: Ctx) => {
      await run(steps, mapCtx(ctx));
    },
  };
}
