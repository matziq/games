import Phaser from 'phaser';

type ActorSprite = Phaser.Physics.Arcade.Sprite;

type Interactable = {
  sprite: Phaser.GameObjects.Sprite;
  kind: 'bones';
  looted: boolean;
};

export class RuinsScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private player!: ActorSprite;
  private ground!: Phaser.Physics.Arcade.StaticGroup;
  private hazards!: Phaser.Physics.Arcade.StaticGroup;

  private water!: Phaser.GameObjects.TileSprite;
  private waterY = 0;
  private waterRisePxPerSec = 6;
  private oxygen = 1; // 0..1

  private hudText!: Phaser.GameObjects.Text;

  private interactables: Interactable[] = [];
  private treasure = 0;

  constructor() {
    super('ruins');
  }

  create() {
    this.cameras.main.setBackgroundColor('#070a10');

    // Controls.
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('A,D,W,S,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;

    // World bounds (a short slice that scrolls).
    const worldW = 2400;
    const worldH = 600;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // Ground.
    this.ground = this.physics.add.staticGroup();
    this.buildPlatform(0, 520, worldW, 5);
    this.buildPlatform(120, 400, 18 * 16, 2);
    this.buildPlatform(620, 330, 14 * 16, 2);
    this.buildPlatform(1180, 420, 22 * 16, 2);
    this.buildPlatform(1760, 360, 18 * 16, 2);

    // Hazards.
    this.hazards = this.physics.add.staticGroup();
    this.placeSpike(300, 520 - 12);
    this.placeSpike(316, 520 - 12);
    this.placeSpike(980, 330 - 12);
    this.placeSpike(1650, 520 - 12);

    // Interactable bone piles.
    this.placeBones(220, 520 - 12);
    this.placeBones(760, 330 - 12);
    this.placeBones(1400, 420 - 12);
    this.placeBones(2050, 360 - 12);

    // Player.
    this.player = this.physics.add.sprite(80, 300, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.setDragX(900);
    this.player.setMaxVelocity(140, 420);

    // Collisions.
    this.physics.add.collider(this.player, this.ground);
    this.physics.add.overlap(this.player, this.hazards, () => {
      this.onPlayerHitHazard();
    });

    // Camera follow.
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(70, 40);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Water overlay (rises from bottom).
    this.waterY = worldH + 10;
    this.water = this.add.tileSprite(0, 0, worldW, worldH, 'water');
    this.water.setOrigin(0, 0);
    this.water.setDepth(10);
    this.water.setAlpha(0.65);

    // HUD.
    this.hudText = this.add.text(10, 10, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: '12px',
      color: '#dbe7ff',
      stroke: '#000000',
      strokeThickness: 3
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(20);

    this.updateHud();
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;

    this.updateMovement();
    this.updateWater(dt);
    this.updateInteractions();
    this.updateHud();
  }

  private updateMovement() {
    const left = this.cursors.left?.isDown || this.keys.A.isDown;
    const right = this.cursors.right?.isDown || this.keys.D.isDown;

    if (left) {
      this.player.setAccelerationX(-520);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setAccelerationX(520);
      this.player.setFlipX(false);
    } else {
      this.player.setAccelerationX(0);
    }

    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.cursors.space!);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onFloor = body.blocked.down;
    if (jumpPressed && onFloor) {
      this.player.setVelocityY(-330);
    }
  }

  private updateWater(dt: number) {
    // Rise.
    this.waterY -= this.waterRisePxPerSec * dt;

    // Render water from waterY to bottom.
    const worldH = this.physics.world.bounds.height;
    const clampedY = Phaser.Math.Clamp(this.waterY, 0, worldH);
    const h = worldH - clampedY;

    this.water.setY(clampedY);
    this.water.setDisplaySize(this.physics.world.bounds.width, h);
    this.water.tilePositionX += 0.12;

    // Drowning mechanic: if player's feet are below water, drain oxygen.
    const playerFeetY = this.player.y + 7;
    const inWater = playerFeetY >= clampedY;

    if (inWater) {
      this.oxygen -= dt * 0.25;
      // Slight swim buoyancy.
      this.player.setGravityY(600);
      if (this.keys.W.isDown || this.cursors.up?.isDown) {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        this.player.setVelocityY(Math.min(body.velocity.y, -70));
      }
    } else {
      this.oxygen += dt * 0.18;
      this.player.setGravityY(900);
    }

    this.oxygen = Phaser.Math.Clamp(this.oxygen, 0, 1);

    if (this.oxygen <= 0) {
      this.onPlayerDrowned();
    }
  }

  private updateInteractions() {
    const interactPressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    if (!interactPressed) return;

    const px = this.player.x;
    const py = this.player.y;

    for (const it of this.interactables) {
      if (it.looted) continue;
      const dx = it.sprite.x - px;
      const dy = it.sprite.y - py;
      if (dx * dx + dy * dy > 26 * 26) continue;

      it.looted = true;
      it.sprite.setTint(0x6d6a60);
      this.treasure += 1;

      // Tiny feedback.
      this.add.text(it.sprite.x, it.sprite.y - 14, '+1', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: '12px',
        color: '#ffe7a8',
        stroke: '#000000',
        strokeThickness: 3
      }).setDepth(25).setScrollFactor(0).setOrigin(0.5, 0.5);

      break;
    }
  }

  private onPlayerHitHazard() {
    // Simple respawn/penalty for now.
    this.cameras.main.shake(140, 0.008);
    this.player.setVelocity(-80, -220);
  }

  private onPlayerDrowned() {
    this.cameras.main.fadeOut(250, 10, 20, 40);
    this.time.delayedCall(280, () => {
      this.scene.restart();
    });
  }

  private buildPlatform(x: number, y: number, tilesWide: number, tilesHigh: number) {
    for (let ty = 0; ty < tilesHigh; ty++) {
      for (let tx = 0; tx < tilesWide; tx++) {
        const s = this.ground.create(x + tx * 16 + 8, y + ty * 16 + 8, 'tileStone') as Phaser.Physics.Arcade.Sprite;
        s.setOrigin(0.5, 0.5);
        s.refreshBody();
      }
    }
  }

  private placeSpike(x: number, y: number) {
    const s = this.hazards.create(x, y, 'spike') as Phaser.Physics.Arcade.Sprite;
    s.refreshBody();
  }

  private placeBones(x: number, y: number) {
    const s = this.add.sprite(x, y, 'bones');
    s.setDepth(5);
    this.interactables.push({ sprite: s, kind: 'bones', looted: false });
  }

  private updateHud() {
    const airPct = Math.round(this.oxygen * 100);
    this.hudText.setText([
      `Treasure: ${this.treasure}`,
      `Air: ${airPct}%`,
      `Water rise: ${this.waterRisePxPerSec.toFixed(1)} px/s`
    ]);
  }
}
