import { Interpreter, createPlaceTemplate, runStudioScript, toRbxlx } from './index.js';

async function run(src: string) {
  const lines: string[] = [];
  const it = new Interpreter((k, t) => lines.push(k === 'print' ? t : `${k}:${t}`));
  const res = await it.run(src, 'test');
  return { lines, ok: res.ok };
}

describe('luau-lite', () => {
  it('does arithmetic, strings and tables', async () => {
    expect((await run('print(1+2*3, 10/4, 7//2, 7%3, 2^10, "a".."b"..1)')).lines).toEqual(['7\t2.5\t3\t1\t1024\tab1']);
    expect((await run('local t={1,2,3} t[#t+1]=9 table.insert(t,0) print(#t, table.concat(t,","))')).lines).toEqual(['5\t1,2,3,9,0']);
  });

  it('runs loops, continue and closures', async () => {
    expect((await run('local s=0 for i=1,10 do if i%2==0 then continue end s+=i end print(s)')).lines).toEqual(['25']);
    expect((await run('local function c() local n=0 return function() n+=1 return n end end local a=c() a() a() print(a())')).lines).toEqual(['3']);
  });

  it('supports methods, pcall and type annotations', async () => {
    expect((await run('local D={} D.__index=D function D.new(n) return setmetatable({name=n},D) end function D:hi() return self.name.." hi" end print(D.new("Rex"):hi())')).lines).toEqual(['Rex hi']);
    expect((await run('print(pcall(function() error("boom") end))')).lines).toEqual(['false\tboom']);
    expect((await run('local x: number = 5 local function add(a: number, b: number): number return a+b end print(add(x,2))')).lines).toEqual(['7']);
  });

  it('reports errors with a line number and stops runaway loops', async () => {
    const bad = await run('foo()');
    expect(bad.ok).toBe(false);
    expect(bad.lines[0]).toContain("attempt to call 'foo'");
    const loop = await run('while true do end');
    expect(loop.ok).toBe(false);
    expect(loop.lines[0]).toContain('exhausted allowed execution time');
  });

  it('edits a place through workspace and Instance.new in one change', async () => {
    const place = createPlaceTemplate('baseplate');
    const lines: string[] = [];
    const res = await runStudioScript('local p = Instance.new("WedgePart") p.Name = "Ramp" p.Position = Vector3.new(1, 2, 3) p.Parent = workspace print(p.ClassName)', place, { out: (_k, t) => lines.push(t) });
    expect(res.ok).toBe(true);
    expect(res.changed).toBe(true);
    expect(lines).toEqual(['WedgePart']);
    const ramp = res.instances.find((i) => i.name === 'Ramp');
    expect(ramp?.props.shape).toBe('Wedge');
    expect(ramp?.props.position).toEqual([1, 2, 3]);
    expect(place.find((i) => i.name === 'Ramp')).toBeUndefined();
  });

  it('exports wedge parts as their own Roblox classes', () => {
    const place = createPlaceTemplate('baseplate');
    place.push({ id: 'w1', className: 'Part', name: 'W', parentId: 'Workspace', props: { shape: 'Wedge', position: [0, 1, 0], size: [4, 4, 4] } });
    place.push({ id: 'w2', className: 'Part', name: 'C', parentId: 'Workspace', props: { shape: 'CornerWedge', position: [8, 1, 0], size: [4, 4, 4] } });
    const xml = toRbxlx(place);
    expect(xml).toContain('<Item class="WedgePart"');
    expect(xml).toContain('<Item class="CornerWedgePart"');
  });
});
