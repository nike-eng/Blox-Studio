import { createInstance, SERVICE_CLASSES, type ClassName, type PlaceInstance, type Vec3 } from '@robloc/blox-studio.rbxlx-serializer';
import { Color3, Interpreter, LuaTable, LuauError, Multi, Vector3, tostr, type HostObject } from './luau-lite.js';

/** One line shown in the Output panel. */
export type OutputKind = 'print' | 'warn' | 'error' | 'info';
export type OutputLine = { id: number; kind: OutputKind; text: string; time: number };

const PART_CLASSES = ['Part', 'TrussPart', 'SpawnLocation'];
const CREATABLE: Record<string, { cls: ClassName; props?: Record<string, unknown> }> = {
  Part: { cls: 'Part' }, TrussPart: { cls: 'TrussPart' }, SpawnLocation: { cls: 'SpawnLocation' },
  WedgePart: { cls: 'Part', props: { shape: 'Wedge' } }, CornerWedgePart: { cls: 'Part', props: { shape: 'CornerWedge' } },
  Model: { cls: 'Model' }, Folder: { cls: 'Folder' },
  Script: { cls: 'Script' }, LocalScript: { cls: 'LocalScript' }, ModuleScript: { cls: 'ModuleScript' },
  PointLight: { cls: 'PointLight' },
};
const EVENTS = new Set(['Touched', 'TouchEnded', 'Changed', 'ChildAdded', 'ChildRemoved', 'DescendantAdded', 'DescendantRemoving', 'Destroying', 'AncestryChanged', 'PlayerAdded', 'PlayerRemoving', 'Heartbeat', 'Stepped', 'RenderStepped', 'Died', 'MouseClick', 'Activated', 'ClickDetector']);
const SHAPES = ['Block', 'Ball', 'Cylinder', 'Wedge', 'CornerWedge'];
const SERVICE_STUBS = ['Players', 'RunService', 'TweenService', 'Debris', 'UserInputService', 'ServerStorage', 'StarterPlayer', 'Teams', 'CollectionService', 'HttpService', 'TextService', 'SoundService', 'MarketplaceService', 'ContextActionService', 'PathfindingService', 'PhysicsService'];

