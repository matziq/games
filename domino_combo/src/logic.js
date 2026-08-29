/* =========================================================
   DOMINO COMBO – pure game logic (DOM-free, unit-testable)
   ========================================================= */

// Die face colors keyed by pip value.
export const COLORS = {
  1: '#BDBDBD', // gray
  2: '#42A5F5', // blue
  3: '#66BB6A', // green
  4: '#AB47BC', // purple
  5: '#FFEE58', // yellow
  6: '#EF5350', // red
};

// Dot positions within a 3×3 grid: [row, col].
export const DOTS = {
  1: [[1, 1]],
  2: [[0, 2], [2, 0]],
  3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

// Create an empty gridSize × gridSize board.
export function createBoard(gridSize) {
  return Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
}

// Difficulty controls which pieces spawn, independently of the game mode.
//   regular   – mostly two-value dominoes (the original behavior)
//   easy      – single dice only, locked to the 5×5 / match-3 beginner board
//   noob      – single dice only, but board size and match count stay free
//   snakeeyes – always twin doubles (the same value on both halves)
export const DIFFICULTIES = ['regular', 'easy', 'noob', 'snakeeyes'];
export const DEFAULT_DIFFICULTY = 'regular';

export const DIFFICULTY_LABELS = {
  regular: 'Regular',
  easy: 'Easy',
  noob: 'Noob',
  snakeeyes: 'Snake Eyes',
};

// Easy pins the board to the beginner preset so its high scores stay comparable.
export const EASY_GRID_SIZE = 5;
export const EASY_MATCH_COUNT = 3;

// Chance of spawning a two-value domino on Regular difficulty.
export const DOUBLE_SPAWN_CHANCE = 6 / 7;

export function normalizeDifficulty(difficulty) {
  return DIFFICULTIES.includes(difficulty) ? difficulty : DEFAULT_DIFFICULTY;
}

// Easy is the only difficulty that locks the board controls.
export function locksBoardOptions(difficulty) {
  return normalizeDifficulty(difficulty) === 'easy';
}

// Which piece shape spawns next. 'twin' is a double whose halves share a
// value; 'double' is a double with two different values.
export function spawnTypeForDifficulty(difficulty, canFitDouble, maxSpawnVal, roll) {
  switch (normalizeDifficulty(difficulty)) {
    case 'snakeeyes':
      return canFitDouble ? 'twin' : 'single';
    case 'easy':
    case 'noob':
      return 'single';
    default:
      return canFitDouble && maxSpawnVal >= 2 && roll < DOUBLE_SPAWN_CHANCE
        ? 'double'
        : 'single';
  }
}

// Key used to store per-config high scores. `mode` defaults to the
// original 'classic' format and `difficulty` to 'regular' so
// previously-saved scores keep working.
export function hsKey(gridSize, matchCount, mode = 'classic', difficulty = DEFAULT_DIFFICULTY) {
  const base =
    mode === 'classic'
      ? `${gridSize}_${matchCount}`
      : `${gridSize}_${matchCount}_${mode}`;
  return normalizeDifficulty(difficulty) === DEFAULT_DIFFICULTY
    ? base
    : `${base}_${normalizeDifficulty(difficulty)}`;
}

// Chaos mode: a matched group of this size or larger triggers a full-board
// gravity collapse, which can cascade into further combos.
export const CHAOS_MATCH_THRESHOLD = 4;
export const SIX_EXPLOSION_THRESHOLD = 4;

// Ultimate Chaos picks one of these at random for every collapse.
export const COLLAPSE_DIRECTIONS = ['down', 'up', 'left', 'right'];

// Board cells a piece would occupy if anchored at (r, c).
export function cellsFor(r, c, piece) {
  const out = [{ r, c }];
  if (piece.type === 'double') {
    out.push(piece.ori === 'h' ? { r, c: c + 1 } : { r: r + 1, c });
  }
  return out;
}

// True when every cell is in-bounds and empty.
export function validPlace(board, gridSize, cells) {
  return cells.every(
    ({ r, c }) =>
      r >= 0 && r < gridSize && c >= 0 && c < gridSize && board[r][c] === null,
  );
}

// Resolve a drop target into valid cells, trying an anchor shifted back
// so a double can snap when the pointer lands on its trailing half.
export function smartPlace(board, gridSize, piece, target) {
  let cells = cellsFor(target.r, target.c, piece);
  if (validPlace(board, gridSize, cells)) return cells;

  if (piece.type === 'double') {
    cells =
      piece.ori === 'h'
        ? cellsFor(target.r, target.c - 1, piece)
        : cellsFor(target.r - 1, target.c, piece);
    if (validPlace(board, gridSize, cells)) return cells;
  }
  return null;
}

// Is there room anywhere for a horizontal or vertical double?
export function canPlaceDouble(board, gridSize) {
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (board[r][c] !== null) continue;
      if (c + 1 < gridSize && board[r][c + 1] === null) return true;
      if (r + 1 < gridSize && board[r + 1][c] === null) return true;
    }
  }
  return false;
}

