import type { PlaceInstance } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';

/** Bump when the thumbnail rules change so old places get a new one. */
export const THUMB_V = 2;

/** One block: [x, y, z, sizeX, sizeY, sizeZ, colorHex (no #), shape (0 block, 1 ball)]. */
export type ThumbPart = [number, number, number, number, number, number, string, number];
export type Thumb = { parts: ThumbPart[]; ground: string | null; /** The place's time of day (Lighting.ClockTime), which sets its sky. */ clock: number };

const MAX_PARTS = 90;
const HUGE = 150; // wider than this counts as the ground, not as something built
const r = (n: number) => Math.round(n * 2) / 2;

/** A tiny picture of what is built in a place: its biggest visible blocks, rounded to keep the size small. */
export function makeThumb(instances: PlaceInstance[]): Thumb {
  const parts: { t: ThumbPart; v: number }[] = [];
  let ground: string | null = null;
  const light = (instances || []).find((i) => i.className === 'Lighting');
  const clock = typeof light?.props?.clockTime === 'number' ? light.props.clockTime : 14;
  let groundArea = 0;
  for (const i of instances || []) {
    if (i.className !== 'Part' && i.className !== 'SpawnLocation') continue;
    const p = i.props || {};
    const pos = p.position, size = p.size;
    if (!pos || !size || (p.transparency ?? 0) > 0.6) continue;
    const color = String(p.color || '#a3a2a5').replace('#', '').slice(0, 6);
    if (Math.max(size[0], size[2]) > HUGE) {
      if (size[0] * size[2] > groundArea) { groundArea = size[0] * size[2]; ground = color; }
      continue;
    }
    parts.push({ t: [r(pos[0]), r(pos[1]), r(pos[2]), r(size[0]), r(size[1]), r(size[2]), color, p.shape === 'Ball' ? 1 : 0], v: size[0] * size[1] * size[2] });
  }
  // Keep the biggest pieces when there are too many, but keep the original order so drawing stays tidy.
  let keep = parts;
  if (parts.length > MAX_PARTS) {
    const cut = [...parts].sort((a, b) => b.v - a.v)[MAX_PARTS - 1].v;
    keep = parts.filter((x) => x.v >= cut).slice(0, MAX_PARTS);
  }
  return { parts: keep.map((x) => x.t), ground, clock };
}
