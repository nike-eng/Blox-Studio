import type { ClassName, InstanceProps, PlaceInstance } from './place-types.js';
import { SERVICE_CLASSES } from './place-types.js';
import { buildObby } from './obby-template.js';

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
 * Builds the instance list for a new place from a template.
 * @param template - which starter template to use
 * @returns flat list of instances including root services
 */
export function createPlaceTemplate(template: PlaceTemplate = 'baseplate'): PlaceInstance[] {
  const services: PlaceInstance[] = SERVICE_CLASSES.map((cls) => ({
    id: cls,
    className: cls,
    name: cls,
    parentId: null,
    props: { ...(DEFAULT_PROPS[cls] || {}) },
  }));
  if (template === 'empty') return services;

  if (template === 'obby') {
    const items = buildObby(createInstance);
    items.push(createInstance('Script', 'ServerScriptService', {
      source: [
        '-- Your own server code goes here.',
        '-- Kill bricks, checkpoints, the finish line, moving platforms and jump pads',
        '-- are configured per part (Properties → Gameplay) and run automatically.',
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
