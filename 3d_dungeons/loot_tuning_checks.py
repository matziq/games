"""Verify loot attraction and lifetime behavior in desktop and touch browsers."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-loot-tuning-live" if URL.startswith("https:") else "Emberkeep-loot-tuning"
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
        help_text = page.locator(".intro .controls").inner_text()
        assert "3.75 tiles" in help_text and "30 seconds" in help_text and "60" in help_text
        page.locator("#start").click()
        boundary = page.evaluate("""() => {
          loadFloor(1,604); enemies=[]; props=[]; world.traps=[]; world.quake.next=Infinity;
          player.inv=1000; player.dash=0; world.seen.fill(1);
          const kinds=[{type:'gold',value:1},{type:'scroll',scroll:'light'},{type:'potion'},
            ...['bow','crossbow'].flatMap(ammoKind=>['fire','poison','explosive','light']
              .map(special=>({type:'ammo',ammoKind,special})))];
          const x=player.x, near=kinds.map(k=>({...k,x:x+150,y:player.y})),
            far=kinds.map(k=>({...k,x:x+150.01,y:player.y}));
          const gear=['weapon','armor'].map(type=>({type,x:x+100,y:player.y}));
          loot=[...near,...far,...gear];baseUpdate(.04);
          const valid=near.every(i=>i.x<x+150)&&far.every(i=>i.x===x+150.01)&&gear.every(i=>i.x===x+100);
          loot=[];return valid;
        }""")
        assert boundary
        page.evaluate("""() => {
          loot=[];window.beforePickup={gold:player.gold,potions:player.potions,scroll:player.scrolls.light,
            arrows:player.ammo.bow.fire,bolts:player.ammo.crossbow.poison};
          loot=[{x:player.x+145,y:player.y,type:'gold',value:9},
                {x:player.x+145,y:player.y,type:'scroll',scroll:'light'},
                {x:player.x+145,y:player.y,type:'potion'},
                {x:player.x+145,y:player.y,type:'ammo',ammoKind:'bow',special:'fire'},
                {x:player.x+145,y:player.y,type:'ammo',ammoKind:'crossbow',special:'poison'}];
        }""")
        try:
            page.wait_for_function("""player.gold===beforePickup.gold+9&&player.potions===beforePickup.potions+1&&
              player.scrolls.light===beforePickup.scroll+1&&player.ammo.bow.fire===beforePickup.arrows+5&&
              player.ammo.crossbow.poison===beforePickup.bolts+5""", timeout=5000)
        except Exception as exc:
            raise AssertionError(page.evaluate("({state,beforePickup,player,loot})")) from exc
        page.evaluate("""() => {
          window.gear={x:player.x+180,y:player.y,type:'weapon',weapon:makeWeapon(),age:29.7};
          window.pot={x:player.x+180,y:player.y,type:'potion',age:19.7};
          loot=[gear,pot];
        }""")
        page.wait_for_function("gear.age>30&&!lootVisible(gear)")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}.png"))
        page.wait_for_function("!loot.includes(pot)")
        page.keyboard.press("p")
        frozen = page.evaluate("({age:gear.age,x:gear.x})")
        page.wait_for_timeout(300)
        assert page.evaluate("({age:gear.age,x:gear.x})") == frozen
        page.keyboard.press("p")
        page.evaluate("loadFloor(2,604);enemies=[];props=[];world.traps=[];loot=[gear];openShop()")
        frozen = page.evaluate("({age:gear.age,x:gear.x})")
        page.wait_for_timeout(300)
        assert page.evaluate("({age:gear.age,x:gear.x})") == frozen
        page.locator("#closeShop").click()
        page.evaluate("gear.age=59.7")
        page.wait_for_function("!loot.includes(gear)")
        if touch:
            page.locator("#inventoryToggle").click()
        page.locator("#autoEquip").check()
        page.locator("#preferWeapon").select_option("ranged")
        if touch:
            page.locator("#closeInventory").click()
            page.keyboard.press("p")
        page.evaluate("""() => {
          world.tiles.fill(1);props=[];enemies=[];world.traps=[];
          window.oldWeapon=player.weapon;window.autoWeapon={...oldWeapon,kind:'bow',name:'Better Bow',damage:oldWeapon.damage+10};
          loot=[{x:player.x+100,y:player.y,type:'weapon',weapon:autoWeapon}];
        }""")
        page.wait_for_function("player.weapon===autoWeapon")
        assert page.evaluate("loot.some(i=>i.weapon===oldWeapon)")
        if touch:
            page.locator("#inventoryToggle").click()
        page.locator("#preferWeapon").select_option("melee")
        if touch:
            page.locator("#closeInventory").click()
            page.keyboard.press("p")
        page.evaluate("window.manualWeapon={...autoWeapon,kind:'sword',name:'Better Sword',damage:autoWeapon.damage+1};loot=[{x:player.x+100,y:player.y,type:'weapon',weapon:manualWeapon}]")
        page.wait_for_function("player.weapon===manualWeapon")
        if touch:
            page.locator("#inventoryToggle").click()
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-auto-equipment.png"))
        page.locator("#autoEquip").uncheck()
        if touch:
            page.locator("#closeInventory").click()
            page.keyboard.press("p")
        page.evaluate("loot=[{x:player.x+100,y:player.y,type:'weapon',weapon:{...manualWeapon,damage:999}}]")
        page.wait_for_timeout(200)
        assert page.evaluate("player.weapon===manualWeapon")
        assert not errors, errors
        report["layouts"].append({"name": name, "exact_radius_and_manual_gear": True,
                                  "natural_pickups": True, "lifetime_and_pause": True,
                                  "auto_equipment_ui_and_preferences": True, "errors": errors})
        context.close()
    browser.close()

(OUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
