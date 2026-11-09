import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './landing-page.module.css';
import { BrandMark } from './brand-mark.js';

const N = 6; // baseplate is N x N studs
const CW = 64; // width of one ground diamond
const CH = 32; // height of one ground diamond
const BH = 26; // height of one block
const MAX = 5; // tallest stack
const OY = MAX * BH + 14;

/** Brick colours by level: lit top, left side, shaded right side. */
const BRICKS = [
  { top: '#ff9d7c', left: '#ff6a3d', right: '#d44d28' },
  { top: '#ffd877', left: '#ffc233', right: '#d99f14' },
  { top: '#6fe6bb', left: '#2fcf9b', right: '#1ba579' },
  { top: '#8cc8ff', left: '#4aa8ff', right: '#2a82da' },
  { top: '#ffa3c3', left: '#ff7aa8', right: '#d9527f' },
];

const START: number[][] = [
  [0, 0, 0, 0, 0, 0],
  [0, 1, 2, 0, 0, 0],
  [0, 0, 3, 1, 0, 0],
  [0, 0, 1, 4, 0, 0],
  [0, 0, 0, 1, 1, 0],
  [0, 0, 0, 0, 0, 0],
];

const pt = (x: number, y: number) => `${x},${y}`;

/** One block, drawn as three faces. (x, y) is the top corner of the ground diamond under it. */
function Block({ x, y, level, drop }: { x: number; y: number; level: number; drop: boolean }) {
  const c = BRICKS[level % BRICKS.length];
  const lift = level * BH;
  const up = lift + BH;
  const top = [pt(x, y - up), pt(x + CW / 2, y + CH / 2 - up), pt(x, y + CH - up), pt(x - CW / 2, y + CH / 2 - up)].join(' ');
  const left = [pt(x - CW / 2, y + CH / 2 - lift), pt(x, y + CH - lift), pt(x, y + CH - up), pt(x - CW / 2, y + CH / 2 - up)].join(' ');
  const right = [pt(x, y + CH - lift), pt(x + CW / 2, y + CH / 2 - lift), pt(x + CW / 2, y + CH / 2 - up), pt(x, y + CH - up)].join(' ');
  return (
    <g className={drop ? styles.drop : undefined}>
      <polygon points={left} fill={c.left} />
      <polygon points={right} fill={c.right} />
      <polygon points={top} fill={c.top} />
      <ellipse cx={x} cy={y + CH / 2 - up} rx={9} ry={4.5} fill={c.left} opacity={0.55} />
      <ellipse cx={x} cy={y + CH / 2 - up - 2.5} rx={9} ry={4.5} fill={c.top} />
    </g>
  );
}

/**
 * The baseplate you can tap: stack blocks on a studded plate, a small taste of the editor.
 */
