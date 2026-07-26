export interface LayerDef {
  name: string;
  aliases: string[];
  rank: number;
  sliced: boolean;
}

export const LAYERS: LayerDef[] = [
  { name: 'app', aliases: [], rank: 0, sliced: false },
  { name: 'pages', aliases: ['views', 'screens'], rank: 1, sliced: true },
  { name: 'widgets', aliases: [], rank: 2, sliced: true },
  { name: 'features', aliases: [], rank: 3, sliced: true },
  { name: 'entities', aliases: [], rank: 4, sliced: true },
  { name: 'shared', aliases: [], rank: 5, sliced: false },
];

const BY_FOLDER = new Map<string, LayerDef>();
for (const layer of LAYERS) {
  BY_FOLDER.set(layer.name, layer);
  for (const alias of layer.aliases) BY_FOLDER.set(alias, layer);
}

export function lookupLayer(folderName: string): LayerDef | null {
  return BY_FOLDER.get(folderName) ?? null;
}
