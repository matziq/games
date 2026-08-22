import { describe, it, expect } from 'vitest';
import {
  COLORS,
  DOTS,
  createBoard,
  hsKey,
  cellsFor,
  validPlace,
  smartPlace,
  canPlaceDouble,
  canPlaceAnywhere,
  visualVals,
  findGroups,
  pickMergeTarget,
  triggersCollapse,
  triggersChaosCollapse,
  shouldCollapseForMode,
  collapseDirectionForMode,
  explosionTargets,
  collapseColumns,
  CHAOS_MATCH_THRESHOLD,
  computeScore,
  sanitizeName,
  randVal,
  randValExcluding,
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LABELS,
  EASY_GRID_SIZE,
  EASY_MATCH_COUNT,
  DOUBLE_SPAWN_CHANCE,
  normalizeDifficulty,
  locksBoardOptions,
  spawnTypeForDifficulty,
} from '../src/logic.js';

describe('constants', () => {
  it('defines a color and dot layout for every pip value 1-6', () => {
    for (let v = 1; v <= 6; v++) {
      expect(COLORS[v]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(DOTS[v]).toHaveLength(v);
    }
  });
});

describe('createBoard', () => {
  it('creates a square board filled with null', () => {
    const b = createBoard(5);
    expect(b).toHaveLength(5);
    expect(b.every((row) => row.length === 5)).toBe(true);
    expect(b.flat().every((cell) => cell === null)).toBe(true);
  });

  it('creates independent rows (no shared reference)', () => {
    const b = createBoard(3);
    b[0][0] = 4;
    expect(b[1][0]).toBeNull();
  });
});

describe('hsKey', () => {
  it('combines grid size and match count', () => {
    expect(hsKey(5, 3)).toBe('5_3');
    expect(hsKey(7, 2)).toBe('7_2');
  });

  it('uses the classic format when mode is omitted or "classic"', () => {
    expect(hsKey(5, 3, 'classic')).toBe('5_3');
  });

  it('appends the mode suffix for non-classic modes', () => {
    expect(hsKey(5, 3, 'chaos')).toBe('5_3_chaos');
  });

  it('keeps existing keys unchanged on the default difficulty', () => {
    expect(hsKey(5, 3, 'classic', 'regular')).toBe('5_3');
    expect(hsKey(5, 3, 'chaos', 'regular')).toBe('5_3_chaos');
  });

  it('appends a difficulty suffix for non-regular difficulties', () => {
    expect(hsKey(5, 3, 'classic', 'easy')).toBe('5_3_easy');
    expect(hsKey(6, 4, 'ultra', 'snakeeyes')).toBe('6_4_ultra_snakeeyes');
    expect(hsKey(7, 2, 'chaos', 'noob')).toBe('7_2_chaos_noob');
  });

  it('falls back to the default difficulty for unknown values', () => {
    expect(hsKey(5, 3, 'classic', 'bogus')).toBe('5_3');
  });
});

describe('difficulty', () => {
  it('exposes a label for every difficulty', () => {
    expect(DIFFICULTIES).toContain(DEFAULT_DIFFICULTY);
    for (const level of DIFFICULTIES) {
      expect(typeof DIFFICULTY_LABELS[level]).toBe('string');
    }
  });

  it('normalizes unknown difficulties to the default', () => {
    expect(normalizeDifficulty('noob')).toBe('noob');
    expect(normalizeDifficulty(undefined)).toBe(DEFAULT_DIFFICULTY);
    expect(normalizeDifficulty('nope')).toBe(DEFAULT_DIFFICULTY);
  });

  it('locks the board options only on Easy', () => {
    expect(locksBoardOptions('easy')).toBe(true);
    expect(locksBoardOptions('noob')).toBe(false);
    expect(locksBoardOptions('regular')).toBe(false);
    expect(locksBoardOptions('snakeeyes')).toBe(false);
    expect(EASY_GRID_SIZE).toBe(5);
    expect(EASY_MATCH_COUNT).toBe(3);
  });
});

describe('spawnTypeForDifficulty', () => {
  it('always spawns single dice on Easy and Noob', () => {
    for (const level of ['easy', 'noob']) {
      expect(spawnTypeForDifficulty(level, true, 6, 0)).toBe('single');
      expect(spawnTypeForDifficulty(level, false, 6, 0.99)).toBe('single');
    }
  });

  it('spawns twin doubles on Snake Eyes whenever a double fits', () => {
    expect(spawnTypeForDifficulty('snakeeyes', true, 6, 0.99)).toBe('twin');
    expect(spawnTypeForDifficulty('snakeeyes', true, 1, 0.99)).toBe('twin');
  });

  it('falls back to a single on Snake Eyes when no double fits', () => {
    expect(spawnTypeForDifficulty('snakeeyes', false, 6, 0)).toBe('single');
  });

  it('spawns mostly doubles on Regular', () => {
    expect(spawnTypeForDifficulty('regular', true, 6, 0)).toBe('double');
    expect(spawnTypeForDifficulty('regular', true, 6, DOUBLE_SPAWN_CHANCE)).toBe('single');
  });

  it('never spawns a double on Regular without room or distinct values', () => {
    expect(spawnTypeForDifficulty('regular', false, 6, 0)).toBe('single');
    expect(spawnTypeForDifficulty('regular', true, 1, 0)).toBe('single');
  });
});

describe('cellsFor', () => {
  it('returns a single cell for a single piece', () => {
    expect(cellsFor(2, 3, { type: 'single' })).toEqual([{ r: 2, c: 3 }]);
  });

  it('extends horizontally for a horizontal double', () => {
    expect(cellsFor(1, 1, { type: 'double', ori: 'h' })).toEqual([
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ]);
  });

  it('extends vertically for a vertical double', () => {
    expect(cellsFor(1, 1, { type: 'double', ori: 'v' })).toEqual([
      { r: 1, c: 1 },
      { r: 2, c: 1 },
    ]);
  });
});

describe('validPlace', () => {
  const gridSize = 3;
  const board = createBoard(gridSize);
  board[0][0] = 5;

  it('accepts in-bounds empty cells', () => {
    expect(validPlace(board, gridSize, [{ r: 1, c: 1 }])).toBe(true);
  });

  it('rejects occupied cells', () => {
    expect(validPlace(board, gridSize, [{ r: 0, c: 0 }])).toBe(false);
  });

  it('rejects out-of-bounds cells', () => {
    expect(validPlace(board, gridSize, [{ r: 3, c: 0 }])).toBe(false);
    expect(validPlace(board, gridSize, [{ r: 0, c: -1 }])).toBe(false);
  });
});

describe('smartPlace', () => {
  it('places at the primary anchor when valid', () => {
    const board = createBoard(4);
    const piece = { type: 'double', ori: 'h' };
    expect(smartPlace(board, 4, piece, { r: 0, c: 0 })).toEqual([
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ]);
  });

  it('shifts a horizontal double back when the head is off-board', () => {
    const board = createBoard(4);
    const piece = { type: 'double', ori: 'h' };
    // Dropping on the last column: head cell (r,4) is invalid, so anchor shifts to c-1.
    expect(smartPlace(board, 4, piece, { r: 2, c: 3 })).toEqual([
      { r: 2, c: 2 },
      { r: 2, c: 3 },
    ]);
  });

  it('returns null when nothing fits', () => {
    const board = createBoard(2);
    board[0][0] = 1;
    board[0][1] = 1;
    const piece = { type: 'double', ori: 'h' };
    expect(smartPlace(board, 2, piece, { r: 0, c: 0 })).toBeNull();
  });
});

describe('canPlaceDouble', () => {
  it('is true on an empty board', () => {
    expect(canPlaceDouble(createBoard(3), 3)).toBe(true);
  });

  it('is false when no two adjacent empty cells remain', () => {
    // Fill a checkerboard so no two empty cells are orthogonally adjacent.
    const board = createBoard(3);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if ((r + c) % 2 === 0) board[r][c] = 1;
      }
    }
    expect(canPlaceDouble(board, 3)).toBe(false);
  });
});

