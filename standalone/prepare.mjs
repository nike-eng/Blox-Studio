// Copies the app + serializer source into ./.src with a plain tsconfig, so the build does not depend on Bit's generated files.
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
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
console.log('prepared .src');
