import { createPlaceTemplate, type PlaceInstance } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { handleRpc, type McpStore } from './mcp.js';
import type { Project } from './project-repository.js';

function fakeStore(): { store: McpStore; project: Project } {
  const project: Project = { id: 'p1', name: 'Mine', instances: createPlaceTemplate('baseplate'), universeId: '', placeId: '', publishHistory: [], updatedAt: '', createdAt: '' };
  const store: McpStore = {
    listProjects: async () => [{ ...project, instances: undefined } as never],
    getProject: async (id) => (id === 'p1' ? project : null),
    saveInstances: async (_id, instances: PlaceInstance[]) => { project.instances = instances; },
    createProject: async () => project,
  };
  return { store, project };
}

const call = async (store: McpStore, name: string, args: Record<string, unknown>) => {
  const r = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store)) as { result: { content: { text: string }[]; isError?: boolean } };
  return r.result;
};

describe('blox studio MCP', () => {
  it('answers initialize and lists tools, but has no publish tool', async () => {
    const { store } = fakeStore();
    const init = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, store)) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe('blox-studio');
    const list = (await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, store)) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toContain('run_luau');
    expect(names).not.toContain('publish');
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, store)).toBeNull();
  });

  it('adds, updates and deletes parts', async () => {
    const { store, project } = fakeStore();
    const added = await call(store, 'add_part', { projectId: 'p1', shape: 'Wedge', position: [10, 2, 0], name: 'Ramp' });
    expect(added.content[0].text).toContain('Added Wedge');
    const ramp = project.instances.find((i) => i.name === 'Ramp')!;
    expect(ramp.props.shape).toBe('Wedge');
    expect((await call(store, 'update_instance', { projectId: 'p1', id: ramp.id, color: '#00ff00' })).isError).toBeUndefined();
    expect(project.instances.find((i) => i.id === ramp.id)!.props.color).toBe('#00ff00');
    expect((await call(store, 'delete_instances', { projectId: 'p1', ids: ['Workspace'] })).isError).toBe(true);
    expect((await call(store, 'delete_instances', { projectId: 'p1', ids: [ramp.id] })).content[0].text).toContain('Deleted 1');
  });

  it('rejects bad input and unknown places', async () => {
    const { store } = fakeStore();
    expect((await call(store, 'add_part', { projectId: 'p1', position: [1, 2] })).isError).toBe(true);
    expect((await call(store, 'get_place', { projectId: 'nope' })).isError).toBe(true);
  });

  it('runs Luau and saves the changes', async () => {
    const { store, project } = fakeStore();
    const r = await call(store, 'run_luau', { projectId: 'p1', source: 'local p = Instance.new("Part") p.Name = "Made" p.Parent = workspace print("ok")' });
    expect(r.content[0].text).toContain('ok');
    expect(project.instances.some((i) => i.name === 'Made')).toBe(true);
  });
});
