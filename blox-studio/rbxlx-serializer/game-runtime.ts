import { createInstance } from './place-factory.js';
import { SERVICE_CLASSES, SCRIPT_CLASSES, PART_CLASSES, type ClassName, type PlaceInstance, type Vec3 } from './place-types.js';
import { Color3, Interpreter, LuaTable, LuauError, Multi, Vector3, tostr, type HostObject } from './luau-lite.js';

/** Where a script runs. Both sides share one tree here (single player), like Roblox Studio's Play Solo. */
export type Side = 'server' | 'client';
export type OutKind = 'print' | 'warn' | 'error' | 'info';

type Rec = Record<string, unknown>;
const KNOWN = ['Workspace', 'Lighting', 'ReplicatedStorage', 'ServerScriptService', 'StarterGui', 'Part', 'TrussPart', 'SpawnLocation', 'Model', 'Folder', 'Script', 'LocalScript', 'ModuleScript', 'PointLight'];
/** Classes `Instance.new` can make. Anything outside the editor's own classes is kept as a plain bag of properties. */
const CREATABLE = new Set([...KNOWN.filter((c) => !SERVICE_CLASSES.includes(c as ClassName)), 'WedgePart', 'CornerWedgePart', 'BindableEvent', 'RemoteEvent', 'IntValue', 'NumberValue', 'StringValue', 'BoolValue', 'ObjectValue', 'ScreenGui', 'Frame', 'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ScrollingFrame', 'UIListLayout', 'UICorner', 'UIPadding', 'Sound', 'Humanoid']);
const VALUE_DEFAULT: Rec = { IntValue: 0, NumberValue: 0, StringValue: '', BoolValue: false };
const SHAPES = ['Block', 'Ball', 'Cylinder', 'Wedge', 'CornerWedge'];
const SERVICES = ['Workspace', 'Lighting', 'ReplicatedStorage', 'ServerScriptService', 'StarterGui', 'Players', 'RunService', 'TweenService', 'Debris', 'CollectionService', 'UserInputService', 'HttpService', 'DataStoreService'];

/** Part settings from Properties → Gameplay are visible to scripts as attributes (Behavior, Checkpoint, JumpPower, Motion, MoveTime, SpinSpeed). Real attributes win. */
const GAMEPLAY_ATTRS: [string, string][] = [['Behavior', 'behavior'], ['Checkpoint', 'checkpoint'], ['JumpPower', 'jumpPower'], ['Motion', 'motion'], ['MoveTime', 'moveTime'], ['SpinSpeed', 'spinSpeed']];
const attrsOf = (p: Rec): Rec => {
  const out: Rec = {};
  GAMEPLAY_ATTRS.forEach(([a, k]) => { const v = p[k]; if (v !== undefined && v !== 'none') out[a] = v; });
  return { ...out, ...((p.attributes as Rec) || {}) };
};
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const vec = (v: Vec3 | undefined, d: Vec3) => { const a = v || d; return new Vector3(a[0], a[1], a[2]); };
const toVec3 = (v: unknown, what: string): Vec3 => { if (!(v instanceof Vector3)) throw new LuauError(`${what} must be a Vector3`); return v.toArray(); };
const num = (v: unknown, what: string): number => { if (typeof v !== 'number') throw new LuauError(`${what} must be a number`); return v; };
const bad = (key: string, of: string): never => { throw new LuauError(`${key} is not a valid member of ${of}`); };

/** Builds a script-visible object from a plain record of members. */
function obj(typeName: string, members: Rec): HostObject {
  return { typeName, toString: () => typeName, set: () => undefined, get: (k) => (k in members ? members[k] : bad(k, typeName)) };
}

/** `Enum.Group.Name` evaluates to "Name" (strings compare equal, which is all scripts need). */
const enumObject = (): HostObject => ({ typeName: 'Enums', toString: () => 'Enum', set: () => undefined, get: (g) => ({ typeName: 'Enum', toString: () => `Enum.${g}`, set: () => undefined, get: (k: string) => k } as HostObject) });

/** Position-only CFrame: enough to read `.Position` and to teleport with `part.CFrame = CFrame.new(x, y, z)`. */
export class CFrameV implements HostObject {
  typeName = 'CFrame';
  constructor(readonly p: Vec3) {}
  toString() { return this.p.join(', '); }
  set(): void { /* read-only */ }
  get(k: string): unknown {
    switch (k) {
      case 'Position': return new Vector3(...this.p);
      case 'X': return this.p[0]; case 'Y': return this.p[1]; case 'Z': return this.p[2];
      default: return bad(k, 'CFrame');
    }
  }
  equals(o: unknown): boolean { return o instanceof CFrameV && o.p.every((n, i) => n === this.p[i]); }
}

/** The local player's body. The 3D world reads this every frame and writes `pos` back. */
export class CharacterState {
  pos: Vec3 = [0, 5, 0];
  health = 100; maxHealth = 100; walkSpeed = 16; jumpPower = 50;
  alive = true;
  /** Set by scripts that move the character; the world teleports there then clears it. */
  teleport: Vec3 | null = null;
  /** Set by scripts that push the character (e.g. `AssemblyLinearVelocity`); the world applies then clears it. */
  velocity: Vec3 | null = null;
  respawn = false;
}

/** A connection returned by `Connect`. */
function connection(off: () => void, isOn: () => boolean): HostObject {
  return { typeName: 'RBXScriptConnection', toString: () => 'Connection', set: () => undefined, get: (k) => (k === 'Disconnect' ? () => off() : k === 'Connected' ? isOn() : bad(k, 'RBXScriptConnection')) };
}

/** An event: `:Connect(fn)`, `:Once(fn)`, `:Wait()`. */
export class Signal implements HostObject {
  typeName = 'RBXScriptSignal';
  private conns: { fn: unknown; once: boolean; on: boolean }[] = [];
  private waiters: ((a: unknown[]) => void)[] = [];
  constructor(private rt: GameRuntime, readonly label: string) {}
  toString() { return `Signal ${this.label}`; }
  set(): void { /* read-only */ }
  /** Calls every connected function. The promise settles when they have all finished (or stopped to wait). */
  fire(...args: unknown[]): Promise<void> {
    const runs: Promise<void>[] = [];
    for (const c of [...this.conns]) { if (!c.on) continue; if (c.once) c.on = false; runs.push(this.rt.dispatch(c.fn, args)); }
    this.conns = this.conns.filter((c) => c.on);
    const w = this.waiters; this.waiters = []; w.forEach((f) => f(args));
    return Promise.all(runs).then(() => undefined);
  }
  get(k: string): unknown {
    switch (k) {
      case 'Connect': case 'Once': return (_s: unknown, fn: unknown) => {
        if (typeof fn !== 'function' && !(fn && typeof fn === 'object')) throw new LuauError('Argument 1 missing or nil (Connect needs a function)');
        const c = { fn, once: k === 'Once', on: true }; this.conns.push(c); this.rt.noteConnect(this.label);
        return connection(() => { c.on = false; }, () => c.on);
      };
      case 'Wait': return () => new Promise<Multi>((r) => this.waiters.push((a) => r(new Multi(a))));
      default: return bad(k, 'RBXScriptSignal');
    }
  }
}

