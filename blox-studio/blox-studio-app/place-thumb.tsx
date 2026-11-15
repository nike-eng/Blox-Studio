import { useId } from 'react';
import type { PlaceThumbData } from './studio-api.js';

const W = 320, H = 200, PAD = 22;

/** Mix a hex colour toward black (k < 1) or white (k > 1). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.length === 6 ? hex : 'a3a2a5', 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.max(0, Math.min(255, Math.round(k <= 1 ? c * k : c + (255 - c) * (k - 1)))));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

// Isometric view from above and in front: x goes down-right, z goes down-left, y goes up.
const px = (x: number, z: number) => (x - z) * 0.866;
const py = (x: number, y: number, z: number) => (x + z) * 0.5 - y;

type Box = { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string; ball: boolean };

/**
 * A small picture of the blocks that are really built in a place. Returns null when there is nothing to show,
 * so the caller can fall back to a painted scene.
 */
export function PlaceThumb({ thumb, className }: { thumb: PlaceThumbData | undefined; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const boxes: Box[] = (thumb?.parts ?? []).map(([x, y, z, sx, sy, sz, c, s]) => ({ x, y, z, sx: Math.max(sx, 0.5), sy: Math.max(sy, 0.5), sz: Math.max(sz, 0.5), c, ball: s === 1 }));
  if (boxes.length === 0) return null;

  // Fit everything inside the picture.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of boxes) {
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (const dy of [-1, 1]) {
      const X = px(b.x + (dx * b.sx) / 2, b.z + (dz * b.sz) / 2), Y = py(b.x + (dx * b.sx) / 2, b.y + (dy * b.sy) / 2, b.z + (dz * b.sz) / 2);
      minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
    }
  }
  const k = Math.min((W - PAD * 2) / Math.max(maxX - minX, 1), (H - PAD * 2) / Math.max(maxY - minY, 1), 6);
  const ox = W / 2 - ((minX + maxX) / 2) * k, oy = H / 2 - ((minY + maxY) / 2) * k;
  const P = (x: number, y: number, z: number) => `${(px(x, z) * k + ox).toFixed(1)},${(py(x, y, z) * k + oy).toFixed(1)}`;

  // Far blocks first so near blocks cover them.
  const sorted = [...boxes].sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y);
  const ground = thumb?.ground;

  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2250" />
          <stop offset="0.55" stopColor="#7a3a74" />
          <stop offset="1" stopColor="#ff8f6b" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}-sky)`} />
      {ground && <ellipse cx={W / 2} cy={H * 0.7} rx={W * 0.62} ry={H * 0.2} fill={shade(ground, 0.55)} opacity="0.55" />}
      {sorted.map((b, i) => {
        const hx = b.sx / 2, hy = b.sy / 2, hz = b.sz / 2;
        if (b.ball) {
          const cx = px(b.x, b.z) * k + ox, cy = py(b.x, b.y, b.z) * k + oy;
          return <ellipse key={i} cx={cx} cy={cy} rx={(b.sx * 0.866 * k) / 1.4} ry={(b.sy * k) / 1.6 + 0.5} fill={shade(b.c, 1.05)} />;
        }
        return (
          <g key={i} strokeLinejoin="round" strokeWidth="0.4" stroke="rgba(10,12,30,0.35)">
            <polygon points={`${P(b.x - hx, b.y + hy, b.z + hz)} ${P(b.x + hx, b.y + hy, b.z + hz)} ${P(b.x + hx, b.y - hy, b.z + hz)} ${P(b.x - hx, b.y - hy, b.z + hz)}`} fill={shade(b.c, 0.78)} />
            <polygon points={`${P(b.x + hx, b.y + hy, b.z - hz)} ${P(b.x + hx, b.y + hy, b.z + hz)} ${P(b.x + hx, b.y - hy, b.z + hz)} ${P(b.x + hx, b.y - hy, b.z - hz)}`} fill={shade(b.c, 0.58)} />
            <polygon points={`${P(b.x - hx, b.y + hy, b.z - hz)} ${P(b.x + hx, b.y + hy, b.z - hz)} ${P(b.x + hx, b.y + hy, b.z + hz)} ${P(b.x - hx, b.y + hy, b.z + hz)}`} fill={shade(b.c, 1.12)} />
          </g>
        );
      })}
    </svg>
  );
}
