import express from 'express';
import { createHash } from 'node:crypto';
import { BloxStudioService } from "./blox-studio-service.js";

export function run() {
  const app = express();
  const service = BloxStudioService.from();
  const port = process.env.PORT || 3000;
  const ready = service.init().catch((err) => console.error('Failed to init storage', err));

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
  app.use('/projects', (req, res, next) => {
    const key = String(req.headers['x-owner-key'] || req.query.key || '');
    if (key.length < 32) { res.status(401).json({ message: 'Open Blox Studio in the browser to use your projects.' }); return; }
    res.locals.ownerHash = createHash('sha256').update(key).digest('hex');
    next();
  });
  app.param('id', async (req, res, next, id) => {
    try {
      if (await service.projects.isOwner(String(id), ownerOf(res))) { next(); return; }
      res.status(404).json({ message: 'Project not found' });
    } catch (err) { next(err); }
  });

  app.get('/', (_req, res) => { res.json({ message: 'Blox Studio service' }); });

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

  app.post('/projects/:id/publish', wrap(async (req, res) => {
    const versionType = req.body?.versionType === 'Saved' ? 'Saved' : 'Published';
    res.json(await service.publish(String(req.params.id), versionType));
  }));

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
