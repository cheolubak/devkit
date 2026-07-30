import { describe, it, expect } from 'vitest';
import reactPreset from '../src/react';
import plugin from '../src/index';

describe('react 프리셋', () => {
  it('config 2개짜리 배열이다', () => {
    expect(Array.isArray(reactPreset)).toBe(true);
    expect(reactPreset).toHaveLength(2);
  });

  it('FSD config는 기존 recommended 객체를 그대로 재사용한다', () => {
    expect(reactPreset[0]).toBe(plugin.configs.recommended);
  });

  it('ignores는 FSD config에만 걸린다', () => {
    expect(reactPreset[0].ignores).toEqual(['app/**', 'pages/**']);
    expect(reactPreset[1].ignores).toBeUndefined();
  });

  it('hooks 규칙은 JSX 없는 ts/js까지 적용한다', () => {
    expect(reactPreset[1].files).toEqual(['**/*.{js,jsx,ts,tsx}']);
  });

  it('react-hooks 네임스페이스로 등록된다', () => {
    expect(Object.keys(reactPreset[1].plugins ?? {})).toEqual(['react-hooks']);
  });

  it('rules-of-hooks가 켜져 있다', () => {
    expect(reactPreset[1].rules?.['react-hooks/rules-of-hooks']).toBeDefined();
  });

  it('eslint-plugin-react와 @next/next 규칙은 포함하지 않는다', () => {
    const allRules = reactPreset.flatMap((config) => Object.keys(config.rules ?? {}));
    expect(allRules.some((rule) => rule.startsWith('react/'))).toBe(false);
    expect(allRules.some((rule) => rule.startsWith('@next/next/'))).toBe(false);
  });
});
