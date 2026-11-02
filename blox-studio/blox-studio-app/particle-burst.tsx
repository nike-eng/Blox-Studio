import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { boxGeo } from './part-visual.js';

/**
 * A one-shot particle explosion (death pieces, finish confetti).
 */
export type Burst = {
  id: number;
  origin: THREE.Vector3;
  colors: string[];
  count: number;
  born: number;
  size: number;
  speed: number;
};

const LIFETIME = 2200;

function BurstView({ burst }: { burst: Burst }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const particles = useMemo(() => Array.from({ length: burst.count }, (_, i) => ({
    color: burst.colors[i % burst.colors.length],
    vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2 + 0.4, (Math.random() - 0.5) * 2).normalize().multiplyScalar(burst.speed * (0.5 + Math.random() * 0.6)),
    spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
  })), [burst]);

  useFrame(() => {
    const age = (performance.now() - burst.born) / 1000;
    particles.forEach((p, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.position.set(
        burst.origin.x + p.vel.x * age,
        burst.origin.y + p.vel.y * age - 0.5 * 90 * age * age,
        burst.origin.z + p.vel.z * age,
      );
      m.rotation.set(p.spin.x * age, p.spin.y * age, p.spin.z * age);
      const s = burst.size * Math.max(0, 1 - age / (LIFETIME / 1000));
      m.scale.setScalar(s);
    });
  });

  return (
    <>
      {particles.map((p, i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }} geometry={boxGeo} castShadow>
          <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.4} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Renders the active particle bursts and garbage-collects expired ones.
 * @param props.bursts - mutable list the game loop pushes new bursts into
 */
export function ParticleBurst({ bursts }: { bursts: MutableRefObject<Burst[]> }) {
  const [active, setActive] = useState<Burst[]>([]);
  useFrame(() => {
    const now = performance.now();
    const alive = bursts.current.filter((b) => now - b.born < LIFETIME);
    if (alive.length !== active.length || alive.some((b, i) => b !== active[i])) {
      bursts.current = alive;
      setActive(alive);
    }
  });
  return <>{active.map((b) => <BurstView key={b.id} burst={b} />)}</>;
}
