import { createPlaceTemplate, type PlaceInstance, type PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
};

/**
 * A fingerprint of a place's content that ignores the random ids: each item's class, name, settings and its parent's name.
 * @param list - place instances
 * @returns fingerprint text
 */
export function fingerprint(list: PlaceInstance[]): string {
  const byId = new Map(list.map((i) => [i.id, i]));
  return list.map((i) => {
    const parent = i.parentId ? byId.get(i.parentId) : undefined;
    return `${i.className}|${i.name}|${parent ? `${parent.className}/${parent.name}` : ''}|${stable(i.props)}`;
  }).sort().join('\n');
}

const TEMPLATES: PlaceTemplate[] = ['baseplate', 'obby', 'empty'];
let known: Set<string> | null = null;

/**
 * Whether a place is still exactly one of the starter templates (nothing was added, moved or changed).
 * Places made from older versions of a template do not match, so they are never reported as untouched.
 * @param list - place instances
 * @returns true when it is an unchanged template
 */
export function isUntouchedTemplate(list: PlaceInstance[]): boolean {
  known ||= new Set(TEMPLATES.map((t) => fingerprint(createPlaceTemplate(t))));
  return known.has(fingerprint(list));
}
