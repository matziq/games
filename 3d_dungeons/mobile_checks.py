"""Exercise real touch input, responsive layouts, and the bundled offline APK."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUTPUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
OUTPUT.mkdir(parents=True, exist_ok=True)
report = {"url": URL, "browser": "Microsoft Edge with mobile touch emulation", "layouts": []}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for name, width, height in [("small-phone", 320, 568), ("phone", 390, 844),
                               ("phone-landscape", 844, 390), ("tablet", 768, 1024)]:
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=True,
                                      is_mobile=True, device_scale_factor=1)
        page = context.new_page()
        errors = []
        external = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("request", lambda request: external.append(request.url) if request.url.startswith("http") else None)
        page.goto(URL)
        page.get_by_role("button", name="Enter the halls").tap()
        page.wait_for_timeout(200)
        assert page.evaluate("state") == "playing"
        assert page.evaluate("DungeonAudio.diagnostic().state") == "running"
        page.evaluate("enemies=[];props=[];loot=[];player.inv=10;keys.clear()")
        dimensions = page.evaluate("""() => {
          const c=canvas.getBoundingClientRect();
          return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
            scrollHeight:document.documentElement.scrollHeight,canvasWidth:c.width,canvasHeight:c.height,
            controls:document.getElementById('touchControls').getBoundingClientRect().toJSON()};
        }""")
        assert dimensions["scrollWidth"] <= width, dimensions
        assert dimensions["scrollHeight"] <= height, dimensions
        assert dimensions["canvasWidth"] > 200 and dimensions["canvasHeight"] > 180, dimensions
        for control in ("movePad", "touchAttack", "touchInteract", "touchDodge", "touchHeal"):
            rect = page.locator("#" + control).bounding_box()
            assert rect and rect["x"] >= 0 and rect["y"] >= 0, (control, rect)
            assert rect["x"] + rect["width"] <= width and rect["y"] + rect["height"] <= height, (control, rect)
        pad = page.locator("#movePad").bounding_box()
        attack = page.locator("#touchAttack").bounding_box()
        x, y = pad["x"] + pad["width"]/2, pad["y"] + pad["height"]/2
        ax, ay = attack["x"] + attack["width"]/2, attack["y"] + attack["height"]/2
        cdp = context.new_cdp_session(page)
        start = page.evaluate("({x:player.x,y:player.y})")
        # Choose a clear movement direction in the starting room.
        direction = page.evaluate("free(player.x+70,player.y,12)?1:-1")
        finger = {"x": x + 30 * direction, "y": y, "id": 1}
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [finger]})
        page.wait_for_timeout(250)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [finger, {"x": ax, "y": ay, "id": 2}]})
        page.wait_for_timeout(400)
        assert page.evaluate("keys.has(' ')"), "attack hold did not reach game input"
        assert page.evaluate("player.cool>0"), "held attack did not execute"
        end = page.evaluate("({x:player.x,y:player.y})")
        assert abs(end["x"]-start["x"]) > 15, (start, end)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        assert page.evaluate("keys.size===0"), "touch release left stuck input"
        page.evaluate("player.hp=40;player.potions=3;player.stamina=100;player.dash=0")
        page.locator("#touchHeal").tap()
        assert page.evaluate("player.hp") == 105
        assert page.evaluate("player.potions") == 2
        page.locator("#touchDodge").tap()
        assert page.evaluate("player.stamina") < 75
        page.evaluate("""player.dash=0;loot=[{x:player.x,y:player.y,type:'armor',
          armor:{name:'Touch-test mail',kind:'chain',reduction:.2,color:'#bac9cd'}}]""")
        page.locator("#touchInteract").tap()
        assert page.evaluate("player.armor.name") == "Touch-test mail"
        page.evaluate("loot=[];props=[{x:player.x,y:player.y,type:'chest',open:false}]")
        page.locator("#touchInteract").tap()
        assert page.evaluate("props[0].open"), "touch interaction did not open chest"
        page.evaluate("props=[];loot=[];player.x=world.end.x;player.y=world.end.y")
        page.locator("#touchInteract").tap()
        assert page.evaluate("depth") == 2, "touch interaction did not descend"
        page.locator("#inventoryToggle").tap()
        assert page.locator("aside").is_visible() and page.evaluate("state") == "paused"
        page.screenshot(path=str(OUTPUT / f"Emberkeep-mobile-{name}-inventory.png"))
        page.locator("#closeInventory").tap()
        page.locator("#start").tap()
        assert page.evaluate("state") == "playing"
        page.evaluate("""loadFloor(2,705);state='playing';player.dash=0;enemies=[];loot=[];props=[];
          player.gold=300;player.x=world.merchant.x-28;player.y=world.merchant.y;keys.clear()""")
        page.wait_for_timeout(80)
        page.locator("#touchInteract").tap()
        assert page.locator("#shopDialog").is_visible()
        page.locator("#shopProducts article").nth(2).locator("button").tap()
        assert page.evaluate("player.gold") == 274
        page.screenshot(path=str(OUTPUT / f"Emberkeep-mobile-{name}-shop.png"))
        page.locator("#closeShop").tap()
        assert page.evaluate("state") == "playing"
        page.evaluate("""() => {
          loadFloor(2,705);player.x=(world.rooms[1].cx+.5)*T;player.y=(world.rooms[1].cy+.5)*T;
          player.angle=0;player.cool=0;player.inv=0;player.armor=null;player.hp=90;
          enemies=[makeEnemy('slime',{x:player.x+48,y:player.y})];enemies[0].hp=30;
          props=[];loot=[];floatingTexts=[];attack();damagePlayer(8);
          loot=[{x:player.x-12,y:player.y,type:'gold',value:37},{x:player.x+12,y:player.y,type:'potion'}];
          update(.01);reveal();render();
        }""")
        floating = page.evaluate("emberkeep.snapshot().floatingTexts.map(f=>({text:f.text,kind:f.kind}))")
        for event in ({"text": "-18", "kind": "strike"}, {"text": "-8", "kind": "damage"},
                      {"text": "+37 GOLD", "kind": "gold"}, {"text": "+1 HEALING POTION", "kind": "heal"}):
            assert event in floating, (name, floating, event)
        page.screenshot(path=str(OUTPUT / f"Emberkeep-mobile-{name}-floating-feedback.png"))
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight")
        page.locator("#mute").tap()
        page.locator("#music").tap()
        audio = page.evaluate("DungeonAudio.diagnostic()")
        page.locator("#mute").tap()
        page.locator("#music").tap()
        page.wait_for_timeout(100)
        page.screenshot(path=str(OUTPUT / f"Emberkeep-mobile-{name}.png"))
        assert not errors, errors
        if URL.startswith("file:"):
            assert not external, external
        report["layouts"].append({"name": name, "dimensions": dimensions, "movement": [start, end],
                                  "multi_touch_attack": True, "heal_dodge_inventory_shop": True,
                                  "floating_combat_and_pickup_feedback": floating,
                                  "audio_gesture_running": True, "toggled_audio": audio, "errors": errors})
        context.close()
    browser.close()

apk = OUTPUT / "Emberkeep-Android.apk"
if apk.exists() and len(sys.argv) == 1:
    with zipfile.ZipFile(apk) as package:
        bundled = package.read("assets/index.html")
        source = Path(__file__).with_name("index.html").read_bytes()
        assert bundled == source, "APK HTML does not match current game"
        assert package.read("classes.dex")[:4] == b"dex\n"
        assert "AndroidManifest.xml" in package.namelist()
        report["apk"] = {"path": str(apk), "bytes": apk.stat().st_size,
                         "sha256": hashlib.sha256(apk.read_bytes()).hexdigest(),
                         "bundled_html_matches": True, "dex_present": True}
(OUTPUT / "Emberkeep-mobile-validation.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