const vec = (v: Vec3 | undefined, d: Vec3): Vector3 => { const a = v || d; return new Vector3(a[0], a[1], a[2]); };
const toVec3 = (v: unknown, what: string): Vec3 => {
  if (!(v instanceof Vector3)) throw new LuauError(`${what} must be a Vector3 (use Vector3.new(x, y, z))`);
  return v.toArray();
};
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Everything a running script can see: a private copy of the place that is applied in one undo step at the end. */
class StudioContext {
  list: PlaceInstance[];
  detached: PlaceInstance[] = [];
  dirty = false;
  private refs = new Map<string, InstanceRef>();
  warned = new Set<string>();
  constructor(instances: PlaceInstance[], readonly it: Interpreter) {
    this.list = instances.map((i) => ({ ...i, props: { ...i.props } }));
  }
  find(id: string): PlaceInstance | undefined {
    return this.list.find((i) => i.id === id) || this.detached.find((i) => i.id === id);
  }
  isAttached(id: string): boolean { return this.list.some((i) => i.id === id); }
  ref(inst: PlaceInstance): InstanceRef {
    let r = this.refs.get(inst.id);
    if (!r) { r = new InstanceRef(this, inst.id); this.refs.set(inst.id, r); }
    return r;
  }
  kids(id: string): PlaceInstance[] {
    return [...this.list, ...this.detached].filter((i) => i.parentId === id);
  }
  subtree(id: string): PlaceInstance[] {
    const out: PlaceInstance[] = []; const stack = [id]; const all = [...this.list, ...this.detached];
    while (stack.length) {
      const cur = stack.pop()!;
      const self = all.find((i) => i.id === cur);
      if (self) out.push(self);
      all.filter((i) => i.parentId === cur).forEach((k) => stack.push(k.id));
    }
    return out;
  }
  /** Moves a subtree between the place and the "not in the game" pile. */
  setParent(inst: PlaceInstance, parent: PlaceInstance | null): void {
    if (SERVICE_CLASSES.includes(inst.className)) throw new LuauError(`The Parent property of ${inst.name} is locked`);
    if (parent && this.subtree(inst.id).some((s) => s.id === parent.id)) throw new LuauError('Attempt to set parent would result in a circular reference');
    const sub = this.subtree(inst.id); const ids = new Set(sub.map((s) => s.id));
    inst.parentId = parent ? parent.id : null;
    if (parent && !this.isAttached(parent.id)) {
      // parent itself is not in the game yet: keep the subtree with it
      this.list = this.list.filter((i) => !ids.has(i.id));
      this.detached = [...this.detached.filter((i) => !ids.has(i.id)), ...sub];
    } else if (parent) {
      this.detached = this.detached.filter((i) => !ids.has(i.id));
      this.list = [...this.list.filter((i) => !ids.has(i.id)), ...sub];
    } else {
      this.list = this.list.filter((i) => !ids.has(i.id));
      this.detached = [...this.detached.filter((i) => !ids.has(i.id)), ...sub];
    }
    this.dirty = true;
  }
  destroy(inst: PlaceInstance): void {
    if (SERVICE_CLASSES.includes(inst.className)) throw new LuauError(`The Parent property of ${inst.name} is locked`);
    const ids = new Set(this.subtree(inst.id).map((s) => s.id));
    this.list = this.list.filter((i) => !ids.has(i.id));
    this.detached = this.detached.filter((i) => !ids.has(i.id));
    this.dirty = true;
  }
  fullName(inst: PlaceInstance): string {
    const parts: string[] = []; let cur: PlaceInstance | undefined = inst;
    while (cur) { parts.unshift(cur.name); cur = cur.parentId ? this.find(cur.parentId) : undefined; }
    return parts.join('.');
  }
}

/** A script-visible wrapper around one instance of the place. */
class InstanceRef implements HostObject {
  typeName = 'Instance';
  constructor(private ctx: StudioContext, readonly id: string) {}
  private get inst(): PlaceInstance {
    const i = this.ctx.find(this.id);
    if (!i) throw new LuauError('This instance has been destroyed');
    return i;
  }
  toString(): string { const i = this.ctx.find(this.id); return i ? i.name : '[destroyed]'; }
  private className(i: PlaceInstance): string {
    if (i.className === 'Part' && i.props.shape === 'Wedge') return 'WedgePart';
    if (i.className === 'Part' && i.props.shape === 'CornerWedge') return 'CornerWedgePart';
    return i.className;
  }
  private isA(i: PlaceInstance, cls: string): boolean {
    const c = this.className(i);
    if (cls === c || cls === i.className || cls === 'Instance') return true;
    if (cls === 'BasePart' || cls === 'PVInstance') return PART_CLASSES.includes(i.className) || (cls === 'PVInstance' && i.className === 'Model');
    if (cls === 'Part' && i.className === 'Part') return true;
    if (cls === 'LuaSourceContainer') return ['Script', 'LocalScript', 'ModuleScript'].includes(i.className);
    if (cls === 'BaseScript') return ['Script', 'LocalScript'].includes(i.className);
    if (cls === 'Light') return i.className === 'PointLight';
    if (cls === 'Model') return i.className === 'Model';
    return false;
  }

