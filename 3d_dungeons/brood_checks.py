"""Verify room labels, attack-only torches, merchant sales, and giant nests in Edge."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-brood-live" if URL.startswith("https:") else "Emberkeep-brood"
report = {"url": URL, "layouts": [], "native_android_launch": False}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for name, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True),
                                       ("small-phone", 320, 568, True), ("landscape", 844, 390, True)]:
        context = browser.new_context(viewport={"width": width, "height": height},
                                      has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.locator("#start").click()

        def action(selector):
            page.locator(selector).tap() if touch else page.locator(selector).click()

        def attack():
            action("#touchAttack") if touch else page.keyboard.press("Space")

        page.evaluate("""() => {
          loadFloor(1,604);enemies=[];props=[];loot=[];world.traps=[];
          world.rooms.forEach(r=>{r.hatchStarted=true;r.hatchTimer=0;r.collapse=null});
          world.quake.next=Infinity;player.inv=1000;world.seen.fill(1);
        }""")
        page.wait_for_function("roomName.textContent==='Entrance Hall'")
        labels = page.evaluate("""() => {
          const names=[],original=ctx.fillText;
          ctx.fillText=function(text,...args){names.push(text);return original.call(this,text,...args)};
          drawRoomDetails();ctx.fillText=original;return names;
        }""")
        assert labels == ["ENTRANCE HALL"], labels
        page.evaluate("""() => {
          const r=world.rooms[1];player.x=(r.x+r.w/2)*T;player.y=(r.y+r.h/2)*T;
          player.angle=0;mouse.active=false;player.weapon={...weaponTypes.sword,kind:'sword',name:'Worn Longsword',damage:16,color:'#badde9'};
          window.sconce={x:player.x+40,y:player.y,lit:false,room:1,type:'torch'};
          world.torches=[sconce];player.cool=0;
        }""")
        page.wait_for_function("roomName.textContent===''")
        action("#touchInteract") if touch else page.keyboard.press("e")
        page.keyboard.press("f")
        assert page.evaluate("!sconce.lit&&!worldTargets().includes(sconce)&&nearby()===null")
        assert page.locator("#touchTorch").count() == 0
        point = page.evaluate("""() => {
          render();const r=canvas.getBoundingClientRect();
          return {x:r.left+(sconce.x-camera.x)*r.width/vw,y:r.top+(sconce.y-camera.y)*r.height/vh};
        }""")
        if touch:
            page.touchscreen.tap(**point)
            assert page.evaluate("selectedWorldItem===null&&!sconce.lit")
            attack()
        else:
            page.mouse.click(**point)
        page.wait_for_function("sconce.lit")
        page.wait_for_timeout(450)
        attack()
        page.wait_for_function("!sconce.lit")

        page.evaluate("""() => {
          loadFloor(2,604);enemies=[];world.traps=[];player.inv=1000;player.gold=0;
          player.potions=1;player.scrolls={fireball:1,light:1,poison:1,lightning:1};
          player.x=world.merchant.x;player.y=world.merchant.y+30;canvas.focus();
        }""")
        action("#touchInteract") if touch else page.keyboard.press("e")
        page.wait_for_function("state==='shop'")
        for label in ["Healing potion", "Fireball scroll", "Light scroll", "Poison scroll", "Lightning scroll"]:
            card = page.locator("#shopProducts article").filter(
                has=page.get_by_role("heading", name="Sell " + label, exact=True))
            card.locator("button").tap() if touch else card.locator("button").click()
            assert card.locator("button").is_disabled()
        assert page.evaluate("player.gold===56&&player.potions===0&&Object.values(player.scrolls).every(n=>n===0)")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-sales.png"))
        action("#closeShop")

        page.evaluate("""() => {
          loadFloor(1,604);world.traps=[];loot=[];world.quake.next=Infinity;player.inv=1000;
          world.seen.fill(1);world.torches.forEach(t=>t.lit=true);
          window.nest=world.rooms.find(r=>r.kind==='spider');window.parent=nest.parent;
          window.originalMax=parent.max;window.originalDamage=parent.damage;
          enemies=[parent];parent.emerge=1000;parent.hp=parent.max/2;
          player.x=(nest.x+nest.w/2)*T;player.y=(nest.y+nest.h/2)*T;
          nest.collapse=null;canvas.focus();
        }""")
        page.wait_for_function("enemies.filter(e=>e.baby).length===18")
        assert page.evaluate("!parent.giant")
        # Position just within the room boundary, then actually walk out.
        page.evaluate("""() => {
          world.tiles.fill(1);world.rooms.forEach(r=>{r.collapse=null});
          enemies.forEach(e=>e.emerge=1000);
          player.x=(nest.x+nest.w)*T-6;player.y=(nest.y+nest.h/2)*T;
          parent.x=player.x-70;parent.y=player.y;
          window.startX=player.x;render();
        }""")
        if touch:
            pad = page.locator("#movePad").bounding_box()
            x, y = pad["x"] + pad["width"] / 2, pad["y"] + pad["height"] / 2
            cdp = context.new_cdp_session(page)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + 36, "y": y}]})
            page.wait_for_function("parent.giant")
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        else:
            page.keyboard.down("d")
            page.wait_for_function("parent.giant")
            page.keyboard.up("d")
        assert page.evaluate("""parent.max===originalMax*3&&parent.hp===originalMax*1.5&&
          parent.damage===originalDamage*3&&!enemies.some(e=>e.baby)&&player.x>startX""")
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-giant.png"))
        hit = page.evaluate("""() => {
          props=[];player.inv=0;player.hp=120;player.armor=player.boots=player.gloves=player.helmet=null;
          strikeWeb(parent);return {root:player.root,hp:player.hp,expected:120-originalDamage*3};
        }""")
        assert hit["root"] == 1 and hit["hp"] == hit["expected"], hit
        page.evaluate("player.x=(nest.x+nest.w/2)*T;player.y=(nest.y+nest.h/2)*T")
        page.wait_for_timeout(100)
        page.evaluate("player.x=world.start.x;player.y=world.start.y")
        page.wait_for_timeout(150)
        assert page.evaluate("parent.max===originalMax*3&&enemies.filter(e=>e.giant).length===1&&!enemies.some(e=>e.baby)")
        assert page.evaluate("state==='playing'&&document.documentElement.scrollWidth<=innerWidth")
        assert not errors, errors
        report["layouts"].append({"name": name, "entrance_only_labels": True, "attack_only_torches": True,
                                   "potion_and_all_scroll_sales": True, "natural_hatch_and_giant_exit": True,
                                   "triple_stats_no_duplicate_brood": True, "errors": errors})
        context.close()
    browser.close()

(OUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
