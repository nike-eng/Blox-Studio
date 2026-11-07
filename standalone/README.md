# Standalone web build (no Bit needed)

Builds the Blox Studio web app from the source in `../blox-studio` so it can be hosted for free on Cloudflare Pages, Vercel, Netlify, etc.

Cloudflare settings (Workers & Pages, connect to Git):
- Project name: `blox-studio`
- Root directory (Advanced settings): `standalone`
- Build command: `npm install && npm run build`
- Deploy command: `npx wrangler deploy` (uses wrangler.jsonc)
- Environment variable `VITE_SERVICE_URL` = address of the Blox Studio server (no trailing slash). Leave unset to use the Bit gateway path.
