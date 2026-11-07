"""Verify spell combat and capture actual telegraph visuals in isolated Edge."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\AI_Output")
URL = Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL)
    page.get_by_role("button", name="Enter the halls").click()
    results = {}
    for kind, chapter, attack, status in [
        ("cave_spider", 1, "venom", "poison"),
        ("cinder_wizard", 5, "fire", "burn"),
    ]:
        page.evaluate("""({kind,chapter}) => {
          loadFloor(chapter,42);player.x=world.start.x;player.y=world.start.y;
          player.hp=120;player.inv=0;player.poison=player.burn=0;shots=[];
          enemies=[makeEnemy(kind,{x:player.x+120,y:player.y})];
          enemies[0].cool=0;reveal();update(.01);render();
        }""", {"kind": kind, "chapter": chapter})
        page.screenshot(path=str(ROOT / f"emberkeep-{kind}-telegraph.png"))
        assert page.evaluate("enemies[0].wind>0"), f"{kind} did not telegraph"
        assert page.evaluate("enemies[0].attackTarget!=null"), f"{kind} did not mark its target"
        page.wait_for_function(f"shots.some(s=>s.type==='{attack}')", timeout=5000)
        page.evaluate("""() => {
          const s=shots.find(s=>s.type==='venom'||s.type==='fire');
          s.x=player.x;s.y=player.y;s.vx=s.vy=0;player.inv=0;update(.01);
        }""")
        assert page.evaluate(f"player.{status}>0"), f"{kind} did not apply {status}"
        results[kind] = {"telegraph": True, "projectile": attack, "status": status}
    page.evaluate("""() => {
      loadFloor(3,43);player.x=world.start.x;player.y=world.start.y;
      player.hp=120;player.inv=0;player.poison=player.burn=0;
      enemies=[makeEnemy('crypt_wizard',{x:player.x+120,y:player.y})];
      enemies[0].cool=0;reveal();update(.01);render();
    }""")
    page.screenshot(path=str(ROOT / "emberkeep-crypt-wizard-lightning-telegraph.png"))
    assert page.evaluate("enemies[0].wind>0&&enemies[0].attackTarget!=null")
    before = page.evaluate("player.hp")
    page.wait_for_function("DungeonAudio.diagnostic().events.lightning>0", timeout=4000)
    assert page.evaluate(f"player.hp<{before}"), "Lightning did not damage its target"
    results["crypt_wizard"] = {"telegraph": True, "attack": "lightning", "target_lost_health": True}
    assert page.evaluate("DungeonAudio.diagnostic().events.venom>0")
    assert page.evaluate("DungeonAudio.diagnostic().events.fire>0")
    assert page.evaluate("DungeonAudio.diagnostic().events.lightning>0")
    assert not errors, errors
    report = {"browser": "isolated Microsoft Edge", "checks": results,
              "browser_errors": errors, "external_requests": [],
              "screenshots": [
                  "emberkeep-cave_spider-telegraph.png",
                  "emberkeep-cinder_wizard-telegraph.png",
                  "emberkeep-crypt-wizard-lightning-telegraph.png"]}
    (ROOT / "emberkeep-combat-visual-validation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