describe('canPlaceAnywhere', () => {
  it('does not mutate the passed piece', () => {
    const board = createBoard(3);
    const piece = { type: 'double', ori: 'h', vals: [1, 2], rot: 0 };
    canPlaceAnywhere(board, 3, piece);
    expect(piece.ori).toBe('h');
  });

  it('finds a vertical fit when only vertical space remains', () => {
    // A single empty column pair: fill everything except a vertical slot.
    const board = createBoard(2);
    board[0][0] = 1;
    board[1][0] = 1;
    // column 1 is empty (2 cells stacked) → vertical double fits, horizontal does not.
    const piece = { type: 'double', ori: 'h', vals: [1, 2], rot: 0 };
    expect(canPlaceAnywhere(board, 2, piece)).toBe(true);
  });

  it('is false for a single when the board is full', () => {
    const board = createBoard(2);
    board.forEach((row, r) => row.forEach((_, c) => (board[r][c] = 1)));
    expect(canPlaceAnywhere(board, 2, { type: 'single' })).toBe(false);
  });
});

describe('visualVals', () => {
  it('keeps order at 0 and 90 degrees', () => {
    expect(visualVals({ vals: [1, 2], rot: 0 })).toEqual([1, 2]);
    expect(visualVals({ vals: [1, 2], rot: 90 })).toEqual([1, 2]);
  });

  it('reverses order at 180 and 270 degrees', () => {
    expect(visualVals({ vals: [1, 2], rot: 180 })).toEqual([2, 1]);
    expect(visualVals({ vals: [1, 2], rot: 270 })).toEqual([2, 1]);
  });

  it('normalizes negative and large rotations', () => {
    expect(visualVals({ vals: [1, 2], rot: -180 })).toEqual([2, 1]);
    expect(visualVals({ vals: [1, 2], rot: 540 })).toEqual([2, 1]);
  });
});

