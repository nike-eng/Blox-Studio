import * as THREE from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import { PART_CLASSES, type PlaceInstance, type Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { subtreeIds } from './use-place-editor.js';
import { DEG } from './part-visual.js';

/** Roblox default physics, in studs and seconds. */
export const ROBLOX = { gravity: 196.2, walkSpeed: 16, jumpVelocity: 50, climbSpeed: 12, halfHeight: 2.5 } as const;

/**
 * Live state of one part during a playtest (position may change for moving / unanchored parts).
 */
export type RuntimePart = {
  inst: PlaceInstance;
  /** Start position. */
  origin: THREE.Vector3;
  /** Start orientation. */
  baseQuat: THREE.Quaternion;
  /** Current position. */
  pos: THREE.Vector3;
  /** Current orientation. */
  quat: THREE.Quaternion;
  /** Inverse of `quat` (kept in sync for overlap tests). */
  invQuat: THREE.Quaternion;
  /** Half extents. */
  half: THREE.Vector3;
  /** Movement during the last frame (for carrying players on platforms). */
  delta: THREE.Vector3;
  /** Physics body, once mounted. */
  body?: RapierRigidBody;
  /** Visual root, once mounted. */
  group?: THREE.Group | null;
  /** Disappearing-tile state. */
  fade: { phase: 'solid' | 'fading' | 'gone' | 'returning'; t: number };
  /** Whether players currently collide with it. */
  solid: boolean;
  /** A script destroyed it. */
  gone?: boolean;
};

/**
 * Mutable session shared between the 3D loop and the HUD.
 */
export type PlaySession = {
  startTime: number;
  finishTime: number | null;
  stage: number;
  totalStages: number;
  deaths: number;
};

/**
 * Builds runtime state for every part in Workspace.
 * @param instances - place instances
 * @returns runtime parts
 */
export function buildRuntime(instances: PlaceInstance[]): RuntimePart[] {
  const ids = subtreeIds(instances, 'Workspace');
  return instances.filter((i) => PART_CLASSES.includes(i.className) && ids.has(i.id)).map(runtimePart);
}

/**
 * Builds the runtime state of one part (also used for parts scripts create while playing).
 * @param inst - a part instance
 * @returns runtime part
 */
export function runtimePart(inst: PlaceInstance): RuntimePart {
  const p = inst.props;
  const origin = new THREE.Vector3(...((p.position || [0, 0, 0]) as Vec3));
  const r = (p.rotation || [0, 0, 0]) as Vec3;
  const baseQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'));
  const s = (p.size || [4, 1, 2]) as Vec3;
  return {
    inst,
    origin,
    baseQuat,
    pos: origin.clone(),
    quat: baseQuat.clone(),
    invQuat: baseQuat.clone().invert(),
    half: new THREE.Vector3(s[0] / 2, s[1] / 2, s[2] / 2),
    delta: new THREE.Vector3(),
    fade: { phase: 'solid', t: 0 },
    solid: p.canCollide !== false,
  } as RuntimePart;
}

const tmp = new THREE.Vector3();

/**
 * Converts a world point into a part's local space.
 * @param part - runtime part
 * @param point - world point
 * @returns local point (shared temp vector — copy if you keep it)
 */
export function toLocal(part: RuntimePart, point: THREE.Vector3): THREE.Vector3 {
  return tmp.copy(point).sub(part.pos).applyQuaternion(part.invQuat);
}

/**
 * Tests whether a sphere touches a part's oriented bounding box.
 * @param part - runtime part
 * @param point - sphere center (world)
 * @param radius - sphere radius in studs
 * @returns true if touching
 */
export function touches(part: RuntimePart, point: THREE.Vector3, radius: number): boolean {
  const l = toLocal(part, point);
  if (part.inst.className === 'Part' && part.inst.props.shape === 'Ball') {
    return l.length() <= Math.min(part.half.x, part.half.y, part.half.z) + radius;
  }
  const dx = Math.max(Math.abs(l.x) - part.half.x, 0);
  const dy = Math.max(Math.abs(l.y) - part.half.y, 0);
  const dz = Math.max(Math.abs(l.z) - part.half.z, 0);
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/**
 * Where a player should appear when (re)spawning on a part.
 * @param part - spawn or checkpoint part
 * @returns body center position
 */
export function spawnPointOn(part: RuntimePart | undefined): THREE.Vector3 {
  if (!part) return new THREE.Vector3(0, 6, 0);
  return part.pos.clone().add(new THREE.Vector3(0, part.half.y + ROBLOX.halfHeight + 0.2, 0));
}