  get(key: string): unknown {
    const i = this.inst; const p = i.props; const ctx = this.ctx;
    const isPart = PART_CLASSES.includes(i.className);
    switch (key) {
      case 'Name': return i.name;
      case 'ClassName': return this.className(i);
      case 'Parent': { const par = i.parentId ? ctx.find(i.parentId) : undefined; return par ? ctx.ref(par) : undefined; }
      case 'Position': if (isPart) return vec(p.position, [0, 0, 0]); break;
      case 'Size': if (isPart) return vec(p.size, [4, 1, 2]); break;
      case 'Orientation': case 'Rotation': if (isPart) return vec(p.rotation, [0, 0, 0]); break;
      case 'Color': if (isPart || i.className === 'PointLight') return Color3.fromHex(p.color || '#a3a2a5'); break;
      case 'Material': if (isPart) return p.material || 'Plastic'; break;
      case 'Shape': if (i.className === 'Part') return p.shape || 'Block'; break;
      case 'Transparency': if (isPart) return p.transparency ?? 0; break;
      case 'Reflectance': if (isPart) return p.reflectance ?? 0; break;
      case 'Anchored': if (isPart) return p.anchored !== false; break;
      case 'CanCollide': if (isPart) return p.canCollide !== false; break;
      case 'CastShadow': if (isPart) return p.castShadow !== false; break;
      case 'Source': if (['Script', 'LocalScript', 'ModuleScript'].includes(i.className)) return p.source || ''; break;
      case 'Brightness': case 'Range': case 'ClockTime': { const v = (p as Record<string, unknown>)[lowerFirst(key)]; if (v !== undefined) return v; break; }
      case 'Enabled': if (i.className === 'PointLight') return (p as Record<string, unknown>).enabled !== false; break;
      default: break;
    }
    // methods
    const self = this;
    switch (key) {
      case 'Destroy': case 'Remove': return () => { ctx.destroy(self.inst); };
      case 'ClearAllChildren': return () => { ctx.kids(self.id).forEach((k) => ctx.destroy(k)); };
      case 'GetChildren': return () => { const t = new LuaTable(); ctx.kids(self.id).forEach((k, n) => t.set(n + 1, ctx.ref(k))); return t; };
      case 'GetDescendants': return () => { const t = new LuaTable(); ctx.subtree(self.id).filter((s) => s.id !== self.id).forEach((k, n) => t.set(n + 1, ctx.ref(k))); return t; };
      case 'FindFirstChild': case 'WaitForChild': return (_s: unknown, name: unknown, recursive?: unknown) => {
        const pool = recursive ? ctx.subtree(self.id).filter((s) => s.id !== self.id) : ctx.kids(self.id);
        const f = pool.find((k) => k.name === tostr(name));
        return f ? ctx.ref(f) : undefined;
      };
      case 'FindFirstChildOfClass': case 'FindFirstChildWhichIsA': return (_s: unknown, cls: unknown) => {
        const f = ctx.kids(self.id).find((k) => (key === 'FindFirstChildOfClass' ? self.className(k) === tostr(cls) || k.className === tostr(cls) : self.isA(k, tostr(cls))));
        return f ? ctx.ref(f) : undefined;
      };
      case 'IsA': return (_s: unknown, cls: unknown) => self.isA(self.inst, tostr(cls));
      case 'IsDescendantOf': return (_s: unknown, other: unknown) => {
        if (!(other instanceof InstanceRef)) return false;
        let cur = self.inst.parentId;
        while (cur) { if (cur === other.id) return true; cur = ctx.find(cur)?.parentId ?? null; }
        return false;
      };
      case 'GetFullName': return () => ctx.fullName(self.inst);
      case 'Clone': return () => {
        const sub = ctx.subtree(self.id); const map = new Map<string, string>();
        const copies = sub.map((s) => { const c = createInstance(s.className, null, { ...s.props }, s.name); map.set(s.id, c.id); return c; });
        copies.forEach((c, n) => { const orig = sub[n]; c.parentId = n === 0 ? null : map.get(orig.parentId || '') ?? null; });
        ctx.detached.push(...copies);
        return ctx.ref(copies[0]);
      };
      case 'SetAttribute': return (_s: unknown, name: unknown, v: unknown) => { const pr = self.inst.props as Record<string, unknown>; pr.attributes = { ...((pr.attributes as object) || {}), [tostr(name)]: v }; ctx.dirty = true; };
      case 'GetAttribute': return (_s: unknown, name: unknown) => ((self.inst.props as Record<string, unknown>).attributes as Record<string, unknown> | undefined)?.[tostr(name)];
      case 'MoveTo': case 'PivotTo': case 'SetPrimaryPartCFrame': return () => { throw new LuauError(`${key} is not supported yet; set Position instead`); };
      default: break;
    }
    if (EVENTS.has(key)) return this.eventStub(key);
    const child = ctx.kids(this.id).find((k) => k.name === key);
    if (child) return ctx.ref(child);
    throw new LuauError(`${key} is not a valid member of ${this.className(i)} "${ctx.fullName(i)}"`);
  }

