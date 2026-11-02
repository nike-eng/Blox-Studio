import { forwardRef, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { PlaceInstance, Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { tiledTexture } from './material-textures.js';

/** Degrees → radians. */
export const DEG = Math.PI / 180;

/** Unit geometries shared by all parts (scaled per part). */
export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
/** Unit sphere. */
export const ballGeo = new THREE.SphereGeometry(0.5, 32, 16);
/** Unit cylinder whose axis is X, matching Roblox's cylinder orientation. */
export const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32).rotateZ(Math.PI / 2);

/**
 * Picks the unit geometry for a part instance.
 * @param inst - part instance
 * @returns shared geometry
 */
export function geometryFor(inst: PlaceInstance): THREE.BufferGeometry {
  if (inst.className !== 'Part') return boxGeo;
  if (inst.props.shape === 'Ball') return ballGeo;
  if (inst.props.shape === 'Cylinder') return cylGeo;
  return boxGeo;
}

const ROUGH: Record<string, number> = {
  SmoothPlastic: 0.25, Plastic: 0.6, Marble: 0.2, Glass: 0.05, Ice: 0.1, Foil: 0.15, Metal: 0.3, DiamondPlate: 0.35,
  Neon: 0.4, Grass: 0.95, LeafyGrass: 0.95, Sand: 1, Snow: 0.9, Rock: 0.95, Slate: 0.9, Basalt: 0.9, Concrete: 0.9,
  Brick: 0.9, Cobblestone: 0.95, Wood: 0.8, WoodPlanks: 0.8, Fabric: 1, Granite: 0.7, Pebble: 0.95, CrackedLava: 0.8, Sandstone: 0.9,
};

/**
 * Maps Roblox material + color + transparency to three.js standard material settings.
 * Neon parts glow (bloom picks them up), metals reflect, glass and ice are see-through.
 * @param material - Roblox material name
 * @param color - hex color
 * @param transparency - 0..1
 * @param reflectance - 0..1
 * @returns props for `meshStandardMaterial`
 */
export function materialProps(material = 'Plastic', color = '#a3a2a5', transparency = 0, reflectance = 0) {
  const base = {
    color,
    transparent: transparency > 0 || material === 'Glass' || material === 'ForceField',
    opacity: 1 - transparency,
    roughness: ROUGH[material] ?? 0.7,
    metalness: Math.min(1, reflectance * 0.8),
    emissive: '#000000',
    emissiveIntensity: 0,
    toneMapped: true,
    depthWrite: true,
  };
  if (material === 'Neon') { base.emissive = color; base.emissiveIntensity = 2.2; base.toneMapped = false; }
  if (material === 'CrackedLava') { base.emissive = color; base.emissiveIntensity = 0.55; }
  if (material === 'Metal' || material === 'DiamondPlate' || material === 'CorrodedMetal' || material === 'Foil') {
    base.metalness = Math.max(base.metalness, material === 'Foil' ? 0.95 : 0.75);
  }
  if (material === 'Glass' || material === 'Ice') { base.opacity = Math.min(base.opacity, 0.55); base.depthWrite = false; }
  if (material === 'ForceField') { base.opacity = Math.min(base.opacity, 0.3); base.emissive = color; base.emissiveIntensity = 0.8; base.depthWrite = false; }
  if (base.opacity <= 0.01) base.depthWrite = false;
  return base;
}

/** Visual for a TrussPart: four rods with rungs every 2 studs, like Roblox's climbable truss. */
function TrussVisual({ size, color }: { size: Vec3; color: string }) {
  const rungs = Math.max(1, Math.floor(size[1] / 2));
  const [hx, hy, hz] = [size[0] / 2 - 0.15, size[1] / 2, size[2] / 2 - 0.15];
  const mat = <meshStandardMaterial color={color} metalness={0.7} roughness={0.35} />;
  return (
    <group>
      {[[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0, z]} castShadow geometry={boxGeo} scale={[0.3, size[1], 0.3]}>{mat}</mesh>
      ))}
      {Array.from({ length: rungs }, (_, i) => {
        const y = -hy + (i + 0.5) * (size[1] / rungs);
        return (
          <group key={i} position={[0, y, 0]}>
            <mesh geometry={boxGeo} scale={[size[0], 0.2, 0.2]} position={[0, 0, -hz]} castShadow>{mat}</mesh>
            <mesh geometry={boxGeo} scale={[size[0], 0.2, 0.2]} position={[0, 0, hz]} castShadow>{mat}</mesh>
            <mesh geometry={boxGeo} scale={[0.2, 0.2, size[2]]} position={[-hx, 0, 0]} castShadow>{mat}</mesh>
            <mesh geometry={boxGeo} scale={[0.2, 0.2, size[2]]} position={[hx, 0, 0]} castShadow>{mat}</mesh>
          </group>
        );
      })}
      {/* invisible hit box for selection */}
      <mesh geometry={boxGeo} scale={size}><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>
  );
}

/**
 * Props for {@link PartVisual}.
 */
export type PartVisualProps = {
  /** Part instance to render. */
  inst: PlaceInstance;
  /** Override opacity multiplier (used by disappearing tiles in playtest). */
  fade?: number;
  /** Click handler (edit mode selection). */
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  /** Extra children rendered inside the part's local space (selection outline). */
  children?: ReactNode;
  /** Render at the origin (the caller positions a parent group, e.g. a physics body). */
  local?: boolean;
};

/**
 * Renders one Roblox part (Block/Ball/Cylinder, TrussPart or SpawnLocation) with Roblox-like materials.
 * Position/rotation are applied to the outer group; size is applied as scale to the mesh.
 */
export const PartVisual = forwardRef<THREE.Group, PartVisualProps>(function PartVisual({ inst, fade = 1, onClick, children, local }, ref) {
  const p = inst.props;
  const size = (p.size || [4, 1, 2]) as Vec3;
  const rot = useMemo(() => (p.rotation || [0, 0, 0]).map((d) => d * DEG) as Vec3, [p.rotation]);
  const mat = materialProps(p.material, p.color, 1 - (1 - (p.transparency ?? 0)) * fade, p.reflectance);
  const shadow = p.castShadow !== false && mat.opacity > 0.3;
  const map = useMemo(() => tiledTexture(p.material || 'Plastic', size[0], size[2]), [p.material, size[0], size[2]]);
  const groupProps = local ? {} : { position: (p.position || [0, 0, 0]) as Vec3, rotation: rot };

  if (mat.opacity <= 0.01 && !onClick) return null;

  return (
    <group ref={ref} {...groupProps} onClick={onClick}>
      {inst.className === 'TrussPart' ? (
        <TrussVisual size={size} color={p.color || '#9ca3af'} />
      ) : (
        <mesh geometry={geometryFor(inst)} scale={size} castShadow={shadow} receiveShadow>
          <meshStandardMaterial {...mat} map={map} />
        </mesh>
      )}
      {inst.className === 'SpawnLocation' && (
        <mesh position={[0, size[1] / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.min(size[0], size[2]) * 0.18, Math.min(size[0], size[2]) * 0.3, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
        </mesh>
      )}
      {children}
    </group>
  );
});
