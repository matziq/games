export function playerNames(values) {
  return values.map((value, i) => value.trim() || `Player ${i + 1}`);
}
export function validPlayerNames(values) {
  return Array.isArray(values) && values.length === 2 &&
    values.every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 24);
}