  private eventStub(name: string): HostObject {
    const ctx = this.ctx;
    const warn = () => {
      if (!ctx.warned.has(name)) { ctx.warned.add(name); ctx.it.out('warn', `The ${name} event does not run in the Command Bar yet, so Connect did nothing.`); }
    };
    const stub = new LuaTable();
    stub.set('Connect', () => { warn(); return undefined; });
    stub.set('Once', () => { warn(); return undefined; });
    stub.set('Wait', () => { warn(); return undefined; });
    return { typeName: 'RBXScriptSignal', get: (k: string) => stub.get(k), set: () => undefined, toString: () => `Signal ${name}` };
  }

  set(key: string, value: unknown): void {
    const i = this.inst; const p = i.props as Record<string, unknown>; const ctx = this.ctx;
    const isPart = PART_CLASSES.includes(i.className);
    const num = (what: string): number => { if (typeof value !== 'number') throw new LuauError(`${what} must be a number`); return value; };
    const bool = (what: string): boolean => { if (typeof value !== 'boolean') throw new LuauError(`${what} must be a boolean`); return value; };
    ctx.dirty = true;
    switch (key) {
      case 'Name': i.name = tostr(value); return;
      case 'Parent': {
        if (value == null) { ctx.setParent(i, null); return; }
        if (!(value instanceof InstanceRef)) throw new LuauError('Parent must be an Instance or nil');
        ctx.setParent(i, value.inst); return;
      }
      case 'Position': if (isPart) { p.position = toVec3(value, 'Position'); return; } break;
      case 'Size': if (isPart) { p.size = toVec3(value, 'Size').map((n) => Math.max(0.05, n)); return; } break;
      case 'Orientation': case 'Rotation': if (isPart) { p.rotation = toVec3(value, key); return; } break;
      case 'Color': if (isPart || i.className === 'PointLight') { if (!(value instanceof Color3)) throw new LuauError('Color must be a Color3 (use Color3.fromRGB(r, g, b))'); p.color = value.toHex(); return; } break;
      case 'Material': if (isPart) { p.material = tostr(value); return; } break;
      case 'Shape': if (i.className === 'Part') { const s = tostr(value); if (!SHAPES.includes(s)) throw new LuauError(`Shape must be one of ${SHAPES.join(', ')}`); p.shape = s; return; } break;
      case 'Transparency': if (isPart) { p.transparency = Math.max(0, Math.min(1, num('Transparency'))); return; } break;
      case 'Reflectance': if (isPart) { p.reflectance = Math.max(0, Math.min(1, num('Reflectance'))); return; } break;
      case 'Anchored': if (isPart) { p.anchored = bool('Anchored'); return; } break;
      case 'CanCollide': if (isPart) { p.canCollide = bool('CanCollide'); return; } break;
      case 'CastShadow': if (isPart) { p.castShadow = bool('CastShadow'); return; } break;
      case 'Source': if (['Script', 'LocalScript', 'ModuleScript'].includes(i.className)) { p.source = tostr(value); return; } break;
      case 'Brightness': case 'Range': case 'ClockTime': if (i.className === 'PointLight' || i.className === 'Lighting') { p[lowerFirst(key)] = num(key); return; } break;
      case 'Enabled': if (i.className === 'PointLight') { p.enabled = bool('Enabled'); return; } break;
      default: break;
    }
    ctx.dirty = false;
    throw new LuauError(`${key} is not a valid member of ${this.className(i)} (or cannot be set in Blox Studio yet)`);
  }
}

