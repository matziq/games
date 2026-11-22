import { Chess } from "./chess.js";
import { newTicTacToe, ticResult, playTicTacToe, newCheckers, checkersMoves, checkersResult, playCheckers } from "./rules.js";

const names = { tic: "Tic-Tac-Toe", checkers: "Checkers", chess: "Chess" };
const symbols = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟"
};
const pieceNames = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const byId = id => document.getElementById(id);
const board = byId("board");
const warning = byId("storage-warning");
const key = game => `road-board-games.v1.${game}`;
const current = document.body.dataset.game;
let selected = null, focusIndex = 0;
const states = { tic: newTicTacToe(), checkers: newCheckers(), chess: new Chess() };

function warn(message) {
  warning.textContent = message;
  warning.hidden = false;
}

function validTic(data) {
  return data && Array.isArray(data.board) && data.board.length === 9 &&
    data.board.every(x => ["", "X", "O"].includes(x)) && ["X", "O"].includes(data.turn);
}

function validCheckers(data) {
  return data && Array.isArray(data.board) && data.board.length === 64 &&
    data.board.every(x => ["", "r", "R", "b", "B"].includes(x)) &&
    ["r", "b"].includes(data.turn) &&
    (data.forced === null || (Number.isInteger(data.forced) && data.forced >= 0 && data.forced < 64)) &&
    Number.isInteger(data.quiet) && data.quiet >= 0 &&
    data.positions && typeof data.positions === "object" && !Array.isArray(data.positions) &&
    Object.values(data.positions).every(n => Number.isInteger(n) && n > 0);
}

for (const game of [current]) {
  try {
    const saved = localStorage.getItem(key(game));
    if (saved === null) continue;
    const data = JSON.parse(saved);
    if (game === "chess") {
      if (!data || typeof data.pgn !== "string") throw new Error("Invalid chess save");
      if (data.pgn) states.chess.loadPgn(data.pgn);
    } else {
      if (!(game === "tic" ? validTic(data) : validCheckers(data))) throw new Error("Invalid save");
      states[game] = data;
    }
  } catch (error) {
    warn(`Could not load ${names[game]}. This browser may not save progress, or the saved game may be invalid.`);
  }
}

function save(game) {
  try {
    const data = game === "chess" ? { pgn: states.chess.pgn() } : states[game];
    localStorage.setItem(key(game), JSON.stringify(data));
  } catch (error) {
    warn(`Could not save ${names[game]}. Progress may be lost when you leave or reload.`);
  }
}

