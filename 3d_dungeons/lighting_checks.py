"""Verify actual radial light pixels, glint masking, and desktop/touch torch controls."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUTPUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-lighting-live" if URL.startswith("https:") else "Emberkeep-lighting"
report = {"url": URL, "layouts": [], "native_android_launch": False}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-gpu"])
    for label, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True)]:
        context = browser.new_context(viewport={"width": width, "height": height},
                                      has_touch=touch, is_mobile=touch, device_scale_factor=1)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL)
        start = page.get_by_role("button", name="Enter the halls")
        start.tap() if touch else start.click()
        page.wait_for_function("DungeonAudio.diagnostic().state==='running'")
        page.evaluate("""() => {
          loadFloor(5,604);state='paused';overlay.hidden=true;
          enemies=[];props=[];loot=[];shots=[];heroShots=[];effects=[];floatingTexts=[];
          world.traps=[];world.cracks=[];world.seen.fill(1);world.quake.next=Infinity;
          world.torches.forEach(t=>t.lit=false);
          const room=world.rooms[1];
          player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;
          window.lightTorch=world.torches.find(t=>t.room===1);
          lightTorch.x=player.x;lightTorch.y=player.y;lightTorch.lit=true;
          clock=0;render();
        }""")
        pixels = page.evaluate("""() => {
          const radius=torchRadius(lightTorch),rows=[];
          for(const fraction of [.08,.18,.3,.45,.6,.7,.85,.98]){
            for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*3/4]){
              const x=Math.floor(lightTorch.x+radius*fraction*Math.cos(angle)-camera.x);
              const y=Math.floor(lightTorch.y+radius*fraction*Math.sin(angle)-camera.y);
              if(x<0||y<0||x>=vw||y>=vh)continue;
              const actual=darknessContext.getImageData(x,y,1,1).data[3]/255;
              const expected=1-lightAt({x:x+camera.x+.5,y:y+camera.y+.5});
              rows.push({fraction,angle,actual,expected,error:Math.abs(actual-expected)});
            }
          }
          return rows;
        }""")
        assert len(pixels) >= 12 and max(row["error"] for row in pixels) < .02, pixels
        edge = page.evaluate("""() => {
          const r=torchRadius(lightTorch),x=lightTorch.x,y=lightTorch.y;
          const sample=f=>({x:x+r*f,y});
          const peak=t=>((.45-t.x*.013-t.y*.007)%3.6+3.6)%3.6;
          const inside=sample(.5),outside=sample(1.02);
          const insideGlint=trapGlint(inside,peak(inside)),outsideGlint=trapGlint(outside,peak(outside));
          const steps=Array.from({length:101},(_,i)=>torchIllumination(sample(i/100)));
          return {insideGlint,outsideGlint,steps,
            symmetry:Math.abs(torchIllumination(sample(.6))-torchIllumination({x:x+r*.6/Math.SQRT2,y:y+r*.6/Math.SQRT2}))};
        }""")
        assert edge["insideGlint"] > .99 and edge["outsideGlint"] == 0
        assert edge["symmetry"] < 1e-12
        assert all(0 <= edge["steps"][i] - edge["steps"][i+1] < .02 for i in range(100))
        screenshot = OUTPUT / f"{PREFIX}-{label}-round-falloff.png"
        page.screenshot(path=str(screenshot))
        # Real weapon input toggles the nearby torch without requiring fire.
        page.evaluate("state='playing';player.inv=1000;selectedWorldItem=null;keys.clear();player.cool=0;player.weapon={...weaponTypes.sword,kind:'sword'}")
        page.locator("#touchAttack").tap() if touch else page.keyboard.press("Space")
        assert page.evaluate("!lightTorch.lit")
        page.evaluate("state='paused';overlay.hidden=true;render()")
        dark = OUTPUT / f"{PREFIX}-{label}-doused.png"
        page.screenshot(path=str(dark))
        assert page.evaluate("torchIllumination(player)===0&&lightAt(player)<.6")
        page.evaluate("state='playing';player.cool=0")
        page.locator("#touchAttack").tap() if touch else page.keyboard.press("Space")
        assert page.evaluate("lightTorch.lit")
        occlusion = page.evaluate("""() => {
          state='paused';overlay.hidden=true;
          world.tiles.fill(1);world.rooms=[{...world.rooms[1],x:3,y:3,w:12,h:12,decor:[]}];
          world.torches=[{x:7.5*T,y:7.5*T,room:0,lit:true}];
          for(let y=0;y<H;y++)world.tiles[y*W+9]=0;
          player.x=7.5*T;player.y=7.5*T;floatingTexts=[];render();
          const point={x:10.5*T,y:7.5*T},sx=Math.floor(point.x-camera.x),sy=Math.floor(point.y-camera.y);
          const alpha=darknessContext.getImageData(sx,sy,1,1).data[3]/255;
          return {blocked:torchIllumination(point),unblocked:radialLight(120/torchRadius(world.torches[0])),
                  error:Math.abs(alpha-(1-lightAt({x:sx+camera.x+.5,y:sy+camera.y+.5})))};
        }""")
        assert occlusion["blocked"] == 0 and occlusion["unblocked"] > .2 and occlusion["error"] < .02, occlusion
        ambient = page.evaluate("""() => {
          loadFloor(5,604);state='paused';overlay.hidden=true;enemies=[];props=[];loot=[];
          shots=[];heroShots=[];effects=[];floatingTexts=[];world.traps=[];world.cracks=[];
          world.seen.fill(1);world.quake.next=Infinity;world.torches.forEach(t=>t.lit=false);
          prepareAmbient();const i=corridorTiles.findIndex(Boolean);
          const point={x:(i%W+.5)*T,y:(Math.floor(i/W)+.5)*T};
          return ambientAt(point);
        }""")
        assert abs(ambient - .42) < 1e-12
        page.evaluate("""() => {
          state='paused';overlay.hidden=true;const room=world.rooms[1];
          window.lightTorch=world.torches.find(t=>t.room===1);lightTorch.lit=true;
          lightTorch.x=(room.x+1.5)*T;lightTorch.y=(room.y+1.5)*T;
          player.x=lightTorch.x+40;player.y=lightTorch.y+40;render();
        }""")
        natural = OUTPUT / f"{PREFIX}-{label}-room.png"
        page.screenshot(path=str(natural))
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight")
        assert not errors, errors
        report["layouts"].append({"device": label, "mask_samples": len(pixels),
                                  "max_mask_error": max(row["error"] for row in pixels),
                                  "circular_symmetry": True, "smooth_falloff": True,
                                  "no_glint_outside_light": True, "real_toggle": True,
                                  "walls_block_light": True, "occluded_pixel_error": occlusion["error"],
                                  "corridor_ambient": ambient,
                                  "no_overflow": True, "errors": errors,
                                  "screenshots": [str(screenshot), str(dark), str(natural)]})
        context.close()
    browser.close()

(OUTPUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
