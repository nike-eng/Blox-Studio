import { run } from '../blox-studio/blox-studio-service/blox-studio-service.app-root.js';

// Starts the Blox Studio server. Settings come from environment variables:
//   MONGO_URL       MongoDB connection string (required)
//   ROBLOX_API_KEY  Open Cloud key for publishing (optional)
//   CORS_ORIGIN     address of the web app that may call this server
//   PORT            set by the host
run();
