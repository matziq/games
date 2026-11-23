"""Exercise saved runs across actual Edge browser restarts."""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\AI_Output\Emberkeep\checks")
OUT.mkdir(parents=True, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
results = []
with sync_playwright() as playwright:
    for label, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True)]:
        with tempfile.TemporaryDirectory(prefix="emberkeep-test-", ignore_cleanup_errors=True) as profile:
            def open_browser():
                return playwright.chromium.launch_persistent_context(
                    profile, channel="msedge", headless=True,
                    viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch)

            context = open_browser()
            page = context.pages[0] if context.pages else context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(URL)
            page.locator("#start").click()
            page.evaluate("""() => {
                loadFloor(8,604); player.weapon={kind:'wand',effect:'light',power:8,range:300,damage:13,name:'Test wand',color:'#f5e797'}; player.gold=4321; player.scrolls.light=7;
                difficulty='hard'; keyBindings.cycle='v';
                player.ammoShared.light=8; selectedAmmo='light'; world.boss.hp=101;
                player.armor={kind:'plate',slot:'armor',name:'Legacy plate',reduction:.2,color:'#c8cddd'};
                player.boots={kind:'robe',slot:'boots',name:'Saved robe boots',reduction:.1,color:'#75579c'};
                world.rooms[1].decor[0].broken=true; world.quake.next=Infinity;
                player.inv=1000; enemies.forEach(enemy=>{enemy.speed=0;enemy.cool=1000});
            }""")
            page.wait_for_timeout(2500)
            assert page.evaluate("JSON.parse(localStorage.getItem(RUN_SAVE_KEY)).version") == 1
            page.locator("#pause").click()
            context.close()

            context = open_browser()
            page = context.pages[0] if context.pages else context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(URL)
            assert page.locator("#resumeSaved").is_visible()
            page.screenshot(path=str(OUT / f"save-{label}-title.png"))
            page.locator("#start").click()
            assert page.locator("#title").inner_text() == "Begin a new journey?"
            page.keyboard.press("Escape")
            assert page.locator("#resumeSaved").is_visible()
            if touch:
                page.locator("#resumeSaved").tap()
            else:
                page.locator("#resumeSaved").click()
            result = page.evaluate("""() => ({
                state, depth, gold:player.gold, scrolls:player.scrolls.light,
                ammo:player.ammoShared.light, droppedAmmo:loot.filter(i=>i.type==='ammo'&&i.special==='light').reduce((n,i)=>n+i.value,0), selectedAmmo, bossHp:world.boss.hp,
                difficulty, cycleKey:keyBindings.cycle, wand:player.weapon.kind==='wand',
                armorDropped:!player.armor&&loot.filter(i=>i.armor?.name==='Legacy plate').length===1,
                compatibleBoots:player.boots?.name==='Saved robe boots',
                shared:enemies.includes(world.boss)&&props.includes(world.rooms[1].decor[0]),
                broken:world.rooms[1].decor[0].broken, quake:world.quake.next===Infinity
            })""")
            assert result == {"state":"playing", "depth":8, "gold":4321, "scrolls":7,
                              "ammo":0, "droppedAmmo":8, "selectedAmmo":"regular", "bossHp":101, "difficulty":"hard", "cycleKey":"v", "wand":True,
                              "armorDropped":True, "compatibleBoots":True,
                              "shared":True, "broken":True, "quake":True}, result
            page.screenshot(path=str(OUT / f"save-{label}-resumed.png"))
            page.evaluate("""() => {
                gearPreferences.enabled=false;
                let armor={...makeArmor('helmet'),kind:'plate',name:'Forbidden plate'};
                let item={type:'armor',armor,x:player.x,y:player.y};
                loot.push(item);selectedWorldItem=item;selectionChoices=[item];refreshSelectionPanel();
            }""")
            page.locator("#useSelected").click()
            assert page.evaluate("loot.some(i=>i.armor?.name==='Forbidden plate') && !player.helmet && messages[0].includes('only robes')")
            page.screenshot(path=str(OUT / f"armor-{label}-incompatible.png"))
            page.evaluate("""() => {
                let weapon={...weaponTypes.rifle,kind:'rifle',name:'Test rifle',damage:50,color:'#c8cddd'};
                let item={type:'weapon',weapon,x:player.x,y:player.y};
                loot.push(item);selectedWorldItem=item;selectionChoices=[item];refreshSelectionPanel();
            }""")
            page.wait_for_timeout(150)
            assert page.evaluate("state==='playing'"), page.locator("#error").inner_text()
            page.locator("#useSelected").click()
            assert page.evaluate("usesAmmo(player.weapon) && !player.boots && loot.some(i=>i.armor?.name==='Saved robe boots')")
            page.wait_for_timeout(150)
            assert page.evaluate("state==='playing'"), page.locator("#error").inner_text()
            page.evaluate("""() => {
                let armor={...makeArmor('gloves'),kind:'leather',slot:'gloves',name:'Leather gloves',reduction:.12};
                let item={type:'armor',armor,x:player.x,y:player.y};
                loot.push(item);gearPreferences.prefer='ranged';gearPreferences.enabled=true;updateAutoGear(1);
            }""")
            assert page.evaluate("player.gloves?.name==='Leather gloves' && loot.some(i=>i.armor?.name==='Forbidden plate')"), page.evaluate("({weapon:player.weapon,gloves:player.gloves,loot:loot.map(i=>i.armor?.name).filter(Boolean),state})")
            page.evaluate("""() => {
                gearPreferences.enabled=false;
                let dropped=loot.find(i=>i.armor?.name==='Saved robe boots');
                dropped.x=player.x+400;dropped.age=6;
                loot.push({type:'gold',value:1,x:player.x+400,y:player.y,age:6});
                saveRun();
            }""")
            page.reload()
            assert page.locator("#resumeSaved").is_visible()
            page.locator("#resumeSaved").click()
            assert page.evaluate("loot.some(i=>i.armor?.name==='Saved robe boots' && i.weaponSwitchDrop && i.age>=6) && loot.some(i=>i.type==='gold' && i.value===1 && i.age>=6)")
            page.evaluate("baseUpdate(4.1)")
            assert page.evaluate("!loot.some(i=>i.armor?.name==='Saved robe boots') && loot.some(i=>i.type==='gold' && i.value===1)")
            page.evaluate("baseUpdate(20)")
            assert page.evaluate("!loot.some(i=>i.type==='gold' && i.value===1)")
            page.evaluate("state='playing';world.merchant=null;player.inv=0;player.hp=1;damagePlayer(10000)")
            assert page.evaluate("state==='dead' && localStorage.getItem(RUN_SAVE_KEY)===null")
            page.reload()
            assert page.locator("#resumeSaved").is_hidden()
            page.evaluate("localStorage.setItem(RUN_SAVE_KEY,'broken')")
            page.reload()
            assert page.locator("#resumeSaved").is_hidden()
            assert "invalid" in page.locator("#error").inner_text()
            page.locator("#restart").click()
            assert page.locator("#title").inner_text() == "Begin a new journey?"
            assert page.evaluate("localStorage.getItem(RUN_SAVE_KEY)") == "broken"
            page.locator("#start").click()
            assert page.evaluate("state==='playing' && JSON.parse(localStorage.getItem(RUN_SAVE_KEY)).version===1")
            assert not errors, errors
            context.close()
            results.append({"device": label, "browser_restart": True, "saved_state": result, "death_cleared": True})
(OUT / "persistence-checks.json").write_text(json.dumps({"url": URL, "results": results}, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