// Can the current piece be placed anywhere (in any allowed orientation)?
export function canPlaceAnywhere(board, gridSize, piece) {
  const oris = piece.type === 'double' ? ['h', 'v'] : ['h'];
  for (const ori of oris) {
    const testPiece = { ...piece, ori };
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (validPlace(board, gridSize, cellsFor(r, c, testPiece))) return true;
      }
    }
  }
  return false;
}

// Visual order of a piece's values, accounting for CSS rotation.
export function visualVals(piece) {
  const normRot = ((piece.rot % 360) + 360) % 360;
  return normRot === 180 || normRot === 270
    ? [...piece.vals].reverse()
    : [...piece.vals];
}

// Find all orthogonally-connected groups of matchCount+ equal tiles.
export function findGroups(board, gridSize, matchCount) {
  const visited = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false),
  );
  const groups = [];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (visited[r][c] || board[r][c] === null) continue;

      const val = board[r][c];
      const group = [];
      const queue = [{ r, c }];
      visited[r][c] = true;

      while (queue.length) {
        const cur = queue.shift();
        group.push(cur);
        for (const [dr, dc] of dirs) {
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          if (
            nr >= 0 &&
            nr < gridSize &&
            nc >= 0 &&
            nc < gridSize &&
            !visited[nr][nc] &&
            board[nr][nc] === val
          ) {
            visited[nr][nc] = true;
            queue.push({ r: nr, c: nc });
          }
        }
      }

      if (group.length >= matchCount) {
        groups.push({ val, cells: group });
      }
    }
  }
  return groups;
}

// Choose where a cleared group merges: prefer a just-placed cell inside it,
// otherwise fall back to the cell closest to the group's center.
export function pickMergeTarget(group, lastPlacedCells) {
  for (const p of lastPlacedCells) {
    if (group.cells.some((c) => c.r === p.r && c.c === p.c)) return p;
  }

  let avgR = 0;
  let avgC = 0;
  group.cells.forEach((c) => {
    avgR += c.r;
    avgC += c.c;
  });
  avgR /= group.cells.length;
  avgC /= group.cells.length;

  let best = group.cells[0];
  let bestD = Infinity;
  for (const c of group.cells) {
    const d = Math.abs(c.r - avgR) + Math.abs(c.c - avgC);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// True if any matched group is large enough to trigger a Chaos collapse.
export function triggersCollapse(groups, threshold = CHAOS_MATCH_THRESHOLD) {
  return groups.some((g) => g.cells.length >= threshold);
}

// Chaos modes need at least four matching tiles before the board moves. A
// stricter match requirement (Hard) raises the bar instead of lowering it.
export function collapseThreshold(matchCount = CHAOS_MATCH_THRESHOLD) {
  return Math.max(CHAOS_MATCH_THRESHOLD, matchCount);
}

// Four or more sixes detonate instead of merging, destroying every tile in the
// single-cell ring around the matched group.
export function isExplodingSixGroup(group) {
  return group.val === 6 && group.cells.length >= SIX_EXPLOSION_THRESHOLD;
}

// Groups big enough to drag the whole board. In Chaos an exploding six clears
// its blast radius in place, so it never causes a collapse; in Ultimate Chaos
// every qualifying match — sixes included — throws the board.
export function triggersChaosCollapse(
  groups,
  matchCount = CHAOS_MATCH_THRESHOLD,
  gameMode = 'chaos',
) {
  const threshold = collapseThreshold(matchCount);
  return groups.some(
    (group) =>
      group.cells.length >= threshold &&
      !(gameMode === 'chaos' && isExplodingSixGroup(group)),
  );
}

export function shouldCollapseForMode(gameMode, groups, matchCount) {
  return (
    (gameMode === 'chaos' || gameMode === 'ultra') &&
    triggersChaosCollapse(groups, matchCount, gameMode)
  );
}

// Chaos always pulls straight down. Ultimate Chaos picks one of the four
// directions at random every time the board collapses.
export function collapseDirectionForMode(gameMode, rng = Math.random) {
  if (gameMode !== 'ultra') return 'down';
  const index = Math.floor(rng() * COLLAPSE_DIRECTIONS.length);
  return COLLAPSE_DIRECTIONS[
    Math.min(Math.max(index, 0), COLLAPSE_DIRECTIONS.length - 1)
  ];
}

// Find every occupied cell touching an exploding group, including diagonals.
// Overlapping blast areas only destroy and score a tile once.
export function explosionTargets(board, gridSize, sourceCells, excludedCells = sourceCells) {
  const excluded = new Set(excludedCells.map(({ r, c }) => `${r},${c}`));
  const targets = new Map();

  for (const { r, c } of sourceCells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        const key = `${nr},${nc}`;
        if (
          nr >= 0 &&
          nr < gridSize &&
          nc >= 0 &&
          nc < gridSize &&
          board[nr][nc] !== null &&
          !excluded.has(key)
        ) {
          targets.set(key, { r: nr, c: nc, val: board[nr][nc] });
        }
      }
    }
  }

  return [...targets.values()];
}

