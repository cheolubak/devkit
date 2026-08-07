import { describe, it, expect } from 'vitest';
import { findFsdRoot, parsePath } from '../src/lib/parse-path';

describe('findFsdRoot', () => {
  it('src 세그먼트가 있으면 마지막 src까지가 루트', () => {
    expect(findFsdRoot('/proj/src/features/auth/ui/x.ts')).toBe('/proj/src');
  });
  it('중첩 src는 마지막 src 기준', () => {
    expect(findFsdRoot('/proj/packages/web/src/entities/user/index.ts')).toBe(
      '/proj/packages/web/src',
    );
  });
  it('src가 없으면 top-most 레이어의 부모가 루트', () => {
    expect(findFsdRoot('/proj/features/auth/ui/x.ts')).toBe('/proj');
  });
  it('레이어도 src도 없으면 null', () => {
    expect(findFsdRoot('/proj/lib/helpers/x.ts')).toBeNull();
  });
  it('레이어가 최상위(segment 0)면 루트는 /', () => {
    expect(findFsdRoot('/app/features/auth/ui/x.ts')).toBe('/');
  });
});

describe('parsePath', () => {
  it('sliced 레이어를 layer/slice/segment로 파싱', () => {
    expect(parsePath('/proj/src/features/auth/ui/Form.tsx')).toMatchObject({
      layer: 'features', rank: 3, sliced: true, slice: 'auth', segment: 'ui', depth: 4,
      unit: 'auth',
    });
  });
  it('shared는 slice=null, segment=첫 단계', () => {
    expect(parsePath('/proj/src/shared/ui/Button.tsx')).toMatchObject({
      layer: 'shared', sliced: false, slice: null, segment: 'ui', depth: 3,
      // 슬라이스가 없으므로 세그먼트가 Public API 단위다.
      unit: 'ui',
    });
  });
  it('app은 레이어 전체가 하나의 Public API 단위다', () => {
    expect(parsePath('/proj/src/app/providers/Theme.tsx')).toMatchObject({
      layer: 'app', sliced: false, slice: null, segment: 'providers', unit: 'app',
    });
    expect(parsePath('/proj/src/app/layout.tsx')?.unit).toBe('app');
  });
  it('별칭 views/screens를 pages로 인식', () => {
    expect(parsePath('/proj/src/views/home/index.ts')?.layer).toBe('pages');
    expect(parsePath('/proj/src/screens/home/index.ts')?.layer).toBe('pages');
    expect(parsePath('/proj/src/views/home/index.ts')?.folderName).toBe('views');
  });
  it('슬라이스명이 shared여도 features로 결정적 파싱', () => {
    expect(parsePath('/proj/src/features/shared/ui/x.ts')).toMatchObject({
      layer: 'features', slice: 'shared', segment: 'ui',
    });
  });
  it('src 밖 라우팅 폴더(루트 app/pages)는 파싱하되 src 앵커로 걸러짐', () => {
    // src가 있는 프로젝트의 루트 라우팅 파일: 이 경로 자체엔 src가 없으므로 no-src 폴백으로 app 레이어가 됨.
    // 오탐 방지는 rule 레벨(대상이 src 기준으로 해석됨)에서 검증하지만, 여기서는 파싱 결과만 확인.
    expect(parsePath('/proj/app/products/page.tsx')?.layer).toBe('app');
  });
  it('레이어 아닌 첫 세그먼트는 null', () => {
    expect(parsePath('/proj/src/utils/x.ts')).toBeNull();
  });
});
