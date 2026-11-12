/**
 * Roblox instance classes supported by Blox Studio.
 */
export type ClassName =
  | 'Workspace'
  | 'Lighting'
  | 'ReplicatedStorage'
  | 'ServerScriptService'
  | 'StarterGui'
  | 'Part'
  | 'TrussPart'
  | 'SpawnLocation'
  | 'Model'
  | 'Folder'
  | 'Script'
  | 'LocalScript'
  | 'ModuleScript'
  | 'PointLight';

/**
 * Part shapes (maps to Roblox `Enum.PartType`).
 */
export type PartShape = 'Block' | 'Ball' | 'Cylinder' | 'Wedge' | 'CornerWedge';

/**
 * What happens when a player touches a part. Exported to Roblox as real gameplay
 * (powered by the generated `BloxRuntime` script) and emulated by the in-browser playtest.
 */
export type PartBehavior = 'none' | 'kill' | 'checkpoint' | 'finish' | 'jumpPad' | 'fade';

/**
 * How a part moves on its own while the game runs.
 */
export type PartMotion = 'none' | 'move' | 'spin';

/**
 * A 3-component vector in studs (or degrees for rotation).
 */
export type Vec3 = [number, number, number];

/**
 * Editable properties of an instance. Only the relevant subset is used per class.
 */
export type InstanceProps = {
  /** World position of the part's center, in studs. */
  position?: Vec3;
  /** Size in studs. */
  size?: Vec3;
  /** Euler rotation in degrees (XYZ order). */
  rotation?: Vec3;
  /** Hex color, e.g. `#a3a2a5`. */
  color?: string;
  /** Roblox material name, e.g. `Plastic`. */
  material?: string;
  /** 0 = opaque, 1 = invisible. */
  transparency?: number;
  /** 0 = matte, 1 = mirror. */
  reflectance?: number;
  /** Whether the part casts shadows. */
  castShadow?: boolean;
  /** Whether physics is disabled for the part. */
  anchored?: boolean;
  /** Whether other parts collide with this one. */
  canCollide?: boolean;
  /** Geometric shape of a Part. */
  shape?: PartShape;
  /** Touch behavior (kill brick, checkpoint, finish, jump pad, disappearing tile). */
  behavior?: PartBehavior;
  /** Stage number for `checkpoint` parts (1, 2, 3…). */
  checkpoint?: number;
  /** Upward launch speed (studs/s) for `jumpPad` parts. */
  jumpPower?: number;
  /** Motion type (moving platform or spinner). */
  motion?: PartMotion;
  /** Offset in studs a `move` part travels to and back from. */
  moveOffset?: Vec3;
  /** Seconds for one leg of a `move` trip. */
  moveTime?: number;
  /** Spin speed in radians per second around the world Y axis. */
  spinSpeed?: number;
  /** Luau source code for scripts. */
  source?: string;
  /** A disabled script never runs. */
  disabled?: boolean;
  /** CollectionService tags. */
  tags?: string[];
  /** Custom attributes set with `SetAttribute`. */
  attributes?: Record<string, unknown>;
  /** Light brightness. */
  brightness?: number;
  /** Light range in studs. */
  range?: number;
  /** Lighting time of day (0-24). */
  clockTime?: number;
  /** Lighting atmosphere density (0 disables atmosphere/fog). */
  atmosphere?: number;
  /** Lighting: enable glow on Neon parts. */
  bloom?: boolean;
  /** Lighting: enable sun rays. */
  sunRays?: boolean;
};

/**
 * A single node of the place's instance tree (flat list, linked by `parentId`).
 */
export type PlaceInstance = {
  /** Unique id inside the place. Services use their class name as id. */
  id: string;
  /** Roblox class. */
  className: ClassName;
  /** Display name (`Instance.Name`). */
  name: string;
  /** Parent id, or `null` for top-level services. */
  parentId: string | null;
  /** Class-specific properties. */
  props: InstanceProps;
};

/**
 * Service classes that always exist at the root of a place.
 */
export const SERVICE_CLASSES: ClassName[] = [
  'Workspace',
  'Lighting',
  'ReplicatedStorage',
  'ServerScriptService',
  'StarterGui',
];

/**
 * Classes that render as 3D parts.
 */
export const PART_CLASSES: ClassName[] = ['Part', 'TrussPart', 'SpawnLocation'];

/**
 * Classes that hold Luau source.
 */
export const SCRIPT_CLASSES: ClassName[] = ['Script', 'LocalScript', 'ModuleScript'];
