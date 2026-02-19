import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    // Generate placeholder pixel-art textures at runtime.
    const g = this.add.graphics();

    // Player: teal body with lighter face pixel.
    g.clear();
    g.fillStyle(0x39d8c0, 1);
    g.fillRect(0, 0, 10, 14);
    g.fillStyle(0x9ff3ea, 1);
    g.fillRect(6, 4, 2, 2);
    g.generateTexture('player', 10, 14);

    // Bone pile.
    g.clear();
    g.fillStyle(0xcfc6a3, 1);
    g.fillRect(0, 6, 16, 6);
    g.fillStyle(0x9a9275, 1);
    g.fillRect(2, 8, 12, 2);
    g.fillRect(6, 2, 4, 6);
    g.generateTexture('bones', 16, 12);

    // Spike.
    g.clear();
    g.fillStyle(0xe85151, 1);
    g.fillTriangle(0, 12, 8, 0, 16, 12);
    g.fillStyle(0xffb4b4, 1);
    g.fillTriangle(5, 12, 8, 6, 11, 12);
    g.generateTexture('spike', 16, 12);

    // Water overlay.
    g.clear();
    g.fillStyle(0x1a7bd9, 0.55);
    g.fillRect(0, 0, 16, 16);
    g.generateTexture('water', 16, 16);

    // Tile: stone block.
    g.clear();
    g.fillStyle(0x2a3038, 1);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle(0x3a434e, 1);
    g.fillRect(1, 1, 14, 14);
    g.fillStyle(0x1c2128, 1);
    g.fillRect(3, 4, 4, 2);
    g.fillRect(9, 9, 4, 2);
    g.generateTexture('tileStone', 16, 16);

    g.destroy();
  }

  create() {
    // Visible sanity check.
    this.add.rectangle(160, 90, 320, 180, 0x0b1220, 1).setOrigin(0.5, 0.5);
    this.add.text(8, 8, 'Aztec Hero — loading…', {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: '12px',
      color: '#dbe7ff'
    });

    // Log to DOM overlay (if present).
    (window as any).__aztecDebug?.append('BootScene: textures generated');
    this.scene.start('ruins');
  }
}
