import type { FsdLocation } from './types';
import { lookupLayer } from './layers';

function toSegments(absPath: string): string[] {
  return absPath.replace(/\\/g, '/').split('/').filter(Boolean);
}

export function findFsdRoot(absPath: string): string | null {
  const segments = toSegments(absPath);
  const lastSrc = segments.lastIndexOf('src');
  if (lastSrc !== -1) {
    return '/' + segments.slice(0, lastSrc + 1).join('/');
  }
  const layerIdx = segments.findIndex((seg) => lookupLayer(seg) !== null);
  if (layerIdx > 0) {
    return '/' + segments.slice(0, layerIdx).join('/');
  }
  if (layerIdx === 0) {
    return ''; // 레이어가 최상위(루트)인 경우
  }
  return null;
}

export function parsePath(absPath: string): FsdLocation | null {
  const root = findFsdRoot(absPath);
  if (root === null) return null;
  const rootSegs = toSegments(root);
  const allSegs = toSegments(absPath);
  const rel = allSegs.slice(rootSegs.length);
  if (rel.length === 0) return null;

  const folderName = rel[0]!;
  const layer = lookupLayer(folderName);
  if (layer === null) return null;

  const slice = layer.sliced ? (rel[1] ?? null) : null;
  const segment = layer.sliced ? (rel[2] ?? null) : (rel[1] ?? null);

  return {
    layer: layer.name,
    rank: layer.rank,
    sliced: layer.sliced,
    slice,
    segment,
    depth: rel.length,
    folderName,
  };
}