describe('findGroups', () => {
  it('finds a horizontal run of matchCount', () => {
    const board = createBoard(3);
    board[0][0] = 4;
    board[0][1] = 4;
    board[0][2] = 4;
    const groups = findGroups(board, 3, 3);
    expect(groups).toHaveLength(1);
    expect(groups[0].val).toBe(4);
    expect(groups[0].cells).toHaveLength(3);
  });

  it('ignores runs shorter than matchCount', () => {
    const board = createBoard(3);
    board[0][0] = 4;
    board[0][1] = 4;
    expect(findGroups(board, 3, 3)).toHaveLength(0);
  });

  it('does not connect diagonally', () => {
    const board = createBoard(3);
    board[0][0] = 2;
    board[1][1] = 2;
    board[2][2] = 2;
    expect(findGroups(board, 3, 3)).toHaveLength(0);
  });

  it('treats an L-shape as one connected group', () => {
    const board = createBoard(3);
    board[0][0] = 5;
    board[1][0] = 5;
    board[1][1] = 5;
    const groups = findGroups(board, 3, 3);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toHaveLength(3);
  });

  it('finds multiple distinct groups', () => {
    const board = createBoard(5);
    // group of 3s across the top
    board[0][0] = board[0][1] = board[0][2] = 3;
    // separate group of 6s across the bottom
    board[4][0] = board[4][1] = board[4][2] = 6;
    const groups = findGroups(board, 5, 3);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.val).sort()).toEqual([3, 6]);
  });

  it('respects a matchCount of 2', () => {
    const board = createBoard(3);
    board[0][0] = 1;
    board[0][1] = 1;
    expect(findGroups(board, 3, 2)).toHaveLength(1);
  });
});

describe('pickMergeTarget', () => {
  const group = {
    val: 2,
    cells: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
    ],
  };

  it('prefers a last-placed cell inside the group', () => {
    expect(pickMergeTarget(group, [{ r: 0, c: 2 }])).toEqual({ r: 0, c: 2 });
  });

  it('falls back to the center-most cell when no last-placed cell matches', () => {
    expect(pickMergeTarget(group, [{ r: 4, c: 4 }])).toEqual({ r: 0, c: 1 });
  });

  it('falls back to center-most with an empty last-placed list', () => {
    expect(pickMergeTarget(group, [])).toEqual({ r: 0, c: 1 });
  });
});

describe('triggersCollapse', () => {
  it('returns false when no group reaches the threshold', () => {
    const groups = [{ val: 1, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] }];
    expect(triggersCollapse(groups)).toBe(false);
  });

  it('returns true when a group has CHAOS_MATCH_THRESHOLD or more cells', () => {
    const cells = Array.from({ length: CHAOS_MATCH_THRESHOLD }, (_, i) => ({ r: 0, c: i }));
    const groups = [{ val: 1, cells }];
    expect(triggersCollapse(groups)).toBe(true);
  });

  it('respects a custom threshold', () => {
    const groups = [{ val: 1, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }] }];
    expect(triggersCollapse(groups, 2)).toBe(true);
    expect(triggersCollapse(groups, 3)).toBe(false);
  });
});