// Apply gravity to the whole board in any of the four directions. Returns a
// fresh board plus the list of tiles that moved, leaving the input untouched.
export function collapseBoard(board, gridSize, direction = 'down') {
  const newBoard = createBoard(gridSize);
  const moved = [];
  const horizontal = direction === 'left' || direction === 'right';
  const towardStart = direction === 'up' || direction === 'left';

  for (let line = 0; line < gridSize; line++) {
    const vals = [];
    for (let i = 0; i < gridSize; i++) {
      const r = horizontal ? line : i;
      const c = horizontal ? i : line;
      if (board[r][c] !== null) vals.push({ i, val: board[r][c] });
    }
    vals.forEach((entry, k) => {
      const target = towardStart ? k : gridSize - vals.length + k;
      const r0 = horizontal ? line : entry.i;
      const c0 = horizontal ? entry.i : line;
      const r1 = horizontal ? line : target;
      const c1 = horizontal ? target : line;
      newBoard[r1][c1] = entry.val;
      if (r1 !== r0 || c1 !== c0) {
        moved.push({ r0, c0, r1, c1, val: entry.val });
      }
    });
  }

  return { board: newBoard, moved };
}

// Score a set of cleared groups. `chainDepth` starts at 1 for the first
// clear of a placement and increases for each chained reaction.
export function computeScore(groups, chainDepth) {
  const numSets = groups.length;
  const isChain = chainDepth > 1;
  const isCombo = numSets >= 2;

  let pts = 0;
  for (const grp of groups) {
    pts += grp.val * grp.cells.length;
  }

  const multiBonus = numSets >= 2 ? 25 * (numSets - 1) : 0;
  const basePts = pts + multiBonus;
  const chainBonus = isChain ? 25 * (chainDepth - 1) : 0;
  const totalPts = basePts + chainBonus;

  return { numSets, isChain, isCombo, basePts, chainBonus, totalPts };
}

// Sanitize a high-score name: letters only, max 6, uppercase.
export function sanitizeName(raw) {
  return raw
    .replace(/[^a-zA-Z]/g, '')
    .substring(0, 6)
    .toUpperCase();
}

// Random pip value in [1, maxSpawnVal]. `rng` is injectable for tests.
export function randVal(maxSpawnVal, rng = Math.random) {
  return Math.floor(rng() * maxSpawnVal) + 1;
}

// Random pip value that is not `exclude`.
export function randValExcluding(maxSpawnVal, exclude, rng = Math.random) {
  let v;
  do {
    v = randVal(maxSpawnVal, rng);
  } while (v === exclude);
  return v;
}
