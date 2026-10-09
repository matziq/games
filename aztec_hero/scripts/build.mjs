import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';

await build();

// Classic scripts can load from file://; ES modules require an HTTP origin.
const entry = new URL('../dist/index.html', import.meta.url);
const html = await readFile(entry, 'utf8');
const moduleScript = /<script type="module" crossorigin src="([^"]+)"><\/script>/g;
const matches = [...html.matchAll(moduleScript)];
if (matches.length !== 1) {
  throw new Error(`Expected one bundled entry script, found ${matches.length}`);
}
await writeFile(entry, html.replace(moduleScript, '<script defer src="$1"></script>'));
