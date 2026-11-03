import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Vec3 } from '@robloc/blox-studio.rbxlx-serializer';

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const fragment = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.6)) : mix(horizon, bottom, min(1.0, -h * 4.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Roblox-like gradient sky dome with a sun disc and glow.
 * Follows the camera so it never clips, and is unaffected by fog.
 * @param props.sun - sun direction
 * @param props.night - render the night palette
 */
export function SkyDome({ sun, night }: { sun: Vec3; night: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({
    top: { value: new THREE.Color(night ? '#050814' : '#2f7fe0') },
    horizon: { value: new THREE.Color(night ? '#1a2240' : '#bfe3ff') },
    bottom: { value: new THREE.Color(night ? '#050814' : '#6aa8e8') },
    sunDir: { value: new THREE.Vector3(...sun).normalize() },
    sunColor: { value: new THREE.Color(night ? '#000000' : '#fff3d6') },
  }), [sun, night]);

  useFrame(({ camera }) => { ref.current?.position.copy(camera.position); });

  return (
    <group ref={ref}>
      <mesh renderOrder={-1000} frustumCulled={false}>
        <sphereGeometry args={[1000, 32, 16]} />
        <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
