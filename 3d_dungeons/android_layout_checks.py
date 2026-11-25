"""Exercise Android-sized touch layouts in a browser, not a native WebView."""
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
CASES = [
    ("small", 320, 568),
    ("phone", 412, 868),
    ("phone-insets", 390, 824),
    ("landscape", 915, 412),
    ("landscape-insets", 867, 370),
    ("tablet", 820, 1180),
    ("tablet-landscape", 1180, 820),
]


def inside(page, selector, width, height):
    rect = page.locator(selector).bounding_box()
    assert rect and rect["x"] >= 0 and rect["y"] >= 0, (selector, rect)
    assert rect["x"] + rect["width"] <= width + 1, (selector, rect)
    assert rect["y"] + rect["height"] <= height + 1, (selector, rect)
    return rect


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True)
    for name, width, height, text_scale in [
        *[(name, width, height, 100) for name, width, height in CASES],
        ("small-large-text", 320, 568, 130),
        ("phone-large-text", 412, 868, 130),
        ("landscape-large-text", 867, 370, 130),
    ]:
        context = browser.new_context(
            viewport={"width": width, "height": height},
            has_touch=True, is_mobile=True, device_scale_factor=2,
            user_agent="Mozilla/5.0 EmberkeepAndroid",
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        if text_scale != 100:
            page.evaluate(f"document.documentElement.style.webkitTextSizeAdjust='{text_scale}%'")
        assert page.locator("#return-menu-link").is_hidden()
        inside(page, "#start", width, height)
        page.locator("#start").tap()
        assert page.evaluate("state") == "playing"
        page.evaluate("player.weapon={kind:'wand',effect:'cold',power:1,damage:6,range:300,color:'#a9eaff'};updateHUD()")
        mana = inside(page, "#manaDisplay", width, height)
        spell_panel = inside(page, "#scrollPanel", width, height)
        assert mana["y"] + mana["height"] <= spell_panel["y"] or mana["x"] + mana["width"] <= spell_panel["x"], (name, mana, spell_panel)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        for selector in ("#pause", "#restart"):
            inside(page, selector, width, height)
        controls = [inside(page, "#" + selector, width, height) for selector in
                    ("movePad", "touchAttack", "touchInteract", "touchDodge", "touchHeal", "touchMana")]
        for rect in controls:
            assert rect["width"] >= 48 and rect["height"] >= 48, (name, rect)
        for i, a in enumerate(controls):
            for b in controls[i + 1:]:
                overlap = (a["x"] < b["x"] + b["width"] and b["x"] < a["x"] + a["width"]
                           and a["y"] < b["y"] + b["height"] and b["y"] < a["y"] + a["height"])
                assert not overlap, (name, a, b)
        if height <= 500:
            assert page.locator("aside").is_hidden()
            assert page.locator(".viewport").bounding_box()["width"] == width
        if page.locator("#inventoryToggle").is_visible():
            page.locator("#inventoryToggle").tap()
            assert page.locator("aside").is_visible() and page.evaluate("state") == "paused"
            inside(page, "#closeInventory", width, height)
            page.locator("#closeInventory").tap()
            page.locator("#start").tap()
        else:
            assert page.locator("aside").is_visible()
        page.locator("#pause").tap()
        assert page.evaluate("state") == "paused"
        inside(page, "#start", width, height)
        page.locator("#start").tap()
        assert page.evaluate("state") == "playing"
        page.evaluate("player.hp=40;player.potions=3")
        page.locator("#touchHeal").tap()
        assert page.evaluate("player.hp") == 105
        page.evaluate("player.mana=0;player.manaPotions=1")
        page.locator("#touchMana").tap()
        assert page.evaluate("player.mana >= 65 && player.manaPotions===0")
        if page.locator("#extraControls > summary").is_visible():
            page.locator("#extraControls > summary").tap()
        inside(page, "#mute", width, height)
        page.locator("#mute").tap()
        assert page.locator("#mute").get_attribute("aria-pressed") == "true"
        assert not errors, (name, errors)
        print(f"{name}: touch controls, pause, settings and gear fit")
        context.close()
    browser.close()
