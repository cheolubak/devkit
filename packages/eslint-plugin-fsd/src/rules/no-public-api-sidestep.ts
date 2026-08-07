import { createImportRule } from '../lib/create-rule';

export default createImportRule({
  meta: { docs: '다른 슬라이스/세그먼트의 내부 경로 직접 import를 금지한다(Public API 강제)' },
  messages: {
    sidestep:
      '"{{ target }}"의 내부 경로를 직접 import했습니다. Public API(진입점)를 통해 접근하세요.',
  },
  check: ({ from, to }) => {
    // Public API 단위가 같으면 서로의 내부다. 이 단위는 레이어마다 다르므로
    // (슬라이스 / 세그먼트 / 레이어 전체) slice로 판정하면 안 된다 —
    // slice가 구조적으로 null인 app·shared에서 내부 판정이 통째로 무너져
    // `shared/ui/index.ts`가 `./Button`을 re-export하는 것마저 위반이 된다.
    const sameUnit = from.layer === to.layer && from.unit != null && from.unit === to.unit;
    if (sameUnit) return null;
    if (to.depth > 2) {
      // 메시지는 "무엇의 내부를 짚었는지"를 보여준다. unit이 레이어 전체인
      // 경우(app)에도 실제로 짚힌 하위 폴더를 그대로 이름한다.
      const target = to.slice ?? to.segment ?? to.layer;
      return { messageId: 'sidestep', data: { target: `${to.folderName}/${target}` } };
    }
    return null;
  },
});
