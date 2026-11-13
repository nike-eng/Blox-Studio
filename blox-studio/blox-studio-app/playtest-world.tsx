import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  RigidBody, CuboidCollider, ConvexHullCollider, BallCollider, CylinderCollider, CapsuleCollider,
  useBeforePhysicsStep, useRapier, type RapierRigidBody, type RapierCollider,
} from '@react-three/rapier';
import { PART_CLASSES, type GameRuntime, type PlaceInstance, type Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { DEG, PartVisual, WEDGE_POINTS, CORNER_WEDGE_POINTS } from './part-visual.js';
import { PlaytestAvatar, type AvatarAnim } from './playtest-avatar.js';
import { ParticleBurst, type Burst } from './particle-burst.js';
import { ROBLOX, buildRuntime, runtimePart, spawnPointOn, touches, type PlaySession, type RuntimePart } from './playtest-runtime.js';

/**
 * Player input, written by keyboard and touch controls.
 */
export type PlayInput = { x: number; z: number; jump: boolean; reset: boolean };

/**
 * Gameplay events surfaced to the HUD.
 */
export type PlayEvent =
  | { type: 'checkpoint'; stage: number }
  | { type: 'died' }
  | { type: 'finish'; time: number }
  | { type: 'jumpPad' };

/** Things scripts changed since the last physics step; the 3D world drains this queue every step. */
export type WorldQueue = { changes: Map<string, Set<string>>; added: PlaceInstance[]; removed: string[] };

/** Per-frame updater, mounted only for parts that animate (moving non-solid parts, fading tiles). */
function PartAnimator({ part }: { part: RuntimePart }) {
  const p = part.inst.props;
  const moving = p.motion === 'move' || p.motion === 'spin';
  const fades = p.behavior === 'fade';
  const baseOpacity = Math.min(0.55, 1 - (p.transparency ?? 0));
  const mats = useRef<THREE.MeshStandardMaterial[] | null>(null);
  const last = useRef(-1);

  useFrame(() => {
    const g = part.group;
    if (!g) return;
    if (!part.body && moving) { g.position.copy(part.pos); g.quaternion.copy(part.quat); }
    if (fades) {
      const f = part.fade;
      const factor = f.phase === 'solid' ? 1 : f.phase === 'fading' ? 1 - f.t / 0.6 : f.phase === 'gone' ? 0 : f.t / 0.3;
      if (factor === last.current) return;
      last.current = factor;
      if (!mats.current) {
        mats.current = [];
        g.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && 'opacity' in m) { const own = m.clone(); (o as THREE.Mesh).material = own; mats.current!.push(own); }
        });
      }
      g.visible = factor > 0.02;
      mats.current.forEach((m) => { m.transparent = true; m.opacity = baseOpacity * factor + 0.0001; });
    }
  });
  return null;
}

/** Corner points of a wedge solid scaled to the part's size (physics hull). */
function hullVertices(shape: string, h: { x: number; y: number; z: number }): Float32Array {
  const pts = shape === 'Wedge' ? WEDGE_POINTS : CORNER_WEDGE_POINTS;
  return new Float32Array(pts.flatMap((v) => [v[0] * 2 * h.x, v[1] * 2 * h.y, v[2] * 2 * h.z]));
}

