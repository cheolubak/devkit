import { createImportRule } from '../lib/create-rule';

export default createImportRule({
  meta: { docs: '다른 슬라이스/세그먼트의 내부 경로 직접 import를 금지한다(Public API 강제)' },
  messages: {
    sidestep:
      '"{{ target }}"의 내부 경로를 직접 import했습니다. Public API(진입점)를 통해 접근하세요.',
  },
  check: ({ from, to }) => {
    const sameSlice =
      from.layer === to.layer && from.slice != null && from.slice === to.slice;
    if (sameSlice) return null;
    if (to.depth > 2) {
      const target = to.slice ?? to.segment ?? to.layer;
      return { messageId: 'sidestep', data: { target: `${to.folderName}/${target}` } };
    }
    return null;
  },
});
