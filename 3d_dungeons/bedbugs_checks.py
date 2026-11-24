"""Verify trap, ammo and torch behavior with real browser controls."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
OUT = Path(r"D:\AI_Output\.copilot\session-state\ba310214-5ced-43de-8d0c-d7b9a59325a3\files")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="msedge", headless=True)
    for name, width, height, touch in [("desktop", 1440, 900, False), ("phone", 412, 868, True)]:
        context = browser.new_context(viewport={"width": width, "height": height},
                                      has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.locator("#start").click()
        page.evaluate("""() => {
          loadFloor(1,604);world.tiles.fill(1);world.merchant=null;world.torches=[];
          world.traps=[];enemies=[];props=[];loot=[];gearPreferences.enabled=false;
          player.weapon={...weaponTypes.bow,kind:'bow',name:'Test bow',damage:20,color:'#ddd'};
          player.hp=player.max;player.inv=0;selectedAmmo='regular';player.ammoShared.fire=0;
          loot=[{x:player.x,y:player.y,type:'ammo',ammoKind:'bow',special:'fire',value:5}];
        }""")
        page.wait_for_function("player.ammoShared.fire===5")
        assert page.evaluate("selectedAmmo") == "regular"
        color = page.evaluate("""() => {
          floatingTexts=[];loot=[{x:player.x,y:player.y,type:'ammo',ammoKind:'bow',special:'poison',value:5}];
          updateScrolls(0);render();return floatingTexts[0].color;
        }""")
        assert color == "#a9e56c"
        page.screenshot(path=str(OUT / f"Emberkeep-magic-pickup-{name}.png"))
        if touch:
            page.locator("#scrollSummary").tap()
            page.locator("#cycleAmmo").tap()
        else:
            page.keyboard.press("t")
        assert page.evaluate("selectedAmmo") == "fire"
        page.evaluate("""() => {
          enemies=[];props=[];loot=[];player.inv=0;
          window.bedTrap={x:player.x,y:player.y,kind:'bedbugs',revealed:false,active:0};
          world.traps=[bedTrap];window.initialHP=player.hp;triggerTrap(bedTrap);render();
        }""")
        assert page.evaluate("player.bedbugs>9&&player.hp===initialHP&&enemies.length===0")
        page.screenshot(path=str(OUT / f"Emberkeep-bedbugs-{name}.png"))
        timings = page.evaluate("""() => {
          const samples={without:[],with:[]};
          for(let round=0;round<3;round++)for(const [key,active] of [['without',false],['with',true]]){
            player.bedbugs=active?10:0;const start=performance.now();
            for(let i=0;i<15;i++)render();
            samples[key].push(performance.now()-start);
          }
          player.bedbugs=10;return samples;
        }""")
        page.locator("#pause").click()
        before = page.evaluate("player.bedbugs")
        page.wait_for_timeout(1200)
        assert page.evaluate("player.bedbugs") == before
        page.locator("#start").click()
        page.evaluate("saveRun()")
        page.reload()
        page.locator("#resumeSaved").click()
        assert page.evaluate("player.bedbugs>7&&player.hp===player.max")
        page.evaluate("""() => {
          world.tiles.fill(1);world.merchant=null;player.bedbugs=0;
          window.bugMob=makeEnemy('slime',{x:player.x+51,y:player.y});
          bugMob.emerge=100;bugMob.hp=300;enemies=[bugMob];
          window.safeTrap={x:player.x+25,y:player.y,kind:'bedbugs',revealed:true,active:0};
          world.traps=[safeTrap];selectedWorldItem=null;
        }""")
        if touch:
            page.locator("#touchInteract").tap()
        else:
            page.keyboard.press("e")
        assert page.evaluate("bugMob.bedbugs>9&&bugMob.hp===300&&!player.bedbugs")
        assert not errors, (name, errors)
        print(f"{name}: ammo selection, pickup color, trap visuals, pause, resume and disarmed faction passed; 15-render timing samples (ms): {timings}")
        context.close()
    browser.close()
