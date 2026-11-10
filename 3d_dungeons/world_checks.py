"""Edge checks: natural idle emergence plus isolated facing, rooms and fissure entry."""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageOps, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
LIVE = URL.startswith("https:")
PREFIX = "Emberkeep-world-live" if LIVE else "Emberkeep-world"


def screenshot(page, name):
    page.screenshot(path=str(ROOT / f"{PREFIX}-{name}.png"))


def natural_idle(page, mode):
    page.goto(URL)
    page.get_by_role("button", name="Enter the halls").click()
    # Observe the real damage path without moving, spawning or replacing any actor.
    page.evaluate("""() => {
      window.observedUndeadHits=[];
      const original=damagePlayer;
      damagePlayer=function(...args){
        const hp=player.hp,zombie=enemies.find(e=>e.idleRisen&&e.wind<=0&&e.cool<=0&&distance(e,player)<e.reach&&e.damage===args[0]);
        const result=original(...args);
        if(zombie&&player.hp<hp)observedUndeadHits.push({amount:hp-player.hp,distance:distance(zombie,player),elapsed:idleThreat.elapsed});
        return result;
      };
    }""")
    page.wait_for_function("idleThreat.markers.length>0", timeout=16000)
    warning = page.evaluate("({elapsed:idleThreat.elapsed,distances:idleThreat.markers.map(p=>distance(p,player))})")
    assert all(90 <= d <= 150 for d in warning["distances"]), warning
    page.keyboard.press("q")
    page.wait_for_function("enemies.some(e=>e.idleRisen)", timeout=7000)
    arrival = page.evaluate("""() => ({
      elapsed:idleThreat.elapsed,
      roomTorches:world.torches.filter(t=>pointInRoom(player,world.rooms[t.room])).map(t=>t.lit),
      zombies:enemies.filter(e=>e.idleRisen).map(e=>({distance:distance(e,player),emerge:e.emerge})),
      state,hp:player.hp
    })""")
    assert arrival["roomTorches"] == [False] * 4, arrival
    assert len(arrival["zombies"]) == 2 and all(z["emerge"] > 0 for z in arrival["zombies"])
    page.wait_for_timeout(650)
    screenshot(page, f"{mode}-undead-torches-out")
    page.wait_for_timeout(1050)
    page.keyboard.press("q")
    page.wait_for_function("observedUndeadHits.length>0", timeout=8000)
    hits = page.evaluate("observedUndeadHits")
    screenshot(page, f"{mode}-undead-attacking")
    assert hits[0]["amount"] > 0
    return {"warning": warning, "arrival": arrival, "actual_undead_hits": hits,
            "fixture_free_normal_start_and_wait": True}


