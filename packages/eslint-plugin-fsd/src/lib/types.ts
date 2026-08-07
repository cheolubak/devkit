import type { PublicApiUnit } from './layers';

export interface FsdLocation {
  layer: string;
  rank: number;
  sliced: boolean;
  /**
   * 이 레이어에서 Public API를 소유하는 **종류**. `unit`이 그 이름이라면
   * 이쪽은 종류다. `sliced === (unitKind === 'slice')` 불변식이 성립한다.
   */
  unitKind: PublicApiUnit;
  slice: string | null;
  segment: string | null;
  /**
   * 이 경로가 속한 Public API 단위의 이름. 레이어의 `publicApi` 종류에 따라
   * 슬라이스명·세그먼트명·레이어명 중 하나다. 같은 레이어의 두 경로가 같은
   * unit이면 서로의 내부이므로 Public API를 거칠 필요가 없다.
   *
   * 레이어 폴더 자체를 가리키는 경로(예: `@/shared`, `@/features`)는 단위가
   * 정해지지 않아 null이다. null끼리는 같은 단위로 보지 않는다.
   * `publicApi: 'layer'`인 레이어(app)에서는 항상 레이어명이라 null이 없다.
   */
  unit: string | null;
  depth: number;
  folderName: string;
}
