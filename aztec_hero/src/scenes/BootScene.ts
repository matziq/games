import Phaser from 'phaser';
let _s=42;
function seed(v:number){_s=v;}
function rng():number{_s=(_s*16807)%2147483647;return(_s&0x7fffffff)/0x7fffffff;}
function pick<T>(...a:T[]):T{return a[Math.floor(rng()*a.length)];}
function fill(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,c:string,a=1){
  ctx.globalAlpha=a;ctx.fillStyle=c;ctx.fillRect(x,y,w,h);ctx.globalAlpha=1;
}
function dot(ctx:CanvasRenderingContext2D,x:number,y:number,c:string,a=1){
  ctx.globalAlpha=a;ctx.fillStyle=c;ctx.fillRect(x,y,1,1);ctx.globalAlpha=1;
}
export class BootScene extends Phaser.Scene{
  constructor(){super('boot');}
  private tex(key:string,w:number,h:number):CanvasRenderingContext2D{
    if(this.textures.exists(key))this.textures.remove(key);
    const t=this.textures.createCanvas(key,w,h)!;
    return(t.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
  }
  private done(key:string){this.textures.get(key).getSourceImage();(this.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();}
  create(){
    window.__aztecDebug?.log('BootScene: generating textures');
    this.genStone('tileStone','#222230',['#4a4a54','#525260','#5a5a66'],'#686874','#3e3e48','#1a1a24',false);
    this.genStone('tileStoneMoss','#222230',['#4a4a54','#525260','#5a5a66'],'#686874','#3e3e48','#1a1a24',true);
    this.genStone('bgWall','#1c1c26',['#2e2e38','#343440','#3a3a46'],'#3a3a46','#2e2e38','#1c1c26',false);
    this.genStone('bgWallDeep','#141420',['#1a1a24','#20202c'],'#20202c','#1a1a24','#141420',false);
    this.genEdge('tileEdgeLeft',true);
    this.genEdge('tileEdgeRight',false);
    this.genTop();
    this.genPlayer();
    this.genSpike();
    this.genBones();
    this.genWater();
    this.genTorch();
    this.genChain();
    this.genCobweb();
    this.genGem();
    this.genDust();
    this.genScorpion();
    this.genSpider();
    this.genSnake();
    this.genGlow();
    this.genDoor();
    this.genLadder();
    const t=this.add.text(160,90,'AZTEC HERO',{fontFamily:'monospace',fontSize:'12px',color:'#c4a060',stroke:'#2a1a0a',strokeThickness:2}).setOrigin(0.5);
    this.time.delayedCall(600,()=>{t.destroy();this.scene.start('ruins');});
  }
  genStone(key:string,mortar:string,base:string[],hi:string,lo:string,crack:string,moss:boolean){
    const ctx=this.tex(key,16,16);
    seed(key.charCodeAt(2)*137+7);
    fill(ctx,0,0,16,16,mortar);
    const rows=[{y:0,h:7,off:[0,8]},{y:8,h:7,off:[4,12]}];
    for(const row of rows){
      fill(ctx,0,row.y+row.h,16,1,mortar);
      for(let bi=0;bi<row.off.length;bi++){
        const bx=row.off[bi];
        const bw=bi<row.off.length-1?row.off[bi+1]-bx-1:16-bx;
        if(bi>0)fill(ctx,bx-1,row.y,1,row.h,mortar);
        const col=pick(...base);
        fill(ctx,bx,row.y,bw,row.h,col);
        fill(ctx,bx,row.y,bw,1,hi);
        fill(ctx,bx,row.y,1,row.h,hi);
        fill(ctx,bx,row.y+row.h-1,bw,1,lo);
        fill(ctx,bx+bw-1,row.y,1,row.h,lo);
        for(let i=0;i<4;i++){
          dot(ctx,bx+1+Math.floor(rng()*Math.max(1,bw-2)),row.y+1+Math.floor(rng()*Math.max(1,row.h-2)),rng()>0.5?hi:lo);
        }
        if(rng()>0.65){
          const cx=bx+2+Math.floor(rng()*Math.max(1,bw-4));
          const cy=row.y+1+Math.floor(rng()*Math.max(1,row.h-3));
          dot(ctx,cx,cy,crack);dot(ctx,cx+1,cy+1,crack);
          if(rng()>0.5)dot(ctx,cx+2,cy+1,crack);
        }
      }
    }
    if(moss){
      for(let i=0;i<6;i++){
        const mx=1+Math.floor(rng()*13),my=1+Math.floor(rng()*13);
        dot(ctx,mx,my,rng()>0.5?'#3a4a2a':'#445530');
        if(rng()>0.4)dot(ctx,mx+1,my,'#3a4a2a');
        if(rng()>0.6)dot(ctx,mx,my+1,'#445530');
      }
    }
    this.done(key);
  }
  genEdge(key:string,left:boolean){
    const ctx=this.tex(key,16,16);
    seed(left?111:222);
    fill(ctx,0,0,16,16,'#222230');
    const bs=left?2:0,bw=14;
    for(let r=0;r<2;r++){
      const ry=r*8;
      fill(ctx,bs,ry,bw,7,pick('#4a4a54','#525260','#5a5a66'));
      fill(ctx,bs,ry,bw,1,'#686874');
      fill(ctx,bs,ry+6,bw,1,'#3e3e48');
      fill(ctx,0,ry+7,16,1,'#2e2e3a');
      for(let i=0;i<3;i++)dot(ctx,bs+1+Math.floor(rng()*(bw-2)),ry+1+Math.floor(rng()*5),pick('#686874','#3e3e48'));
    }
    for(let y=0;y<16;y++){const d=Math.floor(rng()*3);for(let dx=0;dx<d;dx++)dot(ctx,left?dx:15-dx,y,'#222230');}
    this.done(key);
  }
  genTop(){
    const ctx=this.tex('tileStoneTop',16,16);
    seed(333);
    fill(ctx,0,0,16,16,'#222230');
    fill(ctx,0,0,16,2,'#686874');
    for(let x=0;x<16;x++){if(rng()>0.6)dot(ctx,x,0,'#3e3e48');}
    fill(ctx,0,2,16,5,pick('#4a4a54','#525260'));
    fill(ctx,0,7,16,1,'#2e2e3a');
    fill(ctx,0,8,16,7,pick('#525260','#5a5a66'));
    fill(ctx,0,15,16,1,'#2e2e3a');
    fill(ctx,7,2,1,5,'#2e2e3a');fill(ctx,3,8,1,7,'#2e2e3a');fill(ctx,11,8,1,7,'#2e2e3a');
    for(let i=0;i<8;i++)dot(ctx,Math.floor(rng()*16),2+Math.floor(rng()*13),pick('#686874','#3e3e48','#4a4a54'));
    this.done('tileStoneTop');
  }
  genPlayer(){
    // Spritesheet: 4 frames of 14x20 each → 56x20 canvas
    // Frame 0: idle, Frame 1: walk1, Frame 2: walk2, Frame 3: jump
    const FW=14,FH=20;
    const ctx=this.tex('player',FW*4,FH);

    // ---- shared helpers to draw at frame offset ----
    const f=(frame:number,x:number,y:number,w:number,h:number,c:string,a=1)=>fill(ctx,frame*FW+x,y,w,h,c,a);
    const d=(frame:number,x:number,y:number,c:string,a=1)=>dot(ctx,frame*FW+x,y,c,a);

    for(let fr=0;fr<4;fr++){
      // --- HAT (same all frames) ---
      f(fr,4,0,6,1,'#A07820');
      f(fr,3,1,8,2,'#8B6914');
      d(fr,3,1,'#A07820');d(fr,10,1,'#6B5010');
      d(fr,3,2,'#A07820');d(fr,10,2,'#6B5010');
      f(fr,3,3,8,1,'#6B5010');
      f(fr,1,4,12,1,'#8B6914');
      d(fr,1,4,'#A07820');d(fr,12,4,'#6B5010');

      // --- FACE (same all frames) ---
      f(fr,4,5,6,4,'#D4A574');
      d(fr,4,5,'#E0B888');d(fr,9,5,'#E0B888');
      d(fr,5,6,'#1a1a1a');d(fr,8,6,'#1a1a1a');
      d(fr,6,8,'#B88A5C');d(fr,7,8,'#B88A5C');
      f(fr,5,9,4,1,'#D4A574');

      // --- TORSO (same all frames) ---
      f(fr,3,10,8,4,'#C4A882');
      d(fr,3,10,'#D4B892');d(fr,10,10,'#A89068');
      d(fr,6,11,'#A89068');d(fr,7,11,'#A89068');
      d(fr,6,12,'#D4B892');d(fr,7,12,'#D4B892');
      f(fr,3,14,8,1,'#3A2A1A');// belt

      // --- ARMS & LEGS vary per frame ---
      if(fr===0){
        // IDLE: arms at sides, legs together
        f(fr,1,10,2,4,'#C4A882');f(fr,11,10,2,4,'#C4A882');
        f(fr,1,14,2,1,'#D4A574');f(fr,11,14,2,1,'#D4A574');
        // pants
        f(fr,4,15,6,3,'#7B6345');
        d(fr,6,15,'#5A4A32');d(fr,7,15,'#5A4A32');
        d(fr,6,16,'#5A4A32');d(fr,7,16,'#5A4A32');
        // boots
        f(fr,3,18,3,2,'#4A3728');f(fr,8,18,3,2,'#4A3728');
        d(fr,3,18,'#5A4738');d(fr,8,18,'#5A4738');
        d(fr,5,19,'#5A4738');d(fr,10,19,'#5A4738');
      }else if(fr===1){
        // WALK1: left arm forward, right arm back; left leg forward, right leg back
        f(fr,0,11,2,3,'#C4A882');f(fr,0,14,2,1,'#D4A574');// left arm forward
        f(fr,12,10,2,3,'#C4A882');d(fr,12,13,'#D4A574');   // right arm back (up)
        // left leg forward
        f(fr,3,15,3,3,'#7B6345');d(fr,4,15,'#5A4A32');
        f(fr,2,18,3,2,'#4A3728');d(fr,2,18,'#5A4738');d(fr,4,19,'#5A4738');
        // right leg back
        f(fr,8,15,3,2,'#7B6345');d(fr,9,15,'#5A4A32');
        f(fr,9,17,3,2,'#4A3728');d(fr,9,17,'#5A4738');d(fr,11,18,'#5A4738');
      }else if(fr===2){
        // WALK2: right arm forward, left arm back; right leg forward, left leg back
        f(fr,1,10,2,3,'#C4A882');d(fr,1,13,'#D4A574');     // left arm back (up)
        f(fr,12,11,2,3,'#C4A882');f(fr,12,14,2,1,'#D4A574');// right arm forward
        // right leg forward
        f(fr,8,15,3,3,'#7B6345');d(fr,9,15,'#5A4A32');
        f(fr,9,18,3,2,'#4A3728');d(fr,9,18,'#5A4738');d(fr,11,19,'#5A4738');
        // left leg back
        f(fr,4,15,3,2,'#7B6345');d(fr,5,15,'#5A4A32');
        f(fr,3,17,3,2,'#4A3728');d(fr,3,17,'#5A4738');d(fr,5,18,'#5A4738');
      }else{
        // JUMP: arms raised, legs tucked
        f(fr,0,9,2,3,'#C4A882');f(fr,0,8,2,1,'#D4A574');  // left arm up
        f(fr,12,9,2,3,'#C4A882');f(fr,12,8,2,1,'#D4A574');// right arm up
        // legs pulled up
        f(fr,4,15,6,2,'#7B6345');
        d(fr,6,15,'#5A4A32');d(fr,7,15,'#5A4A32');
        f(fr,3,17,4,2,'#4A3728');f(fr,8,17,4,2,'#4A3728');
        d(fr,3,17,'#5A4738');d(fr,8,17,'#5A4738');
      }
    }
    this.done('player');
    // Add spritesheet frame data
    this.textures.get('player').add(0,0,0,0,FW,FH);
    this.textures.get('player').add(1,0,FW,0,FW,FH);
    this.textures.get('player').add(2,0,FW*2,0,FW,FH);
    this.textures.get('player').add(3,0,FW*3,0,FW,FH);
    // Define animations
    this.anims.create({key:'player-idle',frames:[{key:'player',frame:0}],frameRate:1,repeat:-1});
    this.anims.create({key:'player-walk',frames:[{key:'player',frame:1},{key:'player',frame:0},{key:'player',frame:2},{key:'player',frame:0}],frameRate:8,repeat:-1});
    this.anims.create({key:'player-jump',frames:[{key:'player',frame:3}],frameRate:1,repeat:-1});
  }
  genSpike(){
    const ctx=this.tex('spike',16,16);
    fill(ctx,0,12,16,4,'#5a5a62');fill(ctx,0,12,16,1,'#707078');fill(ctx,0,15,16,1,'#3e3e48');
    for(const sx of[2,7,12]){
      for(let r=0;r<10;r++){
        const hw=Math.floor((10-r)*1.5/10)+(r<8?1:0);
        for(let dx=-hw;dx<=hw;dx++){
          const x=sx+dx;if(x<0||x>15)continue;
          dot(ctx,x,11-r,dx===-hw?'#707078':dx===hw?'#3e3e48':'#707078');
        }
      }
      dot(ctx,sx,2,'#888890');dot(ctx,sx,3,'#888890');
    }
    this.done('spike');
  }
  genBones(){
    const ctx=this.tex('bones',16,14);
    fill(ctx,5,0,6,5,'#e0dace');dot(ctx,5,0,'#ece6dc');dot(ctx,10,0,'#b0a890');
    fill(ctx,6,5,4,2,'#e0dace');
    dot(ctx,6,2,'#222230');dot(ctx,9,2,'#222230');
    dot(ctx,6,3,'#222230');dot(ctx,9,3,'#222230');
    dot(ctx,7,4,'#b0a890');dot(ctx,8,4,'#b0a890');
    dot(ctx,7,6,'#ece6dc');dot(ctx,8,6,'#ece6dc');
    fill(ctx,1,8,6,2,'#d4cbb8');dot(ctx,0,8,'#e0d8c8');dot(ctx,7,9,'#e0d8c8');
    fill(ctx,8,9,6,2,'#d4cbb8');fill(ctx,3,11,5,2,'#d4cbb8');
    dot(ctx,10,7,'#d4cbb8');dot(ctx,11,6,'#d4cbb8');
    dot(ctx,2,6,'#b0a890');dot(ctx,3,7,'#d4cbb8');
    fill(ctx,1,13,14,1,'#222230');
    this.done('bones');
  }
  genWater(){
    const ctx=this.tex('water',16,16);
    seed(555);const wc=['#1a3a6a','#1e4278','#224a84'];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){ctx.globalAlpha=0.75;ctx.fillStyle=pick(...wc);ctx.fillRect(x,y,1,1);}
    ctx.globalAlpha=1;
    for(let x=0;x<16;x++){
      if(rng()>0.3){ctx.globalAlpha=0.6;ctx.fillStyle='#2a5a98';ctx.fillRect(x,0,1,1);}
      if(rng()>0.5){ctx.globalAlpha=0.4;ctx.fillStyle='#6a9ac4';ctx.fillRect(x,1,1,1);}
    }
    ctx.globalAlpha=1;
    for(let y=10;y<16;y++)for(let x=0;x<16;x++){if(rng()>0.6){ctx.globalAlpha=0.3;ctx.fillStyle='#1a3a6a';ctx.fillRect(x,y,1,1);}}
    ctx.globalAlpha=1;
    this.done('water');
  }
  genTorch(){
    const ctx=this.tex('torch',8,16);
    fill(ctx,3,8,2,8,'#5a3a1a');dot(ctx,3,8,'#6a4a2a');
    fill(ctx,2,6,4,2,'#6a4a2a');dot(ctx,2,6,'#5a3a1a');dot(ctx,5,6,'#5a3a1a');
    fill(ctx,3,3,2,3,'#ff8800');fill(ctx,2,4,4,2,'#ff8800');
    dot(ctx,3,2,'#ffaa22');dot(ctx,4,2,'#ffaa22');
    dot(ctx,3,1,'#ffcc44');dot(ctx,4,1,'#ffcc44');dot(ctx,3,0,'#ffee88');
    dot(ctx,3,4,'#ffcc44');dot(ctx,4,3,'#ffaa22');
    this.done('torch');
  }
  genChain(){
    const ctx=this.tex('chain',6,16);
    for(let link=0;link<4;link++){
      const ly=link*4;
      if(link%2===0){
        fill(ctx,2,ly,2,4,'#6a6a72');dot(ctx,2,ly,'#808088');dot(ctx,3,ly,'#808088');
        dot(ctx,2,ly+3,'#505058');dot(ctx,3,ly+3,'#505058');
      }else{
        fill(ctx,1,ly+1,4,2,'#6a6a72');dot(ctx,1,ly+1,'#808088');dot(ctx,4,ly+2,'#505058');
      }
    }
    this.done('chain');
  }
  genCobweb(){
    const ctx=this.tex('cobweb',16,16);
    const wc='rgba(200,200,210,0.5)';const wc2='rgba(200,200,210,0.3)';
    for(let i=0;i<14;i++){ctx.fillStyle=wc;ctx.fillRect(0,i,1,1);ctx.fillRect(i,0,1,1);ctx.fillRect(i,i,1,1);}
    for(let i=0;i<6;i++){ctx.fillStyle=wc2;ctx.fillRect(i,5-Math.floor(i*0.6),1,1);ctx.fillRect(5-Math.floor(i*0.6),i,1,1);}
    for(let i=0;i<10;i++){ctx.fillStyle=wc2;ctx.fillRect(i,9-Math.floor(i*0.7),1,1);ctx.fillRect(9-Math.floor(i*0.7),i,1,1);}
    for(let i=0;i<14;i++){ctx.fillStyle=wc;ctx.fillRect(i,13-Math.floor(i*0.8),1,1);}
    this.done('cobweb');
  }
  genGem(){
    const ctx=this.tex('gem',8,8);
    const rows:number[][]=[[3,4],[2,5],[1,6],[0,7],[1,6],[2,5],[3,4]];
    const gc=['#22aa44','#44cc66','#88eebb','#116622'];
    for(let y=0;y<rows.length;y++){
      for(let x=rows[y][0];x<=rows[y][1];x++){
        const c=x<4&&y<3?gc[2]:x>4&&y>3?gc[3]:(x+y)%2===0?gc[0]:gc[1];
        dot(ctx,x,y+1,c);
      }
    }
    this.done('gem');
  }
  genDust(){
    const ctx=this.tex('dust',3,3);
    ctx.globalAlpha=0.6;ctx.fillStyle='rgb(160,150,130)';
    ctx.fillRect(1,0,1,1);ctx.fillRect(0,1,3,1);ctx.fillRect(1,2,1,1);
    ctx.globalAlpha=1;
    this.done('dust');
  }
  genScorpion(){
    const ctx=this.tex('scorpion',16,12);
    fill(ctx,5,6,6,4,'#6a3a1a');fill(ctx,6,5,4,6,'#6a3a1a');
    dot(ctx,7,6,'#884a28');dot(ctx,8,6,'#884a28');dot(ctx,7,7,'#884a28');
    fill(ctx,3,7,2,3,'#6a3a1a');dot(ctx,3,7,'#884a28');dot(ctx,3,8,'#cc2222');
    fill(ctx,0,5,2,2,'#7a4420');fill(ctx,0,3,2,2,'#7a4420');dot(ctx,0,3,'#884a28');
    fill(ctx,0,9,2,2,'#7a4420');dot(ctx,0,9,'#884a28');
    dot(ctx,11,8,'#5a3018');dot(ctx,12,7,'#5a3018');dot(ctx,13,6,'#5a3018');
    dot(ctx,14,5,'#5a3018');dot(ctx,14,4,'#5a3018');dot(ctx,13,3,'#5a3018');
    dot(ctx,13,2,'#5a3018');dot(ctx,12,2,'#cc2222');dot(ctx,12,1,'#cc2222');
    for(let i=0;i<4;i++){dot(ctx,5+i*2,11,'#4a2a10');dot(ctx,6+i*2,11,'#4a2a10');}
    this.done('scorpion');
  }
  genSpider(){
    const ctx=this.tex('spider',12,12);
    fill(ctx,4,4,4,5,'#2a2a2a');fill(ctx,3,5,6,3,'#2a2a2a');
    dot(ctx,5,5,'#3a3a3a');dot(ctx,6,5,'#3a3a3a');
    fill(ctx,4,2,4,2,'#2a2a2a');dot(ctx,5,2,'#3a3a3a');
    dot(ctx,4,3,'#cc2222');dot(ctx,7,3,'#cc2222');
    const ll:number[][]=[[2,4],[1,3],[2,6],[1,5],[0,5],[2,7],[1,7],[0,8],[3,8],[2,9],[1,10]];
    for(const p of ll)dot(ctx,p[0],p[1],'#1a1a1a');
    const rl:number[][]=[[9,4],[10,3],[9,6],[10,5],[11,5],[9,7],[10,7],[11,8],[8,8],[9,9],[10,10]];
    for(const p of rl)dot(ctx,p[0],p[1],'#1a1a1a');
    dot(ctx,5,7,'#3a3a3a');dot(ctx,6,8,'#3a3a3a');
    this.done('spider');
  }
  genSnake(){
    const ctx=this.tex('snake',16,8);
    const bp:number[][]=[[1,4],[2,3],[3,3],[4,4],[5,5],[6,5],[7,4],[8,3],[9,3],[10,4],[11,5],[12,5],[13,4]];
    for(const p of bp){fill(ctx,p[0],p[1],1,2,'#3a6a2a');dot(ctx,p[0],p[1],'#4a8a3a');dot(ctx,p[0],p[1]+1,'#2a5a1a');}
    dot(ctx,3,3,'#4a8a3a');dot(ctx,7,4,'#4a8a3a');dot(ctx,11,5,'#4a8a3a');
    fill(ctx,13,3,3,3,'#3a6a2a');fill(ctx,14,3,2,3,'#4a8a3a');
    dot(ctx,15,3,'#cccc22');dot(ctx,15,5,'#cc2222');dot(ctx,0,5,'#2a5a1a');
    this.done('snake');
  }
  genGlow(){
    const ctx=this.tex('glow',64,64);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const d=Math.sqrt((x-32)**2+(y-32)**2);
      if(d<32){const a=1-d/32;ctx.globalAlpha=a*a*0.8;ctx.fillStyle='#ffcc88';ctx.fillRect(x,y,1,1);}
    }
    ctx.globalAlpha=1;
    this.done('glow');
  }
  genDoor(){
    const ctx=this.tex('door',16,24);
    // Stone archway
    fill(ctx,0,0,16,24,'#3a3a46');
    fill(ctx,1,0,14,24,'#2a2a34');
    // Arch top
    fill(ctx,3,0,10,2,'#5a5a66');fill(ctx,2,2,12,1,'#5a5a66');fill(ctx,1,3,14,1,'#4a4a54');
    // Dark interior
    fill(ctx,3,3,10,21,'#0a0a14');
    // Archway edges
    for(let y=3;y<24;y++){dot(ctx,2,y,'#4a4a54');dot(ctx,13,y,'#4a4a54');}
    // Keystone
    fill(ctx,6,0,4,2,'#A07820');dot(ctx,7,0,'#c4a060');dot(ctx,8,0,'#c4a060');
    // Aztec symbol on keystone
    dot(ctx,7,1,'#6B5010');dot(ctx,8,1,'#6B5010');
    // Light from inside (golden glow)
    fill(ctx,5,6,6,2,'#2a1a08',0.6);
    fill(ctx,4,8,8,4,'#3a2a10',0.4);
    fill(ctx,6,10,4,2,'#4a3a18',0.5);
    // Steps
    fill(ctx,2,22,12,1,'#5a5a66');fill(ctx,1,23,14,1,'#4a4a54');
    // Highlight & shadow on arch
    dot(ctx,1,3,'#686874');dot(ctx,14,3,'#3e3e48');
    for(let y=4;y<22;y++){dot(ctx,1,y,'#4a4a54',0.5);dot(ctx,14,y,'#3e3e48',0.5);}
    this.done('door');
  }
  genLadder(){
    const ctx=this.tex('ladder',10,16);
    // Side rails
    fill(ctx,0,0,2,16,'#5a3a1a');fill(ctx,8,0,2,16,'#5a3a1a');
    dot(ctx,0,0,'#6a4a2a');dot(ctx,8,0,'#6a4a2a');
    dot(ctx,1,0,'#6a4a2a');dot(ctx,9,0,'#6a4a2a');
    // Rungs
    for(let r=0;r<4;r++){
      const ry=2+r*4;
      fill(ctx,2,ry,6,1,'#6a4a2a');
      dot(ctx,2,ry,'#7a5a3a');dot(ctx,7,ry,'#4a2a10');
    }
    this.done('ladder');
  }
}
