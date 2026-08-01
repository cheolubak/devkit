import { describe, expect, it } from 'vitest';
import {
  InvalidMarkerError,
  markerPatch,
  MissingMarkerError,
  PROJECT_TYPES,
  readMarker,
} from '../src/lib/marker.js';

describe('readMarker', () => {
  it('유효한 마커를 읽는다', () => {
    const pkg = { name: 'my-api', devkit: { type: 'nest', version: '0.1.0' } };
    expect(readMarker(pkg)).toEqual({ type: 'nest', version: '0.1.0' });
  });

  it('마커가 없으면 MissingMarkerError 를 던진다', () => {
    expect(() => readMarker({ name: 'my-api' })).toThrow(MissingMarkerError);
  });

  it('마커 부재 오류 메시지가 --type 을 안내한다', () => {
    // 의존성으로 유형을 짐작하는 휴리스틱은 조용히 틀릴 수 있다(설계 5.1절).
    expect(() => readMarker({ name: 'my-api' })).toThrow(/--type/);
  });

  it('알 수 없는 type 은 InvalidMarkerError 를 던진다', () => {
    const pkg = { devkit: { type: 'django', version: '0.1.0' } };
    expect(() => readMarker(pkg)).toThrow(InvalidMarkerError);
  });

  it('알 수 없는 type 오류 메시지가 지원 목록을 담는다', () => {
    const pkg = { devkit: { type: 'django', version: '0.1.0' } };
    expect(() => readMarker(pkg)).toThrow(/nest/);
    expect(() => readMarker(pkg)).toThrow(/monorepo/);
  });

  it('version 이 없으면 InvalidMarkerError 를 던진다', () => {
    expect(() => readMarker({ devkit: { type: 'nest' } })).toThrow(InvalidMarkerError);
  });

  it('devkit 이 객체가 아니면 InvalidMarkerError 를 던진다', () => {
    expect(() => readMarker({ devkit: 'nest' })).toThrow(InvalidMarkerError);
    expect(() => readMarker({ devkit: null })).toThrow(MissingMarkerError);
  });

  it('package.json 자체가 객체가 아니면 MissingMarkerError 를 던진다', () => {
    expect(() => readMarker(null)).toThrow(MissingMarkerError);
    expect(() => readMarker('{}')).toThrow(MissingMarkerError);
  });
});

describe('markerPatch', () => {
  it('mergeJson 에 넘길 패치 형태를 만든다', () => {
    expect(markerPatch('next', '0.2.0')).toEqual({
      devkit: { type: 'next', version: '0.2.0' },
    });
  });
});

describe('PROJECT_TYPES', () => {
  it('템플릿 설계의 3종을 갖는다', () => {
    expect([...PROJECT_TYPES]).toEqual(['nest', 'next', 'monorepo']);
  });
});
