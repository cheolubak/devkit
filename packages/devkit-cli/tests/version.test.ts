import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { devkitVersion } from '../src/lib/version.js';

describe('devkitVersion', () => {
  it('devkit-cli의 package.json 버전을 읽는다 — 하드코딩하지 않는다', () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string };

    expect(devkitVersion()).toBe(pkg.version);
  });
});
