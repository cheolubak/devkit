/**
 * Public API(진입점)를 소유하는 단위. 이 단위 바깥에서 안쪽 파일 경로를
 * 직접 짚는 것이 "우회"이고, 같은 단위 안에서는 자유롭게 오간다.
 *
 * - `slice`   : 슬라이스가 진입점을 갖는다 (pages·widgets·features·entities).
 * - `segment` : 슬라이스가 없어 세그먼트가 그 역할을 대신한다 (shared).
 * - `layer`   : 레이어 전체가 하나의 단위다. app은 최상위라 아무도 import할
 *               수 없으므로(no-higher-level-imports가 막는다) 넘을 경계가 없다.
 */
export type PublicApiUnit = 'slice' | 'segment' | 'layer';

export interface LayerDef {
  name: string;
  aliases: string[];
  rank: number;
  sliced: boolean;
  publicApi: PublicApiUnit;
}

export const LAYERS: LayerDef[] = [
  { name: 'app', aliases: [], rank: 0, sliced: false, publicApi: 'layer' },
  { name: 'pages', aliases: ['views', 'screens'], rank: 1, sliced: true, publicApi: 'slice' },
  { name: 'widgets', aliases: [], rank: 2, sliced: true, publicApi: 'slice' },
  { name: 'features', aliases: [], rank: 3, sliced: true, publicApi: 'slice' },
  { name: 'entities', aliases: [], rank: 4, sliced: true, publicApi: 'slice' },
  { name: 'shared', aliases: [], rank: 5, sliced: false, publicApi: 'segment' },
];

const BY_FOLDER = new Map<string, LayerDef>();
for (const layer of LAYERS) {
  BY_FOLDER.set(layer.name, layer);
  for (const alias of layer.aliases) BY_FOLDER.set(alias, layer);
}

export function lookupLayer(folderName: string): LayerDef | null {
  return BY_FOLDER.get(folderName) ?? null;
}
