import { describe, it, expect } from 'vitest';
import config from '../src/index';

describe('eslint-config-nest', () => {
  it('flat config 배열을 기본 export한다', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('타입 인식을 켠다', () => {
    const withParserOptions = config.find(
      (entry) => entry.languageOptions?.parserOptions !== undefined,
    );
    expect(withParserOptions?.languageOptions?.parserOptions).toMatchObject({
      projectService: true,
    });
  });
});
