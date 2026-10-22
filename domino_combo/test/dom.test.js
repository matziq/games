// @vitest-environment jsdom
import './setup.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
// Grab everything inside <body> … </body>, minus the module <script> tag.
const bodyInner = html
  .replace(/[\s\S]*<body>/i, '')
  .replace(/<\/body>[\s\S]*/i, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '');

describe('game bootstrap (jsdom)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = bodyInner;
    vi.resetModules();
  });

  async function start() {
    await import('../src/main.js');
  }

  it('starts the sole game on a fixed 5x5 board', async () => {
    await start();
    const cells = document.querySelectorAll('#board .cell');
    expect(cells).toHaveLength(25);
    expect(document.getElementById('score-display').textContent).toBe('0');
    expect(document.getElementById('current-piece')).not.toBeNull();
    expect(document.getElementById('mode-display')).toBeNull();
    expect(document.body.textContent).not.toContain('Ultimate Chaos');
    expect(document.getElementById('game').getAttribute('aria-hidden')).toBe('false');
  });

  it('initializes Remix button in disabled state with 0 tokens', async () => {
    await start();
    const remixBtn = document.getElementById('btn-remix');
    expect(remixBtn).not.toBeNull();
    expect(remixBtn.disabled).toBe(true);
    expect(document.getElementById('remix-badge').textContent).toBe('0');
  });

  it('restarts the game when New Game is clicked', async () => {
    await start();
    document.getElementById('score-display').textContent = '100';
    document.getElementById('btn-new-game').click();
    expect(document.querySelectorAll('#board .cell')).toHaveLength(25);
    expect(document.getElementById('score-display').textContent).toBe('0');
  });

  it('opens the help modal via its button', async () => {
    await start();
    const help = document.getElementById('help-modal');
    expect(help.classList.contains('show')).toBe(false);
    document.getElementById('btn-help').click();
    expect(help.classList.contains('show')).toBe(true);
  });

  it('does not expose difficulty or board-size controls', async () => {
    await start();
    expect(document.getElementById('opt-difficulty')).toBeNull();
    expect(document.getElementById('opt-size')).toBeNull();
    expect(document.querySelectorAll('#board .cell')).toHaveLength(25);
  });

  it('toggles sound from the board without restarting the game', async () => {
    await start();
    const pieceBefore = document.getElementById('current-piece');
    const soundButton = document.getElementById('btn-sound');

    soundButton.click();

    expect(soundButton.getAttribute('aria-checked')).toBe('false');
    expect(document.getElementById('current-piece')).toBe(pieceBefore);
  });

  it('preserves the game when only sound changes in Settings', async () => {
    await start();
    const pieceBefore = document.getElementById('current-piece');
    document.getElementById('opt-sound').value = '0';

    document.getElementById('btn-apply-settings').click();

    expect(document.getElementById('current-piece')).toBe(pieceBefore);
    expect(document.getElementById('btn-sound').getAttribute('aria-checked')).toBe('false');
  });

  it('loads the existing score for the fixed game', async () => {
    await start();
    localStorage.setItem(
      'dcHighScores',
      JSON.stringify({ '5_3_ultra': { score: 900, name: 'AAA' } }),
    );
    vi.resetModules();
    document.body.innerHTML = bodyInner;
    await start();

    expect(document.getElementById('high-score').textContent).toContain('900');

    expect(document.getElementById('high-score').textContent).toContain('900');
  });

  it('submits the high-score name when Enter is pressed', async () => {
    await start();
    const nameEntry = document.getElementById('name-entry');
    const nameInput = document.getElementById('hs-name');
    nameEntry.style.display = 'block';
    nameInput.value = 'PLAYER';

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    nameInput.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(nameEntry.style.display).toBe('none');
    expect(document.querySelectorAll('#board .cell')).toHaveLength(25);
  });

  it('requests full screen only from the dedicated button', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue();
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    try {
      await start();
      document.getElementById('btn-help').click();
      expect(requestFullscreen).not.toHaveBeenCalled();

      document.getElementById('btn-fullscreen').click();
      await vi.waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
    } finally {
      delete document.documentElement.requestFullscreen;
    }
  });
});
