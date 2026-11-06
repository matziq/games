"""Verify equipment rendering/input and independent audio buses in isolated Edge."""
import base64
import hashlib
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\AI_Output")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
LIVE = URL.startswith("https:")
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("""(() => {
      const Original=window.AudioContext;
      window.soundProfiles=[];
      window.AudioContext=class extends Original {
        createOscillator(){
          const o=super.createOscillator(),set=o.frequency.setValueAtTime.bind(o.frequency);
          o.frequency.setValueAtTime=(v,t)=>{soundProfiles.push(v);return set(v,t)};
          return o;
        }
      };
    })()""")
    response = page.goto(URL)
    page.get_by_role("button", name="Enter the halls").click()
    page.wait_for_function("DungeonAudio.diagnostic().state==='running'")
    page.evaluate("""() => {
      loadFloor(1,42);enemies=[];props=[];loot=[];effects=[];player.inv=0;
      player.angle=0;mouse.active=false;state='paused';overlay.hidden=true;render();
    }""")
    box = page.locator("#game").bounding_box()
    cx, cy = box["x"] + box["width"]/2, box["y"] + box["height"]/2
    pictures, weapon_hashes, armor_hashes = [], {}, {}
    for kind in ["sword", "axe", "mace", "spear"]:
        page.evaluate("""kind => {
          const t=weaponTypes[kind];
          player.weapon={kind,name:t.label,color:'#c5d4d4',damage:24,...t};
          player.armor=null;player.swing=0;
          loot=[{x:player.x+110,y:player.y,type:'weapon',weapon:{...player.weapon}}];
          world.seen.fill(1);render();
        }""", kind)
        hero = page.screenshot(clip={"x": cx-30, "y": cy-40, "width": 100, "height": 80})
        ground = page.screenshot(clip={"x": cx+80, "y": cy-40, "width": 100, "height": 80})
        weapon_hashes[kind] = [hashlib.sha256(hero).hexdigest(), hashlib.sha256(ground).hexdigest()]
        for label, image in [(kind+" equipped", hero), (kind+" ground loot", ground)]:
            pictures.append((label, image))
    for index, kind in enumerate(["leather", "chain", "plate"]):
        page.evaluate("""({index,kind}) => {
          player.weapon={kind:'sword',name:'Longsword',color:'#c5d4d4',damage:24,range:82};
          player.armor={kind,name:kind,reduction:.1+index*.1,color:['#ad7951','#91adb4','#c8cddd'][index]};
          loot=[{x:player.x+110,y:player.y,type:'armor',armor:{...player.armor}}];render();
        }""", {"index": index, "kind": kind})
        hero = page.screenshot(clip={"x": cx-30, "y": cy-40, "width": 100, "height": 80})
        ground = page.screenshot(clip={"x": cx+80, "y": cy-40, "width": 100, "height": 80})
        armor_hashes[kind] = [hashlib.sha256(hero).hexdigest(), hashlib.sha256(ground).hexdigest()]
        pictures.extend([(kind+" worn", hero), (kind+" loot", ground)])
    for hashes in [weapon_hashes, armor_hashes]:
        for i in [0, 1]:
            assert len({h[i] for h in hashes.values()}) == len(hashes), "Silhouettes are identical"
    page.evaluate("""() => {
      state='playing';player.armor=null;props=[];loot=[];
      const chest={x:player.x+30,y:player.y,type:'chest',open:false};
      props=[chest];
    }""")
    page.keyboard.press("e")
    assert page.evaluate("loot.some(l=>l.type==='armor')"), "Chest has no armor"
    page.evaluate("""() => {
      const item=loot.find(l=>l.type==='armor');
      player.x=item.x;player.y=item.y;loot=loot.filter(l=>l.type==='armor');props=[];
    }""")
    page.keyboard.press("e")
    assert page.evaluate("player.armor!==null")
    assert page.locator("#armor").inner_text() == page.evaluate("player.armor.name")
    armor = page.evaluate("player.armor")
    received = page.evaluate("""() => {
      player.hp=120;player.inv=0;damagePlayer(20);return 120-player.hp;
    }""")
    assert abs(received-20*(1-armor["reduction"])) < .000001
    page.evaluate("""() => {
      loot=[{x:player.x,y:player.y,type:'armor',
        armor:{name:'Replacement Plate',kind:'plate',color:'#c8cddd',reduction:.4}}];
    }""")
    page.keyboard.press("e")
    assert page.evaluate("loot.some(l=>l.type==='armor'&&l.armor.name!=='Replacement Plate')")
    page.evaluate("player.inv=0;player.hp=120;damagePlayer(20)")
    assert page.evaluate("player.hp") == 108
    assert page.locator("#defense").inner_text() == "40%"
    # Isolate gameplay while keeping its normal audio update loop running.
    page.evaluate("enemies=[];props=[];loot=[];player.inv=0;player.hp=120")
    diag = lambda: page.evaluate("DungeonAudio.diagnostic()")
    combinations = []
    for effects_on, music_on in [(True, True), (False, True), (True, False), (False, False)]:
        if diag()["muted"] == effects_on:
            page.locator("#mute").click()
        if diag()["musicMuted"] == music_on:
            page.locator("#music").click()
        page.wait_for_timeout(900)
        page.evaluate("DungeonAudio.play('strike','mace')")
        page.wait_for_timeout(75)
        d = diag()
        assert (d["effectsRms"] > .00001) == effects_on, d
        assert (d["musicRms"] > .00001) == music_on, d
        if not effects_on and not music_on:
            assert d["rms"] < .000001, d
        combinations.append(d)
    page.locator("#mute").click()
    profiles = {}
    for kind in ["sword", "axe", "mace", "spear"]:
        profiles[kind] = page.evaluate("""kind => {
          soundProfiles.length=0;DungeonAudio.play('strike',kind);return [...soundProfiles];
        }""", kind)
    assert len({round(values[0]) for values in profiles.values()}) == 4
    varied = page.evaluate("""() => {
      soundProfiles.length=0;for(let i=0;i<6;i++)DungeonAudio.play('gold');return [...soundProfiles];
    }""")
    assert len(set(varied[::2])) == 6, "Effects pitch is not varied"
    page.locator("#music").click()
    page.evaluate("""() => {
      loadFloor(2,874326);enemies=[];player.x=(world.rooms[1].cx+.5)*T;
      player.y=(world.rooms[1].cy+.5)*T;player.inv=0;reveal();
      player.weapon={kind:'axe',name:'Runed War Axe',damage:41,range:82,cooldown:.46,color:'#c6a0ed'};
      player.armor={kind:'plate',name:"Knight's Plate",color:'#c8cddd',reduction:.34};
      loot=Object.keys(weaponTypes).map((kind,i)=>({x:player.x-100+i*65,y:player.y+90,
        type:'weapon',weapon:{kind,name:weaponTypes[kind].label,color:'#78c8e0',damage:30,...weaponTypes[kind]}}));
      loot.push({x:player.x+130,y:player.y+40,type:'armor',armor:makeArmor()});updateHUD();render();
    }""")
    page.wait_for_timeout(150)
    page.screenshot(path=str(ROOT / ("emberkeep-equipment-live.png" if LIVE else "emberkeep-equipment.png")))
    if not LIVE:
        sheet = browser.new_page(viewport={"width": 1050, "height": 620}, device_scale_factor=1)
        cards = "".join('<figure><img src="data:image/png;base64,'+base64.b64encode(img).decode()
                        +'"><figcaption>'+label+'</figcaption></figure>' for label, img in pictures)
        sheet.set_content('<style>body{background:#10191d;color:#edbf72;font:16px Segoe UI}'
                          'main{display:grid;grid-template-columns:repeat(4,1fr)}figure{margin:10px}'
                          'img{width:200px;height:160px;image-rendering:pixelated}figcaption{text-align:center}'
                          '</style><h2>Emberkeep: actual equipped and ground silhouettes</h2><main>'+cards+'</main>')
        sheet.set_viewport_size({"width": 1050, "height": 920})
        sheet.screenshot(path=str(ROOT / "emberkeep-equipment-silhouettes.png"), full_page=True)
    assert not errors, errors
    report = {"url": URL, "http_status": response.status if LIVE else None, "weapon_render_hashes": weapon_hashes,
              "armor_render_hashes": armor_hashes, "armor_received_damage": received, "armor": armor,
              "audio_combinations": combinations, "weapon_audio_profiles": profiles, "varied_coin_pitches": varied,
              "checks": ["4 equipped and ground weapon silhouettes", "3 worn and ground armor silhouettes",
                         "E chest armor loot/equip/swap", "visible equipment stats", "damage reduction",
                         "40% cap", "4 independent audio combinations", "weapon sounds", "randomized pitch"],
              "browser_errors": errors}
    (ROOT / ("emberkeep-equipment-publication.json" if LIVE else "emberkeep-equipment-validation.json")).write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
