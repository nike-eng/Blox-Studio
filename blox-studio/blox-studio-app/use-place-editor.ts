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
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('move');
  /** Plain selection: picks one object and drops any extra picks. */
  const setSelectedId = useCallback((id: string | null) => { setSelectedIdRaw(id); setMultiIds([]); }, []);
  const past = useRef<PlaceInstance[][]>([]);
  const future = useRef<PlaceInstance[][]>([]);
  const [, force] = useState(0);
  const clipboard = useRef<{ items: PlaceInstance[]; root: string } | null>(null);
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

  /** Replaces the whole place in one undo step (used by scripts). */
  const setAll = useCallback((next: PlaceInstance[]) => { commit(next); }, [commit]);

  /** Updates several instances in one undo step. */
  const updateMany = useCallback((updates: Record<string, InstanceProps>) => {
    commit(current.current.map((i) => (updates[i.id] ? { ...i, props: { ...i.props, ...updates[i.id] } } : i)));
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

  const copy = useCallback((id: string) => {
    const target = current.current.find((i) => i.id === id);
    if (!target || SERVICE_CLASSES.includes(target.className)) return;
    const ids = subtreeIds(current.current, id);
    clipboard.current = { items: current.current.filter((i) => ids.has(i.id)), root: id };
    force((n) => n + 1);
  }, []);

  const paste = useCallback((parentId?: string | null) => {
    const clip = clipboard.current;
    if (!clip) return;
    const rootItem = clip.items.find((i) => i.id === clip.root);
    if (!rootItem) return;
    const wanted = parentId ?? rootItem.parentId ?? 'Workspace';
    const parent = current.current.some((i) => i.id === wanted) ? wanted : 'Workspace';
    const map = new Map<string, string>();
    clip.items.forEach((i) => map.set(i.id, newInstanceId()));
    const copies = clip.items.map((i) => {
      const props = { ...i.props };
      if (props.position) props.position = [props.position[0] + 2, props.position[1], props.position[2] + 2];
      return { ...i, id: map.get(i.id)!, parentId: i.id === clip.root ? parent : map.get(i.parentId!)!, props };
    });
    commit([...current.current, ...copies]);
    setSelectedId(map.get(clip.root)!);
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

  /** Adds or removes an object from the extra picks (Shift/Ctrl-click, or "Select multiple" on touch). */
  const toggleMulti = useCallback((id: string) => {
    if (SERVICE_CLASSES.includes(current.current.find((i) => i.id === id)?.className as ClassName)) return;
    if (!selectedId) { setSelectedIdRaw(id); return; }
    if (id === selectedId) return;
    setMultiIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }, [selectedId]);

  /** Everything currently picked, main object first. */
  const pickedIds = useMemo(() => (selectedId ? [selectedId, ...multiIds] : []), [selectedId, multiIds]);

  /** Only the top-most picks (a child is skipped when its parent is also picked). */
  const topPicks = (ids: string[]) => {
    const set = new Set(ids);
    return ids.filter((id) => {
      let p = current.current.find((i) => i.id === id)?.parentId;
      while (p) { if (set.has(p)) return false; p = current.current.find((i) => i.id === p)?.parentId; }
      return !SERVICE_CLASSES.includes(current.current.find((i) => i.id === id)?.className as ClassName);
    });
  };

  const removeMany = useCallback((ids: string[]) => {
    const tops = topPicks(ids);
    if (!tops.length) return;
    const gone = new Set<string>();
    tops.forEach((id) => subtreeIds(current.current, id).forEach((x) => gone.add(x)));
    commit(current.current.filter((i) => !gone.has(i.id)));
    setSelectedId(null);
  }, [commit, setSelectedId]);

  const duplicateMany = useCallback((ids: string[]) => {
    const tops = topPicks(ids);
    if (!tops.length) return;
    const all: PlaceInstance[] = [];
    const newTops: string[] = [];
    tops.forEach((root) => {
      const sub = subtreeIds(current.current, root);
      const map = new Map<string, string>();
      sub.forEach((old) => map.set(old, newInstanceId()));
      current.current.filter((i) => sub.has(i.id)).forEach((i) => {
        const props = { ...i.props };
        if (props.position) props.position = [props.position[0] + 2, props.position[1], props.position[2] + 2];
        all.push({ ...i, id: map.get(i.id)!, parentId: i.id === root ? i.parentId : map.get(i.parentId!)!, props });
      });
      newTops.push(map.get(root)!);
    });
    commit([...current.current, ...all]);
    setSelectedIdRaw(newTops[0]);
    setMultiIds(newTops.slice(1));
  }, [commit]);

  const groupMany = useCallback((ids: string[]) => {
    const tops = topPicks(ids);
    if (!tops.length) return;
    const first = current.current.find((i) => i.id === tops[0])!;
    const model = createInstance('Model', first.parentId);
    const set = new Set(tops);
    commit([...current.current.map((i) => (set.has(i.id) ? { ...i, parentId: model.id } : i)), model]);
    setSelectedId(model.id);
  }, [commit, setSelectedId]);

  /** Opposite of Group: moves the children of a Model or Folder up one level and removes the empty container. */
  const ungroup = useCallback((id: string) => {
    const target = current.current.find((i) => i.id === id);
    if (!target || (target.className !== 'Model' && target.className !== 'Folder')) return;
    const parent = target.parentId ?? 'Workspace';
    commit(current.current.filter((i) => i.id !== id).map((i) => (i.parentId === id ? { ...i, parentId: parent } : i)));
    setSelectedId(null);
  }, [commit, setSelectedId]);

  /** Cut = copy, then delete. */
  const cut = useCallback((id: string) => {
    const target = current.current.find((i) => i.id === id);
    if (!target || SERVICE_CLASSES.includes(target.className)) return;
    const ids = subtreeIds(current.current, id);
    clipboard.current = { items: current.current.filter((i) => ids.has(i.id)), root: id };
    commit(current.current.filter((i) => !ids.has(i.id)));
    setSelectedId(null);
  }, [commit, setSelectedId]);

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
    instances, byId, selected, selectedId, setSelectedId, multiIds, pickedIds, toggleMulti, tool, setTool,
    removeMany, duplicateMany, groupMany, ungroup, cut,
    updateProps, updateMany, setAll, rename, insert, remove, duplicate, copy, paste, canPaste: !!clipboard.current, reparent, group, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}
