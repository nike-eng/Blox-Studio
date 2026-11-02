import { forwardRef, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { boxGeo } from './part-visual.js';

/**
 * Animation state written by the player controller each physics step.
 */
export type AvatarAnim = {
  /** Horizontal speed in studs/s. */
  speed: number;
  /** Facing angle (radians, around Y). */
  yaw: number;
  /** In the air (jumping / falling). */
  airborne: boolean;
  /** Climbing a truss. */
  climbing: boolean;
  /** Hidden while respawning. */
  dead: boolean;
};

const SKIN = '#f5cd30';
const SHIRT = '#0d69ac';
const PANTS = '#a4bd47';

function Block({ size, color, position }: { size: [number, number, number]; color: string; position?: [number, number, number] }) {
  return (
    <mesh geometry={boxGeo} scale={size} position={position} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.55} />
    </mesh>
  );
}

/**
 * Classic blocky Roblox avatar (5 studs tall, centered on the capsule) with walk, jump and climb animations.
 */
export const PlaytestAvatar = forwardRef<THREE.Group, { anim: MutableRefObject<AvatarAnim> }>(function PlaytestAvatar({ anim }, ref) {
  const root = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const phase = useRef(0);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!root.current) return;
    root.current.visible = !a.dead;
    const cur = root.current.rotation.y;
    let diff = a.yaw - cur;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    root.current.rotation.y = cur + diff * Math.min(1, dt * 14);
    phase.current += dt * (a.climbing ? 9 : Math.min(a.speed, 20) * 0.75);
    let swing = Math.sin(phase.current) * Math.min(1, a.speed / 16) * 0.9;
    let arms = -swing;
    if (a.airborne && !a.climbing) { swing = 0.35; arms = -2.6; }
    if (a.climbing) { arms = -2.6 + Math.sin(phase.current) * 0.5; swing = Math.sin(phase.current) * 0.5; }
    if (armL.current) armL.current.rotation.x = arms;
    if (armR.current) armR.current.rotation.x = a.climbing || a.airborne ? -2.6 - Math.sin(phase.current) * 0.5 : swing;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
  });

  return (
    <group ref={ref}>
      <group ref={root}>
        <Block size={[2, 2, 1]} color={SHIRT} position={[0, 0.5, 0]} />
        <group position={[0, 2, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.62, 0.62, 1.2, 24]} />
            <meshStandardMaterial color={SKIN} roughness={0.5} />
          </mesh>
          <mesh position={[-0.24, 0.12, 0.6]}><boxGeometry args={[0.12, 0.22, 0.04]} /><meshBasicMaterial color="#111" /></mesh>
          <mesh position={[0.24, 0.12, 0.6]}><boxGeometry args={[0.12, 0.22, 0.04]} /><meshBasicMaterial color="#111" /></mesh>
          <mesh position={[0, -0.2, 0.6]}><boxGeometry args={[0.5, 0.08, 0.04]} /><meshBasicMaterial color="#111" /></mesh>
        </group>
        <group ref={armL} position={[-1.5, 1.4, 0]}><Block size={[1, 2, 1]} color={SKIN} position={[0, -0.9, 0]} /></group>
        <group ref={armR} position={[1.5, 1.4, 0]}><Block size={[1, 2, 1]} color={SKIN} position={[0, -0.9, 0]} /></group>
        <group ref={legL} position={[-0.5, -0.5, 0]}><Block size={[1, 2, 1]} color={PANTS} position={[0, -1, 0]} /></group>
        <group ref={legR} position={[0.5, -0.5, 0]}><Block size={[1, 2, 1]} color={PANTS} position={[0, -1, 0]} /></group>
      </group>
    </group>
  );
});
