const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "license_plate_game.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const imageScript = fs.readFileSync(path.join(root, "license_plate_assets", "plate-images.js"), "utf8");
const catalog = vm.runInNewContext(imageScript + "\nPLATE_IMAGES");
const key = "plateGame.found.v1";

function boot(storage = new Map(), failures = {}) {
  const elements = new Map();
  class Element {
    constructor() {
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.handlers = {};
      this.value = "";
      this.textContent = "";
      this.style = { setProperty() {} };
      this.classes = new Set();
      this.classList = {
        add: name => this.classes.add(name),
        remove: name => this.classes.delete(name),
        toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name)
      };
    }
    set innerHTML(value) {
      this.children = [];
      if (value.includes('class="photo"')) this.photo = new Element();
      if (value.includes('id="again"')) elements.set("again", new Element());
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    appendChild(element) { this.children.push(element); }
    querySelectorAll() { return this.children; }
    querySelector() { return this.photo; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    closest() { return this; }
    remove() {}
  }
  for (const id of ["grid", "counter", "bar", "saveStatus", "search", "toggleFound", "reset", "imageStatus", "imageCredits"]) {
    elements.set(id, new Element());
  }
  const warnings = [];
  const windowHandlers = {};
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id),
      createElement: () => new Element(),
      body: new Element()
    },
    localStorage: {
      getItem(name) {
        if (failures.read) throw new Error("Storage read blocked");
        return storage.get(name) ?? null;
      },
      setItem(name, value) {
        if (failures.write) throw new Error("Storage write blocked");
        storage.set(name, value);
      }
    },
    navigator: {},
    window: { addEventListener: (name, handler) => { windowHandlers[name] = handler; } },
    Math: Object.assign(Object.create(Math), { random: () => 0.25 }),
    console: { warn: (...args) => warnings.push(args) },
    confirm: () => !failures.cancelReset,
    setTimeout: () => 0
  });
  if (!failures.catalog) vm.runInContext(imageScript, context);
  vm.runInContext(script, context);
  return {
    storage, elements, warnings, windowHandlers,
    run: code => vm.runInContext(code, context),
    mark: index => {
      const plate = elements.get("grid").children[index];
      elements.get("grid").handlers.pointerup({ target: plate });
    },
    count: () => elements.get("counter").textContent
  };
}

test("marking, unmarking, filtering, keyboard input, and reload preserve progress", () => {
  const game = boot();
  assert.equal(game.elements.get("grid").children.length, 50);
  game.mark(0);
  game.mark(2);
  assert.equal(game.count(), "2 / 50");
  assert.equal(game.elements.get("bar").style.transform, "scaleX(0.04)");
  assert.equal(boot(game.storage).count(), "2 / 50");
  game.mark(0);
  assert.equal(boot(game.storage).count(), "1 / 50");
  const arizona = game.elements.get("grid").children[2];
  assert.equal(arizona.tabIndex, 0);
  game.elements.get("toggleFound").handlers.click({ target: game.elements.get("toggleFound") });
  assert.ok(arizona.classes.has("hidden"));
  game.elements.get("search").value = "Texas";
  game.elements.get("search").handlers.input();
  assert.equal(game.elements.get("grid").children.filter(el => !el.classes.has("hidden")).length, 1);
  const texas = game.elements.get("grid").children[42];
  game.elements.get("grid").handlers.keydown({ target: texas, key: "Enter", preventDefault() {} });
  assert.equal(game.count(), "2 / 50");
});

test("legacy saves retain valid states and ignore duplicates and invalid entries", () => {
  const game = boot(new Map([[key, '["Arizona","Texas","Texas","Atlantis",null,12]']]));
  assert.equal(game.count(), "2 / 50");
  assert.match(game.elements.get("saveStatus").textContent, /Recovered/);
  game.mark(0);
  assert.deepEqual(JSON.parse(game.storage.get(key)), ["Arizona", "Texas", "Alabama"]);
});

test("malformed and wrong-shaped saves do not prevent play", () => {
  for (const value of ["{broken", "null", "{}", '"Arizona"', "5"]) {
    const game = boot(new Map([[key, value]]));
    assert.equal(game.count(), "0 / 50");
    assert.match(game.elements.get("saveStatus").textContent, /could not be read/);
    assert.equal(game.warnings.length, 1);
    game.mark(0);
    assert.equal(boot(game.storage).count(), "1 / 50");
  }
});

test("storage failures warn without interrupting counters, filters, or reset", () => {
  const game = boot(new Map(), { read: true, write: true });
  assert.match(game.elements.get("saveStatus").textContent, /unavailable/);
  game.mark(0);
  assert.equal(game.count(), "1 / 50");
  assert.match(game.elements.get("saveStatus").textContent, /could not be saved/);
  game.elements.get("reset").handlers.click();
  assert.equal(game.count(), "0 / 50");
  assert.match(game.elements.get("saveStatus").textContent, /including reset/);
});

