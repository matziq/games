export const RUN_KEY = 'dcRunV1';

export function validRun(run) {
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const cell = ({ r, c } = {}) => integer(r, 0, 4) && integer(c, 0, 4);
  const validPiece = (piece) => piece && ['single', 'double'].includes(piece.type) &&
    Array.isArray(piece.vals) && piece.vals.length === (piece.type === 'single' ? 1 : 2) &&
    piece.vals.every((value) => integer(value, 1, 6)) &&
    ['h', 'v'].includes(piece.ori) && Number.isSafeInteger(piece.rot) &&
    piece.rot % 90 === 0 && (piece.ori === (Math.abs(piece.rot / 90) % 2 ? 'v' : 'h'));
  return run && run.version === 1 && [2, 3, 4].includes(run.matchCount) &&
    Array.isArray(run.board) && run.board.length === 5 &&
    run.board.every((row) => Array.isArray(row) && row.length === 5 &&
      row.every((value) => value === null || integer(value, 1, 6))) &&
    integer(run.score, 0, Number.MAX_SAFE_INTEGER) &&
    integer(run.remixTokens, 0, Number.MAX_SAFE_INTEGER) &&
    integer(run.maxSpawnVal, 1, 6) && integer(run.chainDepth, 0, Number.MAX_SAFE_INTEGER) &&
    Array.isArray(run.lastPlacedCells) && run.lastPlacedCells.length <= 25 &&
    run.lastPlacedCells.every(cell) &&
    ['settled', 'resolving'].includes(run.phase) &&
    typeof run.cascade === 'boolean' &&
    (run.phase === 'resolving' ? run.piece === null : validPiece(run.piece));
}