/** Makes `Enum.Anything.Anything` evaluate to the second name, e.g. Enum.Material.Neon → "Neon". */
function enumObject(): HostObject {
  const group = (name: string): HostObject => ({ typeName: 'Enum', get: (k) => k, set: () => undefined, toString: () => `Enum.${name}` });
  return { typeName: 'Enums', get: (k) => group(k), set: () => undefined, toString: () => 'Enum' };
}

export type RunResult = { ok: boolean; instances: PlaceInstance[]; changed: boolean };

/**
 * Runs a Luau script against a copy of the place. The caller applies `instances` when `changed`.
 * @param source - script text
 * @param instances - the place
 * @param opts - output callback, chunk name, the script instance being run, and a hook to receive the interpreter (for Stop)
 */
export async function runStudioScript(
  source: string,
  instances: PlaceInstance[],
  opts: { chunk?: string; scriptId?: string; out: (kind: OutputKind, text: string) => void; onStart?: (it: Interpreter) => void },
): Promise<RunResult> {
  const it = new Interpreter(opts.out);
  const ctx = new StudioContext(instances, it);
  opts.onStart?.(it);
  const ws = ctx.find('Workspace');
  const game: HostObject = {
    typeName: 'DataModel',
    toString: () => 'Game',
    set: () => undefined,
    get: (k: string) => {
      if (k === 'GetService' || k === 'FindService') {
        return (_s: unknown, name: unknown) => {
          const n = tostr(name);
          const inst = ctx.find(n);
          if (inst && SERVICE_CLASSES.includes(inst.className)) return ctx.ref(inst);
          if (SERVICE_STUBS.includes(n)) throw new LuauError(`${n} is not available in the Command Bar yet (it works in published games)`);
          throw new LuauError(`'${n}' is not a valid Service name`);
        };
      }
      const inst = ctx.find(k);
      if (inst && SERVICE_CLASSES.includes(inst.className)) return ctx.ref(inst);
      if (k === 'Name') return 'Game';
      throw new LuauError(`${k} is not a valid member of DataModel "Game"`);
    },
  };
  it.setGlobal('game', game);
  if (ws) it.setGlobal('workspace', ctx.ref(ws));
  it.setGlobal('Enum', enumObject());
  const instanceLib = new LuaTable();
  instanceLib.set('new', (cls: unknown, parent?: unknown) => {
    const name = tostr(cls); const def = CREATABLE[name];
    if (!def) throw new LuauError(`Unable to create an Instance of type "${name}" (Blox Studio supports: ${Object.keys(CREATABLE).join(', ')})`);
    const inst = createInstance(def.cls, null, (def.props || {}) as never, name === 'WedgePart' ? 'Wedge' : name === 'CornerWedgePart' ? 'CornerWedge' : undefined);
    if (def.cls === 'Part' && def.props?.shape) (inst.props as Record<string, unknown>).size = [4, 4, 4];
    ctx.detached.push(inst);
    ctx.dirty = true;
    const r = ctx.ref(inst);
    if (parent instanceof InstanceRef) r.set('Parent', parent);
    return r;
  });
  it.setGlobal('Instance', instanceLib);
  if (opts.scriptId) { const s = ctx.find(opts.scriptId); if (s) it.setGlobal('script', ctx.ref(s)); }
  const res = await it.run(source, opts.chunk || 'Command');
  return { ok: res.ok, instances: ctx.list, changed: ctx.dirty };
}

export { Multi };
