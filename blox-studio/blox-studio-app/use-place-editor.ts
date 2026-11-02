import { useCallback, useMemo, useRef, useState } from 'react';
import {
  createInstance,
  newInstanceId,
  SERVICE_CLASSES,
  type ClassName,
  type InstanceProps,
  type PlaceInstance,
} from '@nikethbhat4thh/blox-studio.rbxlx-serializer';

/**
 * Active transform tool, like Roblox Studio's Select / Move / Scale / Rotate.
 */
export type Tool = 'select' | 'move' | 'scale' | 'rotate';

/**
 * State and actions for editing a place.
 */
export type PlaceEditor = ReturnType<typeof usePlaceEditor>;

/**
 * Returns all descendant ids of an instance (inclusive).
 * @param instances - all instances
 * @param id - root id
 * @returns set of ids
 */
export function subtreeIds(instances: PlaceInstance[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    instances.forEach((i) => {
      if (i.parentId && ids.has(i.parentId) && !ids.has(i.id)) { ids.add(i.id); grew = true; }
    });
  }
  return ids;
}

/**
 * Hook managing the instance tree, selection, tool and undo/redo history of a place.
 * @param initial - initial instances
 * @param onChange - called with instances after every committed change
 * @returns editor state and actions
 */
export function usePlaceEditor(initial: PlaceInstance[], onChange?: (instances: PlaceInstance[]) => void) {
  const [instances, setInstances] = useState<PlaceInstance[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const past = useRef<PlaceInstance[][]>([]);
  const future = useRef<PlaceInstance[][]>([]);
  const [, force] = useState(0);
  const current = useRef(instances);
  current.current = instances;

  const commit = useCallback((next: PlaceInstance[]) => {
    past.current.push(current.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    current.current = next;
    setInstances(next);
    onChange?.(next);
  }, [onChange]);

  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  const selected = selectedId ? byId.get(selectedId) || null : null;

  const updateProps = useCallback((id: string, props: InstanceProps) => {
    commit(current.current.map((i) => (i.id === id ? { ...i, props: { ...i.props, ...props } } : i)));
  }, [commit]);

  const rename = useCallback((id: string, name: string) => {
    commit(current.current.map((i) => (i.id === id ? { ...i, name } : i)));
  }, [commit]);

  const insert = useCallback((className: ClassName, parentId?: string | null, props?: InstanceProps, name?: string) => {
    const parent = parentId ?? 'Workspace';
    const inst = createInstance(className, parent, props, name);
    commit([...current.current, inst]);
    setSelectedId(inst.id);
    return inst;
  }, [commit]);

  const remove = useCallback((id: string) => {
    const target = current.current.find((i) => i.id === id);
    if (!target || SERVICE_CLASSES.includes(target.className)) return;
    const ids = subtreeIds(current.current, id);
    commit(current.current.filter((i) => !ids.has(i.id)));
    setSelectedId(null);
  }, [commit]);

  const duplicate = useCallback((id: string) => {
    const target = current.current.find((i) => i.id === id);
    if (!target || SERVICE_CLASSES.includes(target.className)) return;
    const ids = subtreeIds(current.current, id);
    const map = new Map<string, string>();
    ids.forEach((old) => map.set(old, newInstanceId()));
    const copies = current.current.filter((i) => ids.has(i.id)).map((i) => {
      const props = { ...i.props };
      if (props.position) props.position = [props.position[0] + 2, props.position[1], props.position[2] + 2];
      return { ...i, id: map.get(i.id)!, parentId: i.id === id ? i.parentId : map.get(i.parentId!)!, props };
    });
    commit([...current.current, ...copies]);
    setSelectedId(map.get(id)!);
  }, [commit]);

  const reparent = useCallback((id: string, parentId: string) => {
    if (subtreeIds(current.current, id).has(parentId)) return;
    commit(current.current.map((i) => (i.id === id ? { ...i, parentId } : i)));
  }, [commit]);

  const group = useCallback((id: string) => {
    const target = current.current.find((i) => i.id === id);
    if (!target || SERVICE_CLASSES.includes(target.className)) return;
    const model = createInstance('Model', target.parentId);
    commit([...current.current.map((i) => (i.id === id ? { ...i, parentId: model.id } : i)), model]);
    setSelectedId(model.id);
  }, [commit]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(current.current);
    current.current = prev;
    setInstances(prev);
    onChange?.(prev);
    force((n) => n + 1);
  }, [onChange]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    current.current = next;
    setInstances(next);
    onChange?.(next);
    force((n) => n + 1);
  }, [onChange]);

  return {
    instances, byId, selected, selectedId, setSelectedId, tool, setTool,
    updateProps, rename, insert, remove, duplicate, reparent, group, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}
