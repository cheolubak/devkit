import { describe, expect, it } from 'vitest';
import { MissingMarkerError } from '../src/lib/marker.js';
import { resolveType } from '../src/update/resolve-type.js';

const WITH_MARKER = { name: 'demo', devkit: { type: 'nest', version: '0.1.0' } };
const WITHOUT = { name: 'demo' };

describe('resolveType', () => {
  it('마커가 있으면 그 유형을 쓴다', () => {
    expect(resolveType(WITH_MARKER)).toEqual({ type: 'nest', hadMarker: true });
  });

  it('마커가 없고 --type이 있으면 그것을 쓴다', () => {
    expect(resolveType(WITHOUT, 'next')).toEqual({ type: 'next', hadMarker: false });
  });

  it('마커도 --type도 없으면 던진다', () => {
    expect(() => resolveType(WITHOUT)).toThrow(MissingMarkerError);
  });

  it('마커와 --type이 어긋나면 거부한다 — 조용히 한쪽을 고르지 않는다', () => {
    expect(() => resolveType(WITH_MARKER, 'next')).toThrow(/마커는 nest.*--type은 next/s);
  });

  it('마커와 --type이 같으면 통과한다', () => {
    expect(resolveType(WITH_MARKER, 'nest')).toEqual({ type: 'nest', hadMarker: true });
  });

  it('알 수 없는 --type은 거부한다', () => {
    expect(() => resolveType(WITHOUT, 'django')).toThrow(/nest, next, monorepo/);
  });
});
