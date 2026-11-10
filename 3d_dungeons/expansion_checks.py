"""Real Edge input/render checks for traps, ranged weapons, and torchlight."""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

OUTPUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
report = {"url": URL, "checks": [], "screenshots": []}


def screenshot(page, name):
    path = OUTPUT / f"Emberkeep-expansion-{name}.png"
    page.screenshot(path=str(path))
    report["screenshots"].append(str(path))
    return path


def fixture(page, code=""):
    page.evaluate("""() => {
      loadFloor(1,604);state='playing';enemies=[];props=[];loot=[];shots=[];heroShots=[];
      world.traps=[];keys.clear();mouse.active=false;mouse.down=false;
      player.inv=0;player.hp=120;player.armor=null;player.cool=0;player.angle=0;
    }""")
    if code:
        page.evaluate(code)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for mobile in (False, True):
        context = browser.new_context(
            viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
            has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
        page = context.new_page()
        errors, requests = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("request", lambda r: requests.append(r.url) if r.url.startswith("http") else None)
        page.goto(URL)
        start = page.get_by_role("button", name="Enter the halls")
        start.tap() if mobile else start.click()
        page.wait_for_timeout(100)
        assert page.evaluate("DungeonAudio.diagnostic().state") == "running"
        fixture(page, """world.traps=[{x:player.x+45,y:player.y,kind:'explosion',
          inspect:0,active:0,revealed:false,triggered:false}]""")
        page.wait_for_timeout(1100)
        assert page.evaluate("!world.traps[0].revealed&&world.traps[0].inspect>0")
        screenshot(page, "phone-inspecting" if mobile else "trap-inspecting")
        page.wait_for_timeout(1200)
        assert page.evaluate("world.traps[0].revealed&&!world.traps[0].triggered&&player.hp===120")
        page.evaluate("player.x=world.traps[0].x")
        page.wait_for_timeout(100)
        assert page.evaluate("player.hp===120&&!world.traps[0].triggered")
        report["checks"].append({"mobile": mobile, "trap_reveal_and_safe_crossing": True})

        # A real movement input crosses the trigger radius without inspecting.
        fixture(page, """world.traps=[{x:player.x+45,y:player.y,kind:'poison',
          inspect:0,active:0,revealed:false,triggered:false}]""")
        if mobile:
            pad = page.locator("#movePad").bounding_box()
            cdp = context.new_cdp_session(page)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [
                {"x": pad["x"]+pad["width"]/2+32, "y": pad["y"]+pad["height"]/2, "id": 1}]})
            page.wait_for_timeout(240)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        else:
            page.keyboard.down("d")
            page.wait_for_timeout(240)
            page.keyboard.up("d")
        assert page.evaluate("world.traps[0].triggered&&player.hp<120&&player.poison>0")
        screenshot(page, "phone-poison" if mobile else "trap-poison")

        # Torches respond to weapon hits only, not E / Use.
        fixture(page, """var darkTorch=world.torches.find(t=>!t.lit);
          player.x=darkTorch.x;player.y=darkTorch.y+35;player.angle=-Math.PI/2;player.weapon={...weaponTypes.sword,kind:'sword'};reveal();render()""")
        page.wait_for_timeout(100)
        assert page.evaluate("nearby()?.type!=='torch'")
        before = page.evaluate("lightAt({x:darkTorch.x+70,y:darkTorch.y+70})")
        dark = screenshot(page, "phone-dark" if mobile else "room-dark")
        action = lambda: page.locator("#touchAttack").tap() if mobile else page.keyboard.press("Space")
        page.evaluate("player.cool=0")
        action()
        page.wait_for_timeout(120)
        assert page.evaluate("darkTorch.lit")
        after = page.evaluate("lightAt({x:darkTorch.x+70,y:darkTorch.y+70})")
        assert after > before + .1, (before, after)
        lit = screenshot(page, "phone-lit" if mobile else "room-lit")
        difference = ImageChops.difference(Image.open(dark).convert("RGB"), Image.open(lit).convert("RGB"))
        assert sum(ImageStat.Stat(difference).mean) > 2, "No visible lighting transition"
        action()
        assert not page.evaluate("darkTorch.lit")
        report["checks"].append({"mobile": mobile, "torch_light_before": before,
                                "torch_light_after": after, "pixel_change": ImageStat.Stat(difference).mean})

        silhouettes = []
        for kind in ("bow", "boomerang", "javelin"):
            fixture(page, f"""player.weapon={{...weaponTypes.{kind},kind:'{kind}',name:'Test {kind}',
              damage:25,color:'#edbf72'}};enemies=[makeEnemy('slime',{{x:player.x+140,y:player.y}})];
              enemies[0].hp=400;enemies[0].cool=100;enemies[0].speed=0""")
            if mobile:
                page.locator("#touchAttack").tap()
            else:
                page.keyboard.press("Space")
            page.wait_for_timeout(100)
            assert page.evaluate("heroShots.length") == 1
            silhouettes.append(screenshot(page, ("phone-" if mobile else "") + kind))
            page.wait_for_timeout(450)
            assert page.evaluate("enemies[0].hp") < 400
            if kind == "boomerang":
                page.wait_for_timeout(1500)
                assert page.evaluate("heroShots.length") == 0
        assert len({hashlib.sha256(Image.open(f).tobytes()).hexdigest() for f in silhouettes}) == 3
        report["checks"].append({"mobile": mobile, "ranged_hits_and_distinct_renders": True})

        fixture(page, """world.traps=[{x:player.x,y:player.y,kind:'trapdoor',
          inspect:0,active:0,revealed:false,triggered:false}]""")
        page.wait_for_timeout(100)
        assert page.evaluate("depth") in (3, 4, 5)
        assert page.evaluate("player.x===world.start.x&&player.y===world.start.y")
        fixture(page)
        page.evaluate("loadFloor(10,604);enemies=enemies.filter(e=>e.type==='dragon')")
        assert page.evaluate("!world.traps.some(t=>t.kind==='trapdoor')")
        assert page.evaluate("enemies.length") == 1
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        assert page.evaluate("document.documentElement.scrollHeight<=innerHeight")
        assert not errors, errors
        if URL.startswith("file:"):
            assert not requests, requests
        report["checks"].append({"mobile": mobile, "trapdoor_valid_destination": True,
                                "finale_preserved": True, "console_errors": errors})
        context.close()
    browser.close()

report["result"] = "passed"
destination = OUTPUT / ("Emberkeep-expansion-live-validation.json" if URL.startswith("http") else "Emberkeep-expansion-validation.json")
destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
