import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { RuinsScene } from './scenes/RuinsScene.ts';
import { resumeAudio, suspendAudio } from './SoundManager';

declare global {
  interface Window {
    __aztecDebug?: {
      log: (msg: string) => void;
      append: (msg: string) => void;
    };
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 320,
  height: 180,
  backgroundColor: '#070a10',
  pixelArt: true,
  clearBeforeRender: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, RuinsScene]
};

const game = new Phaser.Game(config);

const pauseForLifecycle = () => {
  window.__aztecInput?.releaseAll();
  if (game.loop.running) game.loop.sleep();
  void suspendAudio();
};

const resumeForLifecycle = () => {
  if (document.hidden) return;
  game.loop.wake();
  game.loop.resetDelta();
  void resumeAudio().catch((error) => console.warn('Audio resume was blocked', error));
};

window.addEventListener('blur', pauseForLifecycle);
window.addEventListener('focus', resumeForLifecycle);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForLifecycle();
  else resumeForLifecycle();
});

window.__aztecDebug?.append('Phaser started');
