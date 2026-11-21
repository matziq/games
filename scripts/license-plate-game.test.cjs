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
const defaults = vm.runInNewContext(imageScript + "\nPLATE_DEFAULTS");
const coverage = JSON.parse(fs.readFileSync(path.join(root, "license_plate_assets", "coverage.json"), "utf8"));
const key = "plateGame.found.v1";
const selectionKey = "plateGame.selections.v1";

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
      if (value.includes('class="mark"')) {
        this.nodes = {};
        for (const name of ["mark", "photo", "version", "previous", "next", "random"]) {
          this.nodes[name] = new Element();
          this.nodes[name].parent = this;
        }
        for (const action of ["mark", "previous", "next", "random"]) {
          this.nodes[action].dataset.action = action;
        }
        this.photo = this.nodes.photo;
      }
      if (value.includes('id="again"')) elements.set("again", new Element());
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    appendChild(element) { this.children.push(element); element.parent = this; }
    contains(element) { return this.children.includes(element); }
    querySelectorAll(selector) {
      return selector === ".choices button" ? ["previous", "random", "next"].map(name => this.nodes[name]) : this.children;
    }
    querySelector(selector) { return this.nodes[selector.slice(1)]; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    closest(selector) {
      if (selector === "button" && this.dataset.action) return this;
      if (selector === ".plate" && this.dataset.state) return this;
      return this.parent?.closest(selector) || null;
    }
    remove() {}
  }
  for (const id of ["grid", "counter", "bar", "saveStatus", "search", "toggleFound", "reset", "imageStatus", "imageCredits", "credits", "coverageRows", "coverageSummary"]) {
    elements.set(id, new Element());
  }
  const warnings = [];
  const windowHandlers = {};
  let randomCalls = 0;
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
    Math: Object.assign(Object.create(Math), { random: () => { randomCalls++; return 0.25; } }),
    console: { warn: (...args) => warnings.push(args) },
    confirm: () => !failures.cancelReset,
    setTimeout: () => 0
  });
  if (!failures.catalog) vm.runInContext(imageScript, context);
  vm.runInContext(script, context);
  return {
    storage, elements, warnings, windowHandlers,
    run: code => vm.runInContext(code, context),
    randomCalls: () => randomCalls,
    select: (index, action) => {
      const card = elements.get("grid").children[index];
      elements.get("grid").handlers.click({ target: card.nodes[action] });
    },
    mark: index => {
      const plate = elements.get("grid").children[index];
      elements.get("grid").handlers.click({ target: plate.nodes.mark });
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
  assert.match(html, /<button type="button" class="mark"/);
  assert.equal(arizona.nodes.mark.attributes["aria-pressed"], "true");
  game.elements.get("toggleFound").handlers.click({ target: game.elements.get("toggleFound") });
  assert.ok(arizona.classes.has("hidden"));
  game.elements.get("search").value = "Texas";
  game.elements.get("search").handlers.input();
  assert.equal(game.elements.get("grid").children.filter(el => !el.classes.has("hidden")).length, 1);
  const texas = game.elements.get("grid").children[42];
  // Native buttons dispatch the same click for keyboard activation.
  game.elements.get("grid").handlers.click({ target: texas.nodes.mark });
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

test("catalog coverage, standard defaults and attributed local assets match the published report", () => {
  assert.equal(Object.keys(catalog).length, 50);
  const sources = new Set();
  for (const choices of Object.values(catalog)) {
    assert.ok(choices.length >= 2);
    const state = Object.keys(catalog).find(name => catalog[name] === choices);
    assert.equal(coverage.states[state].count, choices.length);
    assert.equal(coverage.states[state].shortfall, Math.max(0, 20 - choices.length));
    const recent = choices.filter(image => image.recentPhotoDate).length;
    const historic = choices.filter(image => image.era === "historical").length;
    assert.equal(coverage.states[state].recentPhotos, recent);
    assert.equal(coverage.states[state].recentPhotoShortfall, Math.max(0, 10 - recent));
    assert.equal(coverage.states[state].historicExamples, historic);
    assert.equal(coverage.states[state].historicShortfall, Math.max(0, 5 - historic));
    const recentDesigns = choices.filter(image => image.designPeriod === "recent").length;
    const unknown = choices.filter(image => image.designPeriod === "unknown").length;
    assert.equal(coverage.states[state].recentDesigns, recentDesigns);
    assert.equal(coverage.states[state].recentDesignShortfall, Math.max(0, 10 - recentDesigns));
    assert.equal(coverage.states[state].unknownDesignEra, unknown);
    assert.equal(recentDesigns + historic + unknown, choices.length);
    assert.ok(choices.some(image => image.id === defaults[state].id && image.standard));
    assert.ok(defaults[state].label && defaults[state].evidence);
    assert.equal(new Set(choices.map(image => image.designKey)).size, choices.length);
    for (const image of choices) {
      assert.match(image.id, /^[a-z0-9-]+\.jpg$/);
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
      assert.ok(image.width >= 150 && image.height >= 50);
      if (image.recentPhotoDate) {
        assert.match(image.recentPhotoDate, /^(?:201[1-9]|202[0-6])(?:-|$)/);
        assert.notEqual(image.era, "historical");
      }
      if (image.designPeriod === "recent") {
        assert.ok(image.recentDesignEvidence.startYear >= 2011 && image.recentDesignEvidence.startYear <= 2026);
        assert.equal(image.recentDesignEvidence.source, image.source);
        assert.ok(image.recentDesignEvidence.note);
      }
    }
  }
  assert.equal(coverage.total, Object.values(catalog).reduce((sum, choices) => sum + choices.length, 0));
});

test("launch and reload use standard defaults without random calls or migrating old visit history", () => {
  const history = Object.fromEntries(Object.entries(catalog).map(([name, choices]) => [name, choices.at(-1).id]));
  const storage = new Map([[key, '["Arizona","Texas"]'], ["plateGame.images.v1", JSON.stringify(history)]]);
  for (let visit = 0; visit < 3; visit++) {
    const game = boot(storage);
    assert.equal(game.randomCalls(), 0);
    assert.equal(game.count(), "2 / 50");
    assert.equal(storage.has(selectionKey), false);
    for (const name of Object.keys(catalog)) {
      assert.equal(game.run(`imageSelection[${JSON.stringify(name)}].id`), defaults[name].id);
    }
  }
});

test("previous and next wrap; random changes only its own state without marking it", () => {
  const game = boot();
  const other = game.run("imageSelection.Alaska.id");
  game.mark(0);
  const start = game.run("imageSelection.Alabama.id");
  game.select(0, "next");
  assert.notEqual(game.run("imageSelection.Alabama.id"), start);
  game.select(0, "previous");
  assert.equal(game.run("imageSelection.Alabama.id"), start);
  for (let index = 0; index < catalog.Alabama.length; index++) game.select(0, "next");
  assert.equal(game.run("imageSelection.Alabama.id"), start);
  for (let index = 0; index < catalog.Alabama.length; index++) game.select(0, "previous");
  assert.equal(game.run("imageSelection.Alabama.id"), start);
  game.select(0, "random");
  assert.equal(game.randomCalls(), 1);
  assert.notEqual(game.run("imageSelection.Alabama.id"), start);
  assert.equal(game.run("imageSelection.Alaska.id"), other);
  assert.equal(game.count(), "1 / 50");
  assert.deepEqual(Object.keys(JSON.parse(game.storage.get(selectionKey))), ["Alabama"]);
  assert.equal(game.elements.get("grid").children[0].nodes.mark.attributes["aria-pressed"], "true");
});

test("explicit choices survive visits and both trip resets", () => {
  const game = boot();
  game.select(2, "next");
  const chosen = game.run("imageSelection.Arizona.id");
  game.mark(0);
  game.elements.get("reset").handlers.click();
  assert.equal(game.run("imageSelection.Arizona.id"), chosen);
  assert.equal(boot(game.storage).run("imageSelection.Arizona.id"), chosen);
  for (let index = 0; index < 50; index++) game.mark(index);
  game.elements.get("again").handlers.click();
  assert.equal(boot(game.storage).run("imageSelection.Arizona.id"), chosen);
  assert.equal(boot(game.storage).count(), "0 / 50");
});

test("invalid or blocked selections preserve play and deterministic defaults", () => {
  for (const history of ["null", "[]", "{broken", '{"Arizona":"not-a-real-image"}']) {
    const storage = new Map([[key, '["Arizona"]'], [selectionKey, history]]);
    const game = boot(storage);
    assert.equal(game.count(), "1 / 50");
    game.mark(0);
    assert.equal(game.count(), "2 / 50");
    assert.equal(game.run("imageSelection.Arizona.id"), defaults.Arizona.id);
    assert.equal(game.randomCalls(), 0);
    game.select(2, "next");
    assert.equal(Object.keys(JSON.parse(storage.get(selectionKey))).length, 1);
  }
  const blocked = boot(new Map(), { read: true, write: true });
  blocked.mark(0);
  assert.equal(blocked.count(), "1 / 50");
  blocked.select(2, "next");
  assert.match(blocked.elements.get("imageStatus").textContent, /could not be saved/);
  assert.equal(blocked.randomCalls(), 0);
});

test("credits are built only on first expansion and images are lazy", () => {
  const game = boot();
  assert.equal(game.elements.get("imageCredits").children.length, 0);
  assert.equal(game.elements.get("grid").children[0].photo.children[0].loading, "lazy");
  const credits = game.elements.get("credits");
  credits.open = true;
  credits.handlers.toggle({ target: credits });
  assert.equal(game.elements.get("coverageRows").children.length, 50);
  const firstRow = game.elements.get("coverageRows").children[0].children.map(cell => cell.textContent);
  assert.equal(firstRow[0], "Alabama");
  assert.match(firstRow[1], new RegExp(`^${coverage.states.Alabama.recentDesigns} / 10`));
  assert.match(firstRow[2], new RegExp(`^${coverage.states.Alabama.historicExamples} / 5`));
  assert.equal(firstRow[3], String(coverage.states.Alabama.unknownDesignEra));
  assert.match(game.elements.get("coverageSummary").textContent, /not proof of a recent issue or design date/);
  const count = game.elements.get("imageCredits").children.length;
  assert.equal(count, coverage.total);
  credits.handlers.toggle({ target: credits });
  assert.equal(game.elements.get("imageCredits").children.length, count);
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

test("late failures from a replaced image cannot remove the newly selected photo", () => {
  const game = boot();
  const photo = game.elements.get("grid").children[0].photo;
  const old = photo.children[0];
  game.select(0, "next");
  const selected = photo.children[0];
  old.handlers.error();
  assert.equal(photo.children[0], selected);
  assert.doesNotMatch(game.elements.get("imageStatus").textContent, /failed to load/);
});
