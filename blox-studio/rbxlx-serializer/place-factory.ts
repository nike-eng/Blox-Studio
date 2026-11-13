import type { ClassName, InstanceProps, PlaceInstance } from './place-types.js';
import { NESTED_SERVICES, SERVICE_CLASSES } from './place-types.js';
import { buildObby } from './obby-template.js';
import { OBBY_CLIENT_SOURCE, OBBY_RULES_SOURCE } from './obby-scripts.js';

/**
 * Generates a short random id for an instance.
 * @returns a unique-enough id string
 */
export function newInstanceId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const DEFAULT_PROPS: Partial<Record<ClassName, InstanceProps>> = {
  Part: {
    position: [0, 0.5, 0],
    size: [4, 1, 2],
    rotation: [0, 0, 0],
    color: '#a3a2a5',
    material: 'Plastic',
    transparency: 0,
    anchored: true,
    canCollide: true,
    shape: 'Block',
  },
  TrussPart: {
    position: [0, 5, 0],
    size: [2, 10, 2],
    rotation: [0, 0, 0],
    color: '#9ca3af',
    material: 'Metal',
    transparency: 0,
    anchored: true,
    canCollide: true,
  },
  SpawnLocation: {
    position: [0, 0.5, 0],
    size: [12, 1, 12],
    rotation: [0, 0, 0],
    color: '#a3a2a5',
    material: 'Plastic',
    transparency: 0,
    anchored: true,
    canCollide: true,
  },
  Script: { source: 'print("Hello world!")\n' },
  LocalScript: { source: 'print("Hello from the client!")\n' },
  ModuleScript: { source: 'local module = {}\n\nreturn module\n' },
  PointLight: { brightness: 1, range: 16, color: '#ffffff' },
  Lighting: { clockTime: 14.5, brightness: 3, atmosphere: 0.3, bloom: true, sunRays: true },
};

/**
 * Creates a new instance with sensible Roblox defaults.
 * @param className - Roblox class of the instance
 * @param parentId - parent instance id
 * @param overrides - props to merge over the defaults
 * @param name - optional display name (defaults to the class name)
 * @returns the new instance
 */
export function createInstance(
  className: ClassName,
  parentId: string | null,
  overrides: InstanceProps = {},
  name?: string
): PlaceInstance {
  return {
    id: newInstanceId(),
    className,
    name: name || className,
    parentId,
    props: { ...(DEFAULT_PROPS[className] || {}), ...overrides },
  };
}

/**
 * Starter templates for new places.
 */
export type PlaceTemplate = 'baseplate' | 'obby' | 'empty';

/**
 * Makes sure every Roblox service exists (older saved places lack the newer ones). Nothing existing is changed or moved.
 * @param instances - a place's instances
 * @returns the same instances plus any missing services, services first in Explorer order
 */
export function ensureServices(instances: PlaceInstance[]): PlaceInstance[] {
  const have = new Set(instances.map((i) => i.id));
  const missing = SERVICE_CLASSES.filter((cls) => !have.has(cls)).map((cls): PlaceInstance => ({
    id: cls,
    className: cls,
    name: cls,
    parentId: NESTED_SERVICES[cls] ?? null,
    props: { ...(DEFAULT_PROPS[cls] || {}) },
  }));
  if (!missing.length) return instances;
  const all = [...missing, ...instances];
  // Explorer order: services in Roblox's order first, then everything else as it was.
  const rank = (i: PlaceInstance) => { const n = SERVICE_CLASSES.indexOf(i.id as never); return n < 0 ? SERVICE_CLASSES.length : n; };
  const services = all.filter((i) => SERVICE_CLASSES.includes(i.className) && i.id === i.className).sort((a, b) => rank(a) - rank(b));
  const rest = all.filter((i) => !(SERVICE_CLASSES.includes(i.className) && i.id === i.className));
  return [...services, ...rest];
}

/**
 * Builds the instance list for a new place from a template.
 * @param template - which starter template to use
 * @returns flat list of instances including root services
 */
export function createPlaceTemplate(template: PlaceTemplate = 'baseplate'): PlaceInstance[] {
  const services = ensureServices([]);
  if (template === 'empty') return services;

  if (template === 'obby') {
    const items = buildObby(createInstance);
    // The rules live in scripts; this flag tells VoxMesa's Play mode to run them instead of its built-in rules.
    const workspace = services.find((i) => i.id === 'Workspace');
    if (workspace) workspace.props = { ...workspace.props, attributes: { ScriptedGameplay: true } };
    items.push(createInstance('Script', 'ServerScriptService', { source: OBBY_RULES_SOURCE }, 'ObbyRules'));
    items.push(createInstance('LocalScript', 'StarterPlayerScripts', { source: OBBY_CLIENT_SOURCE }, 'ObbyClient'));
    items.push(createInstance('Script', 'ServerScriptService', {
      source: [
        '-- Your own server code goes here.',
        '-- The course rules (kill bricks, checkpoints, finish, jump pads) are in ObbyRules.',
        'print("Welcome to Sky Islands Obby!")',
        '',
      ].join('\n'),
    }, 'Main'));
    return [...services, ...items];
  }

  const items: PlaceInstance[] = [
    createInstance('Part', 'Workspace', {
      position: [0, -4, 0],
      size: [512, 8, 512],
      color: '#5b5d69',
      material: 'Plastic',
    }, 'Baseplate'),
    createInstance('SpawnLocation', 'Workspace', { position: [0, 0.5, 0] }),
    createInstance('Script', 'ServerScriptService', {
      source: 'print("Hello from Blox Studio!")\n',
    }, 'Main'),
  ];
  return [...services, ...items];
}
