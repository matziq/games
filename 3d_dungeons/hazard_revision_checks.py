"""Check revised hazards through desktop and touch controls in Edge."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\AI_Output\Emberkeep\checks")
OUT.mkdir(parents=True, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
results = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True)
    for label, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True)]:
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.locator("#start").click()
        page.evaluate("""() => {
            loadFloor(1,604);world.tiles.fill(1);world.merchant=null;props=[];enemies=[];loot=[];
            world.traps=[{x:player.x+180,y:player.y,kind:'fire',revealed:true,triggered:false,inspect:0,active:0}];
            player.angle=0;mouse.active=false;player.inv=1000;player.cool=0;
            player.weapon={...weaponTypes.sword,kind:'sword',name:'Test Sword',damage:25,color:'#ddd'};
            world.boulder={x:player.x+65,y:player.y,axis:'x',direction:1,age:11.5,hp:100,max:100,radius:49};
        }""")
        page.screenshot(path=str(OUT / f"hazards-{label}-boulder.png"))
        if touch:
            page.locator("#touchAttack").tap()
        else:
            page.keyboard.press("Space")
        assert page.evaluate("world.boulder && world.boulder.hp<100")
        before = page.evaluate("({hp:world.boulder.hp,age:world.boulder.age})")
        page.locator("#pause").click()
        page.reload()
        page.locator("#resumeSaved").click()
        restored = page.evaluate("({hp:world.boulder.hp,age:world.boulder.age,armed:world.traps[0].revealed&&!world.traps[0].triggered})")
        assert restored["hp"] == before["hp"] and restored["age"] >= before["age"] and restored["armed"], restored
        outcome = page.evaluate("""() => {
            const trap=world.traps[0]; const victim=makeEnemy('slime',trap);
            victim.hp=victim.max=300;victim.speed=0;victim.emerge=1000;
            enemies=[victim];player.hp=120;player.inv=0;updateTraps(.01,false);
            return {triggered:trap.triggered, faction:trap.targetFaction, burn:victim.burn, heroHp:player.hp};
        }""")
        assert outcome["triggered"] and outcome["faction"] == "enemy" and outcome["burn"] > 0 and outcome["heroHp"] == 120, outcome
        assert not errors, errors
        results.append({"device": label, "attack": "touch" if touch else "keyboard", "restored": restored, "trap": outcome})
        context.close()
    browser.close()
(OUT / "hazard-revision-checks.json").write_text(json.dumps({"url": URL, "results": results}, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
