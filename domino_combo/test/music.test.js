// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMusic } from '../src/music.js';

describe('original music loops', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('plays distinct 8-bit Retro and Arcade phrases', async () => {
    vi.useFakeTimers();
    const played = [];
    class FakeAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() { return Promise.resolve(); }
      createOscillator() {
        const oscillator = { type: '', frequency: { value: 0 }, connect() {}, disconnect() {},
          start() { played.push([oscillator.type, oscillator.frequency.value]); }, stop() {} };
        return oscillator;
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const music = createMusic();
    await music.start(4);
    const retro = [...played];
    played.length = 0;
    await music.start(5);
    const arcade = [...played];
    music.stop();
    expect(retro.length).toBeGreaterThan(0);
    expect(arcade.length).toBeGreaterThan(0);
    expect(retro).not.toEqual(arcade);
  });
});
