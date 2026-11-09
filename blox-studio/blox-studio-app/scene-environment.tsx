import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { PlaceInstance, Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { SkyDome } from './sky-dome.js';

/**
 * Graphics quality, like Roblox's Graphics Quality slider.
 * `low` = no shadows / effects, `medium` = shadows only, `high` = shadows + Neon bloom.
 */
export type GraphicsQuality = 'low' | 'medium' | 'high';

/**
 * Computes the sun direction for a Roblox `ClockTime`.
 * @param clockTime - hours 0..24
 * @returns sun position
 */
export function sunFromClock(clockTime = 14): Vec3 {
  const angle = ((clockTime - 6) / 12) * Math.PI;
  return [Math.cos(angle) * 200, Math.max(-50, Math.sin(angle) * 200), 80];
}

/**
 * Props for {@link SceneEnvironment}.
 */
export type SceneEnvironmentProps = {
  /** The place's Lighting instance (time of day, brightness, atmosphere, bloom). */
  lighting?: PlaceInstance;
  /** Static point the shadow camera covers (editor). */
  focus?: Vec3;
  /** Live point the sun's shadow camera follows every frame (player in playtest). */
  follow?: MutableRefObject<THREE.Vector3>;
  /** Point lights resolved to world positions. Capped to keep shaders cheap. */
  pointLights?: { id: string; position: Vec3; color?: string; brightness?: number; range?: number }[];
  /** Rendering quality. Defaults to `medium`. */
  quality?: GraphicsQuality;
};

const MAX_POINT_LIGHTS = 4;

function Sun({ offset, focus, follow, intensity, color, shadows, shadowSize }: {
  offset: Vec3; focus: Vec3; follow?: MutableRefObject<THREE.Vector3>; intensity: number; color: string; shadows: boolean; shadowSize: number;
}) {
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(...focus);
    l.position.set(focus[0] + offset[0], focus[1] + offset[1], focus[2] + offset[2]);
    l.target.updateMatrixWorld();
  }, [focus, offset]);
  useFrame(() => {
    const l = light.current;
    if (!l || !follow) return;
    // Snap to a 2-stud grid so shadows don't shimmer while moving.
    const x = Math.round(follow.current.x / 2) * 2, y = Math.round(follow.current.y / 2) * 2, z = Math.round(follow.current.z / 2) * 2;
    l.target.position.set(x, y, z);
    l.position.set(x + offset[0], y + offset[1], z + offset[2]);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      intensity={intensity}
      color={color}
      castShadow={shadows}
      shadow-mapSize={[shadowSize, shadowSize]}
      shadow-bias={-0.0005}
      shadow-normalBias={0.05}
      shadow-camera-left={-70}
      shadow-camera-right={70}
      shadow-camera-top={70}
      shadow-camera-bottom={-70}
      shadow-camera-near={1}
      shadow-camera-far={400}
    />
  );
}

/**
 * Sky, sun, ambient light, fog and (on `high`) Neon bloom driven by the place's Lighting settings —
 * shared by the editor viewport and playtest so both look like the published Roblox game.
 */
export function SceneEnvironment({ lighting, focus = [0, 0, 0], follow, pointLights = [], quality = 'medium' }: SceneEnvironmentProps) {
  const p = lighting?.props || {};
  const clock = p.clockTime ?? 14;
  const night = clock < 6 || clock > 18;
  const sun = sunFromClock(clock);
  const atmosphere = p.atmosphere ?? 0.3;
  const fogFar = atmosphere > 0 ? 2600 - atmosphere * 1800 : 8000;
  const offset: Vec3 = [sun[0] * 0.6, sun[1] * 0.6, sun[2] * 0.6];
  const lights = quality === 'low' ? [] : pointLights.slice(0, MAX_POINT_LIGHTS);

  return (
    <>
      <color attach="background" args={[night ? '#0b1020' : '#bfe3ff']} />
      <fog attach="fog" args={[night ? '#1a2240' : '#bfe3ff', fogFar * 0.3, fogFar]} />
      <SkyDome sun={sun} night={night} />
      <ambientLight intensity={night ? 0.15 : 0.45} />
      <hemisphereLight args={[night ? '#334' : '#dff1ff', '#6b6150', night ? 0.15 : 0.6]} />
      <Sun
        offset={offset}
        focus={focus}
        follow={follow}
        intensity={night ? 0.15 : (p.brightness ?? 3) * 0.7}
        color={clock < 8 || clock > 17 ? '#ffc58a' : '#fff6e6'}
        shadows={quality !== 'low'}
        shadowSize={quality === 'high' ? 2048 : 1024}
      />
      {lights.map((l) => (
        <pointLight key={l.id} position={l.position} color={l.color} intensity={(l.brightness ?? 1) * 30} distance={(l.range ?? 16) * 1.5} decay={1.6} />
      ))}
      {quality === 'high' && p.bloom !== false && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.8} luminanceThreshold={1} luminanceSmoothing={0.2} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}