function RuntimePartView({ part }: { part: RuntimePart }) {
  const p = part.inst.props;
  const moving = p.motion === 'move' || p.motion === 'spin';
  const fades = p.behavior === 'fade';
  const animator = fades || (moving && !part.solid) ? <PartAnimator part={part} /> : null;

  if (!part.solid) {
    return <>{animator}<PartVisual inst={part.inst} ref={(g) => { part.group = g; }} /></>;
  }
  const r = (p.rotation || [0, 0, 0]).map((d) => (d * Math.PI) / 180) as Vec3;
  const h = part.half;
  const collider = part.inst.className === 'Part' && p.shape === 'Ball'
    ? <BallCollider args={[Math.min(h.x, h.y, h.z)]} />
    : part.inst.className === 'Part' && p.shape === 'Cylinder'
      ? <CylinderCollider args={[h.x, Math.min(h.y, h.z)]} rotation={[0, 0, Math.PI / 2]} />
      : part.inst.className === 'Part' && (p.shape === 'Wedge' || p.shape === 'CornerWedge')
        ? <ConvexHullCollider args={[hullVertices(p.shape, h)]} />
        : <CuboidCollider args={[h.x, h.y, h.z]} />;
  const type = p.anchored === false && !moving ? 'dynamic' : moving || fades ? 'kinematicPosition' : 'fixed';
  return (
    <>
    {animator}
    <RigidBody
      ref={(b: RapierRigidBody | null) => { part.body = b || undefined; }}
      type={type}
      colliders={false}
      position={(p.position || [0, 0, 0]) as Vec3}
      rotation={r}
      userData={{ partId: part.inst.id }}
      friction={p.material === 'Ice' ? 0.05 : 0.8}
    >
      {collider}
      <PartVisual inst={part.inst} local ref={(g) => { part.group = g; }} />
    </RigidBody>
    </>
  );
}

/**
 * Props for {@link PlaytestWorld}.
 */
export type PlaytestWorldProps = {
  /** The running scripts and the live copy of the place they work on. */
  runtime: GameRuntime;
  /** Changes made by scripts, waiting to be shown. */
  queue: MutableRefObject<WorldQueue>;
  input: MutableRefObject<PlayInput>;
  session: MutableRefObject<PlaySession>;
  onEvent: (event: PlayEvent) => void;
  /** Current player position, for lighting/shadows to follow. */
  playerPos: MutableRefObject<THREE.Vector3>;
};

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The simulated game: physics bodies for every part, a Roblox-style character controller
 * (walk 16 studs/s, jump 50, gravity 196.2, truss climbing), moving/spinning parts,
 * disappearing tiles, kill bricks, jump pads, checkpoints, finish line and a collision-aware
 * third-person camera.
 */
