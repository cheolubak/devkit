import { describe, it, expect } from 'vitest';
import { resolveImport } from '../src/lib/resolve-import';

const importer = '/proj/src/features/auth/ui/Form.tsx';
const aliases = ['@', '~'];

describe('resolveImport', () => {
  it('상대경로를 importer 기준으로 해석', () => {
    expect(resolveImport('./Button', importer, aliases)).toBe(
      '/proj/src/features/auth/ui/Button',
    );
    expect(resolveImport('../model/store', importer, aliases)).toBe(
      '/proj/src/features/auth/model/store',
    );
  });
  it('@ alias를 FSD 루트(src) 기준으로 해석', () => {
    expect(resolveImport('@/entities/user', importer, aliases)).toBe(
      '/proj/src/entities/user',
    );
    expect(resolveImport('~/shared/ui', importer, aliases)).toBe(
      '/proj/src/shared/ui',
    );
  });
  it('외부 패키지는 null', () => {
    expect(resolveImport('react', importer, aliases)).toBeNull();
    expect(resolveImport('@scope/pkg', importer, aliases)).toBeNull();
  });
});
