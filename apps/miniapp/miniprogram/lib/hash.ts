/** djb2-style string hash. Returns a non-negative 32-bit int. */
function djb2(str: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

export function stableInt(seed: string, max: number): number {
  if (max <= 0) return 0;
  return djb2(seed) % max;
}

/**
 * Map a seed to a small rotation angle in [-rangeDeg, +rangeDeg] (degrees,
 * float to 1 dp). Used to give stacked polaroids a consistent quirky angle
 * across re-renders without per-photo random state.
 */
export function stableAngle(seed: string, rangeDeg: number): number {
  const bucket = djb2(seed) % 1000;
  const t = bucket / 999; // 0..1
  const angle = (t * 2 - 1) * rangeDeg;
  return Math.round(angle * 10) / 10;
}
