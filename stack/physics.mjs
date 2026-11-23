export const MAX_PLACEMENTS = 40;
export const GROUND_Y = 1000;
export const SHAPES = ["bar", "square", "tee", "ell", "short"];
const colors = ["#fcbd52", "#76c9fa", "#d597f9", "#f18383", "#87dbb2"];
const geometry = {
  bar: [[0, 0, 112, 28]], square: [[0, 0, 56, 56]],
  tee: [[0, -14, 84, 28], [0, 14, 28, 28]],
  ell: [[-14, 0, 28, 84], [14, 28, 28, 28]],
  short: [[0, 0, 84, 28]]
};
export function newGame(random = Math.random) {
  return { version: 1, queue: Array.from({length: MAX_PLACEMENTS}, () => SHAPES[Math.floor(random() * SHAPES.length)]),
    blocks: [], aim: 300, rotation: 0, phase: "aim", quiet: 0, ticks: 0, loser: null };
}
export function validGame(s) {
  if (!s || s.version !== 1 || !Array.isArray(s.queue) || s.queue.length !== MAX_PLACEMENTS || s.queue.some(x => !SHAPES.includes(x)) ||
      !Array.isArray(s.blocks) || s.blocks.length > MAX_PLACEMENTS || !["aim", "falling", "won", "lost"].includes(s.phase) ||
      !Number.isFinite(s.aim) || s.aim < 45 || s.aim > 555 || !Number.isInteger(s.rotation) || s.rotation < 0 || s.rotation > 3 ||
      !Number.isInteger(s.quiet) || s.quiet < 0 || !Number.isInteger(s.ticks) || s.ticks < 0 ||
      !(s.loser === null || s.loser === 0 || s.loser === 1)) return false;
  if (s.phase === "lost" ? s.loser === null || !s.blocks.length : s.loser !== null) return false;
  if (s.phase === "won" && s.blocks.length !== MAX_PLACEMENTS) return false;
  if ((s.phase === "aim" && s.blocks.length >= MAX_PLACEMENTS) || (s.phase === "falling" && !s.blocks.length)) return false;
  return s.blocks.every((b, i) => b && b.shape === s.queue[i] && ["x", "y", "angle", "vx", "vy", "angularVelocity"].every(k => Number.isFinite(b[k])) &&
    Math.abs(b.x) < 100000 && Math.abs(b.y) < 100000 && Math.abs(b.vx) < 10000 && Math.abs(b.vy) < 10000 && Math.abs(b.angularVelocity) < 1000);
}
export function makeBody(M, shape, x, y, angle = 0) {
  const options = { friction: 0.8, frictionStatic: 1, restitution: 0.02, density: 0.002, frictionAir: 0.012, render: { fillStyle: colors[SHAPES.indexOf(shape)] } };
  const pieces = geometry[shape].map(([dx, dy, w, h]) => M.Bodies.rectangle(x + dx, y + dy, w, h, options));
  const body = pieces.length === 1 ? pieces[0] : M.Body.create({ ...options, parts: pieces });
  M.Body.setPosition(body, { x, y });
  M.Body.setAngle(body, angle);
  body.plugin.shape = shape;
  return body;
}
export function createWorld(M, state) {
  const engine = M.Engine.create({ enableSleeping: false });
  engine.gravity.y = 1;
  const ground = M.Bodies.rectangle(300, GROUND_Y + 18, 320, 36, { isStatic: true, friction: 0.9 });
  M.Composite.add(engine.world, ground);
  const bodies = state.blocks.map(b => {
    const body = makeBody(M, b.shape, b.x, b.y, b.angle);
    M.Body.setVelocity(body, { x: b.vx, y: b.vy });
    M.Body.setAngularVelocity(body, b.angularVelocity);
    return body;
  });
  M.Composite.add(engine.world, bodies);
  return { engine, ground, bodies };
}
export function snapshot(bodies) {
  return bodies.map(b => ({ shape: b.plugin.shape, x: b.position.x, y: b.position.y, angle: b.angle,
    vx: b.velocity.x, vy: b.velocity.y, angularVelocity: b.angularVelocity }));
}
export function topOf(bodies) { return bodies.length ? Math.min(...bodies.map(b => b.bounds.min.y), GROUND_Y) : GROUND_Y; }
export function hasFallen(bodies) {
  return bodies.some(b => b.bounds.min.y > GROUND_Y + 35 || Math.abs(b.position.x - 300) > 500);
}
export function towerHeight(bodies) { return Math.max(0, Math.round(GROUND_Y - topOf(bodies))); }
export function addBlock(M, world, state) {
  if (state.phase !== "aim" || state.blocks.length >= MAX_PLACEMENTS) return false;
  const body = makeBody(M, state.queue[state.blocks.length], state.aim, topOf(world.bodies) - 100, state.rotation * Math.PI / 2);
  world.bodies.push(body);
  M.Composite.add(world.engine.world, body);
  state.blocks = snapshot(world.bodies);
  state.phase = "falling"; state.quiet = 0; state.ticks = 0; state.rotation = 0;
  return true;
}
export function step(M, world, state) {
  if (state.phase === "lost" || state.phase === "won") return;
  M.Engine.update(world.engine, 1000 / 60);
  if (hasFallen(world.bodies)) {
    state.phase = "lost"; state.loser = (world.bodies.length - 1) % 2;
  } else if (state.phase === "falling") {
    state.ticks++;
    const quiet = world.bodies.every(b => b.speed < 0.13 && Math.abs(b.angularVelocity) < 0.006);
    state.quiet = quiet ? state.quiet + 1 : 0;
    if (state.quiet >= 45) {
      state.phase = world.bodies.length === MAX_PLACEMENTS ? "won" : "aim";
    }
  }
}
