import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('production entry can run from a local file without module CORS', () => {
  const entry = new URL('../dist/index.html', import.meta.url);
  const html = readFileSync(entry, 'utf8');
  assert.doesNotMatch(html, /<script[^>]*type="module"/);
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0][1], /^\.\/assets\/.+\.js$/);
  const code = readFileSync(new URL(scripts[0][1], entry), 'utf8');
  assert.match(code, /^\(function\b/);
});
