"""Exercise saved runs across actual Edge browser restarts."""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\AI_Output\Emberkeep\checks")
OUT.mkdir(parents=True, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
results = []
with sync_playwright() as playwright:
    for label, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True)]:
        with tempfile.TemporaryDirectory(prefix="emberkeep-test-", ignore_cleanup_errors=True) as profile:
            def open_browser():
                return playwright.chromium.launch_persistent_context(
                    profile, channel="msedge", headless=True,
                    viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch)

            context = open_browser()
            page = context.pages[0] if context.pages else context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(URL)
            page.locator("#start").click()
            page.evaluate("""() => {
                loadFloor(8,604); player.weapon={kind:'wand',effect:'light',power:8,range:300,damage:13}; player.gold=4321; player.scrolls.light=7;
                difficulty='hard'; keyBindings.ammo='v';
                player.ammoShared.light=8; selectedAmmo='light'; world.boss.hp=101;
                world.rooms[1].decor[0].broken=true; world.quake.next=Infinity;
                player.inv=1000; enemies.forEach(enemy=>{enemy.speed=0;enemy.cool=1000});
            }""")
            page.wait_for_timeout(2500)
            assert page.evaluate("JSON.parse(localStorage.getItem(RUN_SAVE_KEY)).version") == 1
            page.locator("#pause").click()
            context.close()

            context = open_browser()
            page = context.pages[0] if context.pages else context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(URL)
            assert page.locator("#resumeSaved").is_visible()
            page.screenshot(path=str(OUT / f"save-{label}-title.png"))
            page.locator("#start").click()
            assert page.locator("#title").inner_text() == "Begin a new journey?"
            page.keyboard.press("Escape")
            assert page.locator("#resumeSaved").is_visible()
            if touch:
                page.locator("#resumeSaved").tap()
            else:
                page.locator("#resumeSaved").click()
            result = page.evaluate("""() => ({
                state, depth, gold:player.gold, scrolls:player.scrolls.light,
                ammo:player.ammoShared.light, selectedAmmo, bossHp:world.boss.hp,
                difficulty, ammoKey:keyBindings.ammo, wand:player.weapon.kind==='wand',
                shared:enemies.includes(world.boss)&&props.includes(world.rooms[1].decor[0]),
                broken:world.rooms[1].decor[0].broken, quake:world.quake.next===Infinity
            })""")
            assert result == {"state":"playing", "depth":8, "gold":4321, "scrolls":7,
                              "ammo":8, "selectedAmmo":"light", "bossHp":101, "difficulty":"hard", "ammoKey":"v", "wand":True,
                              "shared":True, "broken":True, "quake":True}, result
            page.screenshot(path=str(OUT / f"save-{label}-resumed.png"))
            page.reload()
            assert page.locator("#resumeSaved").is_visible()
            page.locator("#resumeSaved").click()
            page.evaluate("state='playing';world.merchant=null;player.inv=0;player.hp=1;damagePlayer(10000)")
            assert page.evaluate("state==='dead' && localStorage.getItem(RUN_SAVE_KEY)===null")
            page.reload()
            assert page.locator("#resumeSaved").is_hidden()
            page.evaluate("localStorage.setItem(RUN_SAVE_KEY,'broken')")
            page.reload()
            assert page.locator("#resumeSaved").is_hidden()
            assert "invalid" in page.locator("#error").inner_text()
            page.locator("#restart").click()
            assert page.locator("#title").inner_text() == "Begin a new journey?"
            assert page.evaluate("localStorage.getItem(RUN_SAVE_KEY)") == "broken"
            page.locator("#start").click()
            assert page.evaluate("state==='playing' && JSON.parse(localStorage.getItem(RUN_SAVE_KEY)).version===1")
            assert not errors, errors
            context.close()
            results.append({"device": label, "browser_restart": True, "saved_state": result, "death_cleared": True})
(OUT / "persistence-checks.json").write_text(json.dumps({"url": URL, "results": results}, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
