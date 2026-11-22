"""Verify and capture actual Fireball and Lightning casts in Edge."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\AI_Output\Emberkeep\checks")
OUT.mkdir(parents=True, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
prefix = "spell-effects-live" if URL.startswith("https:") else "spell-effects"
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for label, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True)]:
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.locator("#start").click()
        for kind, expected_damage in [("fireball", 55), ("lightning", 100)]:
            page.evaluate("""kind => {
              loadFloor(3,604);state='playing';props=[];loot=[];world.traps=[];world.tiles.fill(1);
              world.quake.next=Infinity;world.seen.fill(1);player.inv=1000;player.angle=0;mouse.active=false;
              player.selectedScroll=kind;player.scrolls[kind]=1;player.scrollCooldown=0;
              window.target=makeEnemy('slime',{x:player.x+105,y:player.y});
              target.hp=target.max=500;target.speed=0;target.cool=1000;enemies=[target];
              world.scrollFlashes=[];effects=[];floatingTexts=[];refreshScrollHUD();render();
            }""", kind)
            if touch:
                page.locator("#scrollSummary").tap()
                page.locator("#castScroll").tap()
            else:
                page.keyboard.press("r")
            page.wait_for_function("world.scrollFlashes.length>0")
            result = page.evaluate("""() => {
              state='paused';const flash=world.scrollFlashes[0];flash.life=.34;
              const hp=target.hp,remaining=player.scrolls[player.selectedScroll];
              render();const withEffect=ctx.getImageData(0,0,canvas.width,canvas.height).data;
              world.scrollFlashes=[];effects=[];floatingTexts=[];render();
              const baseline=ctx.getImageData(0,0,canvas.width,canvas.height).data;
              let changed=0;for(let i=0;i<baseline.length;i+=4)
                if(Math.abs(withEffect[i]-baseline[i])+Math.abs(withEffect[i+1]-baseline[i+1])+Math.abs(withEffect[i+2]-baseline[i+2])>30)changed++;
              world.scrollFlashes=[flash];render();
              return {hp,remaining,changed,kind:flash.kind};
            }""")
            assert result["hp"] == 500 - expected_damage and result["remaining"] == 0, result
            assert result["kind"] == kind and result["changed"] > 150, result
            screenshot = OUT / f"{prefix}-{label}-{kind}.png"
            page.screenshot(path=str(screenshot))
            results.append({"device": label, "spell": kind, "changed_pixels": result["changed"],
                            "damage": expected_damage, "screenshot": str(screenshot)})
        assert not errors, errors
        context.close()
    browser.close()
(OUT / f"{prefix}-checks.json").write_text(json.dumps({"url": URL, "results": results}, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
