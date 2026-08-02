import type { Ctx, Step } from '../types.js';

export interface FlatStep {
  step: Step;
  ctx: Ctx;
}

/**
 * compose 를 펼쳐 실제 실행 단위만 순서대로 낸다.
 *
 * 각 단계에 **자기가 적용될 ctx** 를 붙여 내보내는 것이 요점이다. monorepo 는
 * next 레시피를 apps/web 에 합성하므로, 그 안의 오버레이는 루트가 아니라
 * apps/web 을 대상으로 한다. 여기서 ctx 를 함께 들고 나오지 않으면 update 가
 * 그 사실을 잃고 앱 설정을 루트에 쏟는다.
 *
 * compose 단계 자체는 결과에 남기지 않는다 — 실행 단위가 아니라 컨테이너다.
 */
export function flattenSteps(steps: Step[], ctx: Ctx): FlatStep[] {
  const flat: FlatStep[] = [];

  for (const step of steps) {
    if (step.children === undefined) {
      flat.push({ step, ctx });
      continue;
    }
    flat.push(...flattenSteps(step.children.steps, step.children.mapCtx(ctx)));
  }

  return flat;
}