function chessResult(game) {
  if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate!`;
  if (game.isStalemate()) return "Draw by stalemate.";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
  if (game.isInsufficientMaterial()) return "Draw: insufficient material.";
  if (game.isDrawByFiftyMoves()) return "Draw by the fifty-move rule.";
  if (game.isDraw()) return "Draw.";
  return "";
}

function squareName(index) {
  return `${"abcdefgh"[index % 8]}${8 - Math.floor(index / 8)}`;
}

function legalMoves() {
  if (current === "checkers") return checkersResult(states.checkers) ? [] : checkersMoves(states.checkers);
  if (current === "chess") return states.chess.isGameOver() ? [] :
    states.chess.moves({ verbose: true }).map(m => ({
      from: (8 - Number(m.from[1])) * 8 + "abcdefgh".indexOf(m.from[0]),
      to: (8 - Number(m.to[1])) * 8 + "abcdefgh".indexOf(m.to[0])
    }));
  return [];
}

function render(restoreFocus = false) {
  const game = states[current], size = current === "tic" ? 3 : 8;
  byId("game-title").textContent = names[current];
  byId("promotion-wrap").hidden = current !== "chess";
  let result, status, cells;
  if (current === "tic") {
    result = ticResult(game);
    status = result || `${game.turn}'s turn`;
    cells = game.board;
    byId("instructions").textContent = "Tap an empty square to place your mark. Three in a row wins.";
  } else if (current === "checkers") {
    result = checkersResult(game);
    status = result || `${game.turn === "r" ? "Red" : "Black"}'s turn${game.forced !== null ? " — continue jumping" : ""}`;
    cells = game.board;
    byId("instructions").textContent = "American checkers: select a piece, then a highlighted square. Captures are required; continue jumps when possible. A newly crowned king ends its turn.";
  } else {
    result = chessResult(game);
    status = result || `${game.turn() === "w" ? "White" : "Black"}'s turn${game.isCheck() ? " — check!" : ""}`;
    cells = game.board().flat();
    byId("instructions").textContent = "Select a piece, then a highlighted legal square. Castling, en passant, and promotion follow chess rules.";
  }
  byId("status").textContent = status;
  board.style.setProperty("--size", size);
  board.setAttribute("aria-label", `${names[current]} board`);
  board.replaceChildren();
  const moves = legalMoves();
  const destinations = selected === null ? [] : moves.filter(m => m.from === selected).map(m => m.to);
  for (let i = 0; i < cells.length; i++) {
    const cell = document.createElement("button");
    const piece = cells[i];
    const r = Math.floor(i / size), c = i % size;
    cell.type = "button";
    cell.className = `square ${current === "tic" ? "tic" : (r + c) % 2 ? "dark" : "light"}`;
    cell.dataset.index = String(i);
    cell.tabIndex = i === focusIndex ? 0 : -1;
    cell.setAttribute("aria-pressed", String(i === selected));
    if (i === selected) cell.classList.add("selected");
    if (destinations.includes(i)) cell.classList.add("destination");
    if (current === "tic") {
      cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}: ${piece || "empty"}`);
      cell.textContent = piece;
    } else if (current === "checkers") {
      const owner = piece && (piece.toLowerCase() === "r" ? "Red" : "Black");
      const king = piece && piece === piece.toUpperCase();
      cell.setAttribute("aria-label", `${squareName(i)}: ${piece ? `${owner} ${king ? "king" : "piece"}` : "empty"}${destinations.includes(i) ? ", legal move" : ""}`);
      if (piece) {
        const token = document.createElement("span");
        token.className = `checker ${owner.toLowerCase()}`;
        token.textContent = king ? "K" : "";
        token.setAttribute("aria-hidden", "true");
        cell.append(token);
      }
    } else {
      cell.setAttribute("aria-label", `${squareName(i)}: ${piece ? `${piece.color === "w" ? "White" : "Black"} ${pieceNames[piece.type]}` : "empty"}${destinations.includes(i) ? ", legal move" : ""}`);
      if (piece) {
        const token = document.createElement("span");
        token.className = `piece ${piece.color === "w" ? "white" : "black"}`;
        token.textContent = symbols[piece.color + piece.type];
        token.setAttribute("aria-hidden", "true");
        cell.append(token);
      }
    }
    board.append(cell);
  }
  if (restoreFocus) board.querySelector(`[data-index="${focusIndex}"]`).focus();
}

board.addEventListener("click", event => {
  const cell = event.target.closest("button[data-index]");
  if (!cell) return;
  const index = Number(cell.dataset.index);
  focusIndex = index;
  if (current === "tic") {
    if (playTicTacToe(states.tic, index)) save("tic");
  } else {
    const moves = legalMoves();
    if (selected !== null && moves.some(move => move.from === selected && move.to === index)) {
      if (current === "checkers") {
        playCheckers(states.checkers, selected, index);
        selected = states.checkers.forced;
      } else {
        states.chess.move({ from: squareName(selected), to: squareName(index), promotion: byId("promotion").value });
        selected = null;
      }
      save(current);
    } else {
      selected = moves.some(move => move.from === index) ? index : null;
    }
  }
  render(true);
});

board.addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const size = current === "tic" ? 3 : 8;
  const r = Math.floor(focusIndex / size), c = focusIndex % size;
  const nextRow = Math.max(0, Math.min(size - 1, r + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0)));
  const nextCol = Math.max(0, Math.min(size - 1, c + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0)));
  event.preventDefault();
  board.querySelector(`[data-index="${focusIndex}"]`).tabIndex = -1;
  focusIndex = nextRow * size + nextCol;
  const next = board.querySelector(`[data-index="${focusIndex}"]`);
  next.tabIndex = 0;
  next.focus();
});

byId("restart").addEventListener("click", () => {
  if (!confirm(`Start a new ${names[current]} game? This will clear its current progress.`)) return;
  states[current] = current === "tic" ? newTicTacToe() : current === "checkers" ? newCheckers() : new Chess();
  selected = null;
  focusIndex = 0;
  save(current);
  render();
});

if (current === "checkers") selected = states.checkers.forced;
render();
