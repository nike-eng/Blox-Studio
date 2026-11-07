import { createInstance, runStudioScript, SERVICE_CLASSES, PART_CLASSES, type ClassName, type InstanceProps, type PlaceInstance, type PlaceTemplate, type Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import type { Project } from './project-repository.js';

/**
 * Storage the MCP tools use. Every method is already limited to ONE owner's projects.
 */
export interface McpStore {
  listProjects(): Promise<Omit<Project, 'instances'>[]>;
  getProject(id: string): Promise<Project | null>;
  saveInstances(id: string, instances: PlaceInstance[]): Promise<void>;
  createProject(name: string, template: PlaceTemplate): Promise<Project>;
}

type Json = Record<string, unknown>;
type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const MAX_INSTANCES = 20000;
const SHAPES = ['Block', 'Ball', 'Cylinder', 'Wedge', 'CornerWedge'];
const TEMPLATES = ['baseplate', 'obby', 'empty'];
const CLASSES_ADDABLE: ClassName[] = ['Part', 'TrussPart', 'SpawnLocation', 'Model', 'Folder', 'Script', 'LocalScript', 'ModuleScript', 'PointLight'];

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
const err = (t: string) => text(t, true);

function vec3(v: unknown, what: string, lo: number, hi: number): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) throw new Error(`${what} must be a list of 3 numbers, like [0, 5, 0]`);
  if (v.some((n: number) => n < lo || n > hi)) throw new Error(`${what} numbers must be between ${lo} and ${hi}`);
  return [v[0], v[1], v[2]];
}

function applyProps(target: PlaceInstance, a: Json): void {
  const p = target.props as Record<string, unknown>;
  const isPart = PART_CLASSES.includes(target.className);
  if (typeof a.name === 'string' && a.name.trim()) target.name = a.name.trim().slice(0, 80);
  if (a.position !== undefined) { if (!isPart) throw new Error('position only works on parts'); p.position = vec3(a.position, 'position', -100000, 100000); }
  if (a.size !== undefined) { if (!isPart) throw new Error('size only works on parts'); p.size = vec3(a.size, 'size', 0.05, 2048); }
  if (a.rotation !== undefined) { if (!isPart) throw new Error('rotation only works on parts'); p.rotation = vec3(a.rotation, 'rotation', -360, 360); }
  if (a.color !== undefined) { if (typeof a.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(a.color)) throw new Error('color must look like #ff0000'); p.color = a.color.toLowerCase(); }
  if (a.material !== undefined) { if (typeof a.material !== 'string' || !/^[A-Za-z]{2,24}$/.test(a.material)) throw new Error('material must be a Roblox material name like Plastic or Neon'); p.material = a.material; }
  if (a.transparency !== undefined) { if (typeof a.transparency !== 'number' || a.transparency < 0 || a.transparency > 1) throw new Error('transparency must be between 0 and 1'); p.transparency = a.transparency; }
  if (a.anchored !== undefined) { if (typeof a.anchored !== 'boolean') throw new Error('anchored must be true or false'); p.anchored = a.anchored; }
  if (a.canCollide !== undefined) { if (typeof a.canCollide !== 'boolean') throw new Error('canCollide must be true or false'); p.canCollide = a.canCollide; }
  if (a.shape !== undefined) { if (target.className !== 'Part' || typeof a.shape !== 'string' || !SHAPES.includes(a.shape)) throw new Error(`shape must be one of ${SHAPES.join(', ')} (parts only)`); p.shape = a.shape; }
  if (a.source !== undefined) { if (!['Script', 'LocalScript', 'ModuleScript'].includes(target.className) || typeof a.source !== 'string') throw new Error('source only works on scripts'); p.source = a.source.slice(0, 200000); }
}

const summary = (i: PlaceInstance) => ({
  id: i.id, name: i.name, className: i.className, parentId: i.parentId,
  ...(i.props.position ? { position: i.props.position } : {}),
  ...(i.props.size ? { size: i.props.size } : {}),
  ...(i.props.color ? { color: i.props.color } : {}),
  ...(i.props.material && i.props.material !== 'Plastic' ? { material: i.props.material } : {}),
  ...(i.props.shape && i.props.shape !== 'Block' ? { shape: i.props.shape } : {}),
});

const projectId = { type: 'string', description: 'Project id from list_projects' };
const num3 = (d: string) => ({ type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: d });
const partProps = {
  name: { type: 'string' }, position: num3('Position in studs [x, y, z]; Y is up'), size: num3('Size in studs [x, y, z]'), rotation: num3('Rotation in degrees [x, y, z]'),
  color: { type: 'string', description: 'Hex color like #ff0000' }, material: { type: 'string', description: 'Roblox material, e.g. Plastic, Neon, Wood, Grass' },
  transparency: { type: 'number' }, anchored: { type: 'boolean' }, canCollide: { type: 'boolean' }, shape: { type: 'string', enum: SHAPES },
};