/** The player's character (a Model with a Humanoid and a HumanoidRootPart). */
class CharacterRef implements HostObject {
  typeName = 'Instance';
  constructor(private rt: GameRuntime) {}
  toString() { return 'Player'; }
  set(): void { /* read-only */ }
  equals(o: unknown) { return o instanceof CharacterRef; }
  get(k: string): unknown {
    const rt = this.rt;
    switch (k) {
      case 'Name': return 'Player';
      case 'ClassName': return 'Model';
      case 'Parent': return rt.ref('Workspace');
      case 'Humanoid': return rt.humanoid;
      case 'HumanoidRootPart': case 'PrimaryPart': case 'Head': return rt.root;
      case 'FindFirstChild': case 'WaitForChild': return (_s: unknown, n: unknown) => (n === 'Humanoid' ? rt.humanoid : n === 'HumanoidRootPart' || n === 'Head' ? rt.root : undefined);
      case 'FindFirstChildOfClass': case 'FindFirstChildWhichIsA': return (_s: unknown, c: unknown) => (c === 'Humanoid' ? rt.humanoid : c === 'BasePart' || c === 'Part' ? rt.root : undefined);
      case 'IsA': return (_s: unknown, c: unknown) => c === 'Model' || c === 'Instance' || c === 'PVInstance';
      case 'GetFullName': return () => 'Workspace.Player';
      case 'GetPivot': return () => new CFrameV(rt.char.pos);
      case 'MoveTo': case 'PivotTo': return (_s: unknown, p: unknown) => { rt.char.teleport = p instanceof Vector3 ? p.toArray() : p instanceof CFrameV ? p.p : rt.char.teleport; };
      default: return bad(k, 'Model "Player"');
    }
  }
}

class RootRef implements HostObject {
  typeName = 'Instance';
  constructor(private rt: GameRuntime) {}
  toString() { return 'HumanoidRootPart'; }
  equals(o: unknown) { return o instanceof RootRef; }
  get(k: string): unknown {
    const rt = this.rt;
    switch (k) {
      case 'Name': return 'HumanoidRootPart';
      case 'ClassName': return 'Part';
      case 'Parent': return rt.character;
      case 'Position': return new Vector3(...rt.char.pos);
      case 'CFrame': return new CFrameV(rt.char.pos);
      case 'AssemblyLinearVelocity': case 'Velocity': return new Vector3(0, 0, 0);
      case 'IsA': return (_s: unknown, c: unknown) => c === 'BasePart' || c === 'Part' || c === 'Instance';
      case 'FindFirstChild': case 'FindFirstAncestorOfClass': return () => undefined;
      case 'GetFullName': return () => 'Workspace.Player.HumanoidRootPart';
      default: return bad(k, 'Part "HumanoidRootPart"');
    }
  }
  set(k: string, v: unknown): void {
    const c = this.rt.char;
    if (k === 'Position') c.teleport = toVec3(v, 'Position');
    else if (k === 'CFrame') { if (!(v instanceof CFrameV)) throw new LuauError('CFrame must be a CFrame (use CFrame.new(x, y, z))'); c.teleport = [...v.p] as Vec3; }
    else if (k === 'AssemblyLinearVelocity' || k === 'Velocity') c.velocity = toVec3(v, k);
    else bad(k, 'Part "HumanoidRootPart"');
  }
}

class HumanoidRef implements HostObject {
  typeName = 'Instance';
  constructor(private rt: GameRuntime) {}
  toString() { return 'Humanoid'; }
  equals(o: unknown) { return o instanceof HumanoidRef; }
  get(k: string): unknown {
    const rt = this.rt; const c = rt.char;
    switch (k) {
      case 'Name': return 'Humanoid';
      case 'ClassName': return 'Humanoid';
      case 'Parent': return rt.character;
      case 'Health': return c.health; case 'MaxHealth': return c.maxHealth;
      case 'WalkSpeed': return c.walkSpeed; case 'JumpPower': return c.jumpPower;
      case 'Died': return rt.signal('Humanoid', 'Died'); case 'HealthChanged': return rt.signal('Humanoid', 'HealthChanged');
      case 'TakeDamage': return (_s: unknown, n: unknown) => rt.setHealth(c.health - num(n, 'damage'));
      case 'IsA': return (_s: unknown, cl: unknown) => cl === 'Humanoid' || cl === 'Instance';
      case 'GetFullName': return () => 'Workspace.Player.Humanoid';
      default: return bad(k, 'Humanoid');
    }
  }
  set(k: string, v: unknown): void {
    const c = this.rt.char;
    if (k === 'Health') this.rt.setHealth(num(v, 'Health'));
    else if (k === 'MaxHealth') { c.maxHealth = Math.max(1, num(v, 'MaxHealth')); c.health = Math.min(c.health, c.maxHealth); }
    else if (k === 'WalkSpeed') c.walkSpeed = Math.max(0, num(v, 'WalkSpeed'));
    else if (k === 'JumpPower') c.jumpPower = Math.max(0, num(v, 'JumpPower'));
    else bad(k, 'Humanoid');
  }
}

/** A script-visible handle on one instance of the place. There is exactly one per id, so `==` works. */
export class InstanceRef implements HostObject {
  typeName = 'Instance';
  constructor(private rt: GameRuntime, readonly id: string) {}
  private get inst(): PlaceInstance { const i = this.rt.nodes.get(this.id); if (!i) throw new LuauError('This instance has been destroyed'); return i; }
  toString() { return this.rt.nodes.get(this.id)?.name ?? '[destroyed]'; }
  equals(o: unknown) { return o instanceof InstanceRef && o.id === this.id; }

