import { describe, it, expect } from 'vitest';
import nextPreset from '../src/next';
import reactPreset from '../src/react';
import plugin from '../src/index';

describe('next 프리셋', () => {
  it('config 4개짜리 배열이다', () => {
    expect(Array.isArray(nextPreset)).toBe(true);
    expect(nextPreset).toHaveLength(4);
  });

  it('앞의 2개는 react 프리셋을 그대로 포함한다', () => {
    expect(nextPreset.slice(0, 2)).toEqual(reactPreset);
  });

  it('ignores는 여전히 FSD config에만 걸린다', () => {
    expect(nextPreset[0]).toBe(plugin.configs.recommended);
    for (const config of nextPreset.slice(1)) {
      expect(config.ignores).toBeUndefined();
    }
  });

  it('Next 규칙에는 파일 스코프를 걸지 않는다', () => {
    // app/·pages/에서 돌아야 하므로 files가 없어야 한다.
    expect(nextPreset[3].files).toBeUndefined();
  });

  it('jsx-a11y 규칙은 jsx/tsx로 좁힌다', () => {
    expect(nextPreset[2].files).toEqual(['**/*.{jsx,tsx}']);
  });

  it('세 플러그인 네임스페이스가 fsd와 충돌 없이 등록된다', () => {
    const keys = nextPreset.flatMap((config) => Object.keys(config.plugins ?? {}));
    expect(keys.sort()).toEqual(['@next/next', 'fsd', 'jsx-a11y', 'react-hooks']);
  });

  it('core-web-vitals 규칙을 포함하고 eslint-plugin-react 규칙은 없다', () => {
    expect(nextPreset[3].rules?.['@next/next/no-img-element']).toBeDefined();
    expect(nextPreset[3].rules?.['@next/next/no-sync-scripts']).toBeDefined();
    const allRules = nextPreset.flatMap((config) => Object.keys(config.rules ?? {}));
    expect(allRules.some((rule) => rule.startsWith('react/'))).toBe(false);
  });
});
