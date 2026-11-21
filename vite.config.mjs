import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: path.resolve(rootDir, 'src'),
  base: './',
  build: {
    outDir: path.resolve(rootDir, 'app-dist'),
    emptyOutDir: true,
    target: 'chrome128'
  },
  clearScreen: false
});
