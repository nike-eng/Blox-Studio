#!/usr/bin/env bash
# Builds the official Luau engine plus vox_luau.cpp into WebAssembly. Needs the Emscripten SDK (emcc, emcmake).
set -euo pipefail
cd "$(dirname "$0")"
LUAU_TAG="${LUAU_TAG:-0.690}"
rm -rf build luau-src dist
git clone --depth 1 --branch "$LUAU_TAG" https://github.com/luau-lang/luau.git luau-src || git clone --depth 1 https://github.com/luau-lang/luau.git luau-src
mkdir build && cd build
emcmake cmake ../luau-src -DCMAKE_BUILD_TYPE=Release -DLUAU_BUILD_CLI=OFF -DLUAU_BUILD_TESTS=OFF -DLUAU_BUILD_WEB=OFF -DCMAKE_CXX_FLAGS="-fexceptions" -DCMAKE_C_FLAGS="-fexceptions"
cmake --build . --target Luau.VM Luau.Compiler Luau.Ast -j"$(nproc)"
cd ..
mkdir dist
S=luau-src
emcc vox_luau.cpp build/libLuau.Compiler.a build/libLuau.VM.a build/libLuau.Ast.a \
  -I$S/VM/include -I$S/Compiler/include -I$S/Ast/include -I$S/Common/include \
  -O2 -fexceptions -std=c++17 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLuau -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_FUNCTIONS=_vox_init,_vox_prelude,_vox_seal,_vox_run,_vox_tick,_vox_next,_vox_stop,_vox_take_output,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=cwrap,UTF8ToString,lengthBytesUTF8,stringToUTF8 \
  -o dist/vox_luau.js
ls -la dist
