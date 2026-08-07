import { createImportRule } from '../lib/create-rule';
import { publicApiDepth } from '../lib/layers';

export default createImportRule({
  meta: { docs: '다른 슬라이스/세그먼트의 내부 경로 직접 import를 금지한다(Public API 강제)' },
  messages: {
    sidestep:
      '내부 경로를 직접 import했습니다. 진입점 "{{ target }}"을(를) 통해 접근하세요.',
  },
  check: ({ from, to }) => {
    // Public API 단위가 같으면 서로의 내부다. 이 단위는 레이어마다 다르므로
    // (슬라이스 / 세그먼트 / 레이어 전체) slice로 판정하면 안 된다 —
    // slice가 구조적으로 null인 app·shared에서 내부 판정이 통째로 무너져
    // `shared/ui/index.ts`가 `./Button`을 re-export하는 것마저 위반이 된다.
    const sameUnit = from.layer === to.layer && from.unit != null && from.unit === to.unit;
    if (sameUnit) return null;
    if (to.depth > publicApiDepth(to.unitKind)) {
      // 메시지가 이름하는 것은 "짚힌 대상"이 아니라 **대신 써야 할 진입점**이다.
      // 그래서 단위 종류마다 publicApiDepth 만큼의 앞부분을 그대로 낸다 —
      // 슬라이스 3(`entities/user/ui`), 세그먼트 2(`shared/lib`), 레이어 1(`app`).
      // 여기가 publicApiDepth 와 어긋나면 규칙이 통과시키지도 않을 경로를
      // 해법이라고 안내하게 된다.
      const prefix =
        to.unitKind === 'slice'
          ? [to.folderName, to.slice, to.segment]
          : to.unitKind === 'segment'
            ? [to.folderName, to.segment]
            : [to.folderName];
      const target = prefix.filter((part): part is string => part !== null).join('/');
      return { messageId: 'sidestep', data: { target } };
    }
    return null;
  },
});
