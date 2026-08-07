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

/**
 * FSD 루트 기준으로 Public API(진입점)로 인정되는 최대 경로 깊이.
 *
 * 슬라이스 레이어는 슬라이스 배럴(`entities/user`, 2)과 **세그먼트 배럴**
 * (`entities/user/ui`, 3)을 모두 진입점으로 인정한다. RSC 때문이다 — 한
 * 슬라이스가 서버 전용 `api`와 클라이언트 `ui`를 함께 가지면 슬라이스 배럴
 * 하나만 허용하는 순간 그 배럴이 둘을 한 모듈 그래프로 묶어, `"use client"`
 * 소비자가 서버 전용 의존성을 번들로 끌어온다. 세그먼트 배럴을 인정하면
 * 클라이언트는 `ui`만, 서버는 `api`만 짚을 수 있다.
 *
 * 슬라이스가 없는 레이어는 세그먼트가 이미 진입점이므로 2에서 멈춘다.
 * `layer` 단위(app)도 2다 — app 내부는 같은 unit이라 임계값에 닿기 전에
 * 걸러지고, 밖에서 app을 짚는 것은 no-higher-level-imports가 이미 잡는다.
 */
export function publicApiDepth(unit: PublicApiUnit): number {
  return unit === 'slice' ? 3 : 2;
}
