"""Verify reachable start/resume UI and real-time three-tile gold attraction."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = sys.argv[1] if len(sys.argv)>1 else Path(__file__).with_name("index.html").resolve().as_uri()+"?test"
PREFIX = "Emberkeep-vacuum-live" if URL.startswith("https:") else "Emberkeep-vacuum"
report = {"url": URL, "layouts": [], "native_android_launch": False}
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for name,w,h,touch in [("desktop",1912,914,False),("short-desktop",1280,600,False),
                            ("phone",390,844,True),("small-phone",320,568,True),("landscape",844,390,True)]:
        context=browser.new_context(viewport={"width":w,"height":h},has_touch=touch,is_mobile=touch)
        page=context.new_page()
        errors=[]
        page.on("pageerror",lambda e: errors.append(str(e)))
        page.goto(URL)
        def verify_button():
            assert page.locator("#start").evaluate("""e=>{
              const b=e.getBoundingClientRect(),r=e.closest('.overlay').getBoundingClientRect();
              return b.top>=r.top&&b.bottom<=r.bottom&&b.top>=0&&b.bottom<=innerHeight&&
                document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===e
            }"""), name
            assert page.locator(".intro .controls").evaluate("""e=>{
              const visible=getComputedStyle(e).display!=='none';e.scrollTop=e.scrollHeight;
              return visible&&e.clientHeight>0&&e.scrollTop+e.clientHeight>=e.scrollHeight-1
            }""")
        verify_button()
        page.screenshot(path=str(OUT/f"{PREFIX}-{name}-start.png"))
        page.locator("#start").tap() if touch else page.locator("#start").click()
        page.evaluate("""() => {
          loadFloor(1,604);props=[];enemies=[];world.traps=[];world.quake.next=Infinity;
          player.inv=1000;keys.clear();mouse.down=false;
          window.originalGold=player.gold;window.originX=player.x;
          window.coin={x:player.x+3*T,y:player.y,type:'gold',value:37};
          window.outside={x:player.x+3*T+1,y:player.y,type:'gold',value:41};
          window.potion={x:player.x+80,y:player.y,type:'potion'};loot=[coin,outside,potion];
        }""")
        page.wait_for_function("player.gold===originalGold+37")
        assert page.evaluate("!loot.includes(coin)&&outside.x===originX+3*T+1&&potion.x===originX+80")
        page.wait_for_timeout(250)
        assert page.evaluate("player.gold===originalGold+37")
        page.screenshot(path=str(OUT/f"{PREFIX}-{name}-gold.png"))
        page.locator("#pause").click()
        verify_button()
        page.screenshot(path=str(OUT/f"{PREFIX}-{name}-pause.png"))
        page.locator("#start").tap() if touch else page.locator("#start").click()
        assert page.evaluate("state==='playing'")
        assert not errors,errors
        report["layouts"].append({"name":name,"start_and_resume_visible":True,"instructions_scrollable":True,
                                  "gold_three_tile_boundary":True,"one_collection":True,"other_loot_unchanged":True,"errors":errors})
        context.close()
    browser.close()
(OUT/f"{PREFIX}-checks.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
