import express from 'express';
import { BloxStudioService } from "./blox-studio-service.js";
import { handleRpc, type McpStore } from "./mcp.js";
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import { cachedVerifier, friendlyAuthError, guestOwnerHash, looksLikeEmail, makeLimiter, resolveCaller, safeRedirect, type AuthUser } from './auth.js';

export function run() {
  const app = express();
  app.set('trust proxy', 1);

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // Max 15 file uploads per 15 mins per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many uploads. Please wait a few minutes and try again.' },
  });

  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // Max 60 project saves/creates per 15 mins per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Saving too fast. Please wait a moment.' },
  });
  const service = BloxStudioService.from();
  const port = process.env.PORT || 3000;
  const ready = service.init().catch((err) => console.error('Failed to init storage', err));
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap to protect Render's free RAM
  });
  
  // Browser access from another website (for example the Cloudflare-hosted web app).
  // Set CORS_ORIGIN to that site's address; separate several with commas. Without it, no other site is allowed.
  const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, x-owner-key, authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'content-disposition');
      res.setHeader('Access-Control-Max-Age', '600');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });
      app.get('/ping', async (_req, res) => {
    try {
      await supabase.storage.from('uploads').list('', { limit: 1 });
    } catch {
      // Ignore storage ping errors so Render uptime check always succeeds
    }
    res.status(200).send('pong');
  });

  app.use(express.json({ limit: '20mb' }));
  app.use(async (_req, _res, next) => { await ready; next(); });

  const wrap = (fn: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
    try { await fn(req, res, next); } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  };

  // Ownership: every request to /projects must carry the browser's private owner key.
  // Only the hash is stored, and a project can only be touched by the key that owns it.
  const ownerOf = (res: express.Response) => res.locals.ownerHash as string;
  // A signed-in person sends their Supabase token; a guest sends the private browser key. Tokens are checked with Supabase.
  const newAuthClient = () => createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { auth: { persistSession: false, autoRefreshToken: false } });
  const authClient = newAuthClient();
  const verifyToken = cachedVerifier(async (token): Promise<AuthUser | null> => {
    const { data, error } = await authClient.auth.getUser(token);
    // A refusal (bad or expired token) means "not signed in"; a hiccup (rate limit, outage) must not sign anyone out.
    if (error) { if (typeof error.status === 'number' && error.status >= 400 && error.status < 500 && error.status !== 429) return null; throw error; }
    return data.user ? { id: data.user.id, email: data.user.email || '' } : null;
  });
  const requireOwner: express.RequestHandler = async (req, res, next) => {
    let caller;
    try {
      caller = await resolveCaller({ authorization: req.headers.authorization, ownerKey: String(req.headers['x-owner-key'] || req.query.key || '') }, verifyToken);
    } catch {
      res.status(503).json({ message: 'Sign-in is busy right now. Try again in a moment.' }); return;
    }
    if (!caller.ok) { res.status(caller.status).json({ message: caller.message }); return; }
    res.locals.ownerHash = caller.ownerHash;
    res.locals.user = caller.user;
    next();
  };
  app.get('/projects/share/:shareId', wrap(async (req, res) => {
    const project = await service.projects.get(String(req.params.shareId));
    if (!project) {
      res.status(404).json({ message: 'Shared place not found' });
      return;
    }
    res.json({
      id: project.id,
      name: project.name,
      instances: project.instances,
      updatedAt: project.updatedAt,
      readOnly: true,
    });
  }));
  app.use('/projects', writeLimiter, requireOwner);
  app.use('/mcp-link', requireOwner);
  app.post('/upload', uploadLimiter, requireOwner, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) {
      res.status(400).json({ message: 'No file provided' });
      return;
    }

    const safeName = `${ownerOf(res)}/${Date.now()}-${req.file.originalname.replace(/\s+/g, '-')}`;

    const { error } = await supabase.storage
      .from('uploads')
      .upload(safeName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage
      .from('uploads')
      .getPublicUrl(safeName);

    res.json({ url: data.publicUrl });
  }));

  // Small in-memory rate limiter: at most `max` calls per minute for one key.
  const hits = new Map<string, number[]>();
  const limited = (key: string, max: number): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < 60000);
    if (recent.length >= max) { hits.set(key, recent); return true; }
    recent.push(now); hits.set(key, recent);
    return false;
  };
  app.param('id', async (req, res, next, id) => {
    try {
      if (await service.projects.isOwner(String(id), ownerOf(res))) { next(); return; }
      res.status(404).json({ message: 'Project not found' });
    } catch (err) { next(err); }
  });

  // ---- Accounts: sign in with an email link (Supabase). Tokens are never stored here; Supabase checks them.
  const emailLimit = makeLimiter(3, 10 * 60_000);
  const ipLimit = makeLimiter(15, 10 * 60_000);
  app.post('/auth/email', wrap(async (req, res) => {
    const { email, redirectTo } = req.body || {};
    if (!looksLikeEmail(email)) { res.status(400).json({ message: 'Type a real email address.' }); return; }
    if (!safeRedirect(redirectTo, req.headers.origin, allowedOrigins)) { res.status(400).json({ message: 'This site is not allowed to start sign-in.' }); return; }
    if (!emailLimit(email.toLowerCase()) || !ipLimit(req.ip || '')) { res.status(429).json({ message: 'Too many tries. Wait a few minutes and try again.' }); return; }
    const { error } = await newAuthClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) { res.status(error.status === 429 ? 429 : 400).json({ message: friendlyAuthError(error.message) }); return; }
    res.json({ ok: true });
  }));

  app.post('/auth/refresh', wrap(async (req, res) => {
    const token = req.body?.refreshToken;
    if (typeof token !== 'string' || token.length < 10 || token.length > 2000) { res.status(400).json({ message: 'Missing sign-in token.' }); return; }
    const { data, error } = await newAuthClient().auth.refreshSession({ refresh_token: token });
    if (error || !data.session) { res.status(401).json({ message: 'Your sign-in has expired. Please sign in again.' }); return; }
    const s = data.session;
    res.json({ accessToken: s.access_token, refreshToken: s.refresh_token, expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in });
  }));

  app.get('/account', requireOwner, wrap(async (_req, res) => {
    const user = res.locals.user as AuthUser | undefined;
    res.json({ signedIn: !!user, email: user?.email || '' });
  }));

  // How many projects are waiting on this browser (made before signing in).
  app.get('/account/guest', requireOwner, wrap(async (req, res) => {
    const key = String(req.headers['x-owner-key'] || '');
    res.json({ count: key.length >= 32 ? await service.projects.countOwned(guestOwnerHash(key)) : 0 });
  }));

  // Moves this browser's projects into the signed-in account. Nothing is deleted.
  app.post('/account/claim', requireOwner, wrap(async (req, res) => {
    if (!res.locals.user) { res.status(401).json({ message: 'Sign in first.' }); return; }
    const key = String(req.headers['x-owner-key'] || '');
    res.json({ moved: key.length >= 32 ? await service.projects.claim(guestOwnerHash(key), ownerOf(res)) : 0 });
  }));

  app.get('/', (_req, res) => { res.json({ message: 'VoxMesa service' }); });

  app.get('/roblox/status', (_req, res) => {
    res.json({ configured: service.publisher.configured });
  });

  app.get('/projects', wrap(async (_req, res) => {
    res.json(await service.projects.list(ownerOf(res)));
  }));

  app.post('/projects', wrap(async (req, res) => {
    const { name, template } = req.body || {};
    res.json(await service.projects.create(String(name || 'Untitled Place'), template, ownerOf(res)));
  }));

  app.get('/projects/:id', wrap(async (req, res) => {
    const project = await service.projects.get(String(req.params.id));
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }
    res.json(project);
  }));

  app.put('/projects/:id', wrap(async (req, res) => {
    const { name, instances, universeId, placeId } = req.body || {};
    const patch: Record<string, unknown> = {};
    if (typeof name === 'string') patch.name = name;
    if (Array.isArray(instances)) patch.instances = instances;
    if (typeof universeId === 'string') patch.universeId = universeId.trim();
    if (typeof placeId === 'string') patch.placeId = placeId.trim();
    const project = await service.projects.update(String(req.params.id), patch);
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }
    res.json(project);
  }));

  app.delete('/projects/:id', wrap(async (req, res) => {
    res.json({ ok: await service.projects.remove(String(req.params.id)) });
  }));

  app.get('/projects/:id/export', wrap(async (req, res) => {
    const project = await service.projects.get(String(req.params.id));
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }
    const filename = `${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'place'}.rbxlx`;
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(service.exportPlace(project));
  }));

  // Plain-language checklist shown before publishing.
  app.get('/projects/:id/publish-check', wrap(async (req, res) => {
    const project = await service.projects.get(String(req.params.id));
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }
    const items = [
      { ok: service.publisher.configured, text: service.publisher.configured ? 'The server has a Roblox key.' : 'The server has no Roblox key yet. The owner must set ROBLOX_API_KEY on the server.' },
      { ok: /^\d+$/.test(project.universeId || ''), text: /^\d+$/.test(project.universeId || '') ? 'Universe ID is set.' : 'Set the Universe ID (digits only) in Game settings.' },
      { ok: /^\d+$/.test(project.placeId || ''), text: /^\d+$/.test(project.placeId || '') ? 'Place ID is set.' : 'Set the Place ID (digits only) in Game settings.' },
      { ok: project.instances.some((i) => i.className === 'SpawnLocation'), text: project.instances.some((i) => i.className === 'SpawnLocation') ? 'The place has a SpawnLocation.' : 'Add a SpawnLocation so players know where to start.' },
      { ok: project.instances.some((i) => i.className === 'Part'), text: project.instances.some((i) => i.className === 'Part') ? 'The place has parts to play on.' : 'The place has no parts yet.' },
    ];
    res.json({ ready: items.every((i) => i.ok), items });
  }));

  app.post('/projects/:id/publish', wrap(async (req, res) => {
    if (limited(`publish:${ownerOf(res)}`, 5)) { res.status(429).json({ message: 'You are publishing too fast. Wait a minute and try again.' }); return; }
    const versionType = req.body?.versionType === 'Saved' ? 'Saved' : 'Published';
    res.json(await service.publish(String(req.params.id), versionType));
  }));

  // ---- AI link (MCP): lets an AI assistant edit the owner's places through a private link.
  app.get('/mcp-link', wrap(async (_req, res) => { res.json({ active: await service.projects.hasMcpLink(ownerOf(res)) }); }));
  app.post('/mcp-link', wrap(async (_req, res) => { res.json({ token: await service.projects.createMcpLink(ownerOf(res)) }); }));
  app.delete('/mcp-link', wrap(async (_req, res) => { await service.projects.revokeMcpLink(ownerOf(res)); res.json({ ok: true }); }));

  const storeFor = (ownerHash: string): McpStore => {
    const owned = async (id: string) => { if (!(await service.projects.isOwner(id, ownerHash))) throw new Error('Project not found'); };
    return {
      listProjects: () => service.projects.list(ownerHash),
      getProject: async (id) => ((await service.projects.isOwner(id, ownerHash)) ? service.projects.get(id) : null),
      saveInstances: async (id, instances) => { await owned(id); await service.projects.update(id, { instances }); },
      createProject: (name, template) => service.projects.create(name, template, ownerHash),
    };
  };

  app.post('/mcp/:token', async (req, res) => {
    try {
      const token = String(req.params.token);
      const ownerHash = await service.projects.ownerForMcpToken(token);
      if (!ownerHash) { res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'This AI link is not valid. Make a new one in VoxMesa (Game settings → Connect an AI).' } }); return; }
      if (limited(`mcp:${token}`, 120)) { res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32002, message: 'Too many requests. Wait a minute.' } }); return; }
      res.setHeader('Cache-Control', 'no-store');
      const store = storeFor(ownerHash);
      const body = req.body;
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.slice(0, 20).map((m) => handleRpc(m, store)))).filter((r) => r !== null);
        if (!out.length) { res.status(202).end(); return; }
        res.json(out); return;
      }
      const out = await handleRpc(body, store);
      if (out === null) { res.status(202).end(); return; }
      res.json(out);
    } catch (err) {
      res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
      console.error('mcp error', (err as Error).message);
    }
  });
  app.get('/mcp/:token', (_req, res) => { res.status(405).set('Allow', 'POST').json({ message: 'This is a VoxMesa AI link. Add it as a custom connector in your AI app.' }); });

  const server = app.listen(port, () => {
    console.log(`🚀  Server ready at: http://localhost:${port}`);
  });

  return {
    port,
    // implement stop to support HMR.
    stop: async () => {
      server.closeAllConnections();
      server.close();
    }
  };
}
