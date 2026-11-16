// VoxMesa's bridge to the official Luau engine (the same language Roblox uses), compiled to WebAssembly.
// JavaScript talks to it with vox_init / vox_run / vox_take_output; scripts talk back to the editor
// through the global function __host(name, jsonArgs) -> jsonResult.
#include <emscripten.h>

#include <cstdlib>
#include <cstring>
#include <string>

#include "lua.h"
#include "luacode.h"
#include "lualib.h"

static lua_State* G = nullptr;
static std::string outBuf;
static std::string errBuf;
static std::string outCopy;

// Calls Module.voxHost(name, args) in JavaScript and returns its answer as a malloc'd string.
EM_JS(char*, vox_host_js, (const char* name, const char* args), {
  let r = '';
  try {
    const fn = Module.voxHost;
    r = fn ? String(fn(UTF8ToString(name), UTF8ToString(args))) : '';
  } catch (e) {
    r = JSON.stringify({error : String(e)});
  }
  const n = lengthBytesUTF8(r) + 1;
  const p = _malloc(n);
  stringToUTF8(r, p, n);
  return p;
});

static int l_print(lua_State* L) {
  int n = lua_gettop(L);
  for (int i = 1; i <= n; i++) {
    size_t len = 0;
    const char* s = luaL_tolstring(L, i, &len);
    if (i > 1) outBuf += '\t';
    outBuf.append(s, len);
    lua_pop(L, 1);
  }
  outBuf += '\n';
  return 0;
}

static int l_host(lua_State* L) {
  const char* name = luaL_checkstring(L, 1);
  const char* args = luaL_optstring(L, 2, "[]");
  char* r = vox_host_js(name, args);
  lua_pushstring(L, r);
  free(r);
  return 1;
}

// Lets the prelude give vectors extra members (Magnitude, Unit, Dot ...): __setvecmeta(metatable).
// Scripts may see an overridden `typeof` (so Vector3 reports "Vector3"), so the compiler must not treat it as built in.
static const char* kMutableGlobals[] = {"typeof", nullptr};
static char* compileScript(const char* source, size_t* size) {
  lua_CompileOptions opts = {};
  opts.optimizationLevel = 1;
  opts.debugLevel = 1;
  opts.mutableGlobals = kMutableGlobals;
  return luau_compile(source, strlen(source), &opts, size);
}

static int l_setvecmeta(lua_State* L) {
  luaL_checktype(L, 1, LUA_TTABLE);
  lua_pushvector(L, 0.f, 0.f, 0.f);
  lua_pushvalue(L, 1);
  lua_setmetatable(L, -2);
  return 0;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int vox_init() {
  if (G) lua_close(G);
  G = luaL_newstate();
  luaL_openlibs(G);
  lua_pushcfunction(G, l_print, "print");
  lua_setglobal(G, "print");
  lua_pushcfunction(G, l_host, "__host");
  lua_setglobal(G, "__host");
  lua_pushcfunction(G, l_setvecmeta, "__setvecmeta");
  lua_setglobal(G, "__setvecmeta");
  return 1;
}

// Runs VoxMesa's own startup script (defines Vector3, Instance, game ...) before scripts are locked down.
EMSCRIPTEN_KEEPALIVE const char* vox_prelude(const char* source) {
  errBuf.clear();
  size_t size = 0;
  char* bytecode = compileScript(source, &size);
  lua_State* T = lua_newthread(G);
  int rc = luau_load(T, "prelude", bytecode, size, 0);
  free(bytecode);
  if (rc != 0 || lua_pcall(T, 0, 0, 0) != 0) {
    const char* msg = lua_tostring(T, -1);
    errBuf = msg ? msg : "prelude failed";
  }
  lua_pop(G, 1);
  return errBuf.c_str();
}

// Locks the standard library so scripts cannot change it.
EMSCRIPTEN_KEEPALIVE int vox_seal() {
  luaL_sandbox(G);
  return 1;
}

// Runs a script. Returns "" when it finished, otherwise the error text.
EMSCRIPTEN_KEEPALIVE const char* vox_run(const char* source, const char* chunk) {
  errBuf.clear();
  if (!G) vox_init();
  size_t size = 0;
  char* bytecode = compileScript(source, &size);
  lua_State* T = lua_newthread(G);
  luaL_sandboxthread(T);
  int rc = luau_load(T, chunk, bytecode, size, 0);
  free(bytecode);
  if (rc != 0) {
    errBuf = lua_tostring(T, -1) ? lua_tostring(T, -1) : "could not load the script";
    lua_pop(G, 1);
    return errBuf.c_str();
  }
  int st = lua_resume(T, nullptr, 0);
  if (st != LUA_OK && st != LUA_YIELD) {
    const char* msg = lua_tostring(T, -1);
    errBuf = msg ? msg : "script error";
    const char* trace = lua_debugtrace(T);
    if (trace) errBuf += std::string("\n") + trace;
  }
  lua_pop(G, 1);
  return errBuf.c_str();
}

// Everything the script printed since the last call.
EMSCRIPTEN_KEEPALIVE const char* vox_take_output() {
  outCopy = outBuf;
  outBuf.clear();
  return outCopy.c_str();
}

}
