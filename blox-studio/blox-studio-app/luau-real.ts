/**
 * Real Luau: the official Luau engine (the language Roblox uses) running in the browser as WebAssembly.
 * This is the default script runner. A script whose first line is `--!lite` uses the built-in beginner runner instead.
 * The engine file lives in /luau/ and is built by the "Build real Luau" GitHub workflow.
 */
import { createRealHost, type OutputKind, type PlaceInstance } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { REAL_LUAU_PRELUDE } from './real-luau-prelude.js';

type LuauModule = { cwrap: (name: string, ret: string | null, args: string[]) => (...a: unknown[]) => unknown };

let loading: Promise<LuauModule> | null = null;
let handler: (op: string, args: string) => string = () => '{"r":null}';

function load(): Promise<LuauModule> {
  if (!loading) {
    loading = (async () => {
      const url = '/luau/vox_luau.js';
      const mod = (await import(/* @vite-ignore */ url)) as { default: (opts: object) => Promise<LuauModule> };
      const m = await mod.default({ voxHost: (op: string, a: string) => handler(op, a) });
      m.cwrap('vox_init', 'number', [])();
      const bad = m.cwrap('vox_prelude', 'string', ['string'])(REAL_LUAU_PRELUDE) as string;
      if (bad) throw new Error(`Real Luau start-up failed: ${bad}`);
      m.cwrap('vox_seal', 'number', [])();
      return m;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

/** First line `--!lite` asks for the built-in beginner runner. */
export const LITE_MARK = /^\s*--!lite\b/;

/** Starts loading the engine in the background; resolves true when it is ready, false when it could not load. */
export function preloadRealLuau(): Promise<boolean> {
  return load().then(() => true, () => false);
}

export type RealRun = { error: string; instances: PlaceInstance[]; changed: boolean };

const MAX_RUN_MS = 60_000;

/**
 * Runs a script with real Luau against a copy of the place. task.wait / task.spawn / task.delay work: this keeps going
 * until nothing is waiting (or `stopped()` is true, or 60 seconds have passed). The caller applies `instances` when `changed`.
 */
export async function runRealLuau(source: string, chunk: string, instances: PlaceInstance[], out: (kind: OutputKind, text: string) => void, scriptId?: string, stopped: () => boolean = () => false): Promise<RealRun> {
  const mod = await load();
  const host = createRealHost(instances, { scriptId, out });
  handler = (op, a) => host.host(op, a);
  // `script` is put on the first line so error line numbers stay right.
  const header = host.scriptId ? `local script = __script(${JSON.stringify(host.scriptId)}) ` : '';
  const started = performance.now();
  let error = mod.cwrap('vox_run', 'string', ['string', 'string', 'number'])(header + source, chunk, started) as string;
  const next = mod.cwrap('vox_next', 'number', []);
  const tick = mod.cwrap('vox_tick', 'string', ['number']);
  while (!error && !stopped()) {
    const due = next() as number;
    if (due < 0) break;
    if (performance.now() - started > MAX_RUN_MS) { error = 'Script stopped: scripts can run for up to 60 seconds in the editor.'; break; }
    await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
    if (stopped()) break;
    error = tick(performance.now()) as string;
  }
  mod.cwrap('vox_stop', 'number', [])();
  const r = host.result();
  return { error, instances: r.instances, changed: r.changed };
}
