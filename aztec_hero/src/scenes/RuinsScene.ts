import Phaser from 'phaser';
// Vertical world: climb UP through rooms to escape rising water
const WORLD_W=640;  // 40 tiles wide
const WORLD_H=2400; // 150 tiles tall
const TILE=16;
const TW=WORLD_W/TILE; // 40
const TH=WORLD_H/TILE; // 150
export class RuinsScene extends Phaser.Scene{
  private platforms!:Phaser.Physics.Arcade.StaticGroup;
  private ladders!:Phaser.Physics.Arcade.StaticGroup;
  private onLadder=false;
  private spikes!:Phaser.Physics.Arcade.StaticGroup;
  private gems!:Phaser.Physics.Arcade.StaticGroup;
  private bonePiles!:Phaser.Physics.Arcade.StaticGroup;
  private enemies!:Phaser.Physics.Arcade.Group;
  private exitZone!:Phaser.Physics.Arcade.StaticGroup;
  private player!:Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!:Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!:Record<string,Phaser.Input.Keyboard.Key>;
  private facingRight=true;
  private waterTiles:Phaser.GameObjects.TileSprite[]=[];
  private waterY=WORLD_H+40;
  private waterSpeed=6;
  private oxygen=100;
  private hudTreasure!:Phaser.GameObjects.Text;
  private hudAir!:Phaser.GameObjects.Text;
  private hudDepth!:Phaser.GameObjects.Text;
  private treasureCount=0;
  private glowSprites:Phaser.GameObjects.Image[]=[];
  private bgDeep!:Phaser.GameObjects.TileSprite;
  private bgMid!:Phaser.GameObjects.TileSprite;
  private enemyData=new Map<Phaser.GameObjects.Sprite,{type:string;startX:number;patrolW:number;dir:number}>();
  private escaped=false;
  // Torch weapon system
  private hasTorch=false;
  private swingTimer=0;
  private torchPickupTime=0;
  private torchFlashing=false;
  private playerTorch:Phaser.GameObjects.Image|null=null;
  private playerTorchGlow:Phaser.GameObjects.Image|null=null;
  private torchPickups!:Phaser.Physics.Arcade.StaticGroup;
  private hudTorch!:Phaser.GameObjects.Text;
  constructor(){super('ruins');}
  create(){
    this.escaped=false;this.treasureCount=0;this.oxygen=100;this.onLadder=false;
    this.hasTorch=false;this.swingTimer=0;this.torchPickupTime=0;this.torchFlashing=false;
    this.playerTorch=null;this.playerTorchGlow=null;
    this.cameras.main.setBackgroundColor('#070a10');
    this.physics.world.setBounds(0,0,WORLD_W,WORLD_H);
    this.bgDeep=this.add.tileSprite(0,0,320,180,'bgWallDeep').setOrigin(0,0).setScrollFactor(0,0).setDepth(-20);
    this.bgMid=this.add.tileSprite(0,0,320,180,'bgWall').setOrigin(0,0).setScrollFactor(0,0).setDepth(-10);
    this.add.tileSprite(0,0,WORLD_W,WORLD_H,'bgWall').setOrigin(0,0).setDepth(-5).setAlpha(0.6);
    this.platforms=this.physics.add.staticGroup();
    this.ladders=this.physics.add.staticGroup();
    this.spikes=this.physics.add.staticGroup();
    this.gems=this.physics.add.staticGroup();
    this.bonePiles=this.physics.add.staticGroup();
    this.enemies=this.physics.add.group({allowGravity:true});
    this.exitZone=this.physics.add.staticGroup();
    this.torchPickups=this.physics.add.staticGroup();
    this.buildLevel();
    // Player starts at bottom
    this.player=this.physics.add.sprite(5*TILE,WORLD_H-40,'player',0).setDepth(5);
    this.player.play('player-idle');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(10,18);this.player.body.setOffset(2,2);
    this.physics.add.collider(this.player,this.platforms,undefined,()=>!this.onLadder,this);
    this.physics.add.collider(this.enemies,this.platforms);
    this.physics.add.overlap(this.player,this.spikes,this.hitSpike,undefined,this);
    this.physics.add.overlap(this.player,this.gems,this.collectGem,undefined,this);
    this.physics.add.overlap(this.player,this.bonePiles,this.nearBones,undefined,this);
    this.physics.add.overlap(this.player,this.enemies,this.hitEnemy,undefined,this);
    this.physics.add.overlap(this.player,this.exitZone,this.reachExit,undefined,this);
    // Ladder overlap — checked each frame to set onLadder flag
    this.physics.add.overlap(this.player,this.ladders);
    this.cameras.main.setBounds(0,0,WORLD_W,WORLD_H);
    this.cameras.main.startFollow(this.player,true,0.08,0.08);
    this.cursors=this.input.keyboard!.createCursorKeys();
    this.keys={W:this.input.keyboard!.addKey('W'),A:this.input.keyboard!.addKey('A'),
      S:this.input.keyboard!.addKey('S'),D:this.input.keyboard!.addKey('D'),E:this.input.keyboard!.addKey('E')};
    this.waterY=WORLD_H+40;
    for(let i=0;i<3;i++){
      const wt=this.add.tileSprite(0,0,WORLD_W,TILE,'water').setOrigin(0,0).setDepth(6).setAlpha(0.7+i*0.1).setVisible(false);
      this.waterTiles.push(wt);
    }
    const pg=this.add.image(0,0,'glow').setDepth(8).setAlpha(0.15).setBlendMode(Phaser.BlendModes.ADD).setScale(2);
    (pg as any).__followPlayer=true;this.glowSprites.push(pg);
    if(!this.textures.exists('darkness')){
      const dt=this.textures.createCanvas('darkness',320,180)!;
      const dc=(dt.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
      dc.fillStyle='#000000';dc.fillRect(0,0,320,180);
      (dt as Phaser.Textures.CanvasTexture).refresh();
    }
    this.add.image(160,90,'darkness').setScrollFactor(0).setDepth(7).setAlpha(0.3).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.add.particles(0,0,'dust',{x:{min:0,max:WORLD_W},y:{min:0,max:WORLD_H},
      lifespan:6000,speed:{min:2,max:8},angle:{min:250,max:290},
      alpha:{start:0.4,end:0},scale:{start:1,end:0.5},frequency:200,quantity:1}).setDepth(6);
    const hs:Phaser.Types.GameObjects.Text.TextStyle={fontFamily:'monospace',fontSize:'7px',color:'#c4a060',stroke:'#1a0a00',strokeThickness:1};
    this.hudTreasure=this.add.text(4,4,'Gems: 0',hs).setScrollFactor(0).setDepth(10);
    this.hudAir=this.add.text(4,14,'Air: 100%',hs).setScrollFactor(0).setDepth(10);
    this.hudDepth=this.add.text(230,4,'',hs).setScrollFactor(0).setDepth(10);
    this.hudTorch=this.add.text(4,24,'',hs).setScrollFactor(0).setDepth(10);
  }
  private buildLevel(){
    // --- WALLS: left and right boundaries for the entire world ---
    for(let y=0;y<TH;y++){this.tile(0,y,'tileStone');this.tile(TW-1,y,'tileStone');}
    // === ROOM 1 (bottom): Starting Chamber (rows 138-149) ===
    this.floor(0,TH-1,TW);                         // floor at row 149
    this.plat(4,146,4);                             // left low
    this.plat(15,146,4);                            // center low
    this.plat(30,146,4);                            // right low
    this.plat(10,143,4);                            // left-center mid
    this.plat(24,143,4);                            // right-center mid
    this.plat(17,140,5);                            // center high — below gap
    this.ceiling(0,138,TW,2);this.gap(18,138,4,2);  // ceiling with gap to room 2
    this.ladder(19,134,144);                        // ladder extends down through gap into room
    this.gem(6,145);this.gem(17,145);this.gem(32,145);this.gem(19,139);
    this.deco(5,145,'torch');this.deco(31,145,'torch');
    this.deco(10,148,'bones');this.deco(34,148,'bones');
    this.bones(22,148);
    this.enemy(15,145,'scorpion',50);this.enemy(30,145,'snake',40);
    // === ROOM 2: Scorpion Den (rows 126-137) ===
    this.floor(0,137,18);this.floor(22,137,18);     // floor with gap (ladder hole)
    this.plat(5,134,4);this.plat(24,134,4);
    this.plat(14,131,4,true);this.plat(34,131,4);
    this.plat(8,128,4);this.plat(30,128,5);         // right one below gap
    this.ceiling(0,126,TW,2);this.gap(32,126,4,2);  // exit top-right
    this.ladder(33,122,132);                        // ladder extends down through gap
    this.gem(7,133);this.gem(16,130);this.gem(26,133);this.gem(32,127);
    this.spk(10,136);this.spk(11,136);this.spk(28,136);this.spk(29,136);
    this.deco(6,133,'torch');this.deco(25,133,'torch');this.deco(35,130,'torch');
    this.deco(2,135,'cobweb');this.deco(37,135,'cobweb');
    this.bones(16,135);
    this.enemy(8,133,'scorpion',50);this.enemy(26,133,'scorpion',40);
    this.enemy(14,130,'scorpion',30);
    // === ROOM 3: Spider Cavern (rows 114-125) ===
    this.floor(0,125,TW);
    this.plat(4,122,4);this.plat(28,122,4);
    this.plat(14,119,5,true);this.plat(34,119,4);
    this.plat(5,116,5);this.plat(24,116,4);
    this.ceiling(0,114,TW,2);this.gap(6,114,4,2);
    this.ladder(7,110,120);                         // ladder extends down through gap
    this.gem(5,121);this.gem(16,118);this.gem(30,121);this.gem(36,118);this.gem(7,115);
    this.spk(15,124);this.spk(16,124);this.spk(24,124);this.spk(25,124);
    this.deco(5,121,'torch');this.deco(29,121,'torch');this.deco(15,118,'torch');
    this.deco(10,123,'cobweb');this.deco(30,123,'cobweb');this.deco(20,118,'cobweb');
    this.bones(36,123);
    this.enemy(6,121,'spider',40);this.enemy(28,121,'spider',40);
    this.enemy(14,118,'spider',50);this.enemy(34,118,'spider',30);
    // === ROOM 4: Snake Pit (rows 102-113) ===
    this.floor(0,113,TW);
    this.plat(6,110,4);this.plat(24,110,4);this.plat(34,110,4);
    this.plat(14,107,4,true);this.plat(30,107,4);
    this.plat(6,104,4);this.plat(26,104,5);         // right one near gap
    this.ceiling(0,102,TW,2);this.gap(28,102,4,2);
    this.ladder(29,98,108);                         // ladder extends down through gap
    this.gem(8,109);this.gem(26,109);this.gem(36,109);this.gem(16,106);
    this.gem(32,106);this.gem(8,103);this.gem(28,103);
    this.spk(12,112);this.spk(13,112);this.spk(20,112);this.spk(21,112);
    this.deco(7,109,'torch');this.deco(25,109,'torch');this.deco(31,106,'torch');
    this.deco(24,112,'chain');this.deco(35,112,'chain');
    this.bones(2,111);
    this.enemy(8,109,'snake',50);this.enemy(26,109,'snake',40);
    this.enemy(36,109,'snake',30);this.enemy(16,106,'snake',40);
    // === ROOM 5: The Gauntlet (rows 90-101) ===
    this.floor(0,101,TW);
    this.plat(4,98,4);this.plat(20,98,4);this.plat(34,98,4);
    this.plat(12,95,4,true);this.plat(28,95,4);
    this.plat(6,92,4);this.plat(14,92,5);           // center near gap
    this.ceiling(0,90,TW,2);this.gap(14,90,4,2);
    this.ladder(15,86,96);                          // ladder extends down through gap
    this.gem(6,97);this.gem(22,97);this.gem(36,97);this.gem(14,94);this.gem(30,94);
    this.gem(8,91);this.gem(16,91);
    this.spk(10,100);this.spk(11,100);this.spk(26,100);this.spk(27,100);
    this.deco(5,97,'torch');this.deco(21,97,'torch');this.deco(35,97,'torch');
    this.enemy(12,94,'scorpion',40);this.enemy(28,94,'snake',40);
    this.enemy(6,91,'spider',30);this.enemy(14,91,'scorpion',30);
    // === ROOM 6: Crumbling Halls (rows 78-89) ===
    this.floor(0,89,TW);
    this.plat(4,86,4);this.plat(20,86,4);this.plat(34,86,4);
    this.plat(12,83,5,true);this.plat(28,83,4);
    this.plat(6,80,4);this.plat(34,80,4);           // right one near gap
    this.ceiling(0,78,TW,2);this.gap(36,78,3,2);
    this.ladder(37,74,84);                          // ladder extends down through gap
    this.gem(6,85);this.gem(22,85);this.gem(36,85);this.gem(14,82);this.gem(30,82);
    this.gem(8,79);this.gem(36,79);
    this.spk(8,88);this.spk(9,88);this.spk(26,88);this.spk(27,88);
    this.deco(5,85,'torch');this.deco(21,85,'torch');this.deco(35,85,'torch');
    this.deco(12,88,'chain');this.deco(28,88,'chain');
    this.bones(36,87);this.bones(2,87);
    this.enemy(20,85,'snake',30);this.enemy(34,85,'scorpion',40);
    this.enemy(12,82,'spider',40);this.enemy(6,79,'snake',30);
    // === ROOM 7: The Ascent (rows 66-77) ===
    this.floor(0,77,TW);
    this.plat(4,74,4);this.plat(18,74,4);this.plat(34,74,4);
    this.plat(10,71,4,true);this.plat(28,71,4);
    this.plat(4,68,4);this.plat(20,68,5);           // center near gap
    this.ceiling(0,66,TW,2);this.gap(22,66,4,2);
    this.ladder(23,62,72);                          // ladder extends down through gap
    this.gem(6,73);this.gem(20,73);this.gem(36,73);this.gem(12,70);this.gem(30,70);
    this.gem(6,67);this.gem(22,67);
    this.spk(10,76);this.spk(11,76);this.spk(30,76);this.spk(31,76);
    this.deco(5,73,'torch');this.deco(19,73,'torch');this.deco(35,73,'torch');
    this.deco(11,70,'torch');this.deco(29,70,'torch');
    this.deco(6,75,'cobweb');this.deco(34,75,'cobweb');
    this.enemy(18,73,'scorpion',30);this.enemy(34,73,'snake',30);
    this.enemy(10,70,'spider',40);this.enemy(28,70,'scorpion',30);
    this.enemy(20,67,'snake',40);
    // === ROOM 8: Final Challenge (rows 54-65) ===
    this.floor(0,65,TW);
    this.plat(4,62,4);this.plat(20,62,4);this.plat(34,62,4);
    this.plat(12,59,4,true);this.plat(28,59,4);
    this.plat(6,56,4);this.plat(18,56,4);           // near gap area
    this.ceiling(0,54,TW,2);this.gap(8,54,4,2);
    this.ladder(9,50,60);                           // ladder extends down through gap
    this.gem(6,61);this.gem(22,61);this.gem(36,61);this.gem(14,58);this.gem(30,58);
    this.gem(8,55);this.gem(20,55);
    this.spk(8,64);this.spk(9,64);this.spk(24,64);this.spk(25,64);
    this.deco(5,61,'torch');this.deco(21,61,'torch');this.deco(35,61,'torch');
    this.deco(13,58,'torch');this.deco(29,58,'torch');
    this.enemy(6,61,'scorpion',30);this.enemy(22,61,'snake',30);
    this.enemy(34,61,'spider',30);this.enemy(14,58,'scorpion',30);
    this.enemy(30,58,'snake',30);this.enemy(18,55,'spider',30);
    // === EXIT ROOM (rows 46-53): The Escape! ===
    this.floor(0,53,TW);
    this.plat(10,50,8);this.plat(24,50,8);
    this.plat(16,48,8,true);
    // Exit door at top center
    const doorX=18*TILE+8,doorY=46*TILE+12;
    this.add.image(doorX,doorY,'door').setDepth(3);
    // Golden glow around door
    const dgl=this.add.image(doorX,doorY-4,'glow').setDepth(8).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setScale(2);
    this.glowSprites.push(dgl);
    this.tweens.add({targets:dgl,alpha:{from:0.3,to:0.5},scaleX:{from:1.8,to:2.2},scaleY:{from:1.8,to:2.2},
      duration:500,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
    // Invisible exit trigger
    const ex=this.exitZone.create(doorX,doorY,'gem');
    ex.setVisible(false);ex.body.setSize(16,24);ex.refreshBody();
    this.gem(12,49);this.gem(26,49);this.gem(18,47);this.gem(20,47);
    this.deco(12,49,'torch');this.deco(26,49,'torch');
    // "ESCAPE" text hint
    this.add.text(doorX,44*TILE,'EXIT',{fontFamily:'monospace',fontSize:'6px',color:'#ffcc44',stroke:'#2a1a0a',strokeThickness:1}).setOrigin(0.5).setDepth(3);
  }
  // --- Level building helpers ---
  private floor(tx:number,ty:number,tw:number){
    for(let i=0;i<tw;i++)this.tile(tx+i,ty,'tileStone');
  }
  private plat(tx:number,ty:number,tw:number,moss=false){
    for(let i=0;i<tw;i++){
      let key:string;
      if(i===0)key='tileEdgeLeft';
      else if(i===tw-1)key='tileEdgeRight';
      else key=moss?'tileStoneMoss':'tileStoneTop';
      this.tile(tx+i,ty,key);
      if(tw>=3)this.tile(tx+i,ty+1,moss?'tileStoneMoss':'tileStone');
    }
  }
  private ceiling(tx:number,ty:number,tw:number,th:number){
    for(let dy=0;dy<th;dy++)for(let i=0;i<tw;i++)this.tile(tx+i,ty+dy,'tileStone');
  }
  private gap(tx:number,ty:number,tw:number,th:number){
    // Remove tiles to create a gap in a ceiling — use array copy to avoid mutation during iteration
    const bodies=[...this.platforms.getChildren()] as Phaser.GameObjects.Sprite[];
    for(let dy=0;dy<th;dy++){
      for(let i=0;i<tw;i++){
        const px=((tx+i)*TILE+8),py=((ty+dy)*TILE+8);
        for(const b of bodies){
          if(b.active&&Math.abs(b.x-px)<2&&Math.abs(b.y-py)<2){b.destroy();break;}
        }
      }
    }
  }
  private ladder(tx:number,topRow:number,bottomRow:number){
    for(let y=topRow;y<bottomRow;y++){
      const ldr=this.ladders.create(tx*TILE+5,y*TILE+8,'ladder');
      ldr.setDepth(0);
      (ldr.body as Phaser.Physics.Arcade.StaticBody).setSize(10,16);
      (ldr as Phaser.Physics.Arcade.Sprite).refreshBody();
    }
  }
  private tile(tx:number,ty:number,key:string){
    const t=this.platforms.create(tx*TILE+8,ty*TILE+8,key);t.refreshBody();t.setDepth(1);
  }
  private gem(tx:number,ty:number){
    const gm=this.gems.create(tx*TILE+4,ty*TILE+4,'gem');
    gm.body.setSize(6,6);gm.body.setOffset(1,1);gm.refreshBody();
  }
  private spk(tx:number,ty:number){
    const sp=this.spikes.create(tx*TILE+8,ty*TILE+8,'spike');
    sp.body.setSize(14,8);sp.body.setOffset(1,8);sp.refreshBody();
  }
  private bones(tx:number,ty:number){
    const bn=this.bonePiles.create(tx*TILE+8,ty*TILE+6,'bones');
    bn.body.setSize(14,12);bn.refreshBody();bn.setDepth(2);
  }
  private enemy(tx:number,ty:number,type:string,patrol:number){
    const spr=this.enemies.create(tx*TILE,ty*TILE,type) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    spr.setDepth(4);spr.body.setCollideWorldBounds(true);
    if(type==='scorpion'){spr.body.setSize(14,10);spr.body.setOffset(1,2);}
    else if(type==='spider'){spr.body.setSize(10,10);spr.body.setOffset(1,2);}
    else{spr.body.setSize(14,6);spr.body.setOffset(1,2);}
    this.enemyData.set(spr,{type,startX:tx*TILE,patrolW:patrol,dir:1});
  }
  private deco(tx:number,ty:number,type:string){
    const x=tx*TILE,y=ty*TILE;
    if(type==='torch'){
      const ts=this.torchPickups.create(x+4,y+8,'torch') as Phaser.Physics.Arcade.Sprite;
      ts.setDepth(3);(ts.body as Phaser.Physics.Arcade.StaticBody).setSize(10,14);ts.refreshBody();
      const gl=this.add.image(x+4,y+4,'glow').setDepth(8).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5);
      this.glowSprites.push(gl);
      ts.setData('glow',gl);
      this.tweens.add({targets:gl,alpha:{from:0.2,to:0.35},scaleX:{from:1.4,to:1.6},scaleY:{from:1.4,to:1.6},
        duration:300+Math.random()*200,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
    }else if(type==='chain'){this.add.image(x+3,y+8,'chain').setDepth(0);}
    else if(type==='cobweb'){this.add.image(x+8,y+8,'cobweb').setDepth(3).setAlpha(0.6);}
    else if(type==='bones'){this.add.image(x+8,y+7,'bones').setDepth(2);}
  }
  // --- Game loop ---
  update(_time:number,delta:number){
    if(this.escaped)return;
    const dt=delta/1000;
    // Check ladder overlap each frame
    this.onLadder=this.physics.overlap(this.player,this.ladders);
    this.movePlayer();this.moveEnemies();this.moveWater(dt);
    this.handleTorch(delta);
    this.updateParallax();this.updateGlows();this.updateHUD();
  }
  private movePlayer(){
    const speed=100,jumpV=-320,climbSpeed=80;
    const onGround=this.player.body.blocked.down;
    const wantUp=this.cursors.up.isDown||this.keys.W.isDown;
    const wantDown=this.cursors.down.isDown||this.keys.S.isDown;
    let vx=0;
    if(this.cursors.left.isDown||this.keys.A.isDown){vx=-speed;if(this.facingRight){this.player.setFlipX(true);this.facingRight=false;}}
    else if(this.cursors.right.isDown||this.keys.D.isDown){vx=speed;if(!this.facingRight){this.player.setFlipX(false);this.facingRight=true;}}
    this.player.setVelocityX(vx);
    if(this.onLadder&&!this.hasTorch){
      // On ladder: disable gravity, allow climb up/down
      this.player.body.allowGravity=false;
      if(wantUp)this.player.setVelocityY(-climbSpeed);
      else if(wantDown)this.player.setVelocityY(climbSpeed);
      else this.player.setVelocityY(0);
      // Jump off ladder with space
      if(this.cursors.space.isDown){
        this.player.body.allowGravity=true;
        this.onLadder=false;
        this.player.setVelocityY(jumpV);
      }
    }else{
      // Off ladder (or carrying torch): restore gravity, normal jump
      this.player.body.allowGravity=true;
      if(this.onLadder&&this.hasTorch)this.onLadder=false; // can't climb with torch
      if(!this.hasTorch&&(wantUp||this.cursors.space.isDown)&&onGround)this.player.setVelocityY(jumpV);
    }
    const anim=this.player.anims.currentAnim?.key;
    if(this.onLadder&&(wantUp||wantDown)){if(anim!=='player-walk')this.player.play('player-walk');}
    else if(!onGround&&!this.onLadder){if(anim!=='player-jump')this.player.play('player-jump');}
    else if(vx!==0){if(anim!=='player-walk')this.player.play('player-walk');}
    else{if(anim!=='player-idle')this.player.play('player-idle');}
  }
  private moveEnemies(){
    for(const[spr,data]of this.enemyData){
      if(!spr.active)continue;
      const speed=data.type==='snake'?30:data.type==='spider'?20:25;
      if(spr.x>data.startX+data.patrolW)data.dir=-1;
      if(spr.x<data.startX-data.patrolW)data.dir=1;
      (spr.body as Phaser.Physics.Arcade.Body).setVelocityX(speed*data.dir);
      spr.setFlipX(data.dir<0);
    }
  }
  private moveWater(dt:number){
    this.waterY-=this.waterSpeed*dt;
    if(this.waterY<0)this.waterY=0;
    for(let i=0;i<this.waterTiles.length;i++){
      const wt=this.waterTiles[i],wy=this.waterY+i*4;
      const h=WORLD_H-wy+TILE;
      if(h<=0){wt.setVisible(false);continue;}
      wt.setVisible(true);wt.setPosition(0,wy);wt.setSize(WORLD_W,h);
      wt.tilePositionX+=(i+1)*0.3;
    }
    if(this.player.y>this.waterY+8){this.oxygen=Math.max(0,this.oxygen-15*dt);if(this.oxygen<=0)this.playerDied();}
    else{this.oxygen=Math.min(100,this.oxygen+20*dt);}
  }
  private updateParallax(){
    const cam=this.cameras.main;
    this.bgDeep.tilePositionX=cam.scrollX*0.1;this.bgDeep.tilePositionY=cam.scrollY*0.1;
    this.bgMid.tilePositionX=cam.scrollX*0.3;this.bgMid.tilePositionY=cam.scrollY*0.3;
  }
  private updateGlows(){
    for(const gl of this.glowSprites){if((gl as any).__followPlayer)gl.setPosition(this.player.x,this.player.y-4);}
  }
  private updateHUD(){
    this.hudTreasure.setText('Gems: '+this.treasureCount);
    this.hudAir.setText('Air: '+Math.ceil(this.oxygen)+'%');
    const roomNum=Math.max(1,9-Math.floor(this.player.y/(12*TILE)));
    this.hudDepth.setText('Room '+roomNum+'/9');
    this.hudAir.setColor(this.oxygen<30?'#ff4444':this.oxygen<60?'#ffaa44':'#c4a060');
  }
  // --- Interactions ---
  private hitSpike(){this.playerDied();}
  private collectGem(_p:any,gem:any){gem.disableBody(true,true);this.treasureCount++;this.cameras.main.flash(100,255,200,50);}
  private nearBones(_p:any,bones:any){
    if(!this.hasTorch&&Phaser.Input.Keyboard.JustDown(this.keys.E)){bones.disableBody(true,true);this.treasureCount+=3;this.cameras.main.flash(100,200,180,100);}
  }
  private hitEnemy(_p:any,enemy:any){
    if(this.player.body.velocity.y>0&&this.player.y<enemy.y-4){
      enemy.disableBody(true,true);this.enemyData.delete(enemy);
      this.player.setVelocityY(-200);this.treasureCount+=2;this.cameras.main.flash(80,255,100,50);
    }else{this.playerDied();}
  }
  private reachExit(){
    if(this.escaped)return;
    this.escaped=true;
    this.player.setVelocity(0,0);this.player.body.enable=false;
    this.cameras.main.flash(500,255,220,100);
    const cam=this.cameras.main;
    const cx=cam.scrollX+160,cy=cam.scrollY+90;
    const bg=this.add.rectangle(cx,cy,320,180,0x000000,0).setScrollFactor(0).setDepth(20);
    this.tweens.add({targets:bg,fillAlpha:0.8,duration:1000});
    const hs={fontFamily:'monospace',fontSize:'14px',color:'#ffcc44',stroke:'#2a1a0a',strokeThickness:3};
    const t1=this.add.text(160,70,'ESCAPED!',hs).setScrollFactor(0).setDepth(21).setOrigin(0.5).setAlpha(0);
    const hs2={fontFamily:'monospace',fontSize:'8px',color:'#c4a060',stroke:'#1a0a00',strokeThickness:1};
    const t2=this.add.text(160,95,'Gems collected: '+this.treasureCount,hs2).setScrollFactor(0).setDepth(21).setOrigin(0.5).setAlpha(0);
    const t3=this.add.text(160,110,'Press SPACE to play again',hs2).setScrollFactor(0).setDepth(21).setOrigin(0.5).setAlpha(0);
    this.tweens.add({targets:t1,alpha:1,duration:800,delay:500});
    this.tweens.add({targets:t2,alpha:1,duration:800,delay:1000});
    this.tweens.add({targets:t3,alpha:1,duration:800,delay:1500,onComplete:()=>{
      this.input.keyboard!.once('keydown-SPACE',()=>{this.scene.restart();});
    }});
  }
  // --- Torch weapon system ---
  private handleTorch(delta:number){
    if(this.swingTimer>0)this.swingTimer-=delta;
    // Torch timer: 10 seconds total, flash at 8s
    if(this.hasTorch){
      const elapsed=(this.time.now-this.torchPickupTime)/1000;
      const remaining=10-elapsed;
      if(remaining<=0){
        this.dropTorch();
        return;
      }
      // Flash warning at 8 seconds (last 2 seconds)
      if(remaining<=2&&this.playerTorch){
        if(!this.torchFlashing){
          this.torchFlashing=true;
          this.tweens.add({targets:this.playerTorch,alpha:{from:1,to:0.2},
            duration:150,yoyo:true,repeat:-1,ease:'Linear'});
        }
      }
      this.hudTorch.setText('[Torch] '+Math.ceil(remaining)+'s  E:swing');
    }else{
      this.hudTorch.setText('');
    }
    // E key: pickup or swing (simple tap)
    if(Phaser.Input.Keyboard.JustDown(this.keys.E)){
      if(this.hasTorch&&this.swingTimer<=0){
        this.swingTorch();
      }else if(!this.hasTorch){
        this.tryPickupTorch();
      }
    }
    // Update held torch position
    if(this.hasTorch&&this.playerTorch){
      const ox=this.facingRight?8:-8;
      this.playerTorch.setPosition(this.player.x+ox,this.player.y-2);
      this.playerTorch.setFlipX(!this.facingRight);
      if(this.playerTorchGlow){
        this.playerTorchGlow.setPosition(this.player.x+ox,this.player.y-6);
      }
    }
  }
  private tryPickupTorch(){
    let closest:Phaser.Physics.Arcade.Sprite|null=null;
    let closestDist=30; // pickup range in pixels
    for(const c of this.torchPickups.getChildren()){
      const ts=c as Phaser.Physics.Arcade.Sprite;
      if(!ts.active)continue;
      const d=Phaser.Math.Distance.Between(this.player.x,this.player.y,ts.x,ts.y);
      if(d<closestDist){closestDist=d;closest=ts;}
    }
    if(closest){
      // Remove the wall torch and its glow
      const gl=closest.getData('glow') as Phaser.GameObjects.Image|null;
      if(gl){
        this.tweens.killTweensOf(gl);
        const idx=this.glowSprites.indexOf(gl);
        if(idx>=0)this.glowSprites.splice(idx,1);
        gl.destroy();
      }
      closest.disableBody(true,true);
      // Give player a held torch
      this.hasTorch=true;
      this.torchPickupTime=this.time.now;
      this.torchFlashing=false;
      const ox=this.facingRight?8:-8;
      this.playerTorch=this.add.image(this.player.x+ox,this.player.y-2,'torch').setDepth(6).setOrigin(0.5,1);
      this.playerTorchGlow=this.add.image(this.player.x+ox,this.player.y-6,'glow')
        .setDepth(8).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setScale(2);
      this.tweens.add({targets:this.playerTorchGlow,alpha:{from:0.25,to:0.45},
        scaleX:{from:1.8,to:2.2},scaleY:{from:1.8,to:2.2},
        duration:250,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
      this.cameras.main.flash(60,255,200,50);
    }
  }
  private swingTorch(){
    this.swingTimer=400; // cooldown ms
    const dir=this.facingRight?1:-1;
    const hx=this.player.x+dir*14;
    const hy=this.player.y;
    // Visual: rotate torch in facing direction from handle
    if(this.playerTorch){
      const swingAngle=this.facingRight?-120:120;
      this.tweens.add({targets:this.playerTorch,angle:{from:0,to:swingAngle},
        duration:150,yoyo:true,ease:'Power2'});
    }
    this.cameras.main.flash(40,255,180,60);
    // Check enemies in swing range
    for(const[spr]of this.enemyData){
      if(!spr.active)continue;
      const d=Phaser.Math.Distance.Between(hx,hy,spr.x,spr.y);
      if(d<22){
        (spr as Phaser.Physics.Arcade.Sprite).disableBody(true,true);this.enemyData.delete(spr);
        this.treasureCount+=2;
        this.cameras.main.flash(80,255,100,50);
      }
    }
    // Check bones in swing range
    for(const c of this.bonePiles.getChildren()){
      const bn=c as Phaser.Physics.Arcade.Sprite;
      if(!bn.active)continue;
      const d=Phaser.Math.Distance.Between(hx,hy,bn.x,bn.y);
      if(d<22){
        bn.disableBody(true,true);
        this.treasureCount+=3;
        this.cameras.main.flash(80,200,180,100);
      }
    }
  }
  private dropTorch(){
    this.hasTorch=false;
    this.torchFlashing=false;
    if(this.playerTorch){this.tweens.killTweensOf(this.playerTorch);this.playerTorch.destroy();this.playerTorch=null;}
    if(this.playerTorchGlow){this.tweens.killTweensOf(this.playerTorchGlow);this.playerTorchGlow.destroy();this.playerTorchGlow=null;}
    this.cameras.main.flash(40,100,80,40);
  }
  private playerDied(){
    if(this.escaped)return;
    this.cameras.main.shake(200,0.02);this.cameras.main.flash(300,180,0,0);
    this.time.delayedCall(400,()=>{this.scene.restart();});
  }
}
