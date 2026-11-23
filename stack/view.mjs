export const VIEW_WIDTH = 600;
export const VIEW_HEIGHT = 620;

export function cameraFor(bodies, ghost, groundY) {
  const visible = ghost ? [...bodies, ghost] : bodies;
  const left = Math.min(0, ...visible.map(b => b.bounds.min.x - 12));
  const right = Math.max(600, ...visible.map(b => b.bounds.max.x + 12));
  const towerTop = Math.min(groundY, ...bodies.map(b => b.bounds.min.y));
  const top = Math.min(groundY - 600, towerTop - 160, ...visible.map(b => b.bounds.min.y - 12));
  const bottom = Math.max(groundY + 40, ...bodies.map(b => b.bounds.max.y + 12));
  const scale = Math.min(VIEW_WIDTH / (right - left), VIEW_HEIGHT / (bottom - top));
  return {
    scale,
    x: (VIEW_WIDTH - (right - left) * scale) / 2 - left * scale,
    y: (VIEW_HEIGHT - (bottom - top) * scale) / 2 - top * scale
  };
}

export function pointerWorldX(clientX, rect, camera) {
  return ((clientX - rect.left) * VIEW_WIDTH / rect.width - camera.x) / camera.scale;
}
