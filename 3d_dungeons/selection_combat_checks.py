"""Verify floor selection and actual combat coexist under mouse and touch input."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-selection-combat-live" if URL.startswith("https:") else "Emberkeep-selection-combat"
report = {"url": URL, "layouts": [], "native_android_launch": False}
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for name, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True),
                                       ("small-phone", 320, 568, True), ("landscape", 844, 390, True)]:
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.locator("#start").click()
        for kind in ["sword", "bow"]:
            page.evaluate("""kind => {
              loadFloor(1,604);world.tiles.fill(1);world.seen.fill(1);world.traps=[];props=[];
              world.rooms.forEach(r=>{r.hatchStarted=true;r.hatchTimer=0;r.collapse=null});
              world.torches=[];world.quake.next=Infinity;heroShots=[];shots=[];keys.clear();
              gearPreferences.enabled=false;player.inv=1000;player.dash=0;player.cool=0;player.root=0;
              player.weapon={...weaponTypes[kind],kind,name:'Combat test',damage:20,color:'#ddd'};
              player.angle=Math.PI;mouse.active=false;
              window.pickup={x:player.x+40,y:player.y,type:'weapon',weapon:makeWeapon()};
              window.mail={x:pickup.x,y:pickup.y,type:'armor',armor:{...makeArmor('boots'),kind:'chain'}};
              loot=[pickup,mail];window.originalWeapon=player.weapon;
              window.foe=makeEnemy('slime',{x:player.x+(kind==='bow'?180:55),y:player.y});
              foe.hp=foe.max=500;foe.speed=0;foe.cool=1000;enemies=[foe];
            }""", kind)
            page.wait_for_timeout(100)
            point = page.evaluate("""() => {
              const r=canvas.getBoundingClientRect();
              return {x:r.left+(pickup.x-camera.x)/vw*r.width,y:r.top+(pickup.y-camera.y)/vh*r.height};
            }""")
            if touch:
                page.touchscreen.tap(**point)
                assert page.evaluate("selectedWorldItem===pickup&&foe.hp<500" if kind == "sword" else "selectedWorldItem===pickup")
                box = page.locator("#touchAttack").bounding_box()
                cdp = context.new_cdp_session(page)
                cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [
                    {"x": box["x"]+box["width"]/2, "y": box["y"]+box["height"]/2, "id": 1}]})
            else:
                page.mouse.move(**point)
                page.mouse.down()
            page.wait_for_timeout(1700 if kind == "bow" else 900)
            assert page.evaluate("selectedWorldItem===pickup&&foe.hp<=460&&player.weapon===originalWeapon&&loot.includes(pickup)&&loot.includes(mail)"), (name, kind, page.evaluate("({selected:selectedWorldItem,hp:foe.hp,angle:player.angle,down:mouse.down,shots:heroShots.length})"))
            if touch:
                cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                cdp.detach()
            else:
                page.mouse.up()
            page.wait_for_timeout(150)
            if not touch:
                page.evaluate("player.cool=0;window.beforeRepeat=foe.hp")
                page.mouse.click(**point)
                assert page.evaluate("selectedWorldItem===mail")
                page.wait_for_timeout(850)
                page.mouse.click(**point)
                assert page.evaluate("selectedWorldItem===pickup")
                page.wait_for_timeout(850)
                assert page.evaluate("foe.hp<=beforeRepeat-40&&player.weapon===originalWeapon")
            page.screenshot(path=str(OUT / f"{PREFIX}-{name}-{kind}.png"))
            page.locator("#selectionChoices button").nth(1).click()
            assert page.evaluate("selectedWorldItem===mail")
            page.keyboard.press("e")
            assert page.evaluate("player.boots===mail.armor&&!loot.includes(mail)&&loot.includes(pickup)")
        assert not errors, errors
        report["layouts"].append({"name": name, "melee_and_ranged_held_input": True,
                                  "selected_loot_does_not_activate": True, "overlap_and_use": True, "errors": errors})
        context.close()
    browser.close()
(OUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
