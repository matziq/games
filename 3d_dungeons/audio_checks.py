"""Verify real Web Audio samples and browser gesture policy in isolated Edge."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"D:\OneDrive\Scripts\games\emberkeep")
URL = Path(__file__).with_name("index.html").resolve().as_uri() + "?test"
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors, warnings, requests = [], [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: warnings.append(m.text) if m.type in ["warning", "error"] else None)
    page.on("request", lambda r: requests.append(r.url) if r.url.startswith("http") else None)
    page.add_init_script("""(() => {
      const Original=window.AudioContext;
      window.audioProbe={contexts:[],sources:0,destinationConnections:0};
      window.AudioContext=class extends Original {
        constructor(...args){super(...args);audioProbe.contexts.push(this)}
        createOscillator(){audioProbe.sources++;return super.createOscillator()}
        createBufferSource(){audioProbe.sources++;return super.createBufferSource()}
      };
      const connect=AudioNode.prototype.connect;
      AudioNode.prototype.connect=function(destination,...args){
        if(destination instanceof AudioDestinationNode)audioProbe.destinationConnections++;
        return connect.call(this,destination,...args);
      };
    })()""")
    page.goto(URL)
    assert page.evaluate("DungeonAudio.diagnostic().state") == "locked"
    assert page.evaluate("audioProbe.contexts.length") == 0, "Audio starts before a gesture"
    page.get_by_role("button", name="Enter the halls").click()
    page.wait_for_function("DungeonAudio.diagnostic().state==='running'")
    page.wait_for_timeout(700)
    diag = lambda: page.evaluate("DungeonAudio.diagnostic()")
    samples = []
    for _ in range(8):
        page.wait_for_timeout(75)
        samples.append(diag()["rms"])
    assert max(samples) > .001, "Ambience/music produces no real samples"
    assert page.evaluate("audioProbe.destinationConnections") == 1
    page.wait_for_function("DungeonAudio.diagnostic().music.phrase>=1", timeout=12000)
    music = page.evaluate("DungeonAudio.diagnostic().music")
    assert len(set(music["recentNotes"])) >= 4, "Music did not develop a varied phrase"
    effects = {}
    for event in ["strike", "hit", "damage", "break", "gold", "chest", "equip", "rank",
                  "heal", "victory", "dragon", "warning", "magic", "dodge", "death", "floor",
                  "armor", "bottle", "barrel", "crate", "voice", "spellCharge", "venom",
                  "lightning", "fire", "poison"]:
        before = page.evaluate("audioProbe.sources")
        page.evaluate("(name)=>DungeonAudio.play(name)", event)
        page.wait_for_timeout(80)
        info = diag()
        effects[event] = {"sources_created": page.evaluate("audioProbe.sources") - before,
                          "output_rms": info["effectsRms"]}
        assert effects[event]["sources_created"] > 0, event + " creates no sound sources"
        assert info["effectsRms"] > .00001, event + " output is silent"
    page.get_by_role("button", name="Sound effects on", exact=True).click()
    page.wait_for_timeout(700)
    muted = diag()
    assert muted["muted"] and muted["effectsRms"] < .000001, "Effects mute leaks sound"
    page.wait_for_function("DungeonAudio.diagnostic().musicRms>.00001", timeout=2500)
    muted = diag()
    assert muted["musicRms"] > .00001, "Muting effects disabled Music"
    page.keyboard.press("Space")
    page.wait_for_timeout(100)
    assert diag()["effectsRms"] < .000001, "Muted strike leaks sound"
    page.get_by_role("button", name="Sound effects off", exact=True).click()
    page.locator("#music").click()
    page.wait_for_function("DungeonAudio.diagnostic().musicRms<.000001", timeout=2500)
    page.evaluate("DungeonAudio.play('strike','sword')")
    page.wait_for_function("DungeonAudio.diagnostic().effectsRms>.00001", timeout=2000)
    assert not diag()["muted"] and diag()["effectsRms"] > .00001, "Unmute fails"
    assert diag()["musicMuted"] and diag()["musicRms"] < .000001, "Muting Music disabled Sound effects"
    page.locator("#music").click()
    page.locator("#volume").fill("0")
    page.wait_for_timeout(700)
    assert diag()["volume"] == 0 and diag()["rms"] < .000001, "Volume zero leaks"
    page.locator("#volume").fill("35")
    page.wait_for_function("DungeonAudio.diagnostic().rms>.00001", timeout=2500)
    assert diag()["volume"] == .35 and diag()["rms"] > .00001
    page.evaluate("audioProbe.contexts[0].suspend()")
    assert diag()["state"] == "suspended"
    assert "paused by browser" in page.locator("#audioStatus").inner_text()
    page.keyboard.press("d")
    page.wait_for_function("DungeonAudio.diagnostic().state==='running'")
    assert page.evaluate("audioProbe.contexts.length") == 1, "Resume creates duplicate contexts"
    page.keyboard.press("p")
    page.wait_for_timeout(3200)
    assert not diag()["playing"] and diag()["rms"] < .000001, "Paused ambience still sounds"
    page.get_by_role("button", name="Resume journey").click()
    page.wait_for_timeout(800)
    assert diag()["playing"] and diag()["rms"] > .00001
    page.screenshot(path=str(ROOT / "emberkeep-audio.png"))
    assert not errors, errors
    assert not warnings, warnings
    assert not requests, requests
    # An explicit browser rejection must surface rather than pretend audio succeeded.
    failed = browser.new_page()
    failed.add_init_script("""(() => {
      const Original=window.AudioContext;
      window.AudioContext=class extends Original {
        get state(){return 'suspended'}
        resume(){return Promise.reject(new Error('Autoplay test rejection'))}
      };
    })()""")
    failed.goto(URL)
    failed.get_by_role("button", name="Enter the halls").click()
    failed.wait_for_function("DungeonAudio.diagnostic().blocked.includes('Autoplay test rejection')")
    assert "retry" in failed.locator("#audioStatus").inner_text()
    report = {"browser": "isolated Microsoft Edge", "initial_context": "locked",
              "gesture_context": "running", "ambient_rms_samples": samples,
              "music_phrase": music,
              "effect_samples": effects, "muted_rms": muted["rms"],
              "checks": ["gesture startup", "connected audio destination", "nonzero ambient/music output",
                         "evolving music phrase with multiple notes", "26 isolated synthesized effect outputs",
                         "independent music/effects mute behavior", "muted attack silence",
                         "unmute", "volume zero", "volume adjustment", "browser suspend/gesture resume",
                         "single context", "pause silence/resume", "explicit autoplay error/retry status"],
              "browser_errors": errors, "console_warnings": warnings, "external_requests": requests}
    (ROOT / "emberkeep-audio-validation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
