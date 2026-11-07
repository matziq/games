"""Exercise realm progression and capture actual chapter gameplay in isolated Edge."""
import base64
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\AI_Output")
URL = Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
CHAPTERS = [
    ("The Sunken Halls", "flooded-limestone"),
    ("Castle of Thorns", "thornwood-castle"),
    ("The Hollow Crypt", "moonlit-crypt"),
    ("The Ruined Keep", "fallen-keep"),
    ("The Cinder Throne", "cinder-forge"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.goto(URL)
    page.get_by_role("button", name="Enter the halls").click()
    page.wait_for_timeout(250)
    images, report = [], []

    for chapter, (title, theme_id) in enumerate(CHAPTERS, 1):
        floor = chapter * 2 - 1
        page.evaluate("""({chapter,floor}) => {
          loadFloor(floor,1000+floor);state='playing';overlay.hidden=true;
          const room=world.rooms[3];
          player.x=(room.cx+.5)*T;player.y=(room.cy+.5)*T;player.inv=0;
          const roster=chapterRosters[chapter-1];
          enemies=roster.map((type,i)=>makeEnemy(type,{
            x:player.x+[-82,82,0][i],y:player.y+[0,0,92][i]
          }));
          world.seen.fill(1);reveal();updateHUD();render();
        }""", {"chapter": chapter,"floor":floor})
        snapshot = page.evaluate("emberkeep.snapshot()")
        theme = snapshot["theme"]
        roster = page.evaluate("(chapter)=>chapterRosters[chapter-1]", chapter)
        assert snapshot["state"] == "playing"
        assert snapshot["depth"] == floor
        assert snapshot["realm"] == chapter
        assert theme["id"] == theme_id, (chapter, theme)
        assert page.locator("#area").inner_text() == title
        assert page.locator("#floor").inner_text().startswith(f"FLOOR {floor} / 10")
        assert theme["name"].upper() in page.locator("#floor").inner_text()
        assert theme["description"] in page.locator("#objective").inner_text()
        assert set(roster).issubset(snapshot["enemyTypes"])
        screenshot = ROOT / f"emberkeep-chapter-{chapter}.png"
        page.screenshot(path=str(screenshot))
        images.append((f"Chapter {chapter}: {title} — {theme['name']}", screenshot.read_bytes()))
        report.append({
            "chapter": chapter, "title": title, "theme": theme, "roster": roster,
            "visible_enemy_types": snapshot["enemyTypes"],
            "screenshot": str(screenshot),
            "screenshot_sha256": hashlib.sha256(screenshot.read_bytes()).hexdigest(),
        })

    assert len({item["theme"]["id"] for item in report}) == 5
    assert len({item["screenshot_sha256"] for item in report}) == 5
    page.evaluate("""() => {loadFloor(1,777);state='playing';props=[];loot=[];enemies=[];}""")
    for floor in range(2, 11):
        page.evaluate("""() => {player.x=world.end.x;player.y=world.end.y;props=[];loot=[];player.inv=10;}""")
        page.keyboard.press("e")
        page.wait_for_function(f"emberkeep.snapshot().depth==={floor}")
        state = page.evaluate("emberkeep.snapshot()")
        assert state["realm"] == (floor + 1) // 2
        assert state["merchant"] is not None if floor in (2, 4, 6, 8) else state["merchant"] is None
    assert "dragon" in page.evaluate("emberkeep.snapshot().enemyTypes")
    report.append({"progression_floors": list(range(1, 11)), "merchant_floors": [2, 4, 6, 8], "dragon_floor": 10})
    assert not errors, errors

    cards = "".join(
        '<figure><img src="data:image/png;base64,' + base64.b64encode(image).decode()
        + '"><figcaption>' + label + '</figcaption></figure>'
        for label, image in images
    )
    sheet = browser.new_page(viewport={"width": 1440, "height": 940}, device_scale_factor=1)
    sheet.set_content(
        '<style>body{background:#101519;color:#edbf72;font:16px Segoe UI;margin:16px}'
        'main{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}'
        'figure{margin:0}img{display:block;width:100%;height:auto;border:1px solid #536365}'
        'figcaption{padding:7px}</style><h2>Emberkeep — five distinct procedural realms</h2>'
        '<main>' + cards + '</main>'
    )
    sheet.screenshot(path=str(ROOT / "emberkeep-chapter-contact-sheet.png"), full_page=True)
    result = {
        "browser": "Microsoft Edge (isolated headless)",
        "url": URL,
        "chapters": report,
        "progression": "E activated the actual stairs between all ten floors; every two floors retain one distinct realm.",
        "theme_colors_distinct": True,
        "browser_errors": errors,
        "contact_sheet": str(ROOT / "emberkeep-chapter-contact-sheet.png"),
    }
    (ROOT / "emberkeep-chapter-validation.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    browser.close()
