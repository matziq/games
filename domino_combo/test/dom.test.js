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

  it('restores a settled run and its piece without changing the board', async () => {
    const board = Array.from({ length: 5 }, () => Array(5).fill(null));
    board[1][2] = 4;
    const saved = { version: 1, matchCount: 3, board, score: 42, remixTokens: 2,
      maxSpawnVal: 4, chainDepth: 0, lastPlacedCells: [], phase: 'settled', cascade: false,
      piece: { type: 'double', vals: [1, 2], ori: 'v', rot: 90 } };
    localStorage.setItem('dcRunV1', JSON.stringify(saved));
    await start();
    expect(document.getElementById('score-display').textContent).toBe('42');
    expect(document.getElementById('remix-badge').textContent).toBe('2');
    expect(document.querySelector('[data-r="1"][data-c="2"] .die')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('dcRunV1'))).toEqual(saved);
  });

  it('recovers a pending cascade without awarding a match twice', async () => {
    vi.useFakeTimers();
    try {
      const board = Array.from({ length: 5 }, () => Array(5).fill(null));
      board[0][0] = board[0][1] = board[0][2] = 1;
      localStorage.setItem('dcRunV1', JSON.stringify({ version: 1, matchCount: 3, board,
        score: 10, remixTokens: 0, maxSpawnVal: 3, chainDepth: 0,
        lastPlacedCells: [{ r: 0, c: 1 }], phase: 'resolving', cascade: false, piece: null }));
      await start();
      await vi.advanceTimersByTimeAsync(1000);
      const result = JSON.parse(localStorage.getItem('dcRunV1'));
      expect(result.phase).toBe('settled');
      expect(result.board[0][1]).toBe(2);
      expect(result.score).toBeGreaterThan(10);
      const score = result.score;
      vi.resetModules();
      document.body.innerHTML = bodyInner;
      await start();
      expect(Number(document.getElementById('score-display').textContent)).toBe(score);
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards an invalid run with an explanation and starts a new game', async () => {
    localStorage.setItem('dcRunV1', '{"version":1,"board":"bad"}');
    await start();
    expect(document.getElementById('storage-status').textContent).toMatch(/invalid/i);
    expect(JSON.parse(localStorage.getItem('dcRunV1')).board).toHaveLength(5);
  });

  it('replaces the saved run on New Game', async () => {
    await start();
    const original = JSON.parse(localStorage.getItem('dcRunV1'));
    original.score = 123;
    localStorage.setItem('dcRunV1', JSON.stringify(original));
    document.getElementById('btn-new-game').click();
    expect(JSON.parse(localStorage.getItem('dcRunV1')).score).toBe(0);
  });

  it('persists and cycles music choices independently of sound', async () => {
    localStorage.setItem('dcMusic', '2');
    await start();
    const button = document.getElementById('btn-music');
    expect(button.textContent).toBe('Music: Pop');
    document.getElementById('btn-sound').click();
    expect(button.textContent).toBe('Music: Pop');
    button.click();
    expect(button.textContent).toBe('Music: Dance');
    expect(localStorage.getItem('dcMusic')).toBe('3');
  });

  it('punches the board only for an actual four-sixes blast', async () => {
    vi.useFakeTimers();
    try {
      const board = Array.from({ length: 5 }, () => Array(5).fill(null));
      board[0][0] = board[0][1] = board[0][2] = board[0][3] = 6;
      localStorage.setItem('dcRunV1', JSON.stringify({ version: 1, matchCount: 3, board,
        score: 0, remixTokens: 0, maxSpawnVal: 6, chainDepth: 0,
        lastPlacedCells: [], phase: 'resolving', cascade: false, piece: null }));
      await start();
      expect(document.getElementById('board').classList.contains('blast-punch')).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(document.getElementById('board').classList.contains('blast-punch')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports unavailable local storage without stopping play', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      await start();
      expect(document.getElementById('storage-status').textContent).toMatch(/unavailable/i);
      expect(document.querySelectorAll('#board .cell')).toHaveLength(25);
    } finally {
      spy.mockRestore();
    }
  });

  it('clears a finished run instead of restoring it after game over', async () => {
    const board = Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (r + c) % 2 + 1));
    localStorage.setItem('dcRunV1', JSON.stringify({ version: 1, matchCount: 3, board,
      score: 20, remixTokens: 0, maxSpawnVal: 3, chainDepth: 0,
      lastPlacedCells: [], phase: 'settled', cascade: false,
      piece: { type: 'single', vals: [1], ori: 'h', rot: 0 } }));
    await start();
    expect(document.getElementById('game-over').classList.contains('show')).toBe(true);
    expect(localStorage.getItem('dcRunV1')).toBeNull();
  });
});
