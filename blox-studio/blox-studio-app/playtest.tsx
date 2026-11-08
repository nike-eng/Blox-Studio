import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import type { PlaceInstance, Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { PlaytestWorld, type PlayEvent, type PlayInput } from './playtest-world.js';
import { SceneEnvironment, type GraphicsQuality } from './scene-environment.js';
import { ROBLOX, type PlaySession } from './playtest-runtime.js';
import { TouchControls } from './touch-controls.js';
import styles from './playtest.module.css';

/**
 * Props for {@link Playtest}.
 */
export type PlaytestProps = {
  /** Snapshot of the place to play (edits made during play are not applied). */
  instances: PlaceInstance[];
  /** Stops the playtest and returns to editing. */
  onStop: () => void;
  /** Player name shown in the leaderboard. */
  playerName?: string;
};

const KEYS: Record<string, keyof PlayInput | 'left' | 'right' | 'fwd' | 'back'> = {
  KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump',
};

const QUALITY_KEY = 'blox-studio:graphics-quality';
const DPR: Record<GraphicsQuality, number> = { low: 0.75, medium: 1, high: 1.5 };

/** Writes the measured FPS into a ref twice per second (no React renders). */
function FpsProbe({ fps }: { fps: MutableRefObject<number> }) {
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    acc.current.frames += 1;
    acc.current.time += dt;
    if (acc.current.time >= 0.5) {
      fps.current = Math.round(acc.current.frames / acc.current.time);
      acc.current = { frames: 0, time: 0 };
    }
  });
  return null;
}

type SceneProps = {
  instances: PlaceInstance[];
  input: MutableRefObject<PlayInput>;
  session: MutableRefObject<PlaySession>;
  onEvent: (e: PlayEvent) => void;
  quality: GraphicsQuality;
  fps: MutableRefObject<number>;
};

/**
 * The 3D scene. Memoized so HUD updates (timer, banners) never re-reconcile the scene graph.
 */
const PlaytestScene = memo(function PlaytestScene({ instances, input, session, onEvent, quality, fps }: SceneProps) {
  const playerPos = useRef(new THREE.Vector3());
  const lighting = useMemo(() => instances.find((i) => i.className === 'Lighting'), [instances]);
  const pointLights = useMemo(() => {
    const byId = new Map(instances.map((i) => [i.id, i]));
    return instances
      .filter((i) => i.className === 'PointLight' && i.parentId)
      .map((l) => ({ id: l.id, position: (byId.get(l.parentId!)?.props.position || [0, 0, 0]) as Vec3, ...l.props }));
  }, [instances]);

  return (
    <Canvas
      shadows={quality !== 'low'}
      dpr={Math.min(DPR[quality], typeof window !== 'undefined' ? window.devicePixelRatio : 1)}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      camera={{ fov: 70, near: 0.5, far: 3000 }}
      className={styles.canvas}
      onContextMenu={(e) => e.preventDefault()}
    >
      <SceneEnvironment lighting={lighting} follow={playerPos} pointLights={pointLights} quality={quality} />
      <FpsProbe fps={fps} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -ROBLOX.gravity, 0]} timeStep={1 / 60} interpolate>
          <PlaytestWorld instances={instances} input={input} session={session} onEvent={onEvent} playerPos={playerPos} />
        </Physics>
      </Suspense>
    </Canvas>
  );
});

/** Stage/timer card and Roblox-style leaderboard; owns the 10 Hz timer so only it re-renders. */
function Hud({ session, playerName, version, fps }: { session: MutableRefObject<PlaySession>; playerName: string; version: number; fps: MutableRefObject<number> }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  const s = session.current;
  const elapsed = ((s.finishTime ?? performance.now()) - s.startTime) / 1000;
  return (
    <>
      <div className={styles.hudCard} data-version={version}>
        <div className={styles.stage}>{s.finishTime !== null ? 'Finished!' : `Stage ${s.stage} / ${s.totalStages}`}</div>
        <div className={styles.timer}>{elapsed.toFixed(1)}s</div>
        <div className={styles.deaths}>☠ {s.deaths}</div>
      </div>
      <div className={styles.leaderboard}>
        <div className={styles.lbHead}><span>Players</span><span>Stage</span></div>
        <div className={styles.lbRow}><span className={styles.lbName}>{playerName}</span><span>{s.stage}</span></div>
        <div className={styles.fps}>{fps.current} FPS</div>
      </div>
    </>
  );
}

/**
 * Full-screen in-browser playtest, like Roblox Studio's Play button: a physics-simulated
 * character runs the place with the same gameplay rules the published game uses.
 */
