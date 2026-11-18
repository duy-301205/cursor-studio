/**
 * Custom Cursor Studio & Library — Hotspot Math & Coordinate Scaling
 *
 * Implements strict rules for cursor hotspot calculation per RULES.md F05 and DESIGN.md:
 * - Origin is top-left (0, 0).
 * - Exact bounds: [0, size - 1]. (e.g. 0 to 31 for 32x32; 0 to 47 for 48x48).
 * - pointFromPointer: converts click/touch position relative to actual image bounding box.
 * - scaleHotspot: proportional transformation when changing canvas raster size:
 *   round(coord * (newSize - 1) / (oldSize - 1)) with clamp [0, newSize - 1].
 */

export interface HotspotPoint {
  x: number;
  y: number;
}

/**
 * Clamp point within [0, size - 1] on both axes.
 */
export function clampHotspot(point: HotspotPoint, size: 32 | 48): HotspotPoint {
  const max = size - 1;
  return {
    x: Math.min(max, Math.max(0, Math.floor(point.x))),
    y: Math.min(max, Math.max(0, Math.floor(point.y))),
  };
}

/**
 * Calculate logical coordinate [0, size - 1] from pointer event and grid bounding box.
 * Ensures strict clamping to boundary and corner clicks (0, 0), (size - 1, size - 1).
 */
export function pointFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect | { left: number; top: number; width: number; height: number },
  size: 32 | 48
): HotspotPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const rawX = Math.floor(((clientX - rect.left) * size) / rect.width);
  const rawY = Math.floor(((clientY - rect.top) * size) / rect.height);
  const x = Math.min(size - 1, Math.max(0, rawX));
  const y = Math.min(size - 1, Math.max(0, rawY));
  return { x, y };
}

/**
 * Scale hotspot when switching between 32x32 and 48x48 raster sizes.
 * Formula per DESIGN.md: round(x * (newSize - 1) / (oldSize - 1)) with clamp [0, newSize - 1].
 */
export function scaleHotspot(
  point: HotspotPoint,
  oldSize: 32 | 48,
  newSize: 32 | 48
): HotspotPoint {
  if (oldSize === newSize) {
    return clampHotspot(point, newSize);
  }
  const newX = Math.round((point.x * (newSize - 1)) / (oldSize - 1));
  const newY = Math.round((point.y * (newSize - 1)) / (oldSize - 1));
  return {
    x: Math.min(newSize - 1, Math.max(0, newX)),
    y: Math.min(newSize - 1, Math.max(0, newY)),
  };
}

/**
 * Common cursor hotspot presets.
 */
export function getHotspotPresets(size: 32 | 48): Array<{
  label: string;
  point: HotspotPoint;
  description: string;
}> {
  return [
    {
      label: 'Top-Left (0, 0)',
      point: { x: 0, y: 0 },
      description: 'Standard pointer / arrow tip',
    },
    {
      label: 'Center',
      point: { x: Math.floor(size / 2), y: Math.floor(size / 2) },
      description: 'Crosshair / reticle center',
    },
    {
      label: 'Top-Right',
      point: { x: size - 1, y: 0 },
      description: 'Top-right corner indicator',
    },
  ];
}
