# Standalone web build (no Bit needed)

Builds the Blox Studio web app from the source in `../blox-studio` so it can be hosted for free on Cloudflare Pages, Vercel, Netlify, etc.

Cloudflare Pages settings:
- Root directory: `standalone`
- Build command: `npm install && npm run build`
- Build output directory: `dist`
- Environment variable `VITE_SERVICE_URL` = address of the Blox Studio server (no trailing slash). Leave unset to use the Bit gateway path.
