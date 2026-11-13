import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { GameRuntime, type PlaceInstance, type Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { PlaytestWorld, type PlayEvent, type PlayInput, type WorldQueue } from './playtest-world.js';
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

/** Roblox's name for a keyboard key (`Enum.KeyCode.E`, `Enum.KeyCode.One`...). */
function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][Number(code.slice(5))] ?? code;
  const map: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', ShiftLeft: 'LeftShift', ShiftRight: 'RightShift', ControlLeft: 'LeftControl', ControlRight: 'RightControl', AltLeft: 'LeftAlt', AltRight: 'RightAlt' };
  return map[code] ?? code;
}

type OutLine = { id: number; kind: string; text: string };

const QUALITY_KEY = 'blox-studio:graphics-quality';
const DPR: Record<GraphicsQuality, number> = { low: 0.85, medium: 1.25, high: 1.75 };

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
  runtime: GameRuntime;
  queue: MutableRefObject<WorldQueue>;
  input: MutableRefObject<PlayInput>;
  session: MutableRefObject<PlaySession>;
  onEvent: (e: PlayEvent) => void;
  quality: GraphicsQuality;
  fps: MutableRefObject<number>;
};

/**
 * The 3D scene. Memoized so HUD updates (timer, banners) never re-reconcile the scene graph.
 */
const PlaytestScene = memo(function PlaytestScene({ instances, runtime, queue, input, session, onEvent, quality, fps }: SceneProps) {
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
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping }}
      camera={{ fov: 70, near: 0.5, far: 3000 }}
      className={styles.canvas}
      onContextMenu={(e) => e.preventDefault()}
    >
      <SceneEnvironment lighting={lighting} follow={playerPos} pointLights={pointLights} quality={quality} />
      <FpsProbe fps={fps} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -ROBLOX.gravity, 0]} timeStep={1 / 60} interpolate>
          <PlaytestWorld runtime={runtime} queue={queue} input={input} session={session} onEvent={onEvent} playerPos={playerPos} />
        </Physics>
      </Suspense>
    </Canvas>
  );
});