function Baseplate() {
  const [heights, setHeights] = useState(START);
  const [last, setLast] = useState('');
  const ox = (N * CW) / 2;
  const total = heights.flat().reduce((a, b) => a + b, 0);

  const tap = (i: number, j: number) => {
    setHeights((hs) => hs.map((row, r) => row.map((h, c) => (r === i && c === j ? (h >= MAX ? 0 : h + 1) : h))));
    setLast(`${i}-${j}`);
  };

  const cells: { i: number; j: number }[] = [];
  for (let s = 0; s <= (N - 1) * 2; s += 1) for (let i = 0; i < N; i += 1) { const j = s - i; if (j >= 0 && j < N) cells.push({ i, j }); }

  const corner = (i: number, j: number) => ({ x: ox + (i - j) * (CW / 2), y: OY + (i + j) * (CH / 2) });
  const plate = [corner(0, 0), corner(N, 0), corner(N, N), corner(0, N)];
  const plateTop = plate.map((p) => pt(p.x, p.y)).join(' ');
  const thick = 12;
  const front = [pt(plate[3].x, plate[3].y), pt(plate[2].x, plate[2].y), pt(plate[2].x, plate[2].y + thick), pt(plate[3].x, plate[3].y + thick)].join(' ');
  const side = [pt(plate[2].x, plate[2].y), pt(plate[1].x, plate[1].y), pt(plate[1].x, plate[1].y + thick), pt(plate[2].x, plate[2].y + thick)].join(' ');

  return (
    <figure className={styles.tray}>
      <svg className={styles.plate} viewBox={`0 0 ${N * CW} ${OY + N * CH + thick + 10}`} role="group" aria-label="A baseplate. Tap a square to stack a block on it.">
        <polygon points={front} fill="#a9c2b9" />
        <polygon points={side} fill="#93b0a5" />
        <polygon points={plateTop} fill="#c9ddd5" />
        {cells.map(({ i, j }) => {
          const { x, y } = corner(i, j);
          const h = heights[i][j];
          const key = `${i}-${j}`;
          return (
            <g
              key={key}
              className={styles.cell}
              role="button"
              tabIndex={0}
              aria-label={`Row ${i + 1}, column ${j + 1}, ${h} ${h === 1 ? 'block' : 'blocks'} high. ${h >= MAX ? 'Press to clear.' : 'Press to add a block.'}`}
              onClick={() => tap(i, j)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(i, j); } }}
            >
              <polygon className={styles.hit} points={[pt(x, y), pt(x + CW / 2, y + CH / 2), pt(x, y + CH), pt(x - CW / 2, y + CH / 2)].join(' ')} />
              {h === 0 && (
                <>
                  <ellipse cx={x} cy={y + CH / 2 + 2.5} rx={10} ry={5} fill="#a9c2b9" />
                  <ellipse cx={x} cy={y + CH / 2} rx={10} ry={5} fill="#dcebe5" />
                </>
              )}
              {Array.from({ length: h }, (_, level) => (
                <Block key={level} x={x} y={y} level={level} drop={last === key && level === h - 1} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className={styles.trayCaption}>
        <span><b>{total}</b> {total === 1 ? 'block' : 'blocks'} stacked</span>
        <button type="button" className={styles.reset} onClick={() => { setHeights(START); setLast(''); }}>Reset</button>
      </figcaption>
    </figure>
  );
}

/** A brick-shaped call to action, with studs on top. */
function BrickLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className={styles.brick}>
      <span className={styles.studs} aria-hidden="true"><i /><i /><i /></span>
      {children}
    </Link>
  );
}

/**
 * Landing page: what VoxMesa is, and one big way in.
 */
export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link to="/" className={styles.logo} aria-label="VoxMesa home">
          <BrandMark size={32} />
          VoxMesa
        </Link>
        <Link to="/projects" className={styles.navLink}>Open editor</Link>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>Free · Runs in your browser · Nothing to install</p>
            <h1>Build 3D games with your thumbs.</h1>
            <p className={styles.lede}>Drag blocks into place, write scripts, and press Play. VoxMesa is a game editor that works on the iPad, phone, Chromebook or laptop you already have.</p>
            <div className={styles.actions}>
              <BrickLink to="/projects">Open VoxMesa</BrickLink>
              <a className={styles.textLink} href="#inside">See what is inside</a>
            </div>
          </div>
          <Baseplate />
        </section>

        <section id="inside" className={styles.inside} aria-labelledby="inside-title">
          <h2 id="inside-title">What is inside</h2>
          <div className={styles.cards}>
            <article>
              <h3>Made for touch</h3>
              <p>Big buttons, a thumb joystick and a jump button. A keyboard works too, but you never need one.</p>
            </article>
            <article>
              <h3>Real scripting</h3>
              <p>Write Script, LocalScript and ModuleScript files in Lua, and run them from the Output window.</p>
            </article>
            <article>
              <h3>Yours to publish</h3>
              <p>Export a place file (.rbxlx) that opens in Roblox Studio, or publish it to your own Roblox experience with your own key.</p>
            </article>
          </div>
        </section>

        <section className={styles.cta} aria-labelledby="cta-title">
          <h2 id="cta-title">Your first game is one tap away.</h2>
          <BrickLink to="/projects">Open VoxMesa</BrickLink>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>VoxMesa is an independent project. It is not affiliated with, endorsed by, or sponsored by Roblox Corporation. Roblox and Roblox Studio are trademarks of Roblox Corporation, named here only to describe file compatibility.</p>
      </footer>
    </div>
  );
}