describe('triggersChaosCollapse', () => {
  it('collapses for four tiles valued 1-5 but not three', () => {
    expect(triggersChaosCollapse([{ val: 4, cells: [{}, {}, {}, {}] }])).toBe(true);
    expect(triggersChaosCollapse([{ val: 4, cells: [{}, {}, {}] }])).toBe(false);
  });

  describe('shouldCollapseForMode', () => {
    const threeFours = [{ val: 4, cells: [{}, {}, {}] }];
    const fourFours = [{ val: 4, cells: [{}, {}, {}, {}] }];
    const threeSixes = [{ val: 6, cells: [{}, {}, {}] }];

    it('gives Chaos the former Ultimate collapse thresholds', () => {
      expect(shouldCollapseForMode('chaos', threeFours, 3)).toBe(false);
      expect(shouldCollapseForMode('chaos', fourFours, 3)).toBe(true);
      expect(shouldCollapseForMode('chaos', threeSixes, 3)).toBe(true);
    });

    it('uses the same explicit thresholds for Ultimate Chaos', () => {
      expect(shouldCollapseForMode('ultra', threeFours, 3)).toBe(false);
      expect(shouldCollapseForMode('ultra', fourFours, 3)).toBe(true);
      expect(shouldCollapseForMode('ultra', threeSixes, 3)).toBe(true);
      expect(shouldCollapseForMode('ultra', threeSixes, 4)).toBe(false);
    });

    it('never collapses Classic mode', () => {
      expect(shouldCollapseForMode('classic', fourFours, 3)).toBe(false);
    });
  });

  it('collapses for three sixes', () => {
    expect(triggersChaosCollapse([{ val: 6, cells: [{}, {}, {}] }])).toBe(true);
  });

  it('requires four sixes when the configured match requirement is four', () => {
    const threeSixes = [{ val: 6, cells: [{}, {}, {}] }];
    const fourSixes = [{ val: 6, cells: [{}, {}, {}, {}] }];
    expect(triggersChaosCollapse(threeSixes, 4)).toBe(false);
    expect(triggersChaosCollapse(fourSixes, 4)).toBe(true);
  });
});

describe('collapseDirectionForMode', () => {
  const fourSixes = [{ val: 6, cells: [{}, {}, {}, {}] }];
  const threeSixes = [{ val: 6, cells: [{}, {}, {}] }];
  const fourFives = [{ val: 5, cells: [{}, {}, {}, {}] }];

  it('always collapses downward in Chaos', () => {
    expect(collapseDirectionForMode('chaos', fourSixes)).toBe('down');
  });

  it('collapses downward for ordinary Ultimate matches and three sixes', () => {
    expect(collapseDirectionForMode('ultra', fourFives)).toBe('down');
    expect(collapseDirectionForMode('ultra', threeSixes)).toBe('down');
  });

  it('collapses upward for four or more sixes in Ultimate Chaos', () => {
    expect(collapseDirectionForMode('ultra', fourSixes)).toBe('up');
  });
});

describe('explosionTargets', () => {
  it('finds all eight occupied neighbors around an exploding six', () => {
    const board = Array.from({ length: 3 }, () => Array(3).fill(1));
    board[1][1] = 6;
    const targets = explosionTargets(board, 3, [{ r: 1, c: 1 }]);
    expect(targets).toHaveLength(8);
    expect(targets.reduce((sum, cell) => sum + cell.val, 0)).toBe(8);
  });

  it('deduplicates overlapping blasts and excludes other matched cells', () => {
    const board = Array.from({ length: 3 }, () => Array(3).fill(2));
    board[1][0] = board[1][1] = 6;
    const sources = [{ r: 1, c: 0 }, { r: 1, c: 1 }];
    const excluded = [...sources, { r: 0, c: 0 }];
    const targets = explosionTargets(board, 3, sources, excluded);
    expect(targets).toHaveLength(6);
    expect(new Set(targets.map(({ r, c }) => `${r},${c}`)).size).toBe(6);
  });
});

