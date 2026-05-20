function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

export function deterministicTilt(id: string, rangeDeg = 6): number {
  const h = fnv1a(id);
  const ratio = (h % 1000) / 1000;
  return Math.round((ratio * 2 - 1) * rangeDeg * 10) / 10;
}

export function deterministicPosition(
  id: string,
  width: number,
  height: number
): { x: number; y: number } {
  const h1 = fnv1a(id);
  const h2 = fnv1a(`${id}-y`);
  return {
    x: Math.round((h1 % 1000) / 1000 * width),
    y: Math.round((h2 % 1000) / 1000 * height),
  };
}