  get(key: string): unknown {
    const rt = this.rt; const i = this.inst; const p = i.props as Rec; const id = this.id;
    const isPart = PART_CLASSES.includes(i.className); const cls = rt.className(i);
    const known = KNOWN.includes(i.className);
    switch (key) {
      case 'Name': return i.name;
      case 'ClassName': return cls;
      case 'Parent': { const par = i.parentId ? rt.nodes.get(i.parentId) : undefined; return par ? rt.ref(par.id) : undefined; }
      case 'Position': if (isPart) return vec(i.props.position, [0, 0, 0]); break;
      case 'CFrame': if (isPart) return new CFrameV(i.props.position || [0, 0, 0]); break;
      case 'Size': if (isPart) return vec(i.props.size, [4, 1, 2]); break;
      case 'Orientation': case 'Rotation': if (isPart) return vec(i.props.rotation, [0, 0, 0]); break;
      case 'Color': if (isPart || i.className === 'PointLight') return Color3.fromHex(i.props.color || '#a3a2a5'); break;
      case 'Material': if (isPart) return i.props.material || 'Plastic'; break;
      case 'Shape': if (i.className === 'Part') return i.props.shape || 'Block'; break;
      case 'Transparency': if (isPart) return i.props.transparency ?? 0; break;
      case 'Reflectance': if (isPart) return i.props.reflectance ?? 0; break;
      case 'Anchored': if (isPart) return i.props.anchored !== false; break;
      case 'CanCollide': if (isPart) return i.props.canCollide !== false; break;
      case 'CastShadow': if (isPart) return i.props.castShadow !== false; break;
      case 'Source': if (SCRIPT_CLASSES.includes(i.className)) return i.props.source || ''; break;
      case 'Enabled': if (i.className === 'PointLight') return p.enabled !== false; break;
      case 'Brightness': case 'Range': case 'ClockTime': if (p[lower(key)] !== undefined) return p[lower(key)]; break;
      case 'Disabled': if (SCRIPT_CLASSES.includes(i.className)) return p.disabled === true; break;
      default: break;
    }
    // class-specific members
    if (i.className === ('Player' as ClassName)) {
      switch (key) {
        case 'UserId': return 1; case 'DisplayName': return i.name;
        case 'Character': return rt.char.alive ? rt.character : undefined;
        case 'CharacterAdded': return rt.signal(id, 'CharacterAdded');
        case 'Kick': return (_s: unknown, m: unknown) => rt.out('warn', `Player kicked: ${m == null ? '' : tostr(m)}`);
        case 'LoadCharacter': return () => { rt.char.respawn = true; };
        default: break;
      }
    }
    if (cls === 'RemoteEvent') {
      switch (key) {
        case 'FireServer': return (_s: unknown, ...a: unknown[]) => rt.signal(id, 'OnServerEvent').fire(rt.localPlayer && rt.ref(rt.localPlayer.id), ...a);
        case 'FireClient': return (_s: unknown, _pl: unknown, ...a: unknown[]) => rt.signal(id, 'OnClientEvent').fire(...a);
        case 'FireAllClients': return (_s: unknown, ...a: unknown[]) => rt.signal(id, 'OnClientEvent').fire(...a);
        case 'OnServerEvent': case 'OnClientEvent': return rt.signal(id, key);
        default: break;
      }
    }
    if (cls === 'BindableEvent') {
      if (key === 'Fire') return (_s: unknown, ...a: unknown[]) => rt.signal(id, 'Event').fire(...a);
      if (key === 'Event') return rt.signal(id, 'Event');
    }
    if (key in VALUE_DEFAULT || key === 'Value') { if (cls in VALUE_DEFAULT || cls === 'ObjectValue') return p.value ?? VALUE_DEFAULT[cls]; }
    // methods
    switch (key) {
      case 'Destroy': case 'Remove': return () => rt.destroy(i);
      case 'ClearAllChildren': return () => rt.kids(id).forEach((k) => rt.destroy(k));
      case 'GetChildren': return () => rt.table(rt.kids(id).map((k) => rt.ref(k.id)));
      case 'GetDescendants': return () => rt.table(rt.subtree(id).filter((s) => s.id !== id).map((k) => rt.ref(k.id)));
      case 'FindFirstChild': return (_s: unknown, name: unknown, deep?: unknown) => {
        const pool = deep ? rt.subtree(id).filter((s) => s.id !== id) : rt.kids(id);
        const f = pool.find((k) => k.name === tostr(name)); return f ? rt.ref(f.id) : undefined;
      };
      case 'WaitForChild': return async (_s: unknown, name: unknown, timeout?: unknown) => {
        const limit = typeof timeout === 'number' ? timeout : 5; const t0 = Date.now();
        for (;;) {
          const f = rt.kids(id).find((k) => k.name === tostr(name)); if (f) return rt.ref(f.id);
          if (!rt.nodes.has(id) || rt.stopped || Date.now() - t0 > limit * 1000) break;
          await new Promise((r) => setTimeout(r, 30));
        }
        rt.out('warn', `Infinite yield possible on '${rt.fullName(i)}:WaitForChild("${tostr(name)}")'`); return undefined;
      };
      case 'FindFirstChildOfClass': case 'FindFirstChildWhichIsA': return (_s: unknown, c: unknown) => {
        const f = rt.kids(id).find((k) => rt.isA(k, tostr(c), key === 'FindFirstChildOfClass')); return f ? rt.ref(f.id) : undefined;
      };
      case 'FindFirstAncestor': return (_s: unknown, name: unknown) => { let cur = i.parentId; while (cur) { const n = rt.nodes.get(cur); if (!n) break; if (n.name === tostr(name)) return rt.ref(n.id); cur = n.parentId; } return undefined; };
      case 'IsA': return (_s: unknown, c: unknown) => rt.isA(i, tostr(c), false);
      case 'IsDescendantOf': return (_s: unknown, o: unknown) => o instanceof InstanceRef && o.id !== id && rt.subtree(o.id).some((s) => s.id === id);
      case 'IsAncestorOf': return (_s: unknown, o: unknown) => o instanceof InstanceRef && o.id !== id && rt.subtree(id).some((s) => s.id === o.id);
      case 'GetFullName': return () => rt.fullName(i);
      case 'Clone': return () => rt.ref(rt.clone(id, null).id);
      case 'SetAttribute': return (_s: unknown, n: unknown, v: unknown) => { p.attributes = { ...((p.attributes as Rec) || {}), [tostr(n)]: v }; rt.signal(id, `AttributeChanged:${tostr(n)}`).fire(); };
      case 'GetAttribute': return (_s: unknown, n: unknown) => attrsOf(p)[tostr(n)];
      case 'GetAttributes': return () => { const t = new LuaTable(); Object.entries(attrsOf(p)).forEach(([k, v]) => t.set(k, v)); return t; };
      case 'SetCore': if (i.className === 'StarterGui') return (_s: unknown, n: unknown, v: unknown) => rt.setCore(tostr(n), v); break;
      case 'AddTag': return (_s: unknown, t: unknown) => { const a = (p.tags as string[]) || []; if (!a.includes(tostr(t))) p.tags = [...a, tostr(t)]; };
      case 'RemoveTag': return (_s: unknown, t: unknown) => { p.tags = ((p.tags as string[]) || []).filter((x) => x !== tostr(t)); };
      case 'HasTag': return (_s: unknown, t: unknown) => ((p.tags as string[]) || []).includes(tostr(t));
      case 'GetTags': return () => rt.table(((p.tags as string[]) || []).slice());
      case 'GetPropertyChangedSignal': return (_s: unknown, n: unknown) => rt.signal(id, `Changed:${tostr(n)}`);
      case 'MoveTo': case 'PivotTo': case 'SetPrimaryPartCFrame': return (_s: unknown, v: unknown) => {
        const pos = v instanceof CFrameV ? v.p : v instanceof Vector3 ? v.toArray() : null; if (!pos) throw new LuauError(`${key} needs a Vector3 or CFrame`);
        const parts = i.className === 'Model' ? rt.subtree(id).filter((s) => PART_CLASSES.includes(s.className)) : [i];
        if (!parts.length) return;
        const c = parts.reduce((a, s) => { const q = s.props.position || [0, 0, 0]; return [a[0] + q[0] / parts.length, a[1] + q[1] / parts.length, a[2] + q[2] / parts.length]; }, [0, 0, 0]);
        parts.forEach((s) => { const q = s.props.position || [0, 0, 0]; rt.setProp(s, 'position', [q[0] - c[0] + pos[0], q[1] - c[1] + pos[1], q[2] - c[2] + pos[2]], 'Position'); });
      };
      case 'Touched': case 'TouchEnded': case 'ChildAdded': case 'ChildRemoved': case 'DescendantAdded': case 'DescendantRemoving': case 'Destroying': case 'AncestryChanged': case 'Changed': case 'AttributeChanged':
        return rt.signal(id, key);
      default: break;
    }
    const child = rt.kids(id).find((k) => k.name === key);
    if (child) return rt.ref(child.id);
    if (!known && key in p) return p[key];
    if (!known) return undefined; // GUI and value classes: unset properties read as nil
    return bad(key, `${cls} "${rt.fullName(i)}"`);
  }

