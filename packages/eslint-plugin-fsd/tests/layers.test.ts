import { describe, it, expect } from 'vitest';
import { lookupLayer, publicApiDepth, LAYERS } from '../src/lib/layers';

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

  it('Public API 단위는 레이어마다 다르다', () => {
    expect(lookupLayer('features')?.publicApi).toBe('slice');
    expect(lookupLayer('views')?.publicApi).toBe('slice');
    // shared는 슬라이스가 없어 세그먼트가 진입점을 소유한다.
    expect(lookupLayer('shared')?.publicApi).toBe('segment');
    // app은 아무도 import할 수 없어 넘을 경계가 없다.
    expect(lookupLayer('app')?.publicApi).toBe('layer');
  });

  it('sliced와 publicApi는 어긋나지 않는다', () => {
    for (const layer of LAYERS) {
      expect(layer.sliced).toBe(layer.publicApi === 'slice');
    }
  });

  it('슬라이스 레이어만 세그먼트 배럴까지 진입점으로 인정한다', () => {
    expect(publicApiDepth('slice')).toBe(3);
    expect(publicApiDepth('segment')).toBe(2);
    expect(publicApiDepth('layer')).toBe(2);
  });

  it('LAYERS는 rank 오름차순', () => {
    const ranks = LAYERS.map((l) => l.rank);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
