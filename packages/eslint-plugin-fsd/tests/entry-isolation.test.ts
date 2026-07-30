import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

const REACT_PACKAGES = [
  'eslint-plugin-react-hooks',
  'eslint-plugin-jsx-a11y',
  '@next/eslint-plugin-next',
  // 프리셋에 포함하지 않지만, 되돌아오면 즉시 알아야 하므로 함께 감시한다(설계 2.1)
  'eslint-plugin-react',
];

const IMPORT_PATTERN = /import\s+(?:type\s+)?(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g;

function resolveRelative(fromFile: string, specifier: string): string {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`상대 import 해석 실패: ${specifier} (from ${fromFile})`);
}

/** entry에서 상대 import를 재귀적으로 따라가며 bare specifier를 모은다. */
function collectBareSpecifiers(entry: string): string[] {
  const visited = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) queue.push(resolveRelative(file, specifier));
      else bare.add(specifier);
    }
  }

  return [...bare];
}

describe('루트 진입점 의존성 격리', () => {
  it('src/index.ts는 React 플러그인을 로드하지 않는다', () => {
    const bare = collectBareSpecifiers(resolve(SRC, 'index.ts'));
    for (const pkg of REACT_PACKAGES) {
      expect(bare).not.toContain(pkg);
    }
  });

  it('탐지기가 실제로 동작한다 (src/react.ts에서는 검출된다)', () => {
    const bare = collectBareSpecifiers(resolve(SRC, 'react.ts'));
    expect(bare).toContain('eslint-plugin-react-hooks');
  });

  it('탐지기가 src/next.ts의 세 패키지를 모두 본다', () => {
    const bare = collectBareSpecifiers(resolve(SRC, 'next.ts'));
    expect(bare).toContain('eslint-plugin-react-hooks');
    expect(bare).toContain('eslint-plugin-jsx-a11y');
    expect(bare).toContain('@next/eslint-plugin-next');
  });

  it('어느 엔트리도 eslint-plugin-react를 로드하지 않는다', () => {
    // 설계 2.1: ESLint 10에서 크래시하므로 제외했다. 되돌아오면 여기서 잡힌다.
    for (const entry of ['index.ts', 'react.ts', 'next.ts']) {
      expect(collectBareSpecifiers(resolve(SRC, entry))).not.toContain('eslint-plugin-react');
    }
  });
});
