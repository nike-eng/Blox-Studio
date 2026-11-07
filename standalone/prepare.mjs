// Copies the app + serializer source into ./.src with a plain tsconfig, so the build does not depend on Bit's generated files.
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '.src');
const skip = (src) => !/(\.spec\.|\.docs\.mdx$|\.compositions\.tsx$|\.bit-app\.|tsconfig\.json$|node_modules)/.test(src);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(here, '../blox-studio/blox-studio-app'), path.join(out, 'app'), { recursive: true, filter: skip });
cpSync(path.join(here, '../blox-studio/rbxlx-serializer'), path.join(out, 'rbxlx-serializer'), { recursive: true, filter: skip });
if (existsSync(path.join(here, 'public'))) cpSync(path.join(here, 'public'), path.join(out, 'public'), { recursive: true });
writeFileSync(path.join(out, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: false, skipLibCheck: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['vite/client'] },
}, null, 2));

// base.module.css only holds global rules; Vite drops it as an unused CSS module, so ship it as a plain stylesheet.
const basePath = path.join(out, 'app', 'base.module.css');
if (existsSync(basePath)) {
  writeFileSync(path.join(out, 'app', 'base.css'), readFileSync(basePath, 'utf8').replace(/:global\(([^)]*)\)/g, '$1'));
  const rootTsx = path.join(out, 'app', 'blox-studio-app.tsx');
  writeFileSync(rootTsx, readFileSync(rootTsx, 'utf8').replace("'./base.module.css'", "'./base.css'"));
}

// Show any crash on screen instead of a blank white page.
const indexPath = path.join(out, 'app', 'index.html');
const guard = `<script>(function(){function show(m){try{var d=document.getElementById('bs-crash');if(!d){d=document.createElement('pre');d.id='bs-crash';d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;max-height:45vh;overflow:auto;margin:0;padding:12px;background:#2b0b0b;color:#ffd6d6;font:12px/1.4 monospace;border-radius:8px;z-index:99999;white-space:pre-wrap';document.body.appendChild(d);}d.textContent='Blox Studio hit an error:\\n'+m;}catch(e){}}window.addEventListener('error',function(e){show(String(e.message||e.error))});window.addEventListener('unhandledrejection',function(e){show(String(e.reason&&e.reason.message||e.reason))});})();</script>`;
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('<style>', guard + '<style>'));
console.log('prepared .src');
