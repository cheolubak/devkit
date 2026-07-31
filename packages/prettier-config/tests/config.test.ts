import { describe, expect, it } from 'vitest';
import config from '../index.json';

describe('@devbak/prettier-config', () => {
  it('세 소비자 프로젝트의 .prettierrc와 동일한 값을 갖는다', () => {
    expect(config).toEqual({
      singleQuote: true,
      trailingComma: 'all',
    });
  });

  it('경로에 의존하는 옵션을 담지 않는다', () => {
    // 공유 설정이 소비자의 파일 구조를 가정하면 안 된다.
    expect(config).not.toHaveProperty('filepath');
    expect(config).not.toHaveProperty('overrides');
  });
});
