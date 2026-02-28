import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { RuinsScene } from './scenes/RuinsScene.ts';

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

new Phaser.Game(config);

window.__aztecDebug?.append('Phaser started');
