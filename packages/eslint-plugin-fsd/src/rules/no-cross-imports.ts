import { createImportRule } from '../lib/create-rule';

export default createImportRule({
  meta: { docs: '같은 레이어의 형제 슬라이스 간 직접 import를 금지한다' },
  messages: {
    crossImport:
      '"{{ layer }}" 레이어의 슬라이스 "{{ fromSlice }}"는 형제 슬라이스 "{{ toSlice }}"를 직접 import할 수 없습니다.',
  },
  // 확장 지점: @x cross-import 예외는 여기서 to.slice가 허용 목록이면 통과시키도록 확장.
  check: ({ from, to }) => {
    if (
      from.layer === to.layer &&
      from.sliced &&
      from.slice != null &&
      to.slice != null &&
      from.slice !== to.slice
    ) {
      return {
        messageId: 'crossImport',
        data: { layer: from.layer, fromSlice: from.slice, toSlice: to.slice },
      };
    }
    return null;
  },
});
