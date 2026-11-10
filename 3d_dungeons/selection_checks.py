"""Real mouse/touch checks for precise selection, cleaner floors, and safe gear undo."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUTPUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-selection-live" if URL.startswith("https:") else "Emberkeep-selection"
report = {"url": URL, "browser": "Microsoft Edge; touch emulation is not a native Android launch", "layouts": []}


def picture(page, name):
    path = OUTPUT / f"{PREFIX}-{name}.png"
    page.screenshot(path=str(path))
    return str(path)


def target_point(page):
    return page.evaluate("""() => {
      const r=canvas.getBoundingClientRect();
      return {x:r.left+(window.overlap.x-camera.x)/vw*r.width,
              y:r.top+(window.overlap.y-camera.y)/vh*r.height};
    }""")


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True, args=["--disable-gpu"])
    for mode, width, height, mobile in [("desktop", 1440, 900, False), ("phone", 390, 844, True),
                                         ("small-phone", 320, 568, True), ("landscape", 844, 390, True),
                                         ("tablet", 768, 1024, True)]:
        context = browser.new_context(viewport={"width": width, "height": height},
                                      has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL)
        start = page.get_by_role("button", name="Enter the halls")
        start.tap() if mobile else start.click()
        page.wait_for_function("DungeonAudio.diagnostic().state==='running'")
        # Objects deliberately share exactly the same world coordinates; no input is mocked.
        page.evaluate("""() => {
          loadFloor(5,604);state='playing';keys.clear();enemies=[];props=[];loot=[];shots=[];heroShots=[];effects=[];
          world.traps=[];world.quake.next=Infinity;world.seen.fill(1);player.inv=1000;player.angle=0;mouse.active=false;
          player.weapon={...weaponTypes.sword,kind:'sword',name:'Test longsword',damage:20,color:'#dddddd'};
          world.torches.forEach(t=>t.lit=true);
          window.overlap={x:player.x-42,y:player.y+20};
          window.floorWeapon={...overlap,type:'weapon',weapon:{...weaponTypes.halberd,kind:'halberd',name:'Selected Halberd',damage:26,color:'#dddddd'}};
          window.floorArmor={...overlap,type:'armor',armor:{...makeArmor('helmet'),name:'Selected Helmet'}};
          window.floorTorch={...overlap,type:'torch',lit:false,room:0};
          world.torches.push(floorTorch);loot=[floorWeapon,floorArmor];window.beforeWeapon=player.weapon;
          window.strikes=0;const actualAttack=attack;attack=function(...args){window.strikes++;return actualAttack(...args)};
          window.pointerTrace=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>pointerTrace.push({type,target:e.target.id||e.target.textContent,x:e.clientX,y:e.clientY}),true);
        }""")
        page.wait_for_timeout(120)
        assert page.evaluate("state==='playing'"), {"errors": errors, "overlay": page.locator("#error").text_content()}
        point = target_point(page)

        def tap_world():
            point = target_point(page)
            page.touchscreen.tap(**point) if mobile else page.mouse.click(**point)

        def button(selector):
            page.locator(selector).tap() if mobile else page.locator(selector).click()

        tap_world()
        assert page.evaluate("selectedWorldItem===floorWeapon&&strikes===0&&player.weapon===beforeWeapon&&!floorTorch.lit"), page.evaluate("({mode:innerWidth,state,selected:selectedWorldItem,choices:selectionChoices.map(worldTargetName),strikes,lit:floorTorch.lit,point:overlap,camera:{...camera},vw,vh,trace:pointerTrace,player:{x:player.x,y:player.y}})")
        assert page.locator("#selectionChoices button").count() == 3
        # Repeated world taps cycle when unobscured. Named choices also work on small screens.
        button("#clearSelected")
        tap_world()
        point = target_point(page)
        unobscured = page.evaluate("p=>document.elementFromPoint(p.x,p.y)===canvas", point)
        if unobscured:
            tap_world()
            assert page.evaluate("selectedWorldItem===floorArmor")
            tap_world()
            assert page.evaluate("selectedWorldItem===floorTorch")
        button("#selectionChoices button:has-text('Selected Helmet')")
        assert page.evaluate("selectedWorldItem===floorArmor&&strikes===0&&loot.includes(floorArmor)")
        button("#touchTorch") if mobile else page.keyboard.press("f")
        assert page.evaluate("floorTorch.lit&&selectedWorldItem===floorArmor&&loot.includes(floorWeapon)")
        shot = picture(page, mode + "-selected-overlap")
        bounds = page.locator("#selectionPanel").bounding_box()
        assert bounds["x"] >= 0 and bounds["y"] >= 0 and bounds["x"] + bounds["width"] <= width
        assert bounds["y"] + bounds["height"] <= height
        # Delete exactly the selected helmet, not the weapon or equipped item.
        button("#deleteSelected") if mobile else page.keyboard.press("x")
        assert page.evaluate("!loot.includes(floorArmor)&&loot.includes(floorWeapon)&&lastGearDelete.item===floorArmor&&player.weapon===beforeWeapon")
        undo_shot = picture(page, mode + "-undo-delete")
        button("#undoDelete")
        assert page.evaluate("loot.filter(o=>o===floorArmor).length===1&&lastGearDelete===null")
        assert page.locator("#undoDelete").is_disabled()
        # Re-select exact restored armor, use with real E / Use, then make sure Undo cannot clone it.
        tap_world()
        button("#selectionChoices button:has-text('Selected Helmet')")
        button("#touchInteract") if mobile else page.keyboard.press("e")
        assert page.evaluate("player.helmet===floorArmor.armor&&!loot.includes(floorArmor)&&!undoGearDelete()&&strikes===0")
        # Select a torch through remaining loot, and use that exact selection.
        tap_world()
        button("#selectionChoices button:has-text('Lit torch')")
        button("#touchInteract") if mobile else page.keyboard.press("e")
        assert page.evaluate("!floorTorch.lit&&loot.includes(floorWeapon)")
        button("#clearSelected")
        # Empty floor clicks still attack; on touch they aim, and Attack remains separate.
        page.evaluate("loot=[];world.torches=world.torches.filter(t=>t!==floorTorch);player.cool=0")
        tap_world()
        if mobile:
            assert page.evaluate("strikes===0")
            button("#touchAttack")
        assert page.evaluate("strikes>0")
        # Decor is never selectable/usable; clicks attack, touch aims then Attack breaks it.
        page.evaluate("""() => {
          loot=[];window.overlap={x:player.x-40,y:player.y+15};
          window.stand={...overlap,type:'decor',label:'Armor stand',hp:1,open:false};
          props=[stand];selectedWorldItem=null;player.cool=0;mouse.down=false;window.beforeDecorGold=player.gold;
        }""")
        tap_world()
        assert page.evaluate("selectedWorldItem===null&&!selectionChoices.includes(stand)&&!worldTargets().includes(stand)")
        if mobile:
            button("#touchInteract")
            assert page.evaluate("!stand.open")
            button("#touchAttack")
        assert page.evaluate("stand.broken&&loot.every(l=>l.type==='gold')&&[1,2].includes(player.gold-beforeDecorGold+loot.reduce((sum,l)=>sum+l.value,0))"), (mode, page.evaluate("({stand,loot,gold:player.gold,weapon:player.weapon,state})"))
        # A real stairs interaction must retain Undo and restore the same gear safely on the new floor.
        page.evaluate("""() => {
          window.overlap={x:player.x-35,y:player.y};
          window.travelGear={...overlap,type:'armor',armor:makeArmor('boots')};
          loot=[travelGear];world.torches=[];selectedWorldItem=null;selectionChoices=[];refreshSelectionPanel();
        }""")
        tap_world()
        button("#deleteSelected") if mobile else page.keyboard.press("x")
        assert page.evaluate("lastGearDelete.item===travelGear&&!loot.includes(travelGear)")
        page.evaluate("player.x=world.end.x;player.y=world.end.y;selectedWorldItem=null;world.traps=[];world.cracks=[]")
        button("#touchInteract") if mobile else page.keyboard.press("e")
        assert page.evaluate("depth===6&&lastGearDelete.item===travelGear")
        button("#undoDelete")
        assert page.evaluate("loot.filter(o=>o===travelGear).length===1&&distance(travelGear,player)===0&&free(travelGear.x,travelGear.y,12)&&!undoGearDelete()")
        # Clean abandoned room fixture retains a real fissure and omits spent overlays.
        page.evaluate("""() => {
          loadFloor(5,604);state='playing';enemies=[];shots=[];heroShots=[];world.seen.fill(1);
          const room=world.rooms.find(r=>r.kind==='abandoned');
          player.x=(room.x+room.w/2)*T;player.y=(room.y+room.h/2)*T;player.inv=1000;
          world.quake.next=Infinity;world.torches.forEach(t=>t.lit=true);
          world.traps=[{x:player.x-60,y:player.y,kind:'fire',revealed:true,triggered:true,active:0}];
          world.cracks=[{x:player.x+95,y:player.y,angle:.35,length:100,forming:0,grace:0}];
          selectedWorldItem=null;selectionChoices=[];refreshSelectionPanel();
        }""")
        page.wait_for_timeout(120)
        clean_shot = picture(page, mode + "-clean-floor")
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight")
        if mobile:
            for control in ["touchAttack", "touchInteract", "touchDodge", "touchHeal", "touchTorch"]:
                box = page.locator("#" + control).bounding_box()
                assert box and 0 <= box["x"] and box["x"] + box["width"] <= width
                assert 0 <= box["y"] and box["y"] + box["height"] <= height
        assert not errors, errors
        report["layouts"].append({"name": mode, "size": [width, height], "exact_overlap": True,
                                   "world_cycle_unobscured": unobscured, "no_selection_attack": True,
                                   "torch_under_loot": True, "delete_correct_identity": True, "undo_once": True,
                                   "use_selected": True, "decor_coins": True, "undo_after_descent": True, "no_overflow": True, "errors": errors,
                                   "screenshots": [shot, undo_shot, clean_shot]})
        context.close()
    browser.close()

(OUTPUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