export function PlaytestWorld({ runtime, queue, input, session, onEvent, playerPos }: PlaytestWorldProps) {
  const baseParts = useMemo(() => buildRuntime(Array.from(runtime.nodes.values())), [runtime]);
  const [extra, setExtra] = useState<RuntimePart[]>([]);
  const parts = useMemo(() => (extra.length ? baseParts.concat(extra) : baseParts), [baseParts, extra]);
  const byId = useMemo(() => new Map(parts.map((p) => [p.inst.id, p])), [parts]);
  const interactive = useMemo(() => parts.filter((p) => (p.inst.props.behavior && p.inst.props.behavior !== 'none') || p.inst.className === 'TrussPart'), [parts]);
  const movers = useMemo(() => parts.filter((p) => p.inst.props.motion === 'move' || p.inst.props.motion === 'spin'), [parts]);
  const spawn = useMemo(() => parts.find((p) => p.inst.className === 'SpawnLocation'), [parts]);
  const checkpoints = useMemo(() => {
    const map = new Map<number, RuntimePart>();
    parts.forEach((p) => { if (p.inst.props.behavior === 'checkpoint') map.set(Math.max(2, Math.round(p.inst.props.checkpoint ?? 2)), p); });
    return map;
  }, [parts]);
  const killY = useMemo(() => Math.min(...parts.map((p) => p.pos.y - p.half.y), 0) - 40, [parts]);

  const { world, rapier } = useRapier();
  const { camera, gl } = useThree();
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const avatar = useRef<THREE.Group>(null);
  const anim = useRef<AvatarAnim>({ speed: 0, yaw: Math.PI, airborne: false, climbing: false, dead: false });
  const vy = useRef(0);
  const clock = useRef(0);
  const deadUntil = useRef(0);
  const padCooldown = useRef(0);
  const touching = useRef(new Set<string>());
  const ownMats = useRef(new WeakMap<RuntimePart, THREE.Material[]>());
  const baseHalf = useRef(new WeakMap<RuntimePart, THREE.Vector3>());
  const sizeWarned = useRef(false);
  // Roblox default camera: 12.5 studs behind, slightly above.
  const cam = useRef({ yaw: 0, pitch: 0.3, dist: 12.5, dragging: false, lx: 0, ly: 0 });
  const bursts = useRef<Burst[]>([]);
  const start = useMemo(() => spawnPointOn(spawn), [spawn]);
  // Scratch objects reused every step to avoid garbage-collection stutter.
  const S = useMemo(() => ({ pos: new THREE.Vector3(), feet: new THREE.Vector3(), dir: new THREE.Vector3(), desired: new THREE.Vector3(), wp: new THREE.Vector3(), offset: new THREE.Vector3() }), []);
  const groundRay = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);
  const camRay = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), [rapier]);

  useEffect(() => {
    session.current.totalStages = Math.max(1, ...Array.from(checkpoints.keys()));
  }, [checkpoints, session]);

  const controller = useMemo(() => {
    const c = world.createCharacterController(0.08);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.enableSnapToGround(0.6);
    c.enableAutostep(1.1, 0.4, false);
    c.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    return c;
  }, [world]);
  useEffect(() => () => { try { world.removeCharacterController(controller); } catch { /* world disposed */ } }, [world, controller]);

  // Camera like Roblox: right-drag (or one-finger drag on touch) to orbit, wheel to zoom.
  useEffect(() => {
    const el = gl.domElement;
    const c = cam.current;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 2) return;
      c.dragging = true; c.lx = e.clientX; c.ly = e.clientY; el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!c.dragging) return;
      c.yaw -= (e.clientX - c.lx) * 0.006;
      c.pitch = Math.min(1.35, Math.max(-1.2, c.pitch + (e.clientY - c.ly) * 0.005));
      c.lx = e.clientX; c.ly = e.clientY;
    };
    const up = () => { c.dragging = false; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); c.dist = Math.min(64, Math.max(4, c.dist * (1 + Math.sign(e.deltaY) * 0.12))); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);

  const respawnPoint = () => spawnPointOn(checkpoints.get(session.current.stage) || spawn);

  /** Own copies of a part's materials, so a color change never touches other parts that share them. */
  const materialsOf = (part: RuntimePart): THREE.MeshStandardMaterial[] => {
    let m = ownMats.current.get(part);
    if (!m && part.group) {
      m = [];
      part.group.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (mat && !Array.isArray(mat)) { const c = mat.clone(); (o as THREE.Mesh).material = c; m!.push(c); }
      });
      ownMats.current.set(part, m);
    }
    return (m || []) as THREE.MeshStandardMaterial[];
  };

  /** Shows a property a script changed on a part. */
  const applyChange = (part: RuntimePart, key: string) => {
    const p = part.inst.props; const g = part.group; const b = part.body;
    if (key === 'position') {
      const v = (p.position || [0, 0, 0]) as Vec3;
      part.pos.set(v[0], v[1], v[2]); part.origin.copy(part.pos);
      if (b) { b.setTranslation({ x: v[0], y: v[1], z: v[2] }, true); b.setNextKinematicTranslation({ x: v[0], y: v[1], z: v[2] }); } else if (g) g.position.copy(part.pos);
    } else if (key === 'rotation') {
      const r = (p.rotation || [0, 0, 0]) as Vec3;
      part.baseQuat.setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'));
      part.quat.copy(part.baseQuat); part.invQuat.copy(part.quat).invert();
      if (b) { b.setRotation(part.quat, true); b.setNextKinematicRotation(part.quat); } else if (g) g.quaternion.copy(part.quat);
    } else if (key === 'color') {
      materialsOf(part).forEach((m) => { if (m.color) m.color.set(p.color || '#a3a2a5'); });
    } else if (key === 'transparency') {
      const t = p.transparency ?? 0;
      materialsOf(part).forEach((m) => { m.transparent = t > 0; m.opacity = 1 - t; m.needsUpdate = true; });
      if (g) g.visible = t < 1;
    } else if (key === 'canCollide') {
      part.solid = p.canCollide !== false;
      b?.setEnabled(part.solid);
    } else if (key === 'size' && g) {
      const s = (p.size || [4, 1, 2]) as Vec3;
      if (!baseHalf.current.has(part)) baseHalf.current.set(part, part.half.clone());
      const base = baseHalf.current.get(part)!;
      part.half.set(s[0] / 2, s[1] / 2, s[2] / 2);
      g.scale.set(part.half.x / base.x, part.half.y / base.y, part.half.z / base.z);
      if (!sizeWarned.current) { sizeWarned.current = true; runtime.out('warn', 'Size changes from scripts move the picture but not the physics yet.'); }
    }
  };

  /** Applies what scripts did since the last step: new parts, removed parts, changed properties. */
  const drainScriptChanges = () => {
    const q = queue.current;
    if (q.added.length) {
      const add = q.added.splice(0).filter((i) => PART_CLASSES.includes(i.className) && runtime.rootOf(i).id === 'Workspace').map(runtimePart);
      if (add.length) setExtra((e) => e.concat(add));
    }
    if (q.removed.length) {
      q.removed.splice(0).forEach((id) => {
        const part = byId.get(id);
        if (part) { part.gone = true; part.solid = false; part.body?.setEnabled(false); if (part.group) part.group.visible = false; runtime.touchWatch.delete(id); touching.current.delete(id); }
      });
    }
    q.changes.forEach((keys, id) => {
      const part = byId.get(id);
      if (part) { if (!part.gone) keys.forEach((k) => applyChange(part, k)); q.changes.delete(id); } else if (!runtime.nodes.has(id)) q.changes.delete(id);
    });
  };

  const die = (at: THREE.Vector3) => {
    if (anim.current.dead) return;
    runtime.characterDied();
    anim.current.dead = true;
    deadUntil.current = clock.current + 1.6;
    session.current.deaths += 1;
    bursts.current.push({ id: Math.random(), origin: at.clone(), colors: ['#f5cd30', '#0d69ac', '#a4bd47'], count: 14, born: performance.now(), size: 0.9, speed: 26 });
    onEvent({ type: 'died' });
  };

  useBeforePhysicsStep(() => {
    const b = body.current;
    const col = collider.current;
    if (!b || !col) return;
    const dt = world.timestep;
    clock.current += dt;
    const t = clock.current;
    drainScriptChanges();
    runtime.step(dt);

    // Moving / spinning parts.
    movers.forEach((part) => {
      const p = part.inst.props;
      const prev = S.wp.copy(part.pos);
      if (p.motion === 'move') {
        const o = p.moveOffset || [0, 0, 0];
        const dur = Math.max(0.2, p.moveTime ?? 3);
        const a = 0.5 - 0.5 * Math.cos((Math.PI * t) / dur);
        part.pos.set(part.origin.x + o[0] * a, part.origin.y + o[1] * a, part.origin.z + o[2] * a);
      } else {
        part.quat.setFromAxisAngle(UP, (p.spinSpeed ?? 1.5) * t).multiply(part.baseQuat);
        part.invQuat.copy(part.quat).invert();
      }
      part.delta.subVectors(part.pos, prev);
      if (part.body) {
        part.body.setNextKinematicTranslation(part.pos);
        part.body.setNextKinematicRotation(part.quat);
      }
    });

    // Disappearing tiles.
    parts.forEach((part) => {
      if (part.inst.props.behavior !== 'fade' || part.fade.phase === 'solid') return;
      const f = part.fade;
      f.t += dt;
      if (f.phase === 'fading' && f.t >= 0.6) { f.phase = 'gone'; f.t = 0; part.body?.setEnabled(false); }
      else if (f.phase === 'gone' && f.t >= 2.5) { f.phase = 'returning'; f.t = 0; part.body?.setEnabled(true); }
      else if (f.phase === 'returning' && f.t >= 0.3) { f.phase = 'solid'; f.t = 0; }
    });

    const pos = S.pos.copy(b.translation() as THREE.Vector3);

    // Death / respawn.
    if (anim.current.dead) {
      if (t >= deadUntil.current) {
        const sp = respawnPoint();
        b.setTranslation(sp, true);
        b.setNextKinematicTranslation(sp);
        vy.current = 0;
        anim.current.dead = false;
        cam.current.yaw = 0;
        runtime.characterRespawned();
      }
      return;
    }
    const ch = runtime.char;
    ch.pos[0] = pos.x; ch.pos[1] = pos.y; ch.pos[2] = pos.z;
    // Scripts that moved or pushed the character (HumanoidRootPart.CFrame / Position / AssemblyLinearVelocity).
    if (ch.teleport) {
      const [tx, ty, tz] = ch.teleport; ch.teleport = null;
      b.setTranslation({ x: tx, y: ty, z: tz }, true); b.setNextKinematicTranslation({ x: tx, y: ty, z: tz });
      pos.set(tx, ty, tz); vy.current = 0;
    }
    if (ch.velocity) { vy.current = ch.velocity[1]; ch.velocity = null; }
    if (!ch.alive || ch.respawn) { die(pos); return; }
    if (input.current.reset) { input.current.reset = false; die(pos); return; }
    if (pos.y < killY) { die(pos); return; }

    // Touch gameplay.
    const feet = S.feet.set(pos.x, pos.y - ROBLOX.halfHeight + 0.4, pos.z);
    // Parts that scripts listen to with Touched / TouchEnded.
    if (runtime.touchWatch.size || touching.current.size) {
      const now = new Set<string>();
      runtime.touchWatch.forEach((id) => {
        const part = byId.get(id);
        if (part && !part.gone && (touches(part, feet, 0.75) || touches(part, pos, 1.2))) now.add(id);
      });
      now.forEach((id) => { if (!touching.current.has(id)) runtime.touch(id); });
      touching.current.forEach((id) => { if (!now.has(id)) runtime.touchEnded(id); });
      touching.current = now;
    }
    let climbing = false;
    for (const part of interactive) {
      if (part.gone) continue;
      if (part.inst.className === 'TrussPart') {
        if (touches(part, pos, 1.6)) climbing = true;
        continue;
      }
      const behavior = part.inst.props.behavior;
      if (behavior === 'fade' && part.fade.phase !== 'solid') continue;
      const hit = touches(part, feet, 0.75) || touches(part, pos, 1.2);
      if (!hit) continue;
      if (behavior === 'kill') { die(pos); return; }
      if (behavior === 'checkpoint') {
        const stage = Math.max(2, Math.round(part.inst.props.checkpoint ?? 2));
        if (stage > session.current.stage) { session.current.stage = stage; onEvent({ type: 'checkpoint', stage }); }
      }
      if (behavior === 'finish' && session.current.finishTime === null) {
        session.current.finishTime = performance.now();
        bursts.current.push({ id: Math.random(), origin: part.pos.clone().add(new THREE.Vector3(0, 2, 0)), colors: ['#ffd60a', '#ff4d6d', '#3d7bfd', '#22c55e', '#9b5de5'], count: 90, born: performance.now(), size: 0.5, speed: 45 });
        onEvent({ type: 'finish', time: (session.current.finishTime - session.current.startTime) / 1000 });
      }
      if (behavior === 'jumpPad' && t > padCooldown.current) {
        vy.current = part.inst.props.jumpPower ?? 100;
        padCooldown.current = t + 0.35;
        onEvent({ type: 'jumpPad' });
      }
      if (behavior === 'fade') { part.fade.phase = 'fading'; part.fade.t = 0; }
    }

    // Movement relative to the camera.
    const { x: ix, z: iz } = input.current;
    const yaw = cam.current.yaw;
    const dir = S.dir.set(
      Math.sin(yaw) * iz + Math.cos(yaw) * ix,
      0,
      Math.cos(yaw) * iz - Math.sin(yaw) * ix,
    );
    if (dir.lengthSq() > 1) dir.normalize();
    const moveInput = dir.lengthSq() > 0.01;

    const grounded = controller.computedGrounded();
    if (climbing && moveInput) {
      vy.current = ROBLOX.climbSpeed;
    } else {
      vy.current -= ROBLOX.gravity * dt;
      if (grounded && vy.current < 0) vy.current = -2;
      if (input.current.jump && (grounded || climbing) && vy.current <= 0) vy.current = ch.jumpPower;
    }
    vy.current = Math.max(vy.current, -250);

    const desired = S.desired.set(dir.x * ch.walkSpeed * dt, vy.current * dt, dir.z * ch.walkSpeed * dt);

    // Ride moving platforms.
    groundRay.origin.x = pos.x; groundRay.origin.y = pos.y - ROBLOX.halfHeight + 0.3; groundRay.origin.z = pos.z;
    const ground = world.castRay(groundRay, 0.8, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, col, b);
    if (ground) {
      const data = ground.collider.parent()?.userData as { partId?: string } | undefined;
      const carrier = data?.partId ? byId.get(data.partId) : undefined;
      if (carrier && carrier.inst.props.motion === 'move') desired.add(carrier.delta);
    }

    controller.computeColliderMovement(col, desired, rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = controller.computedMovement();
    if (vy.current > 0 && m.y < desired.y * 0.5 && !(climbing && moveInput)) vy.current = 0;
    b.setNextKinematicTranslation({ x: pos.x + m.x, y: pos.y + m.y, z: pos.z + m.z });

    anim.current.speed = Math.hypot(m.x, m.z) / dt;
    if (moveInput) anim.current.yaw = Math.atan2(dir.x, dir.z);
    anim.current.airborne = !controller.computedGrounded() && !(climbing && moveInput);
    anim.current.climbing = climbing && moveInput;
  });

  // Third-person camera with occlusion.
  const target = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const a = avatar.current;
    if (!a) return;
    const wp = a.getWorldPosition(S.wp);
    playerPos.current.copy(wp);
    wp.y += 1.5;
    // Roblox's camera tracks the head rigidly; only smooth while dead.
    if (anim.current.dead) target.current.lerp(wp, 0.02); else target.current.copy(wp);
    const c = cam.current;
    const offset = S.offset.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
    let dist = c.dist;
    camRay.origin.x = target.current.x; camRay.origin.y = target.current.y; camRay.origin.z = target.current.z;
    camRay.dir.x = offset.x; camRay.dir.y = offset.y; camRay.dir.z = offset.z;
    const hit = world.castRay(
      camRay,
      c.dist, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, collider.current || undefined, body.current || undefined,
    );
    if (hit) dist = Math.max(2, hit.timeOfImpact - 0.6);
    camera.position.copy(target.current).addScaledVector(offset, dist);
    camera.lookAt(target.current);
  });

  return (
    <>
      {parts.map((part) => <RuntimePartView key={part.inst.id} part={part} />)}
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, start.y, start.z]} enabledRotations={[false, false, false]}>
        <CapsuleCollider ref={collider} args={[ROBLOX.halfHeight - 1, 1]} />
        <PlaytestAvatar ref={avatar} anim={anim} />
      </RigidBody>
      <ParticleBurst bursts={bursts} />
    </>
  );
}
