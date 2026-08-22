import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Building with `viteSingleFile` inlines the JS/CSS back into a single
// self-contained dist/index.html, so the game can still be opened by
// double-clicking the built file — no server required.
export default defineConfig({
  plugins: [viteSingleFile()],
  // The project folder is reached through a symlink; preserve it so Vite keeps
  // index.html inside the project root during the build.
  resolve: {
    preserveSymlinks: true,
  },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
  },
});
