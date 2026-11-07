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
  picked?: boolean;
  onSelect: (id: string, add?: boolean) => void;
  registerRef: (obj: THREE.Group | null) => void;
};

function EditablePart({ inst, selected, picked = false, onSelect, registerRef }: EditablePartProps) {
  const p = inst.props;
  const size = (p.size || [4, 1, 2]) as Vec3;
  const badge = p.behavior && p.behavior !== 'none' ? BEHAVIOR_BADGE[p.behavior] : null;
  return (
    <>
      <PartVisual
        ref={selected ? registerRef : undefined}
        inst={inst}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(inst.id, e.shiftKey || e.ctrlKey || e.metaKey); }}
      >
        {(selected || picked) && (
          <mesh geometry={geometryFor(inst)} scale={size}>
            <meshBasicMaterial visible={false} />
            <Edges color={selected ? '#00a2ff' : '#7fd0ff'} lineWidth={selected ? 2 : 1.5} />
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
  /** Filled with a function that points the camera at a position. */
  focusRef?: MutableRefObject<(pos: Vec3) => void>;
  /** Snap amounts in studs and degrees (0 means off). */
  snap?: { studs: number; degrees: number };
  /** When true, tapping a part adds or removes it from the picks (touch-friendly). */
  multiMode?: boolean;
  /** Move and Rotate along the world axes or the part's own axes. */
  space?: 'world' | 'local';
};

/**
 * Interactive 3D viewport: renders Workspace parts with Roblox-like lighting and materials,
 * and provides Roblox-style move/scale/rotate gizmos.
 */
export function Viewport({ editor, insertPointRef, focusRef, snap = { studs: 1, degrees: 15 }, space = 'world', multiMode = false }: ViewportProps) {
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

  // Start the camera looking at the middle of what you built, or at the spawn area of an empty place.
  const start = useRef<{ target: Vec3; camera: Vec3 } | null>(null);
  if (!start.current) {
    const small = parts.filter((p) => Math.max(...((p.props.size || [4, 1, 2]) as Vec3)) < 200 && p.props.position);
    const t: Vec3 = small.length
      ? [
          small.reduce((a, p) => a + p.props.position![0], 0) / small.length,
          Math.max(2, small.reduce((a, p) => a + p.props.position![1], 0) / small.length),
          small.reduce((a, p) => a + p.props.position![2], 0) / small.length,
        ]
      : [0, 2, 0];
    start.current = { target: t, camera: [t[0] + 34, t[1] + 30, t[2] + 44] };
  }

  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = (pos: Vec3) => {
      const c = controlsRef.current;
      if (!c) return;
      const cam = c.object as THREE.Camera;
      const delta = new THREE.Vector3(pos[0], pos[1], pos[2]).sub(c.target);
      c.target.add(delta);
      cam.position.add(delta);
      c.update();
    };
  }, [focusRef]);

  useEffect(() => {
    insertPointRef.current = () => {
      const t = controlsRef.current?.target as THREE.Vector3 | undefined;
      return t ? [Math.round(t.x), Math.max(1, Math.round(t.y) + 4), Math.round(t.z)] : [0, 5, 0];
    };
  }, [insertPointRef]);

  const mode = tool === 'move' ? 'translate' : tool === 'scale' ? 'scale' : 'rotate';

  const commitTransform = () => {
    if (!target || !selectedId) return;
    const inst = byId.get(selectedId);
    const size = (inst?.props.size || [4, 1, 2]) as Vec3;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const mainUpdate = {
      position: [r(target.position.x), r(target.position.y), r(target.position.z)] as Vec3,
      rotation: [r(target.rotation.x / DEG), r(target.rotation.y / DEG), r(target.rotation.z / DEG)] as Vec3,
      size: [Math.max(0.2, r(size[0] * target.scale.x)), Math.max(0.2, r(size[1] * target.scale.y)), Math.max(0.2, r(size[2] * target.scale.z))] as Vec3,
    };
    const updates: Record<string, typeof mainUpdate> = { [selectedId]: mainUpdate };
    // Everything else that is picked follows the same move / turn / resize.
    const others = editor.multiIds.map((id) => byId.get(id)).filter((i): i is PlaceInstance => !!i && PART_CLASSES.includes(i.className));
    if (others.length && inst) {
      const matrixOf = (pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0]) =>
        new THREE.Matrix4().compose(
          new THREE.Vector3(pos[0], pos[1], pos[2]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG)),
          new THREE.Vector3(1, 1, 1),
        );
      const before = matrixOf(inst.props.position, inst.props.rotation);
      const after = matrixOf(mainUpdate.position, mainUpdate.rotation);
      const delta = after.clone().multiply(before.clone().invert());
      const ratio = [mainUpdate.size[0] / size[0], mainUpdate.size[1] / size[1], mainUpdate.size[2] / size[2]];
      const resized = mode === 'scale';
      for (const o of others) {
        const m = delta.clone().multiply(matrixOf(o.props.position, o.props.rotation));
        const pos = new THREE.Vector3(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
        m.decompose(pos, q, sc);
        const e = new THREE.Euler().setFromQuaternion(q);
        const osize = (o.props.size || [4, 1, 2]) as Vec3;
        updates[o.id] = {
          position: [r(pos.x), r(pos.y), r(pos.z)],
          rotation: mode === 'scale' ? ((o.props.rotation || [0, 0, 0]) as Vec3) : [r(e.x / DEG), r(e.y / DEG), r(e.z / DEG)],
          size: resized ? [Math.max(0.2, r(osize[0] * ratio[0])), Math.max(0.2, r(osize[1] * ratio[1])), Math.max(0.2, r(osize[2] * ratio[2]))] : osize,
        };
        if (mode === 'scale') updates[o.id].position = (o.props.position || [0, 0, 0]) as Vec3;
      }
    }
    editor.updateMany(updates);
    target.scale.set(1, 1, 1);
  };

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ powerPreference: 'high-performance' }}
      camera={{ position: start.current.camera, fov: 60, near: 0.5, far: 5000 }}
      onPointerMissed={() => { if (!draggingRef.current) setSelectedId(null); }}
    >
      <SceneEnvironment lighting={lighting} focus={[0, 0, -60]} pointLights={pointLights} />
      {parts.map((inst) => (
        <EditablePart
          key={inst.id}
          inst={inst}
          selected={inst.id === selectedId}
          picked={editor.multiIds.includes(inst.id)}
          onSelect={(id, add) => (add || multiMode ? editor.toggleMulti(id) : setSelectedId(id))}
          registerRef={setTarget}
        />
      ))}
      {target && selectedIsPart && tool !== 'select' && (
        <TransformControls
          key={selectedId}
          object={target}
          mode={mode}
          space={mode === 'scale' ? 'local' : space}
          translationSnap={snap.studs || null}
          rotationSnap={snap.degrees ? snap.degrees * DEG : null}
          scaleSnap={snap.studs ? Math.min(snap.studs, 1) / 2 || 0.1 : null}
          onMouseDown={() => { draggingRef.current = true; }}
          onMouseUp={() => { commitTransform(); setTimeout(() => { draggingRef.current = false; }, 80); }}
        />
      )}
      <OrbitControls ref={controlsRef} makeDefault target={start.current.target} maxPolarAngle={Math.PI * 0.495} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport axisColors={['#ff4d4d', '#45d17a', '#3d8bff']} labelColor="#fff" />
      </GizmoHelper>
    </Canvas>
  );
}
