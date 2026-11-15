import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { PlaceInstance, Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { DEG, geometryFor, materialProps } from './part-visual.js';
import { tiledTexture } from './material-textures.js';

/**
 * True for plain solid parts (no texture, no glow, not see-through) that can be drawn together with
 * thousands of others in a single draw call. Everything else is drawn one by one by PartVisual.
 */
export function canBatch(inst: PlaceInstance): boolean {
  if (inst.className !== 'Part') return false;
  const p = inst.props;
  if ((p.transparency ?? 0) > 0) return false;
  const m = materialProps(p.material, p.color, 0, p.reflectance);
  if (m.transparent || m.emissiveIntensity > 0) return false;
  return tiledTexture(p.material || 'Plastic', 4, 4) === null;
}

type GroupProps = { parts: PlaceInstance[]; onPick: (id: string, add: boolean) => void };

/** One draw call for every part that shares a shape and a material. Colour, position, rotation and size are per part. */
function BatchGroup({ parts, onPick }: GroupProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const first = parts[0];
  const geometry = useMemo(() => geometryFor(first), [first.props.shape, first.className]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = materialProps(first.props.material, '#ffffff', 0, first.props.reflectance);
  const shadow = first.props.castShadow !== false;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();
    parts.forEach((inst, i) => {
      const p = inst.props;
      const pos = (p.position || [0, 0, 0]) as Vec3, rot = (p.rotation || [0, 0, 0]) as Vec3, size = (p.size || [4, 1, 2]) as Vec3;
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
      dummy.scale.set(size[0], size[1], size[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colour.set(p.color || '#a3a2a5'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, parts.length]}
      castShadow={shadow}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.instanceId == null) return;
        e.stopPropagation();
        onPick(parts[e.instanceId].id, e.shiftKey || e.ctrlKey || e.metaKey);
      }}
    >
      <meshStandardMaterial {...mat} />
    </instancedMesh>
  );
}

/**
 * Draws plain parts in batches. Drawing 1,000 parts one by one costs about 1,000 draw calls per frame and makes
 * phones hot and slow; here it costs a handful.
 */
export function BatchedParts({ parts, onPick }: { parts: PlaceInstance[]; onPick: (id: string, add: boolean) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, PlaceInstance[]>();
    for (const inst of parts) {
      const p = inst.props;
      const key = `${inst.className}|${p.shape ?? 'Block'}|${p.material ?? 'Plastic'}|${p.reflectance ?? 0}|${p.castShadow !== false}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(inst);
    }
    return [...map.entries()];
  }, [parts]);
  return (
    <>
      {groups.map(([key, list]) => <BatchGroup key={`${key}#${list.length}`} parts={list} onPick={onPick} />)}
    </>
  );
}
