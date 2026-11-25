"""Verify real mouse/touch combat input in a desktop browser and mobile emulation."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True)
    for name, width, height, touch in [("desktop", 1440, 900, False),
                                       ("phone", 412, 868, True),
                                       ("landscape", 915, 412, True)]:
        context = browser.new_context(viewport={"width": width, "height": height},
                                      has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.locator("#start").click()
        page.evaluate("""() => {
          world.tiles.fill(1);world.merchant=null;world.traps=[];world.torches=[];
          props=[];loot=[];enemies=[];heroShots=[];keys.clear();player.cool=0;
          gearPreferences.enabled=false;
          player.weapon={...weaponTypes.sword,kind:'sword',damage:16,range:76,cooldown:.36,color:'#dddddd'};
          reveal();render();
        }""")

        def place(expression):
            page.evaluate(f"""() => {{
              player.cool=0;props=[];loot=[];enemies=[];heroShots=[];world.torches=[];
              {expression}; reveal(); render();
            }}""")

        def point(dx, dy=0):
            return page.evaluate("""([dx,dy]) => {
              const r=canvas.getBoundingClientRect();
              return {x:r.left+(player.x+dx-camera.x)*r.width/vw,
                      y:r.top+(player.y+dy-camera.y)*r.height/vh};
            }""", [dx, dy])

        def hit(xy):
            if touch:
                page.touchscreen.tap(xy["x"], xy["y"])
            else:
                page.mouse.click(xy["x"], xy["y"])

        place("window.victim=makeEnemy('slime',{x:player.x+48,y:player.y});victim.hp=300;victim.emerge=100;enemies=[victim]")
        hit(point(48))
        assert page.evaluate("victim.hp") == 282, (name, "enemy tap")
        page.wait_for_timeout(80)
        assert page.evaluate("victim.hp") == 282, (name, "duplicate attack")

        place("window.box={x:player.x+48,y:player.y,type:'crate',hp:50,open:false};props=[box]")
        hit(point(48))
        assert page.evaluate("box.hp") == 34, (name, "crate tap")

        place("window.torch={x:player.x+48,y:player.y,lit:true};world.torches=[torch]")
        hit(point(48))
        assert page.evaluate("torch.lit && selectedWorldItem===torch"), (name, "torch selection")
        if touch:
            page.locator("#touchInteract").tap()
        else:
            page.keyboard.press("e")
        assert not page.evaluate("torch.lit"), (name, "torch use")

        place("window.chest={x:player.x+48,y:player.y,type:'chest',hp:20,open:false};props=[chest]")
        hit(point(48))
        assert page.evaluate("chest.open && player.cool===0"), (name, "chest should open without attacking")
        page.wait_for_timeout(80)
        assert page.evaluate("chest.open && !chest.destroyed"), (name, "duplicate chest action")

        place("window.chest={x:player.x+140,y:player.y,type:'chest',hp:20,open:false};props=[chest]")
        hit(point(140))
        assert page.evaluate("!chest.open && player.cool>0"), (
            name, "distant chest", page.evaluate("({open:chest.open,cool:player.cool,state,error:document.querySelector('#error').textContent,point:{x:player.x,y:player.y}})"),
            page.evaluate("([x,y])=>document.elementFromPoint(x,y)?.outerHTML.slice(0,200)", list(point(140).values())))

        place("window.victim=makeEnemy('slime',{x:player.x-5,y:player.y});victim.hp=300;victim.emerge=100;enemies=[victim];player.weapon={...weaponTypes.bow,kind:'bow',damage:20,color:'#dddddd'};saveRun()")
        page.reload()
        page.locator("#resumeSaved").click()
        page.evaluate("window.victim=enemies[0];player.cool=0;render()")
        hit(point(70))
        assert page.evaluate("victim.hp") == 278, (name, "overlap after resume")
        page.wait_for_timeout(80)
        assert page.evaluate("victim.hp") == 278, (name, "overlap hit repeated")

        if touch:
            page.evaluate("player.cool=0")
            page.locator("#touchHeal").tap()
            assert page.evaluate("player.cool") == 0, (name, "button triggered an attack")
        assert not errors, (name, errors)
        print(f"{name}: mouse/touch chest, monster, crate, torch and saved overlapping target passed")
        context.close()
    browser.close()
