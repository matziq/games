import { difficultyRanges } from "./questions.mjs";
import { playerNames } from "../party_names.mjs";
export const ROUNDS = 20;
function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function newMatch(names, difficulty = "medium", random = Math.random) {
  const players = playerNames(names);
  if (!players.length || players.length > 4 || players.some(name => name.length > 24)) throw new Error("Enter one to four player names.");
  const range = difficultyRanges[difficulty];
  if (!range || range[1] - range[0] < players.length * ROUNDS) throw new Error("Not enough questions for this difficulty.");
  const order = shuffle(Array.from({ length: range[1] - range[0] }, (_, i) => i + range[0]), random).slice(0, players.length * ROUNDS);
  return { version: 1, difficulty, players, order, choices: order.map(() => shuffle([0, 1, 2, 3], random)), cursor: 0, answers: [] };
}
export function validMatch(s) {
  if (!s || s.version !== 1 || !Array.isArray(s.players) || s.players.length < 1 || s.players.length > 4 ||
      s.players.some(p => typeof p !== "string" || !p.trim() || p.length > 24)) return false;
  const total = s.players.length * ROUNDS;
  if (s.difficulty !== undefined && !Object.hasOwn(difficultyRanges, s.difficulty)) return false;
  const range = s.difficulty === undefined ? difficultyRanges.medium : difficultyRanges[s.difficulty];
  if (!Array.isArray(s.order) || s.order.length !== total || new Set(s.order).size !== total ||
      s.order.some(i => !Number.isInteger(i) || i < range[0] || i >= range[1]) ||
      !Array.isArray(s.choices) || s.choices.length !== total ||
      s.choices.some(c => !Array.isArray(c) || c.length !== 4 || new Set(c).size !== 4 || c.some(i => !Number.isInteger(i) || i < 0 || i > 3)) ||
      !Number.isInteger(s.cursor) || s.cursor < 0 || s.cursor > total || !Array.isArray(s.answers) ||
      !(s.answers.length === s.cursor || (s.cursor < total && s.answers.length === s.cursor + 1)) ||
      s.answers.some(a => !Number.isInteger(a) || a < 0 || a > 3)) return false;
  return true;
}
export function answer(s, choice) {
  if (!validMatch(s) || s.cursor >= s.order.length || s.answers.length !== s.cursor || !Number.isInteger(choice) || choice < 0 || choice > 3) return false;
  s.answers.push(choice);
  return true;
}
export function advance(s) {
  if (!validMatch(s) || s.cursor >= s.order.length || s.answers.length !== s.cursor + 1) return false;
  s.cursor++;
  return true;
}
export function scores(s) {
  const points = s.players.map(() => 0);
  s.answers.forEach((value, i) => { if (value === 0) points[i % points.length]++; });
  return points;
}