/** Stage/timer card and Roblox-style leaderboard; owns the 10 Hz timer so only it re-renders. */
function Hud({ session, playerName, version, fps, showFps, runtime }: { session: MutableRefObject<PlaySession>; playerName: string; version: number; fps: MutableRefObject<number>; showFps: boolean; runtime: GameRuntime | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  const s = session.current;
  const elapsed = ((s.finishTime ?? performance.now()) - s.startTime) / 1000;
  // A game that makes a `leaderstats` folder shows its own columns; otherwise the built-in stage counter.
  const stats = runtime?.leaderstats() ?? [];
  const cols = stats.length ? stats.map((c) => ({ name: c.name, value: String(c.value ?? '') })) : [{ name: 'Stage', value: String(s.stage) }];
  return (
    <>
      <div className={styles.hudCard} data-version={version}>
        {!runtime?.scripted && <div className={styles.stage}>{s.finishTime !== null ? 'Finished!' : `Stage ${s.stage} / ${s.totalStages}`}</div>}
        <div className={styles.timer}>{elapsed.toFixed(1)}s</div>
        <div className={styles.deaths}>☠ {s.deaths}</div>
      </div>
      <div className={styles.leaderboard}>
        <div className={styles.lbHead}><span>Players</span>{cols.map((c) => <span key={c.name}>{c.name}</span>)}</div>
        <div className={styles.lbRow}><span className={styles.lbName}>{playerName}</span>{cols.map((c) => <span key={c.name}>{c.value}</span>)}</div>
        {showFps && <div className={styles.fps}>{fps.current} FPS</div>}
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
  const [note, setNote] = useState<{ title: string; text: string; key: number; ms: number } | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [help, setHelp] = useState(true);
  const [menu, setMenu] = useState(false);
  const savedQuality = typeof localStorage !== 'undefined' ? localStorage.getItem(QUALITY_KEY) : null;
  const [quality, setQuality] = useState<GraphicsQuality>(() => (savedQuality === 'low' || savedQuality === 'medium' || savedQuality === 'high' ? savedQuality : 'medium'));
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  /** Automatic graphics only runs until you pick a level yourself. */
  const autoRef = useRef(!(savedQuality === 'low' || savedQuality === 'medium' || savedQuality === 'high'));
  const [limited, setLimited] = useState(false);
  const [showFps, setShowFps] = useState(true);

  // The scripts of this run. Created in an effect (not during render) so Stop / Restart always shut the old scripts down.
  const queue = useRef<WorldQueue>({ changes: new Map(), added: [], removed: [] });
  const [run, setRun] = useState<{ rt: GameRuntime; key: number } | null>(null);
  const runRef = useRef<GameRuntime | null>(null);
  const [lines, setLines] = useState<OutLine[]>([]);
  const [outOpen, setOutOpen] = useState(false);
  const buffer = useRef<OutLine[]>([]);
  useEffect(() => {
    queue.current = { changes: new Map(), added: [], removed: [] };
    buffer.current = [];
    setLines([]);
    let n = 0;
    const rt = new GameRuntime(instances, {
      out: (kind, text) => { n += 1; buffer.current.push({ id: n, kind, text }); if (kind === 'error') setOutOpen(true); },
      onChange: (i, k) => { const m = queue.current.changes; const set = m.get(i.id) || new Set<string>(); set.add(k); m.set(i.id, set); },
      onAdded: (i) => { queue.current.added.push(i); },
      onRemoved: (id) => { queue.current.removed.push(id); },
      onNotify: (nt) => setNote({ title: nt.title, text: nt.text, key: Date.now(), ms: Math.max(1500, nt.duration * 1000) }),
    });
    runRef.current = rt;
    setRun((r) => ({ rt, key: (r?.key ?? 0) + 1 }));
    void rt.start();
    // Output lines arrive in bursts; show them a few times a second instead of re-rendering for every print.
    const flush = setInterval(() => {
      if (!buffer.current.length) return;
      const next = buffer.current.splice(0);
      setLines((l) => l.concat(next).slice(-200));
    }, 150);
    return () => { clearInterval(flush); rt.stop(); if (runRef.current === rt) runRef.current = null; };
  }, [instances, runKey]);

  const changeQuality = (q: GraphicsQuality) => {
    autoRef.current = false;
    setLimited(false);
    setQuality(q);
    try { localStorage.setItem(QUALITY_KEY, q); } catch { /* storage unavailable */ }
  };

  // Automatic graphics: if the frame rate stays under 40 for ~3s, try the next level down.
  // Then check that it really helped. If it did not (for example iPad Low Power Mode caps the game at 30 fps
  // whatever you do), go back to the nicer level and tell the player, instead of making the game ugly for nothing.
  useEffect(() => {
    let slow = 0;
    let probe: { prev: GraphicsQuality; before: number; ticks: number } | null = null;
    const id = setInterval(() => {
      if (!autoRef.current) return;
      const f = fps.current;
      if (probe) {
        probe.ticks += 1;
        if (probe.ticks >= 6) {
          if (f < probe.before * 1.25 && f < 40) { setQuality(probe.prev); setLimited(true); autoRef.current = false; }
          probe = null; slow = 0;
        }
        return;
      }
      slow = f < 40 ? slow + 1 : 0;
      if (slow >= 6) {
        slow = 0;
        const q = qualityRef.current;
        const next: GraphicsQuality = q === 'high' ? 'medium' : q === 'medium' ? 'low' : 'low';
        if (next === q) { setLimited(true); autoRef.current = false; return; }
        probe = { prev: q, before: f, ticks: 0 };
        setQuality(next);
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
      if (!e.repeat) runRef.current?.keyEvent(keyName(e.code), true);
      if (e.code === 'KeyR') { input.current.reset = true; return; }
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      held.current.add(k);
      setHelp(false);
      syncKeys();
    };
    const up = (e: KeyboardEvent) => { runRef.current?.keyEvent(keyName(e.code), false); const k = KEYS[e.code]; if (k) { held.current.delete(k); syncKeys(); } };
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

  useEffect(() => {
    if (!note) return undefined;
    const id = setTimeout(() => setNote(null), note.ms);
    return () => clearTimeout(id);
  }, [note]);

  const restart = () => {
    session.current = { startTime: performance.now(), finishTime: null, stage: 1, totalStages: session.current.totalStages, deaths: 0 };
    setBanner(null);
    setNote(null);
    setMenu(false);
    setRunKey((k) => k + 1);
  };

  const s = session.current;
  const finished = s.finishTime !== null;
  const elapsed = ((s.finishTime ?? performance.now()) - s.startTime) / 1000;

  return (
    <div className={styles.overlay}>
      {run && <PlaytestScene key={run.key} instances={instances} runtime={run.rt} queue={queue} input={input} session={session} onEvent={onEvent} quality={quality} fps={fps} />}

      <div className={styles.topLeft}>
        <button className={styles.menuBtn} onClick={() => setMenu((m) => !m)} aria-label="Menu (Esc)" title="Menu (Esc)">
          <span className={styles.menuIcon} aria-hidden="true"><i /><i /><i /></span>
        </button>
        <button className={styles.stopBtn} onClick={onStop} title="Stop playtest"><span className={styles.stopIcon} /> Stop</button>
        <button className={styles.outBtn} onClick={() => setOutOpen((o) => !o)} title="Output: what your scripts print" data-errors={lines.some((l) => l.kind === 'error')}>
          Output{lines.length ? ` (${lines.length})` : ''}
        </button>
      </div>

      {outOpen && (
        <div className={styles.outPanel} role="log" aria-label="Output">
          <div className={styles.outHead}><b>Output</b><span><button onClick={() => setLines([])}>Clear</button><button onClick={() => setOutOpen(false)} aria-label="Close output">✕</button></span></div>
          <div className={styles.outBody}>
            {lines.length === 0 && <div className={styles.outEmpty}>Nothing yet. Scripts that call <code>print()</code> show up here.</div>}
            {lines.map((l) => <div key={l.id} className={`${styles.outLine} ${styles[`out_${l.kind}`] || ''}`}>{l.text}</div>)}
          </div>
        </div>
      )}

      <Hud session={session} playerName={playerName} version={version} fps={fps} showFps={showFps} runtime={run?.rt ?? null} />

      {banner && (
        <div key={banner.key} className={`${styles.banner} ${styles[banner.tone]}`}>{banner.text}</div>
      )}
      {note && (
        <div key={note.key} className={styles.toast} role="status">
          <strong>{note.title}</strong>
          {note.text && <span>{note.text}</span>}
        </div>
      )}
      {finished && !menu && (
        <div className={styles.finishCard}>
          <div className={styles.trophy}>🏆</div>
          <h2>Course complete!</h2>
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
            <div className={styles.menuSection}>
              <span>Show frame rate</span>
              <div className={styles.segmented}>
                <button data-active={showFps} onClick={() => setShowFps(true)}>On</button>
                <button data-active={!showFps} onClick={() => setShowFps(false)}>Off</button>
              </div>
            </div>
            {limited && (
              <p className={styles.menuNote}>
                Lower graphics did not make this faster, so your device is probably limiting the frame rate (about {fps.current} fps).
                On an iPad or phone, turn off <b>Low Power Mode</b> in Settings → Battery, then play again.
              </p>
            )}
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