/** Tool definitions shown to the AI. */
export const MCP_TOOLS = [
  { name: 'list_projects', description: 'List the places (projects) in this Blox Studio account.', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_project', description: 'Create a new place.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, template: { type: 'string', enum: TEMPLATES } }, required: ['name'] } },
  { name: 'get_place', description: 'Look inside a place: lists instances (id, name, class, position, size, color). Use className or nameContains to filter. Services are Workspace, Lighting, ReplicatedStorage, ServerScriptService, StarterGui.', inputSchema: { type: 'object', properties: { projectId, className: { type: 'string' }, nameContains: { type: 'string' }, limit: { type: 'number', description: 'Max rows, default 100' } }, required: ['projectId'] } },
  { name: 'run_luau', description: 'Run a Luau script that edits the place (a subset: variables, loops, functions, tables, Vector3, Color3, Instance.new, workspace, game:GetService, print). print() output is returned. Changes are saved. Example: for i=1,5 do local p=Instance.new("Part") p.Position=Vector3.new(i*6,3,0) p.Parent=workspace end', inputSchema: { type: 'object', properties: { projectId, source: { type: 'string' } }, required: ['projectId', 'source'] } },
  { name: 'add_part', description: 'Add one part (Block, Ball, Cylinder, Wedge, CornerWedge) to the Workspace or another parent.', inputSchema: { type: 'object', properties: { projectId, parentId: { type: 'string', description: 'Parent id, default Workspace' }, ...partProps }, required: ['projectId'] } },
  { name: 'update_instance', description: 'Change properties of an existing instance (name, position, size, rotation, color, material, transparency, anchored, canCollide, shape, or a script\'s source).', inputSchema: { type: 'object', properties: { projectId, id: { type: 'string' }, ...partProps, source: { type: 'string' } }, required: ['projectId', 'id'] } },
  { name: 'delete_instances', description: 'Delete instances (and everything inside them). Services cannot be deleted.', inputSchema: { type: 'object', properties: { projectId, ids: { type: 'array', items: { type: 'string' } } }, required: ['projectId', 'ids'] } },
  { name: 'get_publish_info', description: 'Show whether a place is ready for Roblox and its publish history. Publishing itself must be done by the owner with the Publish button in Blox Studio.', inputSchema: { type: 'object', properties: { projectId }, required: ['projectId'] } },
];

const INSTRUCTIONS = 'Blox Studio is a Roblox place editor. Use get_place to look first, then add_part / update_instance / run_luau to build. Y is up; 1 stud is about 0.28 m. The owner sees your edits appear in their editor within a few seconds and can undo them. You cannot publish to Roblox; ask the owner to tap Publish.';

/**
 * Runs one MCP tool for one owner.
 * @param name - tool name
 * @param args - tool arguments
 * @param store - the owner's storage
 */
