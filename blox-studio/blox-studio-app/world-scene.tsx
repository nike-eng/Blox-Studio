import { useId } from 'react';

/**
 * Painted landscape pictures for the home page: sky, sun, stars and layers of hills.
 * The same seed always draws the same world.
 */
export type Scene = {
  sky: [string, string];
  sun: string;
  layers: string[];
  seed: number;
  size?: [number, number];
  sunAt?: [number, number];
  flat?: boolean;
  platforms?: boolean;
  outline?: boolean;
  clouds?: boolean;
  bg: string;
};

const PALETTES: Pick<Scene, 'sky' | 'sun' | 'layers' | 'bg'>[] = [
  { sky: ['#2b2f6b', '#ff9a76'], sun: '#ffe3a3', layers: ['#7a4f9a', '#4d3877', '#2b2252'], bg: '#2b2f6b' },
  { sky: ['#0f3057', '#3ec1d3'], sun: '#fff6c9', layers: ['#2a7d9a', '#195a77', '#0d3652'], bg: '#0f3057' },
  { sky: ['#14342f', '#7ed6a5'], sun: '#fff1b8', layers: ['#34996f', '#21705a', '#14463a'], bg: '#14342f' },
  { sky: ['#3a1230', '#ff6b57'], sun: '#ffd18a', layers: ['#9a3354', '#64224a', '#3b1637'], bg: '#3a1230' },
  { sky: ['#1c2a52', '#8ec5ff'], sun: '#ffffff', layers: ['#5476bb', '#395793', '#24396a'], bg: '#1c2a52' },
];

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

/** Smooth hill line across the picture, filled down to the bottom. */
function ridge(rnd: () => number, w: number, h: number, base: number, amp: number): string {
  const steps = Math.max(6, Math.round(w / 45));
  const ys = Array.from({ length: steps + 1 }, () => base - rnd() * amp);
  let d = `M0,${h} L0,${ys[0]}`;
  for (let k = 1; k <= steps; k++) {
    const x0 = ((k - 1) * w) / steps;
    const x1 = (k * w) / steps;
    d += ` Q${x0},${ys[k - 1]} ${(x0 + x1) / 2},${(ys[k - 1] + ys[k]) / 2}`;
  }
  return `${d} L${w},${ys[steps]} L${w},${h} Z`;
}

export const TEMPLATE_SCENES: Record<string, Scene> = {
  baseplate: { ...PALETTES[2], seed: 11, flat: true },
  obby: { ...PALETTES[3], seed: 29, platforms: true },
  empty: { ...PALETTES[4], seed: 5, outline: true, bg: '#1a2038' },
};

/** The big picture behind the title. */
export const HERO_SCENE: Scene = { ...PALETTES[0], seed: 7, size: [800, 420], sunAt: [610, 190], clouds: true };

/**
 * A scene for a saved game. The same id always gives the same picture.
 * @param id - project id
 * @returns scene
 */
export function gameScene(id: string): Scene {
  const seed = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { ...PALETTES[seed % PALETTES.length], seed };
}

/**
 * Draws a scene as an SVG that fills its box.
 * @param props.scene - the scene to draw
 * @param props.className - class for the svg
 * @param props.twinkleClass - optional class that makes stars twinkle
 * @param props.driftClass - optional class that makes clouds drift
 * @param props.sunClass - optional class that makes the sun glow slowly
 */
export function WorldScene({ scene, className, twinkleClass, driftClass, sunClass }: { scene: Scene; className?: string; twinkleClass?: string; driftClass?: string; sunClass?: string }) {
  const uid = useId().replace(/:/g, '');
  const [w, h] = scene.size ?? [320, 180];
  const rnd = rng(scene.seed);
  const [sx, sy] = scene.sunAt ?? [60 + rnd() * 200, h * 0.28];
  const stars = Array.from({ length: Math.round(w / 22) }, () => ({ x: rnd() * w, y: rnd() * h * 0.5, r: 0.5 + rnd() * 1.1, d: Math.round(rnd() * 3000) }));
  const bases = scene.flat ? [0.8, 0.85, 0.9] : scene.layers.length === 3 ? [0.62, 0.74, 0.86] : [0.6, 0.7, 0.8];
  const amps = scene.flat ? [10, 8, 6] : [h * 0.3, h * 0.22, h * 0.14];
  const layers = scene.layers.map((fill, k) => ({ fill, d: ridge(rnd, w, h, h * bases[k], amps[k] * (w > 400 ? 1.2 : 1)) }));
  const cloudY = [h * 0.2, h * 0.34];
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={scene.sky[0]} /><stop offset="1" stopColor={scene.sky[1]} /></linearGradient>
        <radialGradient id={`${uid}g`}><stop offset="0" stopColor={scene.sun} stopOpacity="0.85" /><stop offset="1" stopColor={scene.sun} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${uid}s)`} />
      {stars.map((s, n) => <circle key={n} className={twinkleClass} style={twinkleClass ? { animationDelay: `${s.d}ms` } : undefined} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity="0.8" />)}
      <g className={sunClass}>
        <circle cx={sx} cy={sy} r={w > 400 ? 150 : 42} fill={`url(#${uid}g)`} />
        <circle cx={sx} cy={sy} r={w > 400 ? 34 : 11} fill={scene.sun} />
      </g>
      {scene.clouds && (
        <g className={driftClass} fill="#fff" opacity="0.16">
          {cloudY.map((y, n) => (
            <g key={n} transform={`translate(${n ? 120 : 380} ${y})`}>
              <ellipse cx="0" cy="0" rx="70" ry="13" /><ellipse cx="34" cy="-9" rx="40" ry="12" /><ellipse cx="-30" cy="-6" rx="34" ry="10" />
            </g>
          ))}
        </g>
      )}
      {scene.outline ? (
        <line x1="0" y1={h * 0.7} x2={w} y2={h * 0.7} stroke="#8d96ab" strokeWidth="1.4" strokeDasharray="5 5" />
      ) : (
        layers.map((l, k) => <path key={k} d={l.d} fill={l.fill} />)
      )}
      {scene.platforms && [[40, 0.62], [92, 0.54], [150, 0.44], [208, 0.36], [262, 0.26]].map(([x, y], n) => (
        <rect key={n} x={x - 16} y={h * y} width="32" height="7" rx="3.5" fill={['#5fe8bd', '#ffc233', '#ff7a7f', '#7ec3ff', '#fff'][n]} />
      ))}
      {scene.flat && <ellipse cx={w / 2} cy={h * 0.84} rx="30" ry="5" fill={scene.sun} opacity="0.55" />}
    </svg>
  );
}
