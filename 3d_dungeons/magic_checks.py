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
        if touch:
            page.locator("#inventoryToggle").click()
        page.locator("#difficulty").select_option("easy")
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
        assert page.evaluate("player.hp>30 && player.potions===0")
        page.evaluate("""() => {
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
