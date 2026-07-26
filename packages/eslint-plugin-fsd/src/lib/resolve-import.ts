import { findFsdRoot } from './parse-path';

function dirname(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx <= 0 ? '/' : norm.slice(0, idx);
}

function normalize(p: string): string {
  const segs = p.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

export function resolveImport(
  source: string,
  importerAbsPath: string,
  aliases: string[],
): string | null {
  if (source.startsWith('./') || source.startsWith('../')) {
    return normalize(dirname(importerAbsPath) + '/' + source);
  }
  for (const alias of aliases) {
    if (source === alias || source.startsWith(alias + '/')) {
      const base = findFsdRoot(importerAbsPath);
      if (base === null) return null;
      const rest = source.slice(alias.length).replace(/^\//, '');
      return normalize(base + '/' + rest);
    }
  }
  return null;
}