test("confirmed reset and celebration reset persist; canceled reset preserves saves", () => {
  const storage = new Map([[key, '["Arizona"]']]);
  const canceled = boot(storage, { cancelReset: true });
  canceled.elements.get("reset").handlers.click();
  assert.equal(boot(storage).count(), "1 / 50");
  const game = boot(storage);
  game.elements.get("reset").handlers.click();
  assert.equal(storage.get(key), "[]");
  assert.equal(boot(storage).count(), "0 / 50");
  for (let i = 0; i < 50; i++) game.mark(i);
  assert.equal(game.count(), "50 / 50");
  assert.equal(boot(storage).count(), "50 / 50");
  game.elements.get("again").handlers.click();
  assert.equal(boot(storage).count(), "0 / 50");
});

test("menu and return links resolve to existing entry files", () => {
  const menu = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(menu, /href="\.\/license_plate_game\.html"/);
  assert.match(html, /href="\.\/index\.html">Games menu/);
  assert.ok(fs.existsSync(path.join(root, "index.html")));
});

test("all states have two distinct, local, attributed modern and historical images", () => {
  assert.equal(Object.keys(catalog).length, 50);
  const sources = new Set();
  for (const choices of Object.values(catalog)) {
    assert.equal(choices.length, 2);
    assert.equal(choices[0].era, "modern");
    assert.equal(choices[1].era, "historical");
    for (const image of choices) {
      assert.match(image.id, /^[a-z-]+\.jpg$/);
      assert.equal(image.src, "./license_plate_assets/" + image.id);
      assert.ok(image.author && image.title && image.changes);
      assert.match(image.license, /^(?:Public domain|CC0|CC BY(?:-SA)? [234]\.0)$/);
      assert.match(image.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      assert.ok(image.licenseUrl.startsWith("https://") || image.licenseUrl.startsWith("http://creativecommons.org/"));
      assert.ok(!sources.has(image.original));
      sources.add(image.original);
      const bytes = fs.readFileSync(path.join(root, "license_plate_assets", image.id));
      assert.equal(bytes.readUInt16BE(0), 0xffd8);
      assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), image.sha256);
      assert.ok(image.width >= 150 && image.height >= 75);
    }
  }
});

test("each page visit changes images but does not alter found saves; reset retains visit images", () => {
  const storage = new Map([[key, '["Arizona","Texas"]']]);
  const first = boot(storage);
  const before = JSON.parse(storage.get("plateGame.images.v1"));
  assert.equal(first.count(), "2 / 50");
  first.elements.get("reset").handlers.click();
  assert.deepEqual(JSON.parse(storage.get("plateGame.images.v1")), before);
  const second = boot(storage);
  const after = JSON.parse(storage.get("plateGame.images.v1"));
  for (const state of Object.keys(catalog)) assert.notEqual(after[state], before[state]);
  assert.equal(second.count(), "0 / 50");
  second.windowHandlers.pageshow({ persisted: true });
  const backVisit = JSON.parse(storage.get("plateGame.images.v1"));
  for (const state of Object.keys(catalog)) assert.notEqual(backVisit[state], after[state]);
});

test("invalid or blocked image history does not break gameplay or found-state saves", () => {
  for (const history of ["null", "[]", "{broken", '{"Arizona":"not-a-real-image"}']) {
    const storage = new Map([[key, '["Arizona"]'], ["plateGame.images.v1", history]]);
    const game = boot(storage);
    assert.equal(game.count(), "1 / 50");
    game.mark(0);
    assert.equal(game.count(), "2 / 50");
    assert.equal(Object.keys(JSON.parse(storage.get("plateGame.images.v1"))).length, 50);
  }
  const blocked = boot(new Map(), { read: true, write: true });
  blocked.mark(0);
  assert.equal(blocked.count(), "1 / 50");
  assert.match(blocked.elements.get("imageStatus").textContent, /repeats/);
});

test("missing catalog and failed images have explicit fallbacks without invented plates", () => {
  const missing = boot(new Map(), { catalog: true });
  assert.equal(missing.elements.get("grid").children.length, 50);
  assert.match(missing.elements.get("imageStatus").textContent, /50 states/);
  missing.mark(0);
  assert.equal(missing.count(), "1 / 50");
  const game = boot();
  const photo = game.elements.get("grid").children[0].photo;
  photo.children[0].handlers.error();
  assert.match(photo.textContent, /Photo unavailable/);
  assert.match(game.elements.get("imageStatus").textContent, /failed to load/);
  game.mark(0);
  assert.equal(game.count(), "1 / 50");
});
