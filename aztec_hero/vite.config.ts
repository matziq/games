import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Some setups (symlinks/OneDrive) can confuse resolution; pin the root.
  root: rootDir,
  server: {
    port: 8010,
    strictPort: true
  },
  build: {
    target: 'es2022'
  }
});