def fixtures(page, mode, touch):
    page.evaluate("""() => {
      loadFloor(3,42);state='playing';enemies=[];props=[];loot=[];world.traps=[];
      player.dash=0;player.hp=120;player.inv=0;keys.clear();mouse.active=false;
      world.quake.next=.2;
    }""")
    page.wait_for_function("world.quake.warning>0")
    screenshot(page, f"{mode}-earthquake-warning")
    page.wait_for_function("world.cracks.length===1", timeout=5000)
    page.wait_for_timeout(850)
    screenshot(page, f"{mode}-crack")
    if touch:
        # Isolate touch entry, not creation: place the knight west of the generated crack.
        page.evaluate("player.x=world.cracks[0].x-65;player.y=world.cracks[0].y;render()")
        pad = page.locator("#movePad").bounding_box()
        x, y = pad["x"] + pad["width"]/2, pad["y"] + pad["height"]/2
        cdp = page.context.new_cdp_session(page)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x+40, "y": y, "id": 1}]})
        page.wait_for_function("depth===4", timeout=4000)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else:
        held = set()
        for _ in range(50):
            position = page.evaluate("({floor:depth,x:player.x,y:player.y,target:world.cracks[0]})")
            if position["floor"] == 4:
                break
            dx, dy = position["target"]["x"]-position["x"], position["target"]["y"]-position["y"]
            desired = set()
            if abs(dx) > 8:
                desired.add("d" if dx > 0 else "a")
            if abs(dy) > 8:
                desired.add("s" if dy > 0 else "w")
            for key in held-desired:
                page.keyboard.up(key)
            for key in desired-held:
                page.keyboard.down(key)
            held = desired
            page.wait_for_timeout(80)
        for key in held:
            page.keyboard.up(key)
    assert page.evaluate("depth===4&&!!world.merchant&&player.hp===player.max&&keys.size===0")
    screenshot(page, f"{mode}-crack-arrival-floor4")

    page.evaluate("loadFloor(1,42);state='paused';overlay.hidden=true;enemies=[];props=[];loot=[];effects=[];floatingTexts=[];world.traps=[];world.seen.fill(1);player.inv=0;player.swing=0")
    room_paths = []
    for kind in ["graveyard", "storage", "winery", "weapons", "armor", "spider", "abandoned", "ancient"]:
        page.evaluate("""kind => {
          const r=world.rooms.find(r=>r.kind===kind);
          player.x=(r.x+r.w/2)*T;player.y=(r.y+r.h/2)*T;
          world.torches.filter(t=>world.rooms[t.room]===r).forEach(t=>t.lit=true);
          state='playing';update(0);state='paused';render();
        }""", kind)
        screenshot(page, f"{mode}-room-{kind}")
        room_paths.append(f"{PREFIX}-{mode}-room-{kind}.png")
    page.evaluate("player.x=world.start.x;player.y=world.start.y;player.angle=Math.PI;state='playing';update(0);state='paused';render()")
    screenshot(page, f"{mode}-mirrored-knight")

    # Pixel proof: remove only the independently aimed weapon, render actual body,
    # and compare left to the exact horizontal mirror of right, with head above feet.
    frames = {}
    for name, angle in [("east", 0), ("west", math.pi), ("north", -math.pi/2), ("south", math.pi/2)]:
        data = page.evaluate("""angle => {
          player.angle=angle;
          const weapon=drawWeapon;drawWeapon=()=>{};
          ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,128,128);
          ctx.lineWidth=1;ctx.globalAlpha=1;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
          drawActor({...player,x:64,y:64},true);
          const data=Array.from(ctx.getImageData(32,24,64,80).data);ctx.restore();drawWeapon=weapon;return data;
        }""", angle)
        frames[name] = Image.frombytes("RGBA", (64, 80), bytes(data))
    # Reflection is about x=64, between raster pixel centers 63 and 64.
    contact = Image.new("RGBA", (256, 80), "#111b23")
    for i, image in enumerate(frames.values()):
        contact.alpha_composite(image, (64*i, 0))
    contact.convert("RGB").resize((1024, 320)).save(ROOT / f"{PREFIX}-{mode}-upright-facing-proof.png")
    mirror_error = ImageChops.difference(ImageOps.mirror(frames["east"]), frames["west"])
    assert max(channel[1] for channel in mirror_error.getextrema()) <= 16 and max(ImageStat.Stat(mirror_error).mean)<.5, f"Body is not a horizontal mirror: {mirror_error.getextrema()}"
    assert ImageChops.difference(frames["north"], frames["south"]).getbbox() is None, "Vertical aim rotated the body"
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    return {"earthquake_warning_and_crack": True, "actual_input_fall": "touch" if touch else "keyboard",
            "destination": 4, "merchant_and_health_restored": True, "eight_room_screenshots": room_paths,
            "horizontal_mirroring_mean_pixel_error": ImageStat.Stat(mirror_error).mean, "north_south_body_identical": True, "overflow": False}


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-gpu"])
    reports = []
    for mode, viewport, touch in [("desktop", {"width": 1440, "height": 1000}, False),
                                  ("phone", {"width": 390, "height": 844}, True)]:
        context = browser.new_context(viewport=viewport, is_mobile=touch, has_touch=touch, device_scale_factor=1)
        context.add_init_script("crypto.getRandomValues=(array)=>{array.fill(42);return array}")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        print(f"Checking {mode}: natural idle emergence", flush=True)
        idle = natural_idle(page, mode)
        print(f"Checking {mode}: fissures, rooms and facing", flush=True)
        isolated = fixtures(page, mode, touch)
        assert not errors, errors
        reports.append({"mode": mode, "natural_idle": idle, "isolated_mechanics": isolated, "console_errors": errors})
        context.close()
    browser.close()
    result = {"url": URL, "checks": reports}
    (ROOT / f"{PREFIX}-checks.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
