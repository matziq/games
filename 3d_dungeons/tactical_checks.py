"""Exercise tactical traps, torch shares, equipment slots, and first-hit collisions in Edge."""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

OUTPUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
report = {"url": URL, "checks": [], "screenshots": []}


def picture(page, name):
    path = OUTPUT / f"Emberkeep-trapcraft-{name}.png"
    page.screenshot(path=str(path))
    report["screenshots"].append(str(path))
    return path


def fixture(page, code=""):
    page.evaluate("""() => {
      loadFloor(1,604);state='playing';enemies=[];props=[];loot=[];shots=[];heroShots=[];effects=[];
      world.traps=[];keys.clear();mouse.active=false;mouse.down=false;floatingTexts=[];
      armorSlots.forEach(slot=>player[slot]=null);
      player.level=1;player.hp=120;player.inv=0;player.dash=0;player.cool=0;player.angle=0;
      player.poison=player.burn=0;world.torches.forEach(t=>t.lit=true);
    }""")
    if code:
        page.evaluate(code)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for mobile in (False, True):
        label = "phone" if mobile else "desktop"
        context = browser.new_context(viewport={"width": 390 if mobile else 1440, "height": 844 if mobile else 900},
                                      has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        response = page.goto(URL)
        start = page.get_by_role("button", name="Enter the halls")
        start.tap() if mobile else start.click()
        page.wait_for_function("DungeonAudio.diagnostic().state==='running'")
        use = lambda: page.locator("#touchInteract").tap() if mobile else page.keyboard.press("e")
        attack = lambda: page.locator("#touchAttack").tap() if mobile else page.keyboard.press(" ")

        # Compare actual rendered pixels with a fixed clock; personal light must not expose a glint.
        fixture(page, """var room=world.rooms[1];player.x=(room.x+room.w/2)*T;
          player.y=(room.y+room.h/2)*T;world.seen.fill(1);
          var glint={x:(room.x+2)*T,y:(room.y+2)*T,kind:'fire',inspect:0,active:0};
          world.traps=[glint];world.torches.forEach(t=>t.lit=false);
          var peakClock=((.45-glint.x*.013-glint.y*.007)%3.6+3.6)%3.6;
          state='paused';overlay.hidden=true;clock=peakClock;render()""")
        dark = picture(page, label+"-dark")
        glint_box = page.evaluate("""() => {const box=canvas.getBoundingClientRect();
          const x=glint.x-camera.x+box.x,y=glint.y-camera.y+box.y;return [x-8,y-8,x+8,y+8]}""")
        crop = lambda path: Image.open(path).convert("RGB").crop(tuple(round(v) for v in glint_box))
        page.evaluate("clock=peakClock+1.5;render()")
        dark_off = picture(page, label+"-dark-off")
        assert ImageChops.difference(crop(dark), crop(dark_off)).getbbox() is None
        page.evaluate("roomTorch(glint).lit=true;clock=peakClock;render()")
        shine = picture(page, label+"-quarter-glint")
        assert page.evaluate("trapGlint(glint)") > .99
        page.evaluate("clock=peakClock+1.5;render()")
        gone = picture(page, label+"-quarter-no-glint")
        difference = ImageChops.difference(crop(shine), crop(gone))
        assert difference.getbbox() is not None, "Glint never visibly shines/disappears"
        coverage = page.evaluate("""() => {
          const sconces=world.torches.filter(t=>t.room===1),fractions=[];
          for(let n=0;n<=4;n++){
            sconces.forEach((t,i)=>t.lit=i<n);let lit=0;
            for(let y=0;y<40;y++)for(let x=0;x<40;x++)
              if(torchIllumination({x:(room.x+(x+.5)/40*room.w)*T,y:(room.y+(y+.5)/40*room.h)*T})>.2)lit++;
            fractions.push(lit/1600);
          }return fractions;
        }""")
        assert coverage[0] == 0 and coverage[-1] > .8
        assert all(coverage[i] < coverage[i+1] <= min(1, (i+1)*.4) for i in range(4)), coverage
        picture(page, label+"-fully-lit")
        report["checks"].append({"device": label, "torch_coverage": coverage, "intermittent_glint_pixel_change": ImageStat.Stat(difference).sum})
        page.evaluate("""player.x=glint.x+45;player.y=glint.y;glint.inspect=0;clock=peakClock;render()""")
        assert "Floor glint" in page.evaluate("interactionPrompt(null)")
        page.evaluate("clock=peakClock+1.5;render()")
        assert page.evaluate("interactionPrompt(null)") == ""
        page.evaluate("glint.inspect=.8;render()")
        assert "Inspecting floor glint: 40%" in page.evaluate("interactionPrompt(null)")
        report["checks"].append({"device": label, "no_hidden_glint_hud_leak": True, "inspection_feedback_persists": True})

        # Real Use input discovers the action, waits two simulation seconds, and catches a later arrival.
        fixture(page, """world.traps=[{x:player.x+45,y:player.y,kind:'fire',inspect:0,active:0}];
          var tacticalTrap=world.traps[0]""")
        page.wait_for_function("tacticalTrap.revealed", timeout=5000)
        assert page.evaluate("!tacticalTrap.triggered&&player.hp===120")
        assert "Activate safe fire trap" in page.locator("#prompt").inner_text()
        use()
        page.wait_for_timeout(1750)
        assert page.evaluate("tacticalTrap.arming>0&&!tacticalTrap.triggered")
        picture(page, label+"-arming")
        page.wait_for_function("tacticalTrap.triggered", timeout=2000)
        page.evaluate("""enemies=[makeEnemy('slime',{x:tacticalTrap.x,y:tacticalTrap.y})];
          var approaching=enemies[0];approaching.hp=300;approaching.speed=0;approaching.cool=99""")
        page.wait_for_function("approaching.burn>0")
        hp = page.evaluate("approaching.hp")
        page.wait_for_timeout(750)
        assert page.evaluate("approaching.hp") < hp
        picture(page, label+"-burning-monster")
        report["checks"].append({"device": label, "actual_use_2_second_delay": True, "late_arrival_burns": True})
        for material in ("crate", "monster"):
            fixture(page, f"""player.weapon={{...weaponTypes.boomerang,kind:'boomerang',damage:25,color:'#ddd'}};
              var blocker={"{x:player.x+80,y:player.y,type:'crate',hp:300,open:false}" if material == "crate" else "makeEnemy('slime',{x:player.x+80,y:player.y})"};
              blocker.hp=300;blocker.speed=0;blocker.cool=99;{"props" if material == "crate" else "enemies"}=[blocker]""")
            attack()
            page.wait_for_function("heroShots.some(s=>s.returning)", timeout=1500)
            page.evaluate("player.x=blocker.x+70")
            page.wait_for_function("heroShots.length===0", timeout=1500)
            assert page.evaluate("blocker.hp>0")
        report["checks"].append({"device": label, "returning_boomerang_cannot_cross_prior_intact_target": True})

        for kind in ("bow", "javelin", "knife", "throwing_axe", "boomerang"):
            for material in ("crate", "barrel"):
                fixture(page, f"""player.weapon={{...weaponTypes.{kind},kind:'{kind}',name:'Test',damage:25,color:'#ddd'}};
                  props=[{{x:player.x+65,y:player.y,type:'{material}',hp:60,open:false}}];
                  enemies=[makeEnemy('slime',{{x:player.x+110,y:player.y}})];
                  var behind=enemies[0];behind.hp=300;behind.speed=0;behind.cool=99""")
                attack()
                page.wait_for_timeout(550)
                assert page.evaluate("props[0].hp===33&&behind.hp===300")
                page.evaluate("props[0].hp=1;player.cool=0")
                attack()
                page.wait_for_timeout(550)
                assert page.evaluate("props[0].broken&&behind.hp===300")
                page.evaluate("player.cool=0;loot=[]")
                attack()
                page.wait_for_timeout(550)
                assert page.evaluate("behind.hp===273")
        report["checks"].append({"device": label, "five_projectiles_stop_at_crate_and_barrel_even_on_destroying_hit": True,
                                 "later_projectile_passes_debris": True})

        # Full store/equipment path: purchases do not silently replace any slot.
        fixture(page, "loadFloor(2,604);player.gold=3000;player.x=world.merchant.x;player.y=world.merchant.y")
        use()
        assert page.evaluate("state==='shop'")
        for slot, title in (("armor", "Fitted body armor"), ("boots", "Armored boots"),
                            ("gloves", "Armored gloves"), ("helmet", "Armored helmet")):
            card = page.locator("#shopProducts article").filter(has=page.get_by_role("heading", name=title, exact=True))
            button = card.get_by_role("button")
            button.tap() if mobile else button.click()
            assert page.evaluate(f"!player.{slot}&&world.merchant.stock.{slot}.quantity===0")
        close = page.locator("#closeShop")
        close.tap() if mobile else close.click()
        for slot in ("armor", "boots", "gloves", "helmet"):
            page.evaluate(f"""var gear=loot.find(l=>l.type==='armor'&&armorSlot(l.armor)==='{slot}');
              player.x=gear.x;player.y=gear.y""")
            use()
            assert page.evaluate(f"player.{slot}!==null")
        assert page.evaluate("reduction()<=.4")
        # Render the whole suit and new weapon silhouettes for actual visual inspection.
        page.evaluate("state='paused';overlay.hidden=true;world.seen.fill(1);player.swing=0;player.inv=0;loot=[];floatingTexts=[];effects=[];enemies=[];world.traps=[];heroShots=[];shots=[];player.angle=0")
        worn_hashes = []
        for kind in ("halberd", "knife", "throwing_axe"):
            page.evaluate(f"player.weapon={{...weaponTypes.{kind},kind:'{kind}',name:weaponTypes.{kind}.label,damage:25,color:'#ddd'}};updateHUD();render()")
            path = picture(page, label+"-equipped-"+kind)
            worn_hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
        assert len(set(worn_hashes)) == 3
        for angle in (0, 1.5708, 3.1416, -1.5708):
            page.evaluate(f"player.angle={angle};render()")
            picture(page, label+"-full-armor-"+str(angle).replace(".", "_"))
        page.evaluate("updateHUD()")
        for name in ("Body:", "Boots:", "Gloves:", "Helmet:"):
            assert name in page.locator("#armor").inner_text()
        dimensions = page.evaluate("({w:innerWidth,sw:document.documentElement.scrollWidth,h:innerHeight,sh:document.documentElement.scrollHeight})")
        assert dimensions["w"] == dimensions["sw"] and dimensions["h"] == dimensions["sh"]
        report["checks"].append({"device": label, "all_four_slots_bought_and_equipped": True, "new_weapon_silhouettes": 3,
                                 "four_full_suit_facings": True, "no_overflow": True, "console_errors": errors})
        assert not errors, errors
        context.close()
    browser.close()
report["result"] = "passed"
destination = OUTPUT / ("Emberkeep-trapcraft-live-validation.json" if URL.startswith("https:") else "Emberkeep-trapcraft-validation.json")
destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
