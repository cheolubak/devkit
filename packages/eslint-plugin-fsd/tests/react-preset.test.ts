import { describe, it, expect } from 'vitest';
import reactPreset from '../src/react';
import plugin from '../src/index';

describe('react 프리셋', () => {
  it('config 3개짜리 배열이다', () => {
    expect(Array.isArray(reactPreset)).toBe(true);
    expect(reactPreset).toHaveLength(3);
  });

  it('FSD config는 기존 recommended 객체를 그대로 재사용한다', () => {
    expect(reactPreset[0]).toBe(plugin.configs.recommended);
  });

  it('ignores는 FSD config에만 걸린다', () => {
    expect(reactPreset[0].ignores).toEqual(['app/**', 'pages/**']);
    expect(reactPreset[1].ignores).toBeUndefined();
    expect(reactPreset[2].ignores).toBeUndefined();
  });

  it('react 규칙은 jsx/tsx에만, hooks 규칙은 ts까지 적용한다', () => {
    expect(reactPreset[1].files).toEqual(['**/*.{jsx,tsx}']);
    expect(reactPreset[2].files).toEqual(['**/*.{js,jsx,ts,tsx}']);
  });

  it('react와 react-hooks 네임스페이스가 충돌 없이 등록된다', () => {
    expect(Object.keys(reactPreset[1].plugins ?? {})).toEqual(['react']);
    expect(Object.keys(reactPreset[2].plugins ?? {})).toEqual(['react-hooks']);
  });

  it('자동 런타임 가정으로 react-in-jsx-scope를 끈다', () => {
    expect(reactPreset[1].rules?.['react/react-in-jsx-scope']).toBe(0);
    expect(reactPreset[1].rules?.['react/jsx-uses-react']).toBe(0);
  });

  it('recommended의 실제 규칙은 살아 있다', () => {
    expect(reactPreset[1].rules?.['react/jsx-key']).toBe(2);
  });

  it('react 버전을 detect로 설정한다', () => {
    expect(reactPreset[1].settings?.react).toEqual({ version: 'detect' });
  });

  it('@next/next 규칙은 포함하지 않는다', () => {
    const allRules = reactPreset.flatMap((config) => Object.keys(config.rules ?? {}));
    expect(allRules.some((rule) => rule.startsWith('@next/next/'))).toBe(false);
  });
});
