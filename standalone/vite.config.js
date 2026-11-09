import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the VoxMesa web app without Bit. `npm run build` first copies the source to ./.src (see prepare.mjs).
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '.src');
const modules = path.join(here, 'node_modules');

export default defineConfig({
  root: path.join(src, 'app'),
  publicDir: path.join(src, 'public'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@nikethbhat4thh/blox-studio.rbxlx-serializer', replacement: path.join(src, 'rbxlx-serializer/index.ts') },
      { find: /^(react|react-dom|react-router-dom|three|postprocessing|@react-three\/[^/]+)(\/.*)?$/, replacement: `${modules}/$1$2` },
    ],
    dedupe: ['react', 'react-dom', 'three'],
  },
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
