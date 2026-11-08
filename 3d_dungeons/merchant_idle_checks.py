"""Verify merchant commerce, idle zombies, and floor progression in Microsoft Edge."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
ROOT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.goto(URL)
    page.get_by_role("button", name="Enter the halls").click()
    page.wait_for_timeout(150)

    commerce = []
    for floor in (2, 4):
        page.evaluate(
            """floor => {
              loadFloor(floor,700+floor);state='playing';enemies=[];props=[];loot=[];
              player.gold=350;player.potions=3;player.hp=50;player.dash=0;
              player.x=world.merchant.x-28;player.y=world.merchant.y;
            }""",
            floor,
        )
        page.wait_for_timeout(80)
        if floor == 2:
            page.screenshot(path=str(ROOT / "Emberkeep-merchant-floor2.png"))
        prompt = page.locator("#prompt").inner_text()
        assert "Trade with the merchant" in prompt, (floor, prompt, page.evaluate("({state,depth,merchant:world.merchant,player:{x:player.x,y:player.y},nearby:nearby(),error:$('error').textContent})"), errors)
        gold_before = page.evaluate("player.gold")
        page.keyboard.press("e")
        page.get_by_role("dialog").wait_for(state="visible")
        products = page.locator("#shopProducts article")
        assert products.count() == 3
        prices = page.evaluate(
            """() => Object.fromEntries(Object.entries(world.merchant.stock).map(([k,v])=>[k,v.price]))"""
        )
        for index, item in enumerate(("weapon", "armor", "potion")):
            button = products.nth(index).locator("button")
            assert button.is_enabled(), f"floor {floor} {item} should be affordable"
            button.click()
            page.wait_for_timeout(30)
        state = page.evaluate(
            """() => ({gold:player.gold,potions:player.potions,weapon:player.weapon.name,
              stock:Object.fromEntries(Object.entries(world.merchant.stock).map(([k,v])=>[k,v.quantity])),
              loot:loot.map(x=>x.type)})"""
        )
        assert state["gold"] == gold_before - sum(prices.values())
        assert state["potions"] == 4
        assert state["weapon"] == "Worn Longsword"
        assert "weapon" in state["loot"] and "armor" in state["loot"]
        assert state["stock"] == {"weapon": 0, "armor": 0, "potion": 4}
        page.evaluate("player.gold=0;updateShop()")
        assert page.locator("#shopProducts button").nth(2).is_disabled()
        assert "more gold" in page.locator("#shopProducts button").nth(2).inner_text()
        page.get_by_role("button", name="Leave the shop").click()
        assert page.evaluate("state") == "playing"
        page.evaluate("player.x=world.merchant.x;player.y=world.merchant.y;player.hp=50;player.inv=0;damagePlayer(20)")
        assert page.evaluate("player.hp") == 50, "merchant room should prevent damage"
        commerce.append({"floor": floor, "prices": prices, "after_purchase": state, "sanctuary": True})

    page.evaluate(
        """() => {
          loadFloor(1,901);state='playing';enemies=[];props=[];loot=[];keys.clear();
          player.dash=0;player.x=world.start.x;player.y=world.start.y;
          for(let i=0;i<231;i++)update(.04);
        }"""
    )
    warning = page.evaluate("emberkeep.snapshot().idle")
    assert len(warning["markers"]) == 2 and warning["zombies"] == 0, warning
    page.screenshot(path=str(ROOT / "Emberkeep-idle-warning.png"))
    page.evaluate("for(let i=0;i<81;i++)update(.04)")
    emerged = page.evaluate("emberkeep.snapshot().idle")
    assert emerged["triggered"] and emerged["zombies"] == 2, emerged
    assert page.evaluate("enemies.filter(e=>e.type==='zombie').every(e=>e.emerge>0)")
    page.screenshot(path=str(ROOT / "Emberkeep-zombie-emergence.png"))
    page.evaluate(
        """() => {
          const zombie=enemies.find(e=>e.type==='zombie');zombie.x=player.x+35;zombie.y=player.y;
          zombie.emerge=0;zombie.cool=0;player.hp=120;player.inv=0;update(.04);
        }"""
    )
    assert page.evaluate("enemies.find(e=>e.type==='zombie').wind>0"), "zombie did not telegraph its attack"
    hp = page.evaluate("player.hp")
    page.evaluate("update(.7)")
    assert page.evaluate("player.hp") < hp, "surfaced zombie did not damage the player"

    page.evaluate("loadFloor(1,777);state='playing';enemies=[];props=[];loot=[]")
    for floor in range(2, 11):
        page.evaluate("player.x=world.end.x;player.y=world.end.y;props=[];loot=[];player.inv=10")
        page.keyboard.press("e")
        page.wait_for_function(f"emberkeep.snapshot().depth==={floor}")
        state = page.evaluate("emberkeep.snapshot()")
        assert state["realm"] == (floor + 1) // 2
        assert (state["merchant"] is not None) == (floor in (2, 4, 6, 8))
    assert "dragon" in page.evaluate("emberkeep.snapshot().enemyTypes")
    assert not errors, errors

    report = {
        "browser": "Microsoft Edge (headless Playwright)",
        "url": URL,
        "merchant_floors": commerce,
        "idle_warning": warning,
        "zombie_emergence": emerged,
        "zombie_attack": "Telegraphed melee windup followed by real player damage.",
        "progression": "Actual E input traversed floors 1 through 10; shops appeared on 2, 4, 6, 8; dragon appeared on 10.",
        "console_errors": errors,
        "screenshots": [
            str(ROOT / "Emberkeep-merchant-floor2.png"),
            str(ROOT / "Emberkeep-idle-warning.png"),
            str(ROOT / "Emberkeep-zombie-emergence.png"),
        ],
    }
    (ROOT / "Emberkeep-merchant-idle-validation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
