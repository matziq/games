import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(process.argv[2] || 0, 'utf8');
const dom = new JSDOM(html, {
  url: 'https://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
try {
  const { window } = dom;
  window.matchMedia = () => ({ matches: false });
  for (const script of window.document.querySelectorAll('script')) {
    assert(!script.src, `Bundled game must not load external script ${script.src}`);
    window.eval(script.textContent);
  }
  const document = window.document;
  assert.equal(document.querySelectorAll('#board .cell').length, 25);
  assert.equal(document.getElementById('mode-select'), null, 'Old mode chooser must be absent');
  assert.equal(document.getElementById('mode-display'), null, 'Mode label must be absent');
  assert.equal(document.getElementById('opt-difficulty'), null, 'Difficulty control must be absent');
  assert.equal(document.getElementById('opt-size'), null, 'Board-size control must be absent');
  assert.equal(document.getElementById('btn-remix').disabled, true);
  assert.equal(document.getElementById('remix-badge').textContent, '0');
  assert.match(document.getElementById('help-modal').textContent, /Remix Token/);
  assert.match(document.getElementById('help-modal').textContent, /random direction/);

  const entry = document.getElementById('name-entry');
  entry.style.display = 'block';
  document.getElementById('hs-name').value = 'APK CHECK';
  const enter = new window.KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true,
  });
  document.getElementById('hs-name').dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true, 'Enter must submit the high-score name');
  assert.equal(entry.style.display, 'none');
  console.log('Bundled game verified: one unnamed game, fixed 5x5 board, Remix, Enter submission.');
} finally {
  dom.window.close();
}
