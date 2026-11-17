const CENTER_DEAD_ZONE_RATIO = 0.2;

export function getChecklistDropPlacement(bounds, clientX, clientY) {
  if (!bounds || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const width = Math.max(1, Number(bounds.width) || Number(bounds.right) - Number(bounds.left));
  const height = Math.max(1, Number(bounds.height) || Number(bounds.bottom) - Number(bounds.top));
  const centerX = Number(bounds.left) + width / 2;
  const centerY = Number(bounds.top) + height / 2;
  const horizontalOffset = clientX - centerX;
  const verticalOffset = clientY - centerY;

  const inNeutralCenter =
    Math.abs(horizontalOffset) <= width * CENTER_DEAD_ZONE_RATIO &&
    Math.abs(verticalOffset) <= height * CENTER_DEAD_ZONE_RATIO;
  if (inNeutralCenter) return null;

  if (Math.abs(horizontalOffset) >= Math.abs(verticalOffset)) {
    return horizontalOffset < 0 ? "left" : "right";
  }
  return verticalOffset < 0 ? "above" : "below";
}
