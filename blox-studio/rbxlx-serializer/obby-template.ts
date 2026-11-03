import type { ClassName, InstanceProps, PlaceInstance, Vec3 } from './place-types.js';

/**
 * Instance constructor used by the template (injected to avoid a circular import with the factory).
 */
export type CreateInstanceFn = (className: ClassName, parentId: string | null, overrides?: InstanceProps, name?: string) => PlaceInstance;

/**
 * Builds the "Sky Islands" obby: a floating start island over the ocean and five themed stages
 * (rainbow hops, lava run, sky machines, disappearing glass + jump pad, truss tower)
 * ending in a glowing finish with a trophy. Gaps are tuned for default Roblox movement
 * (WalkSpeed 16, JumpPower 50 ≈ 6.4 stud jump height).
 * @param createInstance - instance constructor with class defaults
 * @returns instances to append under Workspace (services are not included)
 */
export function buildObby(createInstance: CreateInstanceFn): PlaceInstance[] {
  const items: PlaceInstance[] = [];
  const add = (className: PlaceInstance['className'], parentId: string, props: InstanceProps, name: string) => {
    const inst = createInstance(className, parentId, props, name);
    items.push(inst);
    return inst;
  };
  const model = (name: string, parentId = 'Workspace') => add('Model', parentId, {}, name);
  const block = (parentId: string, name: string, position: Vec3, size: Vec3, color: string, material: string, extra: InstanceProps = {}) =>
    add('Part', parentId, { position, size, color, material, ...extra }, name);
  const flag = (parentId: string, x: number, topY: number, z: number) => {
    block(parentId, 'FlagPole', [x, topY + 5, z], [0.5, 10, 0.5], '#e5e7eb', 'Metal', { canCollide: false });
    block(parentId, 'Flag', [x + 1.7, topY + 8.5, z], [3, 2, 0.2], '#22c55e', 'Neon', { canCollide: false });
  };

  // World ----------------------------------------------------------------------
  const world = model('World');
  block(world.id, 'Ocean', [0, -24, -150], [2048, 2, 2048], '#1d8fe0', 'Glass', { transparency: 0.25, reflectance: 0.2, behavior: 'kill', castShadow: false });
  block(world.id, 'IslandRock', [0, -8.5, 4], [44, 14, 40], '#7a6a5c', 'Rock');
  block(world.id, 'IslandSand', [0, -1.4, 4], [50, 1.2, 46], '#e9d7a5', 'Sand');
  block(world.id, 'IslandGrass', [0, -0.5, 4], [46, 1, 42], '#5cb85c', 'Grass');
  const tree = (x: number, z: number, s = 1) => {
    const t = model('Tree', world.id);
    block(t.id, 'Trunk', [x, 4 * s, z], [1.6 * s, 8 * s, 1.6 * s], '#7b4a2a', 'Wood');
    block(t.id, 'Leaves', [x, 9.5 * s, z], [8 * s, 8 * s, 8 * s], '#3fa34d', 'LeafyGrass', { shape: 'Ball' });
    block(t.id, 'LeavesTop', [x + 0.8 * s, 12.5 * s, z - 0.5 * s], [5 * s, 5 * s, 5 * s], '#4cbb5a', 'LeafyGrass', { shape: 'Ball' });
  };
  tree(-17, 18); tree(17, 17, 1.2); tree(-17, -8, 0.9); tree(17, -9);
  block(world.id, 'Rock', [11, 1, 21], [4, 3, 3.5], '#8d8f96', 'Slate', { rotation: [0, 25, 8] });
  block(world.id, 'Rock', [-10, 0.8, -12], [3, 2.4, 3], '#8d8f96', 'Slate', { rotation: [10, -30, 0] });

  add('SpawnLocation', 'Workspace', { position: [0, 0.5, 10], size: [10, 1, 10], color: '#3d7bfd', material: 'SmoothPlastic' }, 'SpawnLocation');

  const gate = model('StartGate', world.id);
  block(gate.id, 'PillarL', [-8, 6, -14], [2, 12, 2], '#f2f2f2', 'Marble');
  block(gate.id, 'PillarR', [8, 6, -14], [2, 12, 2], '#f2f2f2', 'Marble');
  const beam = block(gate.id, 'Beam', [0, 12.5, -14], [18, 1.5, 2], '#00d1ff', 'Neon');
  add('PointLight', beam.id, { brightness: 2, range: 20, color: '#00d1ff' }, 'Glow');

  // Stage 1 · Rainbow hops ------------------------------------------------------
  const s1 = model('Stage1_RainbowHops');
  ['#ff4d6d', '#ff9f1c', '#ffd60a', '#2ec4b6', '#3d7bfd', '#9b5de5'].forEach((color, i) => {
    block(s1.id, `Hop${i + 1}`, [i % 2 ? 2.5 : -2.5, 1 + i * 1.2, -24 - i * 10], [6, 1, 6], color, 'SmoothPlastic');
  });
  const cp2 = block(s1.id, 'Checkpoint2', [0, 7.5, -86], [14, 1, 14], '#22c55e', 'SmoothPlastic', { behavior: 'checkpoint', checkpoint: 2 });
  flag(cp2.id, 5.5, 8, -91.5);

  // Stage 2 · Lava run ----------------------------------------------------------
  const s2 = model('Stage2_LavaRun');
  block(s2.id, 'LavaPool', [0, 5.6, -121], [24, 1, 56], '#ff5a1f', 'CrackedLava', { behavior: 'kill' });
  const glow = block(s2.id, 'LavaGlow', [0, 6.15, -121], [24, 0.1, 56], '#ff3d00', 'Neon', { canCollide: false, castShadow: false, transparency: 0.5 });
  add('PointLight', glow.id, { brightness: 3, range: 40, color: '#ff6a00' }, 'Heat');
  for (let i = 0; i < 6; i++) {
    block(s2.id, `Stone${i + 1}`, [i % 2 ? 3 : -3, 7.5, -98 - i * 9], [6, 2, 6], '#3b3f4a', 'Basalt');
  }
  block(s2.id, 'LaserBar', [0, 9.4, -111.5], [12, 0.5, 0.5], '#ff1f1f', 'Neon', { behavior: 'kill' });
  const cp3 = block(s2.id, 'Checkpoint3', [0, 7.5, -156], [14, 1, 14], '#22c55e', 'SmoothPlastic', { behavior: 'checkpoint', checkpoint: 3 });
  flag(cp3.id, 5.5, 8, -161.5);

  // Stage 3 · Sky machines (moving platforms + spinner) -----------------------------
  const s3 = model('Stage3_SkyMachines');
  block(s3.id, 'Slider1', [-6, 7.5, -169], [8, 1, 8], '#f59e0b', 'DiamondPlate', { motion: 'move', moveOffset: [12, 0, 0], moveTime: 2.6 });
  block(s3.id, 'Slider2', [6, 8.5, -179], [8, 1, 8], '#f59e0b', 'DiamondPlate', { motion: 'move', moveOffset: [-12, 0, 0], moveTime: 2.2 });
  block(s3.id, 'Lift', [0, 9, -189], [8, 1, 8], '#f59e0b', 'DiamondPlate', { motion: 'move', moveOffset: [0, 6, 0], moveTime: 2 });
  block(s3.id, 'SpinnerDisc', [0, 15, -208], [1, 26, 26], '#cbd5e1', 'Metal', { shape: 'Cylinder', rotation: [0, 0, 90] });
  block(s3.id, 'SpinnerBar', [0, 16.3, -208], [22, 1.2, 1.2], '#ff1f1f', 'Neon', { behavior: 'kill', motion: 'spin', spinSpeed: 1.4, canCollide: false });
  block(s3.id, 'SpinnerHub', [0, 16.5, -208], [2.5, 2, 2.5], '#334155', 'Metal', { motion: 'spin', spinSpeed: 1.4 });
  const cp4 = block(s3.id, 'Checkpoint4', [0, 15, -229], [14, 1, 14], '#22c55e', 'SmoothPlastic', { behavior: 'checkpoint', checkpoint: 4 });
  flag(cp4.id, 5.5, 15.5, -234.5);

  // Stage 4 · Disappearing glass and jump pad -------------------------------------
  const s4 = model('Stage4_GlassAndBounce');
  for (let i = 0; i < 5; i++) {
    block(s4.id, `GlassTile${i + 1}`, [i % 2 ? 2.5 : -2.5, 15.2, -241 - i * 9], [6, 0.6, 6], '#7dd3fc', 'Glass', { transparency: 0.2, behavior: 'fade' });
  }
  block(s4.id, 'Landing', [0, 15, -287], [12, 1, 10], '#e2e8f0', 'Concrete');
  block(s4.id, 'JumpPad', [0, 15.7, -287], [5, 0.4, 5], '#4ade80', 'Neon', { behavior: 'jumpPad', jumpPower: 110 });
  block(s4.id, 'HighLedge', [0, 35, -301], [14, 1, 12], '#22c55e', 'SmoothPlastic', { behavior: 'checkpoint', checkpoint: 5 });

  // Stage 5 · Truss tower and finish ------------------------------------------------
  const s5 = model('Stage5_TrussTower');
  block(s5.id, 'Tower', [0, 30, -316], [16, 50, 16], '#64748b', 'Brick');
  add('TrussPart', s5.id, { position: [0, 46, -307], size: [2, 20, 2] }, 'ClimbTruss');
  block(s5.id, 'TowerTop', [0, 55.5, -316], [18, 1, 18], '#f8fafc', 'Marble');
  const finish = block(s5.id, 'Finish', [0, 56.2, -316], [10, 0.4, 10], '#ffd60a', 'Neon', { behavior: 'finish' });
  add('PointLight', finish.id, { brightness: 4, range: 30, color: '#ffd60a' }, 'FinishGlow');
  block(s5.id, 'TrophyBase', [0, 57.5, -322], [3, 2, 3], '#1f2937', 'Marble');
  block(s5.id, 'TrophyStem', [0, 59, -322], [1.4, 1, 1], '#ffcc00', 'Foil', { shape: 'Cylinder', rotation: [0, 0, 90] });
  block(s5.id, 'TrophyCup', [0, 61.2, -322], [3.6, 3.6, 3.6], '#ffcc00', 'Foil', { shape: 'Ball', reflectance: 0.4 });

  return items;
}
