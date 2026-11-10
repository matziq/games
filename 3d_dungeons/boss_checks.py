"""Verify quake boundaries and traverse the generated route to the unmodified boss."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUTPUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-boss-live" if URL.startswith("https:") else "Emberkeep-boss"
report = {"url": URL, "layouts": []}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-gpu"])
    for label, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True)]:
        context = browser.new_context(viewport={"width": width, "height": height},
                                      has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.get_by_role("button", name="Enter the halls").click()
        boundaries = page.evaluate("""() => {
          const results=[];
          for(const floor of [1,2,3,9,10]){
            loadFloor(floor,42);state='paused';player.x=world.end.x;player.y=world.end.y;
            world.quake.next=.01;updateEarthquakes(.02,player);
            const warning=world.quake.warning,pending=!!world.quake.pending;
            updateEarthquakes(3,player);
            results.push({floor,warning,pending,cracks:world.cracks.length,depth,state});
          }
          loadFloor(4,42);world.quake.next=.01;updateEarthquakes(200,player);
          return {floors:results,sanctuary:world.quake.elapsed===0&&world.quake.warning===0};
        }""")
        for row in boundaries["floors"]:
            assert row["warning"] == (0 if row["floor"] < 3 else 3), row
            assert row["cracks"] == (1 if 3 <= row["floor"] < 10 else 0), row
            assert row["pending"] == (3 <= row["floor"] < 10), row
            assert row["depth"] == row["floor"] and row["state"] == "paused"
        assert boundaries["sanctuary"]
        route = page.evaluate("""() => {
          loadFloor(10,604);state='paused';overlay.hidden=true;
          const boss=enemies.find(e=>e.type==='dragon'),origin={x:boss.x,y:boss.y};
          const start=Math.floor(player.y/T)*W+Math.floor(player.x/T);
          const goal=Math.floor(boss.y/T)*W+Math.floor(boss.x/T);
          const parents=new Map([[start,null]]),queue=[start];
          for(let i=0;i<queue.length&&!parents.has(goal);i++)
            for(const n of [queue[i]-1,queue[i]+1,queue[i]-W,queue[i]+W]){
              if(n<0||n>=W*H||parents.has(n)||!free((n%W+.5)*T,(Math.floor(n/W)+.5)*T,12))continue;
              parents.set(n,queue[i]);queue.push(n);
            }
          if(!parents.has(goal))throw Error('No knight-clear route to Varkhos');
          const route=[];for(let n=goal;n!==null;n=parents.get(n))route.push(n);
          route.reverse();
          for(const n of route){
            const x=(n%W+.5)*T,y=(Math.floor(n/W)+.5)*T;
            if(Math.hypot(x-boss.x,y-boss.y)<120)break;
            move(player,x-player.x,y-player.y);
            if(Math.hypot(player.x-x,player.y-y)>.01)throw Error('Generated route blocked');
            reveal();
          }
          player.inv=1000;player.hp=player.max;player.angle=Math.atan2(boss.y-player.y,boss.x-player.x);
          world.torches.forEach(t=>{if(t.room===world.rooms.length-1)t.lit=true});
          boss.cool=0;world.quake.next=.01;state='playing';
          return {tiles:route.length,bossAtExit:distance(boss,world.end)===0,
            bossUnmoved:boss.x===origin.x&&boss.y===origin.y,inFinalRoom:pointInRoom(boss,world.rooms.at(-1))};
        }""")
        assert route["tiles"] > 10 and route["bossAtExit"] and route["bossUnmoved"] and route["inFinalRoom"], route
        page.wait_for_function("enemies.find(e=>e.type==='dragon').wind>0")
        page.screenshot(path=str(OUTPUT / f"{PREFIX}-{label}-final-chamber.png"))
        page.wait_for_function("world.quake.warning===0", timeout=6000)
        assert page.evaluate("depth===10&&world.cracks.length===0&&state==='playing'")
        page.wait_for_function("shots.length>0", timeout=6000)
        assert not errors, errors
        report["layouts"].append({"device": label, "boundaries": boundaries, "route": route,
                                  "natural_boss_telegraph_and_projectiles": True,
                                  "final_tremor_no_descent": True, "errors": errors})
        context.close()
    browser.close()

(OUTPUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
