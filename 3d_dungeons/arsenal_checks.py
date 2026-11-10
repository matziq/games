"""Exercise nest timers, special ammo inputs, web roots and pits in real Edge."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-arsenal-live" if URL.startswith("https:") else "Emberkeep-arsenal"
report = {"url": URL, "layouts": [], "native_android_launch": False}
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for name, w, h, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True),
                              ("small-phone", 320, 568, True), ("landscape", 844, 390, True)]:
        context = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.locator("#start").click()
        page.evaluate("""() => {
          loadFloor(1,604);enemies=[];loot=[];world.traps=[];world.quake.next=Infinity;
          player.inv=1000;player.hp=500;world.seen.fill(1);
          window.nest=world.rooms.find(r=>r.kind==='spider');
          window.savedEgg=nest.decor[0];breakProp(savedEgg,999);loot=[];
          player.x=(nest.x+nest.w/2)*T;player.y=(nest.y+nest.h/2)*T;
        }""")
        page.wait_for_function("nest.hatchTimer>3")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-eggs.png"))
        page.wait_for_function("enemies.filter(e=>e.baby).length===15")
        assert page.evaluate("savedEgg.broken&&nest.decor.every(e=>e.open)&&enemies.every(e=>e.speed===245)")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-swarm.png"))
        page.evaluate("""() => {
          loadFloor(1,604);enemies=[];props=[];world.traps=[];world.torches=[];world.tiles.fill(1);
          world.rooms.forEach(r=>{r.hatchStarted=true;r.hatchTimer=0;r.collapse=null});
          player.inv=1000;player.angle=0;world.seen.fill(1);
          player.weapon={...weaponTypes.crossbow,kind:'crossbow',damage:25,color:'#badde9',name:'Test Crossbow'};
          loot=[{x:player.x,y:player.y,type:'ammo',ammoKind:'crossbow',special:'light',value:5}];
        }""")
        page.wait_for_function("player.ammo.crossbow.light===5")
        page.locator("#scrollSummary").click()
        assert "light (5)" in page.locator("#cycleAmmo").inner_text()
        def ammo_action():
            if touch:
                page.locator("#cycleAmmo").tap()
            else:
                page.keyboard.press("c")
        ammo_action()
        assert page.evaluate("player.ammoChoice.crossbow==='regular'")
        ammo_action()
        assert page.evaluate("player.ammoChoice.crossbow==='light'")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-ammo.png"))
        page.locator("#scrollSummary").click()
        if touch:
            page.locator("#touchAttack").tap()
        else:
            page.keyboard.press("Space")
        page.wait_for_function("player.ammo.crossbow.light===4&&world.scrollLights.length===1")
        assert page.evaluate("world.scrollLights[0].magicRadius===170")
        page.evaluate("""() => {
          heroShots=[];player.cool=0;player.angle=0;mouse.active=false;canvas.focus();
          window.testTorch={x:player.x+40,y:player.y,lit:false,room:0,type:'torch'};world.torches=[testTorch];
        }""")
        if touch:
            page.locator("#touchAttack").tap()
        else:
            page.keyboard.press("Space")
        page.wait_for_timeout(250)
        assert page.evaluate("testTorch.lit"), (name, errors, page.locator("#error").inner_text(), page.evaluate("({state,angle:player.angle,shots:heroShots.length,cool:player.cool,ammo:player.ammo.crossbow})"))
        page.evaluate("""() => {
          world.torches=[];player.inv=0;player.root=0;player.angle=0;
          const spider=makeEnemy('cave_spider',{x:player.x+50,y:player.y});
          shoot(spider,Math.PI,spider.shotSpeed);window.webX=player.x;
        }""")
        page.wait_for_function("player.root>0")
        assert page.evaluate("!shots.some(s=>s.type==='web')")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-web.png"))
        page.keyboard.down("d")
        page.wait_for_timeout(300)
        assert page.evaluate("Math.abs(player.x-webX)<.01")
        page.wait_for_function("player.x>webX+5")
        page.keyboard.up("d")
        page.evaluate("""() => {
          enemies=[];props=[];world.traps=[];heroShots=[];player.root=0;player.dash=0;player.inv=1000;
          window.scrollBefore=player.scrolls.light;window.lootX=player.x;
          window.fadingGear={x:player.x+95,y:player.y,type:'weapon',weapon:makeWeapon(),age:9.7};
          loot=[fadingGear,{x:player.x+120,y:player.y,type:'scroll',scroll:'light'}];
        }""")
        page.wait_for_function("player.scrolls.light===scrollBefore+1")
        assert page.evaluate("fadingGear.x===lootX+95")
        page.wait_for_function("fadingGear.age>10")
        page.keyboard.press("p")
        paused_age = page.evaluate("fadingGear.age")
        page.wait_for_timeout(350)
        assert page.evaluate("fadingGear.age") == paused_age
        page.keyboard.press("p")
        page.wait_for_function("lootVisible(fadingGear)")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-fading-loot.png"))
        page.evaluate("fadingGear.age=19.8")
        page.wait_for_function("!loot.includes(fadingGear)")
        for container in ["barrel", "crate", "chest"]:
            page.evaluate("""type => {
              loot=[];props=[];world.traps=[];player.angle=0;mouse.active=false;canvas.focus();player.cool=0;
              player.weapon={...weaponTypes.sword,kind:'sword',damage:100,name:'Test Sword',color:'#ddd'};
              window.remnant={x:player.x+45,y:player.y,type,hp:1,open:false};props=[remnant];
            }""", container)
            if container == "chest":
                if touch:
                    page.locator("#touchInteract").tap()
                else:
                    page.keyboard.press("e")
            elif touch:
                page.locator("#touchAttack").tap()
            else:
                page.keyboard.press("Space")
            page.wait_for_function("remnant.open")
            page.evaluate("loot=[];player.cool=0")
            if touch:
                page.locator("#touchAttack").tap()
            else:
                page.keyboard.press("Space")
            page.wait_for_function("remnant.destroyed")
            assert page.evaluate("loot.length===0&&!blocksShot(remnant)")
        page.evaluate("""() => {
          props=[];loot=[];heroShots=[];player.inv=1000;
          window.safeTest={x:player.x+45,y:player.y,kind:'fire',inspect:0,active:0};
          window.trapBug=makeEnemy('bug',safeTest);trapBug.hp=300;trapBug.trapSwarm=true;trapBug.emerge=10;
          enemies=[trapBug];world.traps=[safeTest];
        }""")
        page.wait_for_timeout(350)
        assert page.evaluate("!safeTest.triggered&&trapBug.hp===300")
        page.evaluate("safeTest.revealed=true")
        if touch:
            page.locator("#touchInteract").tap()
        else:
            page.keyboard.press("e")
        page.wait_for_function("safeTest.arming>0")
        assert page.evaluate("!safeTest.triggered")
        page.wait_for_function("safeTest.triggered&&trapBug.burn>0&&trapBug.hp<300")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-active-trap.png"))
        page.evaluate("""() => {
          loadFloor(3,604);enemies=[];props=[];world.traps=[];world.quake.next=Infinity;
          const room=world.rooms.find(r=>r.kind==='abandoned');
          player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;player.inv=1000;
          room.collapse={timer:100,warning:{x:player.x+80,y:player.y,life:2},count:0};
          world.seen.fill(1);
        }""")
        page.wait_for_function("world.pits.length===1")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-pit.png"))
        page.evaluate("() => {player.x=world.pits[0].x;player.y=world.pits[0].y}")
        page.wait_for_function("depth===4")
        assert page.evaluate("state==='playing'&&player.root===0")
        assert not errors, errors
        report["layouts"].append({"name": name, "natural_egg_hatch": True, "destroyed_egg_stays_dead": True,
                                   "five_pack_pickup": True, "ammo_keyboard_or_touch_selection": True,
                                   "real_attack_consumption": True, "projectile_relights_torch": True,
                                   "instant_web_root_and_expiry": True, "pit_exact_one_floor": True,
                                   "scroll_vacuum": True, "loot_blink_expiry_pause": True,
                                   "clear_container_remains": True, "mob_only_affected_after_activation": True,
                                   "errors": errors})
        context.close()
    browser.close()
(OUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
