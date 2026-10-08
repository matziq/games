export const ROOM_COUNT = 9;
export const ROOM_HEIGHT = 12 * 16;
export const EXIT_ROOM_TOP = 46 * 16;

export function roomForY(playerY: number): number {
  const room = Math.floor((2400 - playerY) / ROOM_HEIGHT) + 1;
  return Math.min(ROOM_COUNT, Math.max(1, room));
}

export function clampFrameDelta(deltaMs: number, maxMs = 50): number {
  return Math.min(maxMs, Math.max(0, deltaMs));
}