  set(key: string, value: unknown): void {
    const rt = this.rt; const i = this.inst; const isPart = PART_CLASSES.includes(i.className);
    const bool = (w: string) => { if (typeof value !== 'boolean') throw new LuauError(`${w} must be a boolean`); return value; };
    switch (key) {
      case 'Name': i.name = tostr(value); rt.signal(this.id, 'Changed').fire('Name'); return;
      case 'Parent': {
        if (value == null) { rt.setParent(i, null); return; }
        if (!(value instanceof InstanceRef)) throw new LuauError('Parent must be an Instance or nil');
        rt.setParent(i, rt.nodes.get(value.id) || null); return;
      }
      case 'Position': if (isPart) return rt.setProp(i, 'position', toVec3(value, 'Position'), key);
      // falls through when not a part
      case 'CFrame': if (isPart) { if (!(value instanceof CFrameV)) throw new LuauError('CFrame must be a CFrame (use CFrame.new(x, y, z))'); return rt.setProp(i, 'position', [...value.p] as Vec3, key); } break;
      case 'Size': if (isPart) return rt.setProp(i, 'size', toVec3(value, 'Size').map((n) => Math.max(0.05, n)) as Vec3, key); break;
      case 'Orientation': case 'Rotation': if (isPart) return rt.setProp(i, 'rotation', toVec3(value, key), key); break;
      case 'Color': if (isPart || i.className === 'PointLight') { if (!(value instanceof Color3)) throw new LuauError('Color must be a Color3 (use Color3.fromRGB(r, g, b))'); return rt.setProp(i, 'color', value.toHex(), key); } break;
      case 'Material': if (isPart) return rt.setProp(i, 'material', tostr(value), key); break;
      case 'Shape': if (i.className === 'Part') { const s = tostr(value); if (!SHAPES.includes(s)) throw new LuauError(`Shape must be one of ${SHAPES.join(', ')}`); return rt.setProp(i, 'shape', s, key); } break;
      case 'Transparency': if (isPart) return rt.setProp(i, 'transparency', Math.max(0, Math.min(1, num(value, key))), key); break;
      case 'Reflectance': if (isPart) return rt.setProp(i, 'reflectance', Math.max(0, Math.min(1, num(value, key))), key); break;
      case 'Anchored': if (isPart) return rt.setProp(i, 'anchored', bool(key), key); break;
      case 'CanCollide': if (isPart) return rt.setProp(i, 'canCollide', bool(key), key); break;
      case 'CastShadow': if (isPart) return rt.setProp(i, 'castShadow', bool(key), key); break;
      case 'Source': if (SCRIPT_CLASSES.includes(i.className)) return rt.setProp(i, 'source', tostr(value), key); break;
      case 'Disabled': if (SCRIPT_CLASSES.includes(i.className)) return rt.setProp(i, 'disabled', bool(key), key); break;
      case 'Enabled': if (i.className === 'PointLight') return rt.setProp(i, 'enabled', bool(key), key); break;
      case 'Brightness': case 'Range': case 'ClockTime': if (i.className === 'PointLight' || i.className === 'Lighting') return rt.setProp(i, lower(key), num(value, key), key); break;
      default: break;
    }
    if (!KNOWN.includes(i.className)) {
      const isValue = key === 'Value' && (rt.className(i) in VALUE_DEFAULT || rt.className(i) === 'ObjectValue');
      (i.props as Rec)[isValue ? 'value' : key] = value;
      rt.signal(this.id, 'Changed').fire(isValue ? value : key); rt.signal(this.id, `Changed:${key}`).fire();
      rt.onChange?.(i, key);
      return;
    }
    throw new LuauError(`${key} is not a valid member of ${rt.className(i)} (or cannot be set in VoxMesa yet)`);
  }
}

type Timer = { at: number; fn: () => void };
type TweenRun = { inst: InstanceRef; goals: [string, unknown][]; from: unknown[]; t: number; dur: number; style: string; dir: string; done: Signal; playing: boolean };

export type RuntimeOptions = {
  out: (kind: OutKind, text: string) => void;
  /** Called after a script changed a property of an instance (so the 3D world can follow). */
  onChange?: (inst: PlaceInstance, key: string) => void;
  onAdded?: (inst: PlaceInstance) => void;
  onRemoved?: (id: string) => void;
  /** A script asked for a notification (StarterGui:SetCore("SendNotification", {...})). */
  onNotify?: (n: { title: string; text: string; duration: number }) => void;
};

const ease = (style: string, dir: string, x: number): number => {
  const inn = (t: number): number => {
    switch (style) {
      case 'Linear': return t; case 'Sine': return 1 - Math.cos((t * Math.PI) / 2);
      case 'Cubic': return t ** 3; case 'Quart': return t ** 4; case 'Quint': return t ** 5;
      case 'Exponential': return t === 0 ? 0 : 2 ** (10 * t - 10);
      case 'Back': return 2.70158 * t ** 3 - 1.70158 * t ** 2;
      default: return t * t; // Quad and anything not listed
    }
  };
  if (dir === 'In') return inn(x);
  if (dir === 'Out') return 1 - inn(1 - x);
  return x < 0.5 ? inn(x * 2) / 2 : 1 - inn((1 - x) * 2) / 2;
};

