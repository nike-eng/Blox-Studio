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

/** The obby as it was before its rules became scripts (places made from it are still unchanged copies). */
function legacyObby(): PlaceInstance[] {
  return createPlaceTemplate('obby')
    .filter((i) => i.name !== 'ObbyRules' && i.name !== 'ObbyClient')
    .map((i) => {
      if (i.id === 'Workspace') { const { attributes: _unused, ...props } = i.props; return { ...i, props }; }
      if (i.className === 'Script' && i.name === 'Main') {
        return { ...i, props: { ...i.props, source: [
          '-- Your own server code goes here.',
          '-- Kill bricks, checkpoints, the finish line, moving platforms and jump pads',
          '-- are configured per part (Properties → Gameplay) and run automatically.',
          'print("Welcome to Sky Islands Obby!")',
          '',
        ].join('\n') } };
      }
      return i;
    });
}

let known: Set<string> | null = null;

/**
 * Whether a place is still exactly one of the starter templates (nothing was added, moved or changed).
 * Places made from older versions of a template do not match, so they are never reported as untouched.
 * @param list - place instances
 * @returns true when it is an unchanged template
 */
export function isUntouchedTemplate(list: PlaceInstance[]): boolean {
  known ||= new Set([...TEMPLATES.map((t) => fingerprint(createPlaceTemplate(t))), fingerprint(legacyObby())]);
  return known.has(fingerprint(list));
}

/** Bump when the matching rules change, so earlier answers are worked out again. */
export const PRISTINE_V = 2;

/**
 * Says how a place differs from the closest starter template (used to explain why nothing matched).
 * @param list - place instances
 * @returns short description
 */
export function whyNotTemplate(list: PlaceInstance[]): string {
  const mine = fingerprint(list).split('\n');
  const mineSet = new Set(mine);
  let best = '';
  let bestScore = Infinity;
  for (const ref0 of [...TEMPLATES.map((t) => [t, createPlaceTemplate(t)] as const), ['legacy obby', legacyObby()] as const]) {
    const t = ref0[0];
    const ref = fingerprint(ref0[1] as PlaceInstance[]).split('\n');
    const refSet = new Set(ref);
    const extra = mine.filter((l) => !refSet.has(l));
    const missing = ref.filter((l) => !mineSet.has(l));
    if (extra.length + missing.length < bestScore) {
      bestScore = extra.length + missing.length;
      best = `closest ${t}: ${extra.length} different, ${missing.length} missing. Place has: ${(extra[0] || '-').slice(0, 220)} | Template has: ${(missing[0] || '-').slice(0, 220)}`;
    }
  }
  return best;
}
