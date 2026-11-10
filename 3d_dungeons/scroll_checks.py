"""Exercise real canvas right-click, R, scroll selection and touch casting in Edge."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUTPUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-scrolls-live" if URL.startswith("https:") else "Emberkeep-scrolls"
report = {"url": URL, "layouts": [], "native_android_launch": False}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-gpu"])
    for label, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True),
                                       ("small-phone", 320, 568, True), ("landscape", 844, 390, True),
                                       ("tablet", 768, 1024, True)]:
        context = browser.new_context(viewport={"width": width, "height": height},
                                      has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.get_by_role("button", name="Enter the halls").click()
        page.evaluate("""() => {
          loadFloor(3,604);state='playing';enemies=[];props=[];loot=[];world.traps=[];
          world.quake.next=Infinity;world.torches.forEach(t=>t.lit=false);
          const room=world.rooms[1];player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;
          player.angle=0;player.inv=1000;player.scrolls={fireball:1,light:1,poison:1,lightning:1};
          player.selectedScroll='fireball';player.scrollCooldown=0;world.seen.fill(1);
          window.scrollFoe=makeEnemy('slime',{x:player.x+105,y:player.y});
          scrollFoe.hp=scrollFoe.max=500;scrollFoe.speed=0;scrollFoe.cool=1000;enemies=[scrollFoe];
          window.attackCalls=0;const original=attack;attack=()=>{attackCalls++;original()};
          window.canvasMenus=[];canvas.addEventListener('contextmenu',event=>canvasMenus.push(event.defaultPrevented));
          render();
        }""")

        def select(kind):
            if not page.locator("#scrollPanel").evaluate("(element)=>element.open"):
                page.locator("#scrollSummary").tap() if touch else page.locator("#scrollSummary").click()
            page.locator("#scroll-" + kind).tap() if touch else page.locator("#scroll-" + kind).click()
            assert page.locator("#scroll-" + kind).get_attribute("aria-pressed") == "true"

        if touch:
            select("fireball")
            page.locator("#castScroll").tap()
        else:
            point = page.evaluate("""() => {const r=canvas.getBoundingClientRect();
              return {x:r.left+scrollFoe.x-camera.x,y:r.top+scrollFoe.y-camera.y}}""")
            page.mouse.click(point["x"], point["y"], button="right")
            assert page.evaluate("canvasMenus.length===1&&canvasMenus[0]"), "Canvas menu was not suppressed"
        assert page.evaluate("player.scrolls.fireball===0&&scrollFoe.hp<=445&&scrollFoe.burn>0&&attackCalls===0")
        page.screenshot(path=str(OUTPUT / f"{PREFIX}-{label}-fireball.png"))
        page.evaluate("player.scrollCooldown=0")
        page.keyboard.press("r")
        assert page.evaluate("player.scrolls.fireball===0"), "Empty cast duplicated/underflowed inventory"
        select("light")
        page.evaluate("player.scrollCooldown=0")
        page.locator("#castScroll").tap() if touch else page.locator("#castScroll").click()
        assert page.evaluate("player.scrolls.light===0&&world.scrollLights.length===1&&torchIllumination(player)>.9")
        select("poison")
        page.evaluate("player.scrollCooldown=0;player.angle=0;mouse.active=false")
        page.keyboard.press("r")
        assert page.evaluate("player.scrolls.poison===0&&world.scrollZones.length===1")
        page.wait_for_function("scrollFoe.poison>0")
        select("lightning")
        page.evaluate("player.scrollCooldown=0;player.angle=0;mouse.active=false;player.scrolls.lightning=2;window.beforeBolt=scrollFoe.hp")
        page.keyboard.down("r")
        assert page.evaluate("player.scrolls.lightning===1&&scrollFoe.hp<=beforeBolt-100")
        page.evaluate("player.scrollCooldown=0")
        page.keyboard.down("r")
        assert page.evaluate("player.scrolls.lightning===1"), "Repeated keydown cast twice"
        page.keyboard.up("r")
        page.screenshot(path=str(OUTPUT / f"{PREFIX}-{label}-lightning.png"))
        page.evaluate("""() => {
          loot=[{x:player.x,y:player.y,type:'scroll',scroll:'light'}];
        }""")
        page.wait_for_function("player.scrolls.light===1")
        page.evaluate("""() => {
          window.gear={x:player.x+35,y:player.y-40,type:'weapon',
            weapon:{...weaponTypes.sword,kind:'sword',name:'Scroll interaction sword',damage:18,color:'#dddddd'}};
          loot.push(gear);
        }""")
        gear_point = page.evaluate("""() => {const r=canvas.getBoundingClientRect();
          return {x:r.left+gear.x-camera.x,y:r.top+gear.y-camera.y}}""")
        page.touchscreen.tap(gear_point["x"], gear_point["y"]) if touch else page.mouse.click(gear_point["x"], gear_point["y"])
        assert page.evaluate("selectedWorldItem===gear"), page.evaluate("""() => ({
          selected:selectedWorldItem?.type,distance:distance(gear,player),reachable:targetReachable(gear),
          seen:world.seen[Math.floor(gear.y/T)*W+Math.floor(gear.x/T)],rect:canvas.getBoundingClientRect().toJSON(),
          camera,vw,vh,gear:{x:gear.x,y:gear.y},layout:innerWidth,state,exists:loot.includes(gear),
          overlay:document.elementFromPoint(canvas.getBoundingClientRect().left+gear.x-camera.x,canvas.getBoundingClientRect().top+gear.y-camera.y)?.outerHTML.slice(0,200)
        })""")
        select("light")
        page.wait_for_timeout(150)
        assert page.locator("#scrollPanel").evaluate("(element)=>element.open"), "Selection prevented choosing a spell"
        page.evaluate("state='paused';window.lightCount=player.scrolls.light")
        page.keyboard.press("r")
        assert page.evaluate("player.scrolls.light===lightCount")
        outside = page.evaluate("""() => {
          const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
          document.querySelector('header').dispatchEvent(event);return event.defaultPrevented;
        }""")
        assert not outside, "Context menu disabled outside canvas"
        page.evaluate("state='playing';refreshScrollHUD()")
        page.screenshot(path=str(OUTPUT / f"{PREFIX}-{label}-scroll-panel.png"))
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight")
        assert not errors, errors
        report["layouts"].append({"device": label, "right_click": not touch, "keyboard_R": True,
                                  "touch_cast": touch, "all_four_effects": True, "single_use": True,
                                  "pickup": True, "paused_cast_preserves_inventory": True,
                                  "context_menu_only_canvas": True, "no_primary_attack": True,
                                  "key_repeat_ignored": True, "spell_choice_while_gear_selected": True,
                                  "no_overflow": True, "errors": errors})
        context.close()
    browser.close()

(OUTPUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