export async function callTool(name: string, args: Json, store: McpStore): Promise<ToolResult> {
  try {
    if (name === 'list_projects') {
      const list = await store.listProjects();
      return text(list.length ? JSON.stringify(list.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt })), null, 1) : 'No places yet. Use create_project.');
    }
    if (name === 'create_project') {
      const n = typeof args.name === 'string' ? args.name.trim().slice(0, 80) : '';
      if (!n) return err('name is required');
      const t = (args.template as string) || 'baseplate';
      if (!TEMPLATES.includes(t)) return err(`template must be one of ${TEMPLATES.join(', ')}`);
      const p = await store.createProject(n, t as PlaceTemplate);
      return text(`Created "${p.name}" with id ${p.id}.`);
    }
    const id = typeof args.projectId === 'string' ? args.projectId : '';
    const project = id ? await store.getProject(id) : null;
    if (!project) return err('Project not found. Call list_projects to see your places.');
    const items = project.instances;

    if (name === 'get_place') {
      const limit = Math.max(1, Math.min(300, Number(args.limit) || 100));
      const cls = typeof args.className === 'string' ? args.className : '';
      const sub = typeof args.nameContains === 'string' ? args.nameContains.toLowerCase() : '';
      const rows = items.filter((i) => (!cls || i.className === cls) && (!sub || i.name.toLowerCase().includes(sub)));
      return text(`${project.name}: ${items.length} instances in total, ${rows.length} match.\n${JSON.stringify(rows.slice(0, limit).map(summary))}${rows.length > limit ? `\n…and ${rows.length - limit} more (use limit or filters).` : ''}`);
    }
    if (name === 'run_luau') {
      const source = typeof args.source === 'string' ? args.source : '';
      if (!source.trim()) return err('source is required');
      if (source.length > 100000) return err('Script is too long (100,000 characters max).');
      const lines: string[] = [];
      let stopper: (() => void) | undefined;
      const timer = setTimeout(() => stopper?.(), 10000);
      let res;
      try {
        res = await runStudioScript(source, items, { chunk: 'run_luau', out: (k, t) => { if (lines.length < 200) lines.push(k === 'print' ? t : `[${k}] ${t}`); }, onStart: (it) => { stopper = () => it.abort(); } });
      } finally { clearTimeout(timer); }
      if (res.instances.length > MAX_INSTANCES) return err(`That would make more than ${MAX_INSTANCES} instances; nothing was saved.`);
      if (res.changed) await store.saveInstances(project.id, res.instances);
      const out = lines.length ? lines.join('\n') : '(no output)';
      return text(`${out}\n${res.changed ? 'The place was changed and saved.' : 'The place was not changed.'}${res.ok ? '' : ' The script stopped with an error.'}`, !res.ok);
    }
    if (name === 'add_part') {
      if (items.length >= MAX_INSTANCES) return err('This place is full.');
      const parentId = typeof args.parentId === 'string' ? args.parentId : 'Workspace';
      if (!items.some((i) => i.id === parentId)) return err('parentId not found');
      const shape = typeof args.shape === 'string' ? args.shape : 'Block';
      if (!SHAPES.includes(shape)) return err(`shape must be one of ${SHAPES.join(', ')}`);
      const inst = createInstance('Part', parentId, { shape: shape as never, ...(shape === 'Block' ? {} : { size: [4, 4, 4] as Vec3 }) } as InstanceProps, shape === 'Block' ? 'Part' : shape);
      applyProps(inst, args);
      await store.saveInstances(project.id, [...items, inst]);
      return text(`Added ${shape} "${inst.name}" with id ${inst.id} at ${JSON.stringify(inst.props.position)}.`);
    }
    if (name === 'update_instance') {
      const tid = typeof args.id === 'string' ? args.id : '';
      const target = items.find((i) => i.id === tid);
      if (!target) return err('id not found. Use get_place to find ids.');
      const next = items.map((i) => (i.id === tid ? { ...i, props: { ...i.props } } : i));
      applyProps(next.find((i) => i.id === tid)!, args);
      await store.saveInstances(project.id, next);
      return text(`Updated "${next.find((i) => i.id === tid)!.name}".`);
    }
    if (name === 'delete_instances') {
      const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === 'string') : [];
      if (!ids.length) return err('ids is required');
      const gone = new Set<string>();
      const walk = (x: string) => { gone.add(x); items.filter((i) => i.parentId === x).forEach((k) => walk(k.id)); };
      for (const x of ids) {
        const t = items.find((i) => i.id === x);
        if (!t) return err(`id ${x} not found`);
        if (SERVICE_CLASSES.includes(t.className) || !CLASSES_ADDABLE.includes(t.className)) return err(`${t.name} cannot be deleted`);
        walk(x);
      }
      await store.saveInstances(project.id, items.filter((i) => !gone.has(i.id)));
      return text(`Deleted ${gone.size} instance(s).`);
    }
    if (name === 'get_publish_info') {
      const spawn = items.some((i) => i.className === 'SpawnLocation');
      return text(JSON.stringify({
        universeIdSet: !!project.universeId, placeIdSet: !!project.placeId, hasSpawnLocation: spawn,
        lastPublishes: project.publishHistory.slice(0, 3),
        note: 'To publish, the owner opens Game settings to set the Universe and Place IDs, then taps Publish.',
      }, null, 1));
    }
    return err(`Unknown tool: ${name}`);
  } catch (e) {
    return err((e as Error).message || 'Something went wrong');
  }
}

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };

/**
 * Handles one JSON-RPC message from an MCP client (Streamable HTTP, stateless).
 * @returns the JSON-RPC response, or `null` for notifications (reply 202 with no body)
 */
export async function handleRpc(msg: RpcRequest, store: McpStore): Promise<Json | null> {
  const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || typeof msg.method !== 'string') return fail(-32600, 'Invalid request');
  if (msg.id === undefined || msg.method.startsWith('notifications/')) return null;
  switch (msg.method) {
    case 'initialize':
      return reply({ protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'blox-studio', version: '1.0.0' }, instructions: INSTRUCTIONS });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: MCP_TOOLS });
    case 'tools/call': {
      const name = String(msg.params?.name || '');
      if (!MCP_TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
      return reply(await callTool(name, (msg.params?.arguments as Json) || {}, store));
    }
    default: return fail(-32601, `Method not found: ${msg.method}`);
  }
}
