# Blox Studio server (standalone)

Runs the project storage, AI link (MCP) and Roblox publishing outside Bit.

Environment variables:
- `MONGO_URL`      MongoDB connection string (required, e.g. from MongoDB Atlas free tier)
- `CORS_ORIGIN`    address of the web app allowed to call this server (comma-separate several)
- `ROBLOX_API_KEY` Open Cloud key with universe-places:write (optional; needed to publish). Keep it secret.
- `PORT`           set by the host

Build: `npm install && npm run build`   Start: `npm start`
