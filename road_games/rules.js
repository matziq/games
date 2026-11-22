export function newTicTacToe() {
  return { board: Array(9).fill(""), turn: "X" };
}

export function ticResult(state) {
  const b = state.board;
  for (const [a, c, d] of [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]]) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return `${b[a]} wins!`;
  }
  return b.every(Boolean) ? "Draw!" : "";
}

export function playTicTacToe(state, index) {
  if (!Number.isInteger(index) || index < 0 || index > 8 || state.board[index] || ticResult(state)) return false;
  state.board[index] = state.turn;
  state.turn = state.turn === "X" ? "O" : "X";
  return true;
}

export function newCheckers() {
  const board = Array(64).fill("");
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 1) board[r * 8 + c] = r < 3 ? "b" : r > 4 ? "r" : "";
  }
  const state = { board, turn: "r", forced: null, quiet: 0, positions: {} };
  state.positions[checkersPosition(state)] = 1;
  return state;
}

function checkersPosition(state) {
  return `${state.board.map(p => p || ".").join("")}:${state.turn}`;
}

function movesFor(state, index, capturesOnly = false) {
  const piece = state.board[index];
  if (!piece || piece.toLowerCase() !== state.turn) return [];
  const row = Math.floor(index / 8), col = index % 8;
  const dirs = piece === piece.toUpperCase() ? [-1, 1] : piece === "r" ? [-1] : [1];
  const moves = [];
  for (const dr of dirs) for (const dc of [-1, 1]) {
    const r = row + dr, c = col + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const middle = r * 8 + c;
    if (!state.board[middle] && !capturesOnly) moves.push({ from: index, to: middle, capture: null });
    const r2 = r + dr, c2 = c + dc;
    if (state.board[middle] && state.board[middle].toLowerCase() !== state.turn &&
        r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && !state.board[r2 * 8 + c2]) {
      moves.push({ from: index, to: r2 * 8 + c2, capture: middle });
    }
  }
  return moves;
}

export function checkersMoves(state) {
  if (state.forced !== null) return movesFor(state, state.forced, true);
  const all = state.board.flatMap((_, i) => movesFor(state, i));
  const captures = all.filter(move => move.capture !== null);
  return captures.length ? captures : all;
}

export function checkersResult(state) {
  if (!checkersMoves(state).length) return `${state.turn === "r" ? "Black" : "Red"} wins!`;
  if (state.quiet >= 80) return "Draw: 40 moves each without a capture or advancing a man.";
  if (state.positions[checkersPosition(state)] >= 3) return "Draw: position repeated three times.";
  return "";
}

export function playCheckers(state, from, to) {
  if (checkersResult(state)) return false;
  const move = checkersMoves(state).find(m => m.from === from && m.to === to);
  if (!move) return false;
  const piece = state.board[from], man = piece === piece.toLowerCase();
  state.board[from] = "";
  state.board[to] = piece;
  if (move.capture !== null) state.board[move.capture] = "";
  const row = Math.floor(to / 8);
  const crowned = man && ((piece === "r" && row === 0) || (piece === "b" && row === 7));
  if (crowned) state.board[to] = piece.toUpperCase();
  state.quiet = move.capture !== null || man ? 0 : state.quiet + 1;
  if (move.capture !== null && !crowned && movesFor(state, to, true).length) {
    state.forced = to;
  } else {
    state.forced = null;
    state.turn = state.turn === "r" ? "b" : "r";
    const position = checkersPosition(state);
    state.positions[position] = (state.positions[position] || 0) + 1;
  }
  return true;
}