/**
 * Runs a place's scripts. Scripts live in the tree like in Roblox: Scripts under Workspace / ServerScriptService run on the
 * server side; LocalScripts run once StarterGui (and StarterPlayerScripts) have been copied into the player's PlayerGui /
 * PlayerScripts; ModuleScripts only run when something `require`s them.
 */
export class GameRuntime {
  nodes = new Map<string, PlaceInstance>();
  readonly char = new CharacterState();
  /** Ids of parts a script listens to with Touched / TouchEnded (the 3D world only tests these). */
  readonly touchWatch = new Set<string>();
  readonly host: Interpreter;
  readonly character: CharacterRef; readonly root: RootRef; readonly humanoid: HumanoidRef;
  localPlayer: PlaceInstance | null = null;
  stopped = false;
  time = 0;
  readonly out: (kind: OutKind, text: string) => void;
  readonly onChange?: RuntimeOptions['onChange'];
  private opts: RuntimeOptions;
  private refs = new Map<string, InstanceRef>();
  private signals = new Map<string, Signal>();
  private interps = new Set<Interpreter>();
  private started = new Set<string>();
  private modules = new Map<string, { values: unknown[] } | 'loading'>();
  private timers: Timer[] = [];
  private tweens: TweenRun[] = [];
  private renderBinds = new Map<string, unknown>();
  private keys = new Set<string>();
  private games = new Map<Side, HostObject>();
  private services = new Map<string, HostObject>();
  private shared = new LuaTable();
  private gShared = new LuaTable();
  private store = new Map<string, Map<string, unknown>>();

  constructor(instances: PlaceInstance[], opts: RuntimeOptions) {
    this.opts = opts; this.out = opts.out; this.onChange = opts.onChange;
    instances.forEach((i) => this.nodes.set(i.id, { ...i, props: { ...i.props } }));
    this.nodes.set('Players', { id: 'Players', className: 'Players' as ClassName, name: 'Players', parentId: null, props: {} });
    this.host = new Interpreter(opts.out);
    this.character = new CharacterRef(this); this.root = new RootRef(this); this.humanoid = new HumanoidRef(this);
  }

  noteConnect(label: string): void { const m = /^(.*):(Touched|TouchEnded)$/.exec(label); if (m) this.touchWatch.add(m[1]); }

  // ---- tree helpers (used by InstanceRef)
  ref(id: string): InstanceRef { let r = this.refs.get(id); if (!r) { r = new InstanceRef(this, id); this.refs.set(id, r); } return r; }
  signal(id: string, name: string): Signal { const k = `${id}:${name}`; let s = this.signals.get(k); if (!s) { s = new Signal(this, k); this.signals.set(k, s); } return s; }
  table(items: unknown[]): LuaTable { const t = new LuaTable(); items.forEach((v, n) => t.set(n + 1, v)); return t; }
  className(i: PlaceInstance): string {
    if (i.className === 'Part' && i.props.shape === 'Wedge') return 'WedgePart';
    if (i.className === 'Part' && i.props.shape === 'CornerWedge') return 'CornerWedgePart';
    return i.className;
  }
  isA(i: PlaceInstance, cls: string, exact: boolean): boolean {
    const c = this.className(i);
    if (cls === c || cls === i.className) return true;
    if (exact) return false;
    if (cls === 'Instance') return true;
    if (cls === 'BasePart') return PART_CLASSES.includes(i.className);
    if (cls === 'PVInstance') return PART_CLASSES.includes(i.className) || i.className === 'Model';
    if (cls === 'LuaSourceContainer') return SCRIPT_CLASSES.includes(i.className);
    if (cls === 'BaseScript') return i.className === 'Script' || i.className === 'LocalScript';
    if (cls === 'ValueBase') return c in VALUE_DEFAULT || c === 'ObjectValue';
    if (cls === 'GuiObject') return ['Frame', 'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ScrollingFrame'].includes(c);
    if (cls === 'LayerCollector') return c === 'ScreenGui';
    return cls === 'Light' && i.className === 'PointLight';
  }
  kids(id: string): PlaceInstance[] { return [...this.nodes.values()].filter((i) => i.parentId === id); }
  subtree(id: string): PlaceInstance[] {
    const out: PlaceInstance[] = []; const stack = [id];
    while (stack.length) { const cur = stack.pop()!; const n = this.nodes.get(cur); if (n) out.push(n); this.kids(cur).reverse().forEach((k) => stack.push(k.id)); }
    return out;
  }
  fullName(i: PlaceInstance): string { const parts: string[] = []; let cur: PlaceInstance | undefined = i; while (cur) { parts.unshift(cur.name); cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined; } return parts.join('.'); }
  /** The top-most ancestor (a service, or the instance itself when it has no parent). */
  rootOf(i: PlaceInstance): PlaceInstance { let cur = i; while (cur.parentId) { const p = this.nodes.get(cur.parentId); if (!p) break; cur = p; } return cur; }
  attached(i: PlaceInstance): boolean { const r = this.rootOf(i); return SERVICE_CLASSES.includes(r.className) || r.id === 'Players'; }
  clone(id: string, parentId: string | null): PlaceInstance {
    const sub = this.subtree(id); const map = new Map<string, string>();
    const copies = sub.map((s) => { const c = createInstance(s.className, null, JSON.parse(JSON.stringify(s.props)), s.name); map.set(s.id, c.id); return c; });
    copies.forEach((c, n) => { c.parentId = n === 0 ? parentId : map.get(sub[n].parentId || '') ?? null; this.nodes.set(c.id, c); });
    return copies[0];
  }
  setProp(i: PlaceInstance, key: string, value: unknown, member: string): void {
    (i.props as Rec)[key] = value;
    this.signal(i.id, 'Changed').fire(member); this.signal(i.id, `Changed:${member}`).fire();
    this.onChange?.(i, key);
  }
  setParent(i: PlaceInstance, parent: PlaceInstance | null): void {
    if (SERVICE_CLASSES.includes(i.className) || i.id === 'Players') throw new LuauError(`The Parent property of ${i.name} is locked`);
    if (parent && this.subtree(i.id).some((s) => s.id === parent.id)) throw new LuauError('Attempt to set parent would result in a circular reference');
    const wasIn = this.attached(i); const old = i.parentId ? this.nodes.get(i.parentId) : undefined;
    i.parentId = parent ? parent.id : null;
    if (old) { this.signal(old.id, 'ChildRemoved').fire(this.ref(i.id)); }
    this.signal(i.id, 'AncestryChanged').fire(this.ref(i.id), parent ? this.ref(parent.id) : undefined);
    if (parent) {
      this.signal(parent.id, 'ChildAdded').fire(this.ref(i.id));
      let cur: PlaceInstance | undefined = parent; while (cur) { this.signal(cur.id, 'DescendantAdded').fire(this.ref(i.id)); cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined; }
    }
    const isIn = this.attached(i);
    if (isIn && !wasIn) { this.subtree(i.id).forEach((s) => { this.opts.onAdded?.(s); this.maybeStart(s); }); }
    if (!isIn && wasIn) this.subtree(i.id).forEach((s) => this.opts.onRemoved?.(s.id));
  }
  destroy(i: PlaceInstance): void {
    if (SERVICE_CLASSES.includes(i.className) || i.id === 'Players') throw new LuauError(`The Parent property of ${i.name} is locked`);
    const sub = this.subtree(i.id); const was = this.attached(i);
    sub.forEach((s) => this.signal(s.id, 'Destroying').fire());
    const par = i.parentId ? this.nodes.get(i.parentId) : undefined;
    sub.forEach((s) => { this.nodes.delete(s.id); this.refs.delete(s.id); if (was) this.opts.onRemoved?.(s.id); });
    if (par) this.signal(par.id, 'ChildRemoved').fire(this.ref(i.id));
  }

