import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport, Edges, Html } from '@react-three/drei';
import { PART_CLASSES, type PlaceInstance, type Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import type { PlaceEditor } from './use-place-editor.js';
import { subtreeIds } from './use-place-editor.js';
import { DEG, PartVisual, geometryFor } from './part-visual.js';
import { SceneEnvironment } from './scene-environment.js';
import styles from './studio.module.css';

const BEHAVIOR_BADGE: Record<string, { label: string; color: string }> = {
  kill: { label: '☠ Kill', color: '#ef4444' },
  checkpoint: { label: '⚑ Checkpoint', color: '#22c55e' },
  finish: { label: '🏆 Finish', color: '#eab308' },
  jumpPad: { label: '⇪ Jump pad', color: '#4ade80' },
  fade: { label: '◌ Disappears', color: '#38bdf8' },
};

type EditablePartProps = {
  inst: PlaceInstance;
  selected: boolean;
  onSelect: (id: string) => void;
  registerRef: (obj: THREE.Group | null) => void;
};

function EditablePart({ inst, selected, onSelect, registerRef }: EditablePartProps) {
  const p = inst.props;
  const size = (p.size || [4, 1, 2]) as Vec3;
  const badge = p.behavior && p.behavior !== 'none' ? BEHAVIOR_BADGE[p.behavior] : null;
  return (
    <>
      <PartVisual
        ref={selected ? registerRef : undefined}
        inst={inst}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(inst.id); }}
      >
        {selected && (
          <mesh geometry={geometryFor(inst)} scale={size}>
            <meshBasicMaterial visible={false} />
            <Edges color="#00a2ff" lineWidth={2} />
          </mesh>
        )}
        {selected && (badge || p.motion === 'spin') && (
          <Html position={[0, size[1] / 2 + 1.5, 0]} center zIndexRange={[10, 0]}>
            <span className={styles.partBadge} style={{ borderColor: badge?.color || '#f59e0b' }}>
              {badge?.label}{p.motion === 'spin' ? ' ⟳ Spins' : ''}
            </span>
          </Html>
        )}
      </PartVisual>
      {selected && p.motion === 'move' && p.moveOffset && (
        <group
          position={[
            (p.position?.[0] ?? 0) + p.moveOffset[0],
            (p.position?.[1] ?? 0) + p.moveOffset[1],
            (p.position?.[2] ?? 0) + p.moveOffset[2],
          ]}
          rotation={(p.rotation || [0, 0, 0]).map((d) => d * DEG) as Vec3}
        >
          <mesh geometry={geometryFor(inst)} scale={size}>
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.25} depthWrite={false} />
            <Edges color="#f59e0b" />
          </mesh>
        </group>
      )}
    </>
  );
}

/**
 * Props for the 3D viewport.
 */
export type ViewportProps = {
  /** Place editor state. */
  editor: PlaceEditor;
  /** Filled with a function returning where new parts should be placed. */
  insertPointRef: MutableRefObject<() => Vec3>;
};

/**
 * Interactive 3D viewport: renders Workspace parts with Roblox-like lighting and materials,
 * and provides Roblox-style move/scale/rotate gizmos.
 */
export function Viewport({ editor, insertPointRef }: ViewportProps) {
  const { instances, selectedId, setSelectedId, tool, updateProps } = editor;
  const [target, setTarget] = useState<THREE.Group | null>(null);
  const draggingRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const workspaceIds = useMemo(() => subtreeIds(instances, 'Workspace'), [instances]);
  const parts = instances.filter((i) => PART_CLASSES.includes(i.className) && workspaceIds.has(i.id));
  const lighting = instances.find((i) => i.className === 'Lighting');
  const selectedIsPart = parts.some((p) => p.id === selectedId);
  const byId = editor.byId;
  const pointLights = instances
    .filter((i) => i.className === 'PointLight' && i.parentId)
    .map((l) => ({ id: l.id, position: (byId.get(l.parentId!)?.props.position || [0, 0, 0]) as Vec3, ...l.props }));

  useEffect(() => { if (!selectedIsPart) setTarget(null); }, [selectedIsPart]);

  useEffect(() => {
    insertPointRef.current = () => {
      const t = controlsRef.current?.target as THREE.Vector3 | undefined;
      return t ? [Math.round(t.x), Math.max(1, Math.round(t.y) + 4), Math.round(t.z)] : [0, 5, 0];
    };
  }, [insertPointRef]);

  const commitTransform = () => {
    if (!target || !selectedId) return;
    const inst = byId.get(selectedId);
    const size = (inst?.props.size || [4, 1, 2]) as Vec3;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    updateProps(selectedId, {
      position: [r(target.position.x), r(target.position.y), r(target.position.z)],
      rotation: [r(target.rotation.x / DEG), r(target.rotation.y / DEG), r(target.rotation.z / DEG)],
      size: [Math.max(0.2, r(size[0] * target.scale.x)), Math.max(0.2, r(size[1] * target.scale.y)), Math.max(0.2, r(size[2] * target.scale.z))],
    });
    target.scale.set(1, 1, 1);
  };

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ powerPreference: 'high-performance' }}
      camera={{ position: [46, 42, 60], fov: 60, near: 0.5, far: 5000 }}
      onPointerMissed={() => { if (!draggingRef.current) setSelectedId(null); }}
    >
      <SceneEnvironment lighting={lighting} focus={[0, 0, -60]} pointLights={pointLights} />
      {parts.map((inst) => (
        <EditablePart key={inst.id} inst={inst} selected={inst.id === selectedId} onSelect={setSelectedId} registerRef={setTarget} />
      ))}
      {target && selectedIsPart && tool !== 'select' && (
        <TransformControls
          key={selectedId}
          object={target}
          mode={tool === 'move' ? 'translate' : tool === 'scale' ? 'scale' : 'rotate'}
          translationSnap={1}
          rotationSnap={15 * DEG}
          scaleSnap={0.1}
          onMouseDown={() => { draggingRef.current = true; }}
          onMouseUp={() => { commitTransform(); setTimeout(() => { draggingRef.current = false; }, 80); }}
        />
      )}
      <OrbitControls ref={controlsRef} makeDefault target={[0, 5, -40]} maxPolarAngle={Math.PI * 0.495} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={['#ff4d4d', '#45d17a', '#3d8bff']} labelColor="#fff" />
      </GizmoHelper>
    </Canvas>
  );
}
