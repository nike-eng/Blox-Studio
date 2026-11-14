/**
 * Little isometric block scenes used as previews on the home page.
 * Each scene is a grid of columns (i, j) with a height h, drawn back to front.
 */
export type Cell = { i: number; j: number; h: number; tone: string };
export type Scene = { cells: Cell[]; bg: string; outline?: boolean };

type Tone = { top: string; left: string; right: string };

const TONES: Record<string, Tone> = {
  grey: { top: '#9aa0b0', left: '#737a8c', right: '#5c6272' },
  mint: { top: '#5fe8bd', left: '#2fcf9b', right: '#1fa57c' },
  red: { top: '#ff7a7f', left: '#f04b52', right: '#c2373e' },
  amber: { top: '#ffd166', left: '#f5ab1c', right: '#c98511' },
  blue: { top: '#7ec3ff', left: '#4a9be8', right: '#3578bb' },
  snow: { top: '#f4f6fa', left: '#c9cfdb', right: '#a2aabb' },
  grass: { top: '#8be28a', left: '#4fb85a', right: '#3a9047' },
  sand: { top: '#ffd9a0', left: '#e6a55e', right: '#bd8244' },
  rose: { top: '#ffb6c8', left: '#ee7a98', right: '#c25a77' },
  violet: { top: '#c9b8ff', left: '#8f7be0', right: '#6f5db8' },
  ice: { top: '#aee6ff', left: '#62b5e0', right: '#4a93b8' },
};

const W = 18; // half the width of one block
const H = 9; // half the height of its top face
const L = 14; // height of one level
const pts = (a: number[][]) => a.map((p) => p.join(',')).join(' ');
const sky = (from: string) => `linear-gradient(180deg, ${from} 0%, #1e222c 100%)`;

/** The three starter templates. */
export const TEMPLATE_SCENES: Record<string, Scene> = {
  baseplate: {
    bg: sky('#27324a'),
    cells: [
      ...Array.from({ length: 16 }, (_, n) => ({ i: n % 4, j: Math.floor(n / 4), h: 1, tone: 'grey' })).filter((c) => !(c.i === 1 && c.j === 1)),
      { i: 1, j: 1, h: 2, tone: 'mint' },
    ],
  },
  obby: {
    bg: sky('#2e2740'),
    cells: [
      { i: 0, j: 3, h: 1, tone: 'mint' },
      { i: 1, j: 3, h: 1, tone: 'blue' },
      { i: 1, j: 2, h: 2, tone: 'amber' },
      { i: 2, j: 2, h: 1, tone: 'mint' },
      { i: 2, j: 1, h: 3, tone: 'red' },
      { i: 3, j: 1, h: 1, tone: 'amber' },
      { i: 3, j: 0, h: 4, tone: 'snow' },
    ],
  },
  empty: { bg: sky('#232838'), outline: true, cells: [{ i: 1, j: 1, h: 2, tone: 'grey' }] },
};

/** A tall stepped mesa for the top of the page: each layer of rock has its own colour. */
export const HERO_SCENE: Scene = {
  bg: 'transparent',
  cells: [
    [1, 2, 2, 1],
    [2, 3, 3, 2],
    [2, 3, 4, 2],
    [1, 2, 2, 1],
  ].flatMap((row, i) => row.map((h, j) => ({ i, j, h, tone: ['grey', 'sand', 'amber', 'mint'][h - 1] }))),
};

const THEMES: [string, string][] = [['grass', '#243a30'], ['sand', '#3b3226'], ['rose', '#3b2831'], ['violet', '#2f2b45'], ['ice', '#223648']];

/**
 * A scene for a saved game. The same id always gives the same picture, so each game keeps its own look.
 * @param id - project id
 * @returns scene
 */
export function gameScene(id: string): Scene {
  let s = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const [main, bg] = THEMES[Math.floor(rnd() * THEMES.length)];
  const accent = ['amber', 'mint', 'blue', 'red'][Math.floor(rnd() * 4)];
  const cells: Cell[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (rnd() < 0.3) continue;
      cells.push({ i, j, h: 1 + Math.floor(rnd() * 3), tone: rnd() < 0.12 ? accent : main });
    }
  }
  if (!cells.length) cells.push({ i: 1, j: 1, h: 2, tone: main });
  return { cells, bg: sky(bg) };
}

/**
 * Draws a scene as an SVG.
 * @param props.scene - the scene to draw
 * @param props.className - class for the svg
 */
export function VoxelScene({ scene, className }: { scene: Scene; className?: string }) {
  const ordered = [...scene.cells].sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i);
  // fit the picture to the blocks that are in it
  const xs = scene.cells.map((c) => (c.i - c.j) * W);
  const minX = Math.min(...xs) - W - 3;
  const maxX = Math.max(...xs) + W + 3;
  const minY = Math.min(...scene.cells.map((c) => (c.i + c.j) * H - c.h * L)) - 3;
  const maxY = Math.max(...scene.cells.map((c) => (c.i + c.j) * H + 2 * H)) + 3;
  return (
    <svg className={className} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="presentation" aria-hidden="true" focusable="false">
      {ordered.map((c) => {
        const cx = (c.i - c.j) * W;
        const cy = (c.i + c.j) * H;
        const d = c.h * L;
        const ty = cy - d;
        const t = TONES[c.tone] ?? TONES.grey;
        const left = pts([[cx - W, ty + H], [cx, ty + 2 * H], [cx, ty + 2 * H + d], [cx - W, ty + H + d]]);
        const right = pts([[cx, ty + 2 * H], [cx + W, ty + H], [cx + W, ty + H + d], [cx, ty + 2 * H + d]]);
        const top = pts([[cx, ty], [cx + W, ty + H], [cx, ty + 2 * H], [cx - W, ty + H]]);
        if (scene.outline) {
          return (
            <g key={`${c.i}-${c.j}`} fill="none" stroke="#8d96ab" strokeWidth="1.4" strokeDasharray="4 3" strokeLinejoin="round">
              <polygon points={left} />
              <polygon points={right} />
              <polygon points={top} />
            </g>
          );
        }
        return (
          <g key={`${c.i}-${c.j}`} stroke="rgba(10,12,20,0.28)" strokeWidth="0.6" strokeLinejoin="round">
            <polygon points={left} fill={t.left} />
            <polygon points={right} fill={t.right} />
            <polygon points={top} fill={t.top} />
          </g>
        );
      })}
    </svg>
  );
}
