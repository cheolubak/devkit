import { describe, it, expect } from 'vitest';
import plugin from '../src/index';

describe('plugin 진입점', () => {
  it('3개 rule을 노출한다', () => {
    expect(Object.keys(plugin.rules).sort()).toEqual([
      'no-cross-imports',
      'no-higher-level-imports',
      'no-public-api-sidestep',
    ]);
  });
  it('recommended 프리셋이 fsd/ 규칙을 error로 켠다', () => {
    const rec = plugin.configs.recommended;
    expect(rec.plugins.fsd).toBe(plugin);
    expect(rec.rules['fsd/no-higher-level-imports']).toBe('error');
    expect(rec.rules['fsd/no-cross-imports']).toBe('error');
    expect(rec.rules['fsd/no-public-api-sidestep']).toBe('error');
  });
  it('recommended 프리셋이 루트 Next.js 라우팅 폴더를 ignore한다', () => {
    expect(plugin.configs.recommended.ignores).toEqual(['app/**', 'pages/**']);
  });
});
