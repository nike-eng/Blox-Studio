import { GameRuntime, createInstance, createPlaceTemplate, ensureServices, toRbxlx, type PlaceInstance } from './index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function place(scripts: { cls: 'Script' | 'LocalScript' | 'ModuleScript'; parent: string; name: string; src: string }[], parts: { name: string; parent?: string }[] = []) {
  const list: PlaceInstance[] = createPlaceTemplate('empty');
  parts.forEach((p) => list.push(createInstance('Part', p.parent || 'Workspace', {}, p.name)));
  scripts.forEach((s) => list.push(createInstance(s.cls, s.parent, { source: s.src }, s.name)));
  return list;
}
async function boot(list: PlaceInstance[]) {
  const lines: string[] = []; const changes: string[] = [];
  const rt = new GameRuntime(list, { out: (k, t) => lines.push(k === 'print' ? t : `${k}:${t}`), onChange: (i, k) => changes.push(`${i.name}.${k}`) });
  await rt.start(); await sleep(120);
  return { rt, lines, changes };
}

describe('GameRuntime', () => {
  it('runs a Script and reacts to Touched', async () => {
    const list = place([{ cls: 'Script', parent: 'Workspace', name: 'S', src: 'local p = workspace.Lava\np.Touched:Connect(function(hit) print("hit", hit.Name, hit.Parent.Name) p.Color = Color3.fromRGB(255,0,0) end)\nprint("ready")' }], [{ name: 'Lava' }]);
    const { rt, lines, changes } = await boot(list);
    expect(lines).toEqual(['ready']);
    rt.touch(list.find((i) => i.name === 'Lava')!.id); await sleep(60);
    expect(lines).toEqual(['ready', 'hit\tHumanoidRootPart\tPlayer']);
    expect(changes).toContain('Lava.color');
    expect(rt.nodes.get(list.find((i) => i.name === 'Lava')!.id)!.props.color).toBe('#ff0000');
    rt.stop();
  });

  it('keeps server and client apart and copies StarterGui into PlayerGui', async () => {
    const list = place([
      { cls: 'Script', parent: 'ServerScriptService', name: 'Srv', src: 'local P = game:GetService("Players") print("server local player:", P.LocalPlayer) P.PlayerAdded:Connect(function(pl) print("joined", pl.Name) end)' },
      { cls: 'LocalScript', parent: 'StarterGui', name: 'Hud', src: 'local P = game:GetService("Players") print("client local player:", P.LocalPlayer.Name, script.Parent.Name, game:GetService("RunService"):IsClient())' },
      { cls: 'LocalScript', parent: 'ReplicatedStorage', name: 'Never', src: 'print("should not run")' },
    ]);
    const { rt, lines } = await boot(list);
    expect(lines).toEqual(['server local player:\tnil', 'joined\tPlayer', 'client local player:\tPlayer\tPlayerGui\ttrue']);
    rt.stop();
  });

  it('shares ModuleScripts through require (cached)', async () => {
    const list = place([
      { cls: 'ModuleScript', parent: 'ReplicatedStorage', name: 'Counter', src: 'print("loading") local M = {n = 0} function M.bump() M.n += 1 return M.n end return M' },
      { cls: 'Script', parent: 'Workspace', name: 'A', src: 'local m = require(game.ReplicatedStorage.Counter) m.bump() m.bump() local m2 = require(game.ReplicatedStorage.Counter) print(m2.n, m == m2)' },
    ]);
    const { rt, lines } = await boot(list);
    expect(lines).toEqual(['loading', '2\ttrue']);
    rt.stop();
  });

  it('builds a leaderboard and a RemoteEvent round trip', async () => {
    const list = place([
      { cls: 'Script', parent: 'ServerScriptService', name: 'Stats', src: 'local P=game:GetService("Players")\nP.PlayerAdded:Connect(function(pl)\n local f=Instance.new("Folder") f.Name="leaderstats" f.Parent=pl\n local c=Instance.new("IntValue") c.Name="Coins" c.Value=5 c.Parent=f\nend)\nlocal r=Instance.new("RemoteEvent") r.Name="Buy" r.Parent=game.ReplicatedStorage\nr.OnServerEvent:Connect(function(pl, n) pl.leaderstats.Coins.Value += n print("server got", n) end)' },
      { cls: 'LocalScript', parent: 'StarterGui', name: 'Client', src: 'local r=game.ReplicatedStorage:WaitForChild("Buy") r:FireServer(7)' },
    ]);
    const { rt, lines } = await boot(list);
    expect(lines).toContain('server got\t7');
    expect(rt.leaderstats()).toEqual([{ name: 'Coins', value: 12 }]);
    rt.stop();
  });

  it('fires Heartbeat, runs tweens and kills the humanoid', async () => {
    const list = place([{ cls: 'Script', parent: 'Workspace', name: 'T', src: 'local p=workspace.Door local ts=game:GetService("TweenService") local tw=ts:Create(p, TweenInfo.new(1, Enum.EasingStyle.Linear, Enum.EasingDirection.Out), {Transparency=1}) tw.Completed:Connect(function() print("tween done", p.Transparency) end) tw:Play() local n=0 game:GetService("RunService").Heartbeat:Connect(function(dt) n+=1 end) p.Touched:Connect(function(h) local hum=h.Parent:FindFirstChild("Humanoid") if hum then hum.Died:Connect(function() print("died, beats>0:", n>0) end) hum.Health=0 end end)' }], [{ name: 'Door' }]);
    const { rt, lines } = await boot(list);
    for (let k = 0; k < 70; k++) rt.step(1 / 60);
    await sleep(60);
    expect(lines).toContain('tween done\t1');
    rt.touch(list.find((i) => i.name === 'Door')!.id); await sleep(60);
    expect(rt.char.alive).toBe(false);
    expect(lines).toContain('died, beats>0:\ttrue');
    rt.characterRespawned(); expect(rt.char.health).toBe(100);
    rt.stop();
  });

  it('reports errors with the script path and stops waiting loops', async () => {
    const list = place([
      { cls: 'Script', parent: 'Workspace', name: 'Bad', src: 'local x = workspace.Nope.Position' },
      { cls: 'Script', parent: 'Workspace', name: 'Loop', src: 'while true do task.wait(0.01) end' },
    ]);
    const { rt, lines } = await boot(list);
    expect(lines.some((l) => l.startsWith('error:Workspace.Bad:') && l.includes('Nope is not a valid member of Workspace'))).toBe(true);
    rt.stop(); await sleep(80);
  });

  it('copies StarterPlayerScripts into the player and runs them there', async () => {
    const list = place([
      { cls: 'LocalScript', parent: 'StarterPlayerScripts', name: 'Input', src: 'print("player script in", script.Parent.Name, "of", script.Parent.Parent.Name)' },
      { cls: 'LocalScript', parent: 'StarterPlayer', name: 'Wrong', src: 'print("should not run")' },
    ]);
    const { rt, lines } = await boot(list);
    expect(lines).toEqual(['player script in\tPlayerScripts\tof\tPlayer']);
    rt.stop();
  });

  it('adds missing services to old places without touching anything else', () => {
    const old = createPlaceTemplate('obby').filter((i) => !['StarterPlayer', 'StarterPlayerScripts', 'StarterCharacterScripts', 'StarterPack', 'ServerStorage', 'ReplicatedFirst'].includes(i.id));
    const fixed = ensureServices(old);
    const ids = fixed.map((i) => i.id);
    expect(ids.slice(0, 11)).toEqual(['Workspace', 'Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer', 'StarterPlayerScripts', 'StarterCharacterScripts']);
    expect(fixed.find((i) => i.id === 'StarterPlayerScripts')!.parentId).toBe('StarterPlayer');
    expect(fixed.length).toBe(old.length + 6);
    expect(ensureServices(fixed)).toBe(fixed);
  });

  it('exports one StarterPlayer, with BloxClient inside the place\'s own StarterPlayerScripts', () => {
    const xml = toRbxlx(createPlaceTemplate('obby'));
    expect((xml.match(/class="StarterPlayer"/g) || []).length).toBe(1);
    expect((xml.match(/class="StarterPlayerScripts"/g) || []).length).toBe(1);
    expect((xml.match(/name="Name">BloxClient</g) || []).length).toBe(1);
  });
});
