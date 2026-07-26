import { describe, it, expect } from 'vitest';
import { lookupLayer, LAYERS } from '../src/lib/layers';

describe('lookupLayer', () => {
  it('정규 레이어명을 조회한다', () => {
    expect(lookupLayer('features')?.name).toBe('features');
    expect(lookupLayer('features')?.rank).toBe(3);
    expect(lookupLayer('shared')?.sliced).toBe(false);
    expect(lookupLayer('widgets')?.sliced).toBe(true);
  });

  it('pages 별칭 views/screens를 pages로 조회한다', () => {
    expect(lookupLayer('views')?.name).toBe('pages');
    expect(lookupLayer('screens')?.name).toBe('pages');
    expect(lookupLayer('views')?.rank).toBe(1);
  });

  it('알 수 없는 폴더명은 null', () => {
    expect(lookupLayer('utils')).toBeNull();
    expect(lookupLayer('src')).toBeNull();
  });

  it('LAYERS는 rank 오름차순', () => {
    const ranks = LAYERS.map((l) => l.rank);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
