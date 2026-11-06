"""Isolated desktop browser interaction checks; uses an existing Playwright install."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\AI_Output")
URL = Path(__file__).with_name("index.html").resolve().as_uri() + "?test"

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors, external = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda r: external.append(r.url) if r.url.startswith("http") else None)
    page.goto(URL)
    page.wait_for_function("Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)")
    page.keyboard.press("Shift")
    page.keyboard.press("Space")
    page.screenshot(path=str(ROOT / "emberkeep-title.png"))
    page.get_by_role("button", name="Enter the halls").click()
    page.wait_for_timeout(200)
    before = page.evaluate("emberkeep.snapshot().player")
    page.keyboard.down("d")
    page.wait_for_timeout(350)
    page.keyboard.up("d")
    after = page.evaluate("emberkeep.snapshot().player")
    assert after["x"] > before["x"] + 35, "keyboard movement failed"
    page.keyboard.press("p")
    assert page.evaluate("emberkeep.snapshot().state") == "paused"
    page.get_by_role("button", name="Resume journey").click()
    page.get_by_role("button", name="Source art").click()
    assert page.locator("#gallery img").count() == 15
    page.screenshot(path=str(ROOT / "emberkeep-source-art.png"))
    page.get_by_role("button", name="Return to the halls").click()
    page.wait_for_function("emberkeep.snapshot().state==='playing'")
    assert page.evaluate("emberkeep.snapshot().state") == "playing"
    page.evaluate("""() => {
      const chest=props.find(p=>p.type==='chest');
      player.x=chest.x-35;player.y=chest.y;player.inv=10;
    }""")
    page.wait_for_timeout(100)
    page.keyboard.press("e")
    assert page.evaluate("props.find(p=>p.type==='chest').open"), "chest did not open"
    assert page.evaluate("loot.some(l=>l.type==='weapon')"), "chest lacks weapon"
    page.evaluate("""() => {
      const barrel=props.find(p=>p.type==='barrel'&&!p.open);
      player.x=barrel.x-40;player.y=barrel.y;player.angle=0;player.inv=10;
      mouse.active=false;
    }""")
    page.keyboard.down("Space")
    page.wait_for_timeout(950)
    page.keyboard.up("Space")
    assert page.evaluate("props.some(p=>p.type==='barrel'&&p.open)"), "barrel did not break"
    page.evaluate("player.hp=30")
    page.keyboard.press("q")
    assert page.evaluate("player.hp") == 95, "potion failed"
    page.keyboard.press("Shift")
    assert page.evaluate("player.stamina") < 85, "dodge failed"
    page.evaluate("""() => {
      loadFloor(2,874326);player.x=(world.rooms[1].cx+.5)*T;
      player.y=(world.rooms[1].cy+.5)*T;player.inv=10;reveal();
    }""")
    page.wait_for_timeout(350)
    page.screenshot(path=str(ROOT / "emberkeep-gameplay.png"))
    # Fixture positioning isolates stairs/boss without skipping their real input paths.
    for chapter in range(3, 6):
        page.evaluate("player.x=world.end.x;player.y=world.end.y;props=[];loot=[];player.inv=10")
        page.keyboard.press("e")
        assert page.evaluate("depth") == chapter
    page.evaluate("""() => {
      const b=enemies.find(e=>e.type==='dragon');
      player.x=b.x-150;player.y=b.y;player.inv=10;b.cool=0;reveal();
    }""")
    page.wait_for_timeout(600)
    page.screenshot(path=str(ROOT / "emberkeep-dragon.png"))
    assert page.evaluate("enemies.find(e=>e.type==='dragon').wind") > 0
    page.wait_for_timeout(800)
    assert page.evaluate("shots.length") > 0, "dragon failed to fire"
    page.evaluate("""() => {
      const b=enemies.find(e=>e.type==='dragon');b.hp=1;player.x=b.x-45;
      player.y=b.y;player.angle=0;player.inv=10;mouse.active=false;player.cool=0;
    }""")
    page.keyboard.press("Space")
    page.wait_for_timeout(100)
    assert page.evaluate("state") == "won", "attack did not trigger victory"
    page.screenshot(path=str(ROOT / "emberkeep-victory.png"))
    page.get_by_role("button", name="Adventure again").click()
    assert page.evaluate("state") == "playing"
    page.get_by_role("button", name="New run").click()
    assert page.evaluate("state") == "confirm"
    page.keyboard.press("Escape")
    assert page.evaluate("state") == "playing"
    page.set_viewport_size({"width": 1024, "height": 768})
    page.wait_for_timeout(100)
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    page.evaluate("render()")
    assert not errors, errors
    assert not external, external
    report = {"browser": "Microsoft Edge (isolated headless)", "errors": errors,
              "external_requests": external, "checks": [
                  "offline image decoding", "keyboard movement", "pause/resume", "source-art gallery",
                  "chest opening and weapon drop", "Space attacks break barrel", "Q healing", "Shift dodge",
                  "E stairs progression", "dragon telegraph and projectiles", "Space boss victory",
                  "restart confirmation and cancellation", "1024px layout", "canvas rendering"],
              "screenshots": ["emberkeep-title.png", "emberkeep-source-art.png", "emberkeep-gameplay.png",
                              "emberkeep-dragon.png", "emberkeep-victory.png"]}
    (ROOT / "emberkeep-browser-validation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
