"""Exercise magic and settings in real desktop and touch browser layouts."""
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
          world.tiles.fill(1); props=[]; enemies=[]; world.traps=[];
          player.inv=1000; player.weapon={kind:'wand',effect:'fireball',power:5,name:'Fireball Wand +5',
            damage:10,range:300,cooldown:.55,color:'#ff954d'};
          player.angle=0; player.cool=0;
        }""")
        if touch:
            page.locator("#touchAttack").tap()
        else:
            page.keyboard.press("Space")
        assert page.evaluate("heroShots.some(s=>s.wandEffect==='fireball'&&s.power===5)")
        page.screenshot(path=str(OUT / f"magic-{label}-fireball.png"))
        page.evaluate("player.cool=0;player.weapon.effect='light';attack()")
        assert page.evaluate("world.scrollLights.some(s=>s.coneAngle===player.angle&&s.life>5)")
        page.screenshot(path=str(OUT / f"magic-{label}-light.png"))
        page.evaluate("player.cool=0;player.weapon.effect='fire';attack()")
        page.screenshot(path=str(OUT / f"magic-{label}-flame.png"))
        chain = page.evaluate("""() => {
          player.cool=0;player.weapon.effect='lightning';player.weapon.color='#b8ccff';
          const a=makeEnemy('slime',{x:player.x+70,y:player.y}),b=makeEnemy('slime',{x:player.x+120,y:player.y});
          a.hp=b.hp=300;a.speed=b.speed=0;a.cool=b.cool=1000;enemies=[a,b];attack();updateHeroShots(.14);
          return {hp:b.hp,bolts:world.scrollFlashes.filter(f=>f.kind==='lightning').length};
        }""")
        assert chain["hp"] < 300 and chain["bolts"] >= 2, chain
        page.screenshot(path=str(OUT / f"magic-{label}-lightning.png"))
        page.evaluate("player.scrolls.fireball=1;player.scrolls.light=1;player.selectedScroll='fireball';refreshScrollHUD()")
        page.locator("#scrollSummary").click()
        if touch:
            page.locator("#cycleAmmo").tap()
        else:
            page.keyboard.press("t")
        assert page.evaluate("player.selectedScroll==='light'")
        page.evaluate("""() => {
          var bow={x:player.x,y:player.y,type:'weapon',
            weapon:{kind:'bow',name:'Bow',damage:15,range:400,cooldown:.6,color:'#d5d9d0'}};
          loot.push(bow);equipLoot(bow);player.ammoShared.fire=2;selectedAmmo='regular';refreshScrollHUD();
        }""")
        if touch:
            page.locator("#cycleAmmo").tap()
        else:
            page.keyboard.press("t")
        assert page.evaluate("selectedAmmo==='fire' && player.scrolls.light===0")
        assert page.locator("#scrollChoices").is_hidden()
        if not touch:
            page.keyboard.press("c")
            assert page.evaluate("selectedAmmo==='fire'")
        page.locator("#scrollSummary").click()
        if touch:
            page.locator("#inventoryToggle").click()
        page.locator("#autoEquip").click()
        assert page.locator("#autoEquip").get_attribute("aria-pressed") == "false"
        page.locator("#autoEquip").click()
        page.locator("#preferWeapon").click()
        assert page.locator("#preferWeapon").inner_text() == "Prefer: Magic"
        page.locator("#difficulty").select_option("easy")
        cycle_key = page.get_by_label("Cycle ammo or scrolls key")
        cycle_key.fill("b")
        cycle_key.press("Tab")
        assert page.evaluate("keyBindings.cycle==='b'")
        key = page.get_by_label("Health potion key")
        key.fill("v")
        key.press("Tab")
        assert page.evaluate("difficulty==='easy' && keyBindings.potion==='v'")
        assert page.locator("#healHint").inner_text() == "V HEAL"
        if touch:
            page.locator("#inventoryToggle").click()
            page.locator("#pause").click()
        page.evaluate("player.hp=30;player.potions=1;player.inv=1000;canvas.focus()")
        page.keyboard.press("v")
        healed = page.evaluate("({hp:player.hp,potions:player.potions,state,key:keyBindings.potion,error:$('error').textContent})")
        assert healed["hp"] > 30 and healed["potions"] == 0, (label, healed)
        page.evaluate("""() => {
          player.weapon={kind:'wand',effect:'light',power:5,name:'Light Wand',damage:10,range:300,cooldown:.55};
          player.scrolls.light=2; var item={x:player.x,y:player.y,type:'weapon',
            weapon:{kind:'sword',name:'Sword',damage:15,range:82,cooldown:.36}};
          loot.push(item);equipLoot(item);
        }""")
        assert page.evaluate("player.scrolls.light===0&&loot.filter(i=>i.type==='scroll'&&i.scroll==='light').length===2")
        assert not errors, errors
        results.append({"device": label, "attack": "touch" if touch else "keyboard", "wand_and_scroll_drop": True})
        context.close()
    browser.close()
(OUT / "magic-checks.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
