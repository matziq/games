"""Verify enemy-friendly-fire protection and uninterrupted boss celebrations."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\AI_Output\Emberkeep\checks")
OUT.mkdir(parents=True, exist_ok=True)
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
PREFIX = "Emberkeep-crowns-live" if URL.startswith("https:") else "Emberkeep-crowns"
report = {"url": URL, "layouts": [], "native_android_launch": False}
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for name, width, height, touch in [("desktop", 1440, 900, False), ("phone", 390, 844, True),
                                       ("small-phone", 320, 568, True), ("landscape", 844, 390, True)]:
        context = browser.new_context(viewport={"width": width, "height": height}, has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.locator("#start").click()
        for spell in ["ranged", "fire", "venom"]:
            protected = page.evaluate("""spell => {
              loadFloor(1,604);world.tiles.fill(1);props=[];world.traps=[];shots=[];loot=[];
              world.rooms.forEach(r=>{r.hatchStarted=true;r.hatchTimer=0;r.collapse=null});
              player.inv=0;world.quake.next=Infinity;
              window.archer=makeEnemy('cinder_wizard',{x:player.x+180,y:player.y});
              window.ally=makeEnemy('slime',{x:player.x+80,y:player.y});
              archer.cool=ally.cool=1000;archer.speed=ally.speed=0;enemies=[archer,ally];
              const hp=ally.hp,heroHP=player.hp;shoot(archer,Math.PI,400,spell);baseUpdate(.4);
              return ally.hp===hp&&!ally.burn&&!ally.poison&&player.hp===heroHP&&shots.length===0;
            }""", spell)
            assert protected, spell
        page.evaluate("""() => {
          enemies=[archer];window.heroBeforeShot=player.hp;shoot(archer,Math.PI,400,'fire');
        }""")
        page.wait_for_function("player.hp<heroBeforeShot")
        assert page.evaluate("""() => {
          shots=[];player.inv=1000;ally.x=player.x+100;ally.y=player.y;enemies=[ally];
          const hp=ally.hp;const trap={x:ally.x,y:ally.y,kind:'explosion',revealed:true};
          triggerTrap(trap,true);return ally.hp<hp;
        }""")
        page.evaluate("""() => {
          loadFloor(16,604);props=[];world.traps=[];world.quake.next=Infinity;world.seen.fill(1);
          window.boss=world.boss;enemies=[boss];boss.hp=1;boss.cool=1000;
          player.x=boss.x-60;player.y=boss.y;player.angle=0;player.cool=0;player.inv=1000;
          player.weapon={...weaponTypes.sword,kind:'sword',name:'Crowned sword',damage:30,color:'#ddd'};
          window.keptWeapon=player.weapon;window.goldBeforeBoss=player.gold;window.keptScrolls=JSON.stringify(player.scrolls);
          window.keptAmmo=JSON.stringify(player.ammo);window.victorySounds=window.DungeonAudio.diagnostic().events.victory||0;mouse.active=false;
        }""")
        if touch:
            page.locator("#touchAttack").tap()
        else:
            page.keyboard.press("Space")
        page.wait_for_function("bossDefeated&&player.crowns===1")
        celebration = page.evaluate("""() => ({state,overlayHidden:overlay.hidden,coins:effects.filter(p=>p.coin).length,
          sounds:window.DungeonAudio.diagnostic().events.victory-victorySounds,
          gold:player.gold-goldBeforeBoss, goldDrop:loot.some(item=>item.type==='gold'&&item.value===1000)})""")
        assert celebration["state"] == "playing" and celebration["overlayHidden"], celebration
        assert celebration["coins"] > 0 and celebration["sounds"] == 1, celebration
        assert celebration["gold"] >= 1000 or celebration["goldDrop"], celebration
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-victory.png"))
        page.evaluate("window.spoils=loot.slice()")
        assert page.evaluate("state==='playing'&&depth===16&&player.weapon===keptWeapon&&spoils.every(i=>loot.includes(i)||i.taken)")
        page.evaluate("""() => {loot=[];window.goldAfterBoss=player.gold;window.bossKills=kills;window.bossRank=player.level;
          window.keptScrolls=JSON.stringify(player.scrolls);window.keptAmmo=JSON.stringify(player.ammo);
          player.x=world.end.x;player.y=world.end.y;selectedWorldItem=null;player.cool=0}""")
        if touch:
            page.locator("#touchInteract").tap()
        else:
            page.keyboard.press("e")
        page.wait_for_function("depth===1&&runCycle===2")
        assert page.evaluate("""state==='playing'&&!bossDefeated&&player.crowns===1&&player.weapon===keptWeapon&&
          player.gold>=goldAfterBoss&&kills===bossKills&&player.level===bossRank&&JSON.stringify(player.scrolls)===keptScrolls&&
          JSON.stringify(player.ammo)===keptAmmo&&makeEnemy('slime',player).damage===creatures.slime.damage*1.25""")
        assert "CYCLE 2" in page.locator("#floor").inner_text()
        page.screenshot(path=str(OUT / f"{PREFIX}-{name}-cycle-two.png"))
        assert not errors, errors
        report["layouts"].append({"name": name, "enemy_shots_no_friendly_damage_or_status": True,
                                  "player_and_activated_trap_damage_preserved": True,
                                  "floor_16_boss_uninterrupted_celebration_and_next_cycle": True, "progression_preserved": True, "errors": errors})
        context.close()
    browser.close()
(OUT / f"{PREFIX}-checks.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