  // ---- running scripts
  dispatch(fn: unknown, args: unknown[]): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.host.steps = 0; this.host.depth = 0;
    return this.host.call(fn, args).then(() => undefined, (e: unknown) => { if (!this.stopped) this.out('error', e instanceof Error ? e.message : String(e)); });
  }
  /** Which side a script runs on, or null if it does not run where it is. */
  sideOf(i: PlaceInstance): Side | null {
    if (i.props.disabled === true || !this.attached(i)) return null;
    const r = this.rootOf(i).id;
    if (i.className === 'Script') return r === 'Workspace' || r === 'ServerScriptService' ? 'server' : null;
    if (i.className === 'LocalScript') return r === 'Players' ? 'client' : null;
    return null;
  }
  private maybeStart(i: PlaceInstance): void {
    if (!SCRIPT_CLASSES.includes(i.className) || i.className === 'ModuleScript' || this.started.has(i.id) || !this.begun) return;
    const side = this.sideOf(i); if (!side) return;
    this.started.add(i.id);
    const it = this.makeInterp(side);
    it.setGlobal('script', this.ref(i.id));
    void it.run(String(i.props.source || ''), this.fullName(i));
  }
  private begun = false;

  /** Starts every server Script, then lets the player join (which starts the LocalScripts). */
  async start(): Promise<void> {
    this.begun = true;
    this.subtree('Workspace').concat(this.subtree('ServerScriptService')).forEach((s) => this.maybeStart(s));
    await new Promise((r) => setTimeout(r, 60)); // let scripts connect PlayerAdded before the player arrives, like the real engine
    if (!this.stopped) await this.joinPlayer();
  }
  private async joinPlayer(): Promise<void> {
    const player = createInstance('Folder', 'Players', {}, 'Player'); (player as { className: string }).className = 'Player';
    this.nodes.set(player.id, player); this.localPlayer = player;
    const gui = createInstance('Folder', player.id, {}, 'PlayerGui'); (gui as { className: string }).className = 'PlayerGui'; this.nodes.set(gui.id, gui);
    this.kids('StarterGui').forEach((k) => this.clone(k.id, gui.id));
    const pack = createInstance('Folder', player.id, {}, 'Backpack'); (pack as { className: string }).className = 'Backpack'; this.nodes.set(pack.id, pack);
    const starterScripts = [...this.nodes.values()].find((n) => (n.className as string) === 'StarterPlayerScripts');
    const ps = createInstance('Folder', player.id, {}, 'PlayerScripts'); (ps as { className: string }).className = 'PlayerScripts'; this.nodes.set(ps.id, ps);
    if (starterScripts) this.kids(starterScripts.id).forEach((k) => this.clone(k.id, ps.id));
    // PlayerAdded handlers get a head start (up to a third of a second) so the server has set the player up before client scripts run
    const settle = (p: Promise<void>) => Promise.race([p, new Promise<void>((r) => setTimeout(r, 300))]);
    await settle(this.signal('Players', 'PlayerAdded').fire(this.ref(player.id)));
    void this.signal(player.id, 'CharacterAdded').fire(this.character);
    this.subtree(player.id).forEach((s) => this.maybeStart(s));
  }
  private makeInterp(side: Side): Interpreter {
    const it = new Interpreter(this.out); this.interps.add(it);
    it.setGlobal('game', this.gameFor(side));
    it.setGlobal('workspace', this.ref('Workspace'));
    it.setGlobal('Enum', enumObject());
    it.setGlobal('_G', this.gShared); it.setGlobal('shared', this.shared);
    it.setGlobal('require', async (m: unknown) => this.requireModule(m, side));
    const instanceLib = new LuaTable();
    instanceLib.set('new', (cls: unknown, parent?: unknown) => this.instanceNew(tostr(cls), parent));
    it.setGlobal('Instance', instanceLib);
    const lib = (o: Rec) => { const t = new LuaTable(); Object.entries(o).forEach(([k, v]) => t.set(k, v)); return t; };
    it.setGlobal('CFrame', lib({ new: (x?: unknown, y?: unknown, z?: unknown) => (x instanceof Vector3 ? new CFrameV(x.toArray()) : new CFrameV([Number(x ?? 0), Number(y ?? 0), Number(z ?? 0)])) }));
    it.setGlobal('TweenInfo', lib({ new: (t?: unknown, style?: unknown, dir?: unknown) => ({ typeName: 'TweenInfo', toString: () => 'TweenInfo', set: () => undefined, get: (k: string) => ({ Time: Number(t ?? 1), EasingStyle: style ?? 'Quad', EasingDirection: dir ?? 'Out' } as Rec)[k] }) }));
    it.setGlobal('Random', lib({ new: () => obj('Random', { NextNumber: (_s: unknown, a?: unknown, b?: unknown) => (a == null ? Math.random() : Number(a) + Math.random() * (Number(b) - Number(a))), NextInteger: (_s: unknown, a: unknown, b: unknown) => Math.floor(Number(a) + Math.random() * (Number(b) - Number(a) + 1)) }) }));
    return it;
  }
  private async requireModule(m: unknown, side: Side): Promise<unknown> {
    if (!(m instanceof InstanceRef)) throw new LuauError('Attempted to call require with invalid argument(s).');
    const inst = this.nodes.get(m.id);
    if (!inst || inst.className !== 'ModuleScript') throw new LuauError('Attempted to call require with invalid argument(s).');
    const cached = this.modules.get(m.id);
    if (cached === 'loading') throw new LuauError(`Requested module ${inst.name} was required recursively`);
    if (cached) return cached.values[0];
    this.modules.set(m.id, 'loading');
    const it = this.makeInterp(side); it.setGlobal('script', m);
    const res = await it.runChunk(String(inst.props.source || ''), this.fullName(inst));
    if (!res.ok) { this.modules.delete(m.id); throw new LuauError(`Requested module experienced an error while loading (${res.error})`); }
    if (res.values.length !== 1 || res.values[0] == null) { this.modules.delete(m.id); throw new LuauError('Module code did not return exactly one value'); }
    this.modules.set(m.id, { values: res.values });
    return res.values[0];
  }
  private instanceNew(name: string, parent?: unknown): InstanceRef {
    if (!CREATABLE.has(name)) throw new LuauError(`Unable to create an Instance of type "${name}"`);
    const real = (name === 'WedgePart' || name === 'CornerWedgePart' ? 'Part' : name) as ClassName;
    const inst = createInstance(real, null, name === 'WedgePart' ? { shape: 'Wedge', size: [4, 4, 4] } : name === 'CornerWedgePart' ? { shape: 'CornerWedge', size: [4, 4, 4] } : {}, name);
    if (name in VALUE_DEFAULT) (inst.props as Rec).value = VALUE_DEFAULT[name];
    this.nodes.set(inst.id, inst);
    const r = this.ref(inst.id);
    if (parent instanceof InstanceRef) r.set('Parent', parent);
    return r;
  }
  setHealth(h: number): void {
    const c = this.char; if (!c.alive) return;
    c.health = Math.max(0, Math.min(c.maxHealth, h));
    this.signal('Humanoid', 'HealthChanged').fire(c.health);
    if (c.health <= 0) this.characterDied();
  }
  /** The world calls this when the player falls off or touches something deadly. */
  characterDied(): void { if (!this.char.alive) return; this.char.alive = false; this.char.health = 0; this.signal('Humanoid', 'Died').fire(); }
  /** The world calls this after the player respawned at a spawn point. */
  characterRespawned(): void {
    const c = this.char; c.alive = true; c.health = c.maxHealth; c.respawn = false; c.teleport = null; c.velocity = null;
    if (this.localPlayer) this.signal(this.localPlayer.id, 'CharacterAdded').fire(this.character);
  }

  // ---- events from the 3D world
  touch(partId: string): void { if (this.nodes.has(partId)) this.signal(partId, 'Touched').fire(this.root); }
  touchEnded(partId: string): void { if (this.nodes.has(partId)) this.signal(partId, 'TouchEnded').fire(this.root); }
  keyEvent(key: string, down: boolean, kind: 'Keyboard' | 'MouseButton1' | 'Touch' = 'Keyboard'): void {
    if (down) this.keys.add(key); else this.keys.delete(key);
    const input = obj('InputObject', { KeyCode: kind === 'Keyboard' ? key : 'Unknown', UserInputType: kind, UserInputState: down ? 'Begin' : 'End', Position: new Vector3(0, 0, 0) });
    this.signal('UserInputService', down ? 'InputBegan' : 'InputEnded').fire(input, false);
  }
  /** Advances timers, tweens and the per-frame events by `dt` seconds. */
  step(dt: number): void {
    if (this.stopped) return;
    this.time += dt;
    for (const t of [...this.timers]) if (t.at <= this.time) { this.timers = this.timers.filter((x) => x !== t); t.fn(); }
    for (const tw of [...this.tweens]) {
      if (!tw.playing) continue;
      tw.t += dt; const a = tw.dur <= 0 ? 1 : Math.min(1, tw.t / tw.dur); const e = ease(tw.style, tw.dir, a);
      tw.goals.forEach(([k, to], n) => { try { tw.inst.set(k, this.lerp(tw.from[n], to, e)); } catch { tw.playing = false; } });
      if (a >= 1) { tw.playing = false; this.tweens = this.tweens.filter((x) => x !== tw); tw.done.fire('Completed'); }
    }
    this.signal('RunService', 'Stepped').fire(this.time, dt);
    this.signal('RunService', 'RenderStepped').fire(dt);
    for (const [, fn] of this.renderBinds) this.dispatch(fn, [dt]);
    this.signal('RunService', 'Heartbeat').fire(dt);
  }
  private lerp(a: unknown, b: unknown, t: number): unknown {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    if (a instanceof Vector3 && b instanceof Vector3) return new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    if (a instanceof Color3 && b instanceof Color3) return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    return t >= 1 ? b : a;
  }
  /** Stops every script. */
  stop(): void { this.stopped = true; this.interps.forEach((i) => i.abort()); this.host.abort(); this.timers = []; this.tweens = []; }

  /** StarterGui:SetCore — only SendNotification is supported; other names are ignored with a warning. */
  setCore(name: string, v: unknown): void {
    if (name !== 'SendNotification') { this.out('warn', `SetCore("${name}") is not supported yet`); return; }
    if (!(v instanceof LuaTable)) throw new LuauError('SetCore("SendNotification") needs a table with Title and Text');
    const f = (k: string) => { const x = v.get(k); return x == null ? '' : tostr(x); };
    const d = v.get('Duration');
    this.opts.onNotify?.({ title: f('Title'), text: f('Text'), duration: typeof d === 'number' ? d : 5 });
  }
  /** True when this place's rules run as scripts (Workspace attribute ScriptedGameplay), so the built-in gameplay stays out of the way. */
  get scripted(): boolean { return (this.nodes.get('Workspace')?.props.attributes as Rec | undefined)?.ScriptedGameplay === true; }

  // ---- for the UI
  /** The player's leaderstats as name/value pairs. */
  leaderstats(): { name: string; value: unknown }[] {
    const p = this.localPlayer; if (!p) return [];
    const f = this.kids(p.id).find((k) => k.name === 'leaderstats'); if (!f) return [];
    return this.kids(f.id).map((v) => ({ name: v.name, value: (v.props as Rec).value }));
  }
  /** The instances currently in the player's PlayerGui (for drawing a HUD). */
  playerGui(): PlaceInstance[] { const p = this.localPlayer; const g = p && this.kids(p.id).find((k) => k.name === 'PlayerGui'); return g ? this.subtree(g.id).filter((s) => s.id !== g.id) : []; }

  // ---- services
  private gameFor(side: Side): HostObject {
    let g = this.games.get(side); if (g) return g;
    const rt = this;
    g = {
      typeName: 'DataModel', toString: () => 'Game', set: () => undefined,
      get: (k: string) => {
        if (k === 'GetService' || k === 'FindService') return (_s: unknown, n: unknown) => rt.service(side, tostr(n), k === 'FindService');
        if (k === 'Name') return 'Game';
        if (k === 'IsLoaded') return () => true;
        if (k === 'BindToClose') return () => undefined;
        if (k === 'PlaceId' || k === 'GameId' || k === 'JobId') return k === 'JobId' ? '' : 0;
        if (SERVICES.includes(k)) return rt.service(side, k, false);
        return bad(k, 'DataModel "Game"');
      },
    };
    this.games.set(side, g); return g;
  }
  private service(side: Side, name: string, soft: boolean): unknown {
    const node = this.nodes.get(name);
    if (node && SERVICE_CLASSES.includes(node.className)) return this.ref(name);
    const key = `${side}:${name}`; const cached = this.services.get(key); if (cached) return cached;
    const rt = this; let s: HostObject | undefined;
    switch (name) {
      case 'Players': s = obj('Players', {
        LocalPlayer: side === 'client' && rt.localPlayer ? rt.ref(rt.localPlayer.id) : undefined,
        GetPlayers: () => rt.table(rt.localPlayer ? [rt.ref(rt.localPlayer.id)] : []),
        GetPlayerFromCharacter: (_s: unknown, c: unknown) => (c instanceof CharacterRef && rt.localPlayer ? rt.ref(rt.localPlayer.id) : undefined),
        PlayerAdded: rt.signal('Players', 'PlayerAdded'), PlayerRemoving: rt.signal('Players', 'PlayerRemoving'),
        GetChildren: () => rt.table(rt.kids('Players').map((k) => rt.ref(k.id))),
      }); break;
      case 'RunService': s = obj('RunService', {
        Heartbeat: rt.signal('RunService', 'Heartbeat'), Stepped: rt.signal('RunService', 'Stepped'), RenderStepped: rt.signal('RunService', 'RenderStepped'),
        IsServer: () => side === 'server', IsClient: () => side === 'client', IsStudio: () => false, IsRunning: () => !rt.stopped, IsRunMode: () => false,
        BindToRenderStep: (_s: unknown, n: unknown, _p: unknown, fn: unknown) => { rt.renderBinds.set(tostr(n), fn); },
        UnbindFromRenderStep: (_s: unknown, n: unknown) => { rt.renderBinds.delete(tostr(n)); },
      }); break;
      case 'TweenService': s = obj('TweenService', {
        Create: (_s: unknown, inst: unknown, info: unknown, goals: unknown) => {
          if (!(inst instanceof InstanceRef)) throw new LuauError('TweenService:Create needs an Instance');
          if (!(goals instanceof LuaTable)) throw new LuauError('TweenService:Create needs a table of goals');
          const i = info as HostObject; const done = rt.signal(`tween${rt.time}${Math.random()}`, 'Completed');
          const pairs = goals.keys().map((k) => [tostr(k), goals.get(k)] as [string, unknown]);
          const tw: TweenRun = { inst, goals: pairs, from: [], t: 0, dur: Number(i.get('Time')), style: tostr(i.get('EasingStyle')), dir: tostr(i.get('EasingDirection')), done, playing: false };
          return obj('Tween', {
            Play: () => { tw.from = pairs.map(([k]) => inst.get(k)); tw.t = 0; tw.playing = true; if (!rt.tweens.includes(tw)) rt.tweens.push(tw); },
            Cancel: () => { tw.playing = false; rt.tweens = rt.tweens.filter((x) => x !== tw); }, Pause: () => { tw.playing = false; },
            Completed: done,
          });
        },
      }); break;
      case 'Debris': s = obj('Debris', { AddItem: (_s: unknown, i: unknown, t?: unknown) => { if (i instanceof InstanceRef) rt.timers.push({ at: rt.time + (typeof t === 'number' ? t : 10), fn: () => { const n = rt.nodes.get(i.id); if (n) rt.destroy(n); } }); } }); break;
      case 'CollectionService': s = obj('CollectionService', {
        AddTag: (_s: unknown, i: unknown, t: unknown) => (i as InstanceRef).get('AddTag') && ((i as InstanceRef).get('AddTag') as (a: unknown, b: unknown) => void)(i, t),
        RemoveTag: (_s: unknown, i: unknown, t: unknown) => ((i as InstanceRef).get('RemoveTag') as (a: unknown, b: unknown) => void)(i, t),
        HasTag: (_s: unknown, i: unknown, t: unknown) => ((i as InstanceRef).get('HasTag') as (a: unknown, b: unknown) => boolean)(i, t),
        GetTagged: (_s: unknown, t: unknown) => rt.table([...rt.nodes.values()].filter((n) => rt.attached(n) && ((n.props as Rec).tags as string[] | undefined)?.includes(tostr(t))).map((n) => rt.ref(n.id))),
      }); break;
      case 'UserInputService': s = obj('UserInputService', {
        InputBegan: rt.signal('UserInputService', 'InputBegan'), InputEnded: rt.signal('UserInputService', 'InputEnded'),
        IsKeyDown: (_s: unknown, k: unknown) => rt.keys.has(tostr(k)), TouchEnabled: false, KeyboardEnabled: true, MouseEnabled: true,
      }); break;
      case 'HttpService': s = obj('HttpService', {
        GenerateGUID: () => `{${crypto.randomUUID().toUpperCase()}}`,
        JSONEncode: (_s: unknown, v: unknown) => JSON.stringify(toJs(v)),
        JSONDecode: (_s: unknown, v: unknown) => { try { return fromJs(JSON.parse(tostr(v))); } catch { throw new LuauError('Can\'t parse JSON'); } },
      }); break;
      case 'DataStoreService': s = obj('DataStoreService', { GetDataStore: (_s: unknown, n: unknown) => {
        const m = rt.store.get(tostr(n)) || new Map<string, unknown>(); rt.store.set(tostr(n), m);
        return obj('DataStore', {
          GetAsync: (_x: unknown, k: unknown) => m.get(tostr(k)), SetAsync: (_x: unknown, k: unknown, v: unknown) => { m.set(tostr(k), v); },
          IncrementAsync: (_x: unknown, k: unknown, d?: unknown) => { const n2 = (Number(m.get(tostr(k))) || 0) + (typeof d === 'number' ? d : 1); m.set(tostr(k), n2); return n2; },
          UpdateAsync: async (_x: unknown, k: unknown, fn: unknown) => { const r = await rt.host.call(fn, [m.get(tostr(k))]); m.set(tostr(k), r[0]); return r[0]; },
        });
      } }); break;
      default: break;
    }
    if (!s) { if (soft) return undefined; throw new LuauError(`'${name}' is not a valid Service name`); }
    this.services.set(key, s); return s;
  }
}

function toJs(v: unknown): unknown {
  if (v instanceof LuaTable) {
    if (v.hash.size === 0) return v.arr.map(toJs);
    const o: Rec = {}; v.keys().forEach((k) => { o[tostr(k)] = toJs(v.get(k)); }); return o;
  }
  return v instanceof Vector3 || v instanceof Color3 ? tostr(v) : v;
}
function fromJs(v: unknown): unknown {
  if (Array.isArray(v)) { const t = new LuaTable(); v.forEach((x, n) => t.set(n + 1, fromJs(x))); return t; }
  if (v && typeof v === 'object') { const t = new LuaTable(); Object.entries(v as Rec).forEach(([k, x]) => t.set(k, fromJs(x))); return t; }
  return v ?? undefined;
}