export function Playtest({ instances, onStop, playerName = 'Player1' }: PlaytestProps) {
  const input = useRef<PlayInput>({ x: 0, z: 0, jump: false, reset: false });
  const held = useRef(new Set<string>());
  const session = useRef<PlaySession>({ startTime: performance.now(), finishTime: null, stage: 1, totalStages: 1, deaths: 0 });
  const fps = useRef(60);
  const [version, setVersion] = useState(0);
  const [banner, setBanner] = useState<{ text: string; tone: string; key: number } | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [help, setHelp] = useState(true);
  const [menu, setMenu] = useState(false);
  const [quality, setQuality] = useState<GraphicsQuality>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(QUALITY_KEY) : null;
    return saved === 'low' || saved === 'medium' || saved === 'high' ? saved : 'medium';
  });

  const changeQuality = (q: GraphicsQuality) => {
    setQuality(q);
    try { localStorage.setItem(QUALITY_KEY, q); } catch { /* storage unavailable */ }
  };

  // Auto-adjust like Roblox's "Automatic" graphics: step down when FPS stays under 40 for ~3s.
  useEffect(() => {
    let slow = 0;
    const id = setInterval(() => {
      slow = fps.current < 40 ? slow + 1 : 0;
      if (slow >= 6) {
        slow = 0;
        setQuality((q) => (q === 'high' ? 'medium' : q === 'medium' ? 'low' : q));
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  const syncKeys = useCallback(() => {
    const h = held.current;
    input.current.x = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    input.current.z = (h.has('back') ? 1 : 0) - (h.has('fwd') ? 1 : 0);
    input.current.jump = h.has('jump');
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { setMenu((m) => !m); return; }
      if (e.code === 'KeyR') { input.current.reset = true; return; }
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      held.current.add(k);
      setHelp(false);
      syncKeys();
    };
    const up = (e: KeyboardEvent) => { const k = KEYS[e.code]; if (k) { held.current.delete(k); syncKeys(); } };
    const blur = () => { held.current.clear(); syncKeys(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [syncKeys]);

  const onEvent = useCallback((e: PlayEvent) => {
    if (e.type === 'checkpoint') setBanner({ text: `Checkpoint! Stage ${e.stage}`, tone: 'good', key: Date.now() });
    if (e.type === 'died') setBanner({ text: 'Oof!', tone: 'bad', key: Date.now() });
    if (e.type === 'finish') setBanner({ text: `You beat it in ${e.time.toFixed(1)}s!`, tone: 'gold', key: Date.now() });
    setVersion((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!banner || session.current.finishTime) return undefined;
    const id = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(id);
  }, [banner]);

  const restart = () => {
    session.current = { startTime: performance.now(), finishTime: null, stage: 1, totalStages: session.current.totalStages, deaths: 0 };
    setBanner(null);
    setMenu(false);
    setRunKey((k) => k + 1);
  };

  const s = session.current;
  const finished = s.finishTime !== null;
  const elapsed = ((s.finishTime ?? performance.now()) - s.startTime) / 1000;

  return (
    <div className={styles.overlay}>
      <PlaytestScene key={runKey} instances={instances} input={input} session={session} onEvent={onEvent} quality={quality} fps={fps} />

      <div className={styles.topLeft}>
        <button className={styles.menuBtn} onClick={() => setMenu((m) => !m)} aria-label="Menu (Esc)" title="Menu (Esc)">
          <span className={styles.menuIcon} aria-hidden="true"><i /><i /><i /></span>
        </button>
        <button className={styles.stopBtn} onClick={onStop} title="Stop playtest"><span className={styles.stopIcon} /> Stop</button>
      </div>

      <Hud session={session} playerName={playerName} version={version} fps={fps} />

      {banner && (
        <div key={banner.key} className={`${styles.banner} ${styles[banner.tone]}`}>{banner.text}</div>
      )}
      {finished && !menu && (
        <div className={styles.finishCard}>
          <div className={styles.trophy}>🏆</div>
          <h2>Obby complete!</h2>
          <p>{elapsed.toFixed(2)}s · {s.deaths} {s.deaths === 1 ? 'death' : 'deaths'}</p>
          <div className={styles.finishActions}>
            <button className={styles.primaryBtn} onClick={restart}>Play again</button>
            <button className={styles.ghostBtn} onClick={onStop}>Back to editor</button>
          </div>
        </div>
      )}

      {menu && (
        <div className={styles.menuBackdrop} onClick={() => setMenu(false)}>
          <div className={styles.menu} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Game menu">
            <h2>Playtest</h2>
            <div className={styles.menuSection}>
              <span>Graphics quality</span>
              <div className={styles.segmented}>
                {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                  <button key={q} data-active={quality === q} onClick={() => changeQuality(q)}>{q[0].toUpperCase() + q.slice(1)}</button>
                ))}
              </div>
            </div>
            <div className={styles.menuButtons}>
              <button className={styles.primaryBtn} onClick={() => setMenu(false)}>Resume</button>
              <button className={styles.ghostBtn} onClick={() => { input.current.reset = true; setMenu(false); }}>Reset character</button>
              <button className={styles.ghostBtn} onClick={restart}>Restart run</button>
              <button className={styles.stopBtn} onClick={onStop}>Leave playtest</button>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div className={styles.help}>
          <b>WASD</b> move · <b>Space</b> jump · <b>Right-drag</b> look · <b>Scroll</b> zoom · <b>R</b> reset · <b>Esc</b> menu
        </div>
      )}

      <TouchControls input={input} />
    </div>
  );
}
