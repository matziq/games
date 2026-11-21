const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "license_plate_game.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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
      if (value.includes('id="again"')) elements.set("again", new Element());
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    appendChild(element) { this.children.push(element); }
    querySelectorAll() { return this.children; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    closest() { return this; }
    remove() {}
  }
  for (const id of ["grid", "counter", "bar", "saveStatus", "search", "toggleFound", "reset"]) {
    elements.set(id, new Element());
  }
  const warnings = [];
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
    console: { warn: (...args) => warnings.push(args) },
    confirm: () => !failures.cancelReset,
    setTimeout: () => 0
  });
  vm.runInContext(script, context);
  return {
    storage, elements, warnings,
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
  assert.equal(game.elements.get("bar").style.width, "4%");
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
