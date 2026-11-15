/**
 * Real Luau: the official Luau engine (the language Roblox uses) running in the browser as WebAssembly.
 * Beta: scripts that start with the line `--!real` run here instead of the built-in beginner runner.
 * The engine file lives in /luau/ and is built by the "Build real Luau" GitHub workflow.
 */

type LuauModule = {
  cwrap: (name: string, ret: string | null, args: string[]) => (...a: unknown[]) => string;
  voxHost?: (name: string, args: string) => string;
};

let loading: Promise<LuauModule> | null = null;
let handler: (name: string, args: string) => string = () => '{}';

function load(): Promise<LuauModule> {
  if (!loading) {
    loading = (async () => {
      const url = '/luau/vox_luau.js';
      const mod = (await import(/* @vite-ignore */ url)) as { default: (opts: object) => Promise<LuauModule> };
      return mod.default({ voxHost: (n: string, a: string) => handler(n, a) });
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export const REAL_LUAU_MARK = /^\s*--!real\b/;

/** Runs a script with real Luau. `host` answers the script's calls into the editor (none are wired up yet). */
export async function runRealLuau(source: string, chunk: string, host?: (name: string, args: string) => string): Promise<{ output: string; error: string }> {
  const mod = await load();
  handler = host || (() => '{}');
  const run = mod.cwrap('vox_run', 'string', ['string', 'string']);
  const take = mod.cwrap('vox_take_output', 'string', []);
  const error = run(source, chunk);
  return { output: take(), error };
}
