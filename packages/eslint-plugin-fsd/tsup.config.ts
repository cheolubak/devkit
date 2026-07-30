import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts', 'src/next.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
