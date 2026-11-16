/**
 * Real Luau: the official Luau engine (the language Roblox uses) running in the browser as WebAssembly.
 * Beta: scripts that start with the line `--!real` run here instead of the built-in beginner runner.
 * The engine file lives in /luau/ and is built by the "Build real Luau" GitHub workflow.
 */
import { createRealHost, type OutputKind, type PlaceInstance } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { REAL_LUAU_PRELUDE } from './real-luau-prelude.js';

type LuauModule = { cwrap: (name: string, ret: string | null, args: string[]) => (...a: unknown[]) => string };

let loading: Promise<LuauModule> | null = null;
let handler: (op: string, args: string) => string = () => '{"r":null}';

function load(): Promise<LuauModule> {
  if (!loading) {
    loading = (async () => {
      const url = '/luau/vox_luau.js';
      const mod = (await import(/* @vite-ignore */ url)) as { default: (opts: object) => Promise<LuauModule> };
      const m = await mod.default({ voxHost: (op: string, a: string) => handler(op, a) });
      m.cwrap('vox_init', 'number', [])();
      const bad = m.cwrap('vox_prelude', 'string', ['string'])(REAL_LUAU_PRELUDE);
      if (bad) throw new Error(`Real Luau start-up failed: ${bad}`);
      m.cwrap('vox_seal', 'number', [])();
      return m;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export const REAL_LUAU_MARK = /^\s*--!real\b/;

export type RealRun = { error: string; instances: PlaceInstance[]; changed: boolean };

/** Runs a script with real Luau against a copy of the place. The caller applies `instances` when `changed`. */
export async function runRealLuau(source: string, chunk: string, instances: PlaceInstance[], out: (kind: OutputKind, text: string) => void, scriptId?: string): Promise<RealRun> {
  const mod = await load();
  const host = createRealHost(instances, { scriptId, out });
  handler = (op, a) => host.host(op, a);
  // `script` is put on the first line so error line numbers stay right.
  const header = host.scriptId ? `local script = __script(${JSON.stringify(host.scriptId)}) ` : '';
  const error = mod.cwrap('vox_run', 'string', ['string', 'string'])(header + source, chunk);
  const r = host.result();
  return { error, instances: r.instances, changed: r.changed };
}
