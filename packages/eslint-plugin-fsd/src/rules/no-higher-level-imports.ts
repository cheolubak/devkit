import { createImportRule } from '../lib/create-rule';

export default createImportRule({
  meta: { docs: '자신보다 상위 레이어를 import하지 못하게 한다' },
  messages: {
    higherLevel:
      '"{{ fromLayer }}" 레이어는 상위 레이어 "{{ toLayer }}"을(를) import할 수 없습니다.',
  },
  check: ({ from, to }) =>
    to.rank < from.rank
      ? { messageId: 'higherLevel', data: { fromLayer: from.folderName, toLayer: to.folderName } }
      : null,
});