describe('collapseColumns', () => {
  it('drops tiles to the bottom of each column, preserving order', () => {
    const board = createBoard(3);
    board[0][0] = 1;
    board[1][0] = 2;
    // column 0: [1, 2, null] -> should become [null, 1, 2]
    const { board: out } = collapseColumns(board, 3);
    expect(out[0][0]).toBeNull();
    expect(out[1][0]).toBe(1);
    expect(out[2][0]).toBe(2);
  });

  it('leaves an already-settled column unchanged', () => {
    const board = createBoard(3);
    board[2][1] = 5;
    const { board: out, moved } = collapseColumns(board, 3);
    expect(out[2][1]).toBe(5);
    expect(moved).toHaveLength(0);
  });

  it('reports every tile that moved', () => {
    const board = createBoard(2);
    board[0][0] = 3;
    const { moved } = collapseColumns(board, 2);
    expect(moved).toEqual([{ r0: 0, c0: 0, r1: 1, c1: 0, val: 3 }]);
  });

  it('lifts tiles to the top when gravity points upward', () => {
    const board = createBoard(3);
    board[1][0] = 1;
    board[2][0] = 2;
    const { board: out, moved } = collapseColumns(board, 3, 'up');
    expect(out[0][0]).toBe(1);
    expect(out[1][0]).toBe(2);
    expect(out[2][0]).toBeNull();
    expect(moved).toEqual([
      { r0: 1, c0: 0, r1: 0, c1: 0, val: 1 },
      { r0: 2, c0: 0, r1: 1, c1: 0, val: 2 },
    ]);
  });

  it('does not mutate the input board', () => {
    const board = createBoard(3);
    board[0][0] = 4;
    collapseColumns(board, 3);
    expect(board[0][0]).toBe(4);
    expect(board[2][0]).toBeNull();
  });

  it('handles an empty board without error', () => {
    const board = createBoard(4);
    const { board: out, moved } = collapseColumns(board, 4);
    expect(out.flat().every((c) => c === null)).toBe(true);
    expect(moved).toHaveLength(0);
  });
});

describe('computeScore', () => {
  it('sums tile face values for a single group', () => {
    const groups = [{ val: 3, cells: [{}, {}, {}] }];
    const s = computeScore(groups, 1);
    expect(s.basePts).toBe(9); // 3 * 3
    expect(s.totalPts).toBe(9);
    expect(s.isCombo).toBe(false);
    expect(s.isChain).toBe(false);
  });

  it('adds a combo bonus for simultaneous groups', () => {
    const groups = [
      { val: 2, cells: [{}, {}, {}] }, // 6
      { val: 4, cells: [{}, {}, {}] }, // 12
    ];
    const s = computeScore(groups, 1);
    // tiles 18 + multiBonus 25*(2-1)=25
    expect(s.basePts).toBe(43);
    expect(s.chainBonus).toBe(0);
    expect(s.totalPts).toBe(43);
    expect(s.isCombo).toBe(true);
    expect(s.numSets).toBe(2);
  });

  it('adds an escalating chain bonus on deeper chains', () => {
    const groups = [{ val: 1, cells: [{}, {}, {}] }]; // 3 tile pts
    const s = computeScore(groups, 3);
    expect(s.isChain).toBe(true);
    expect(s.chainBonus).toBe(50); // 25 * (3 - 1)
    expect(s.basePts).toBe(3);
    expect(s.totalPts).toBe(53);
  });
});

describe('sanitizeName', () => {
  it('keeps letters, drops others, uppercases, and caps at 6', () => {
    expect(sanitizeName('ab12cd34ef')).toBe('ABCDEF');
    expect(sanitizeName('  jo-ea!! ')).toBe('JOEA');
    expect(sanitizeName('')).toBe('');
  });
});

describe('randVal / randValExcluding', () => {
  it('produces values in [1, maxSpawnVal] with an injected rng', () => {
    expect(randVal(6, () => 0)).toBe(1);
    expect(randVal(6, () => 0.999)).toBe(6);
    expect(randVal(3, () => 0.5)).toBe(2);
  });

  it('never returns the excluded value', () => {
    // rng yields 0 → would be 1; excluding 1 forces it to roll again to 2.
    const seq = [0, 0, 0.5];
    let i = 0;
    const rng = () => seq[i++];
    expect(randValExcluding(3, 1, rng)).toBe(2);
  });
});
