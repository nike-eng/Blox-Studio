import { createInstance, type PlaceInstance, type Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';

/** One ready-made model the Add menu can drop into the place. */
export type KitId = 'tree' | 'house' | 'bridge' | 'stairs' | 'tower' | 'lamp' | 'campfire' | 'fence' | 'pyramid' | 'pine';

type Piece = { name: string; at: Vec3; size: Vec3; color: string; material?: string; shape?: string; light?: { color: string; brightness: number; range: number } };

/** Pieces are described from the ground up: `at` is the bottom-centre of the piece, relative to the model's middle. */
const KITS: Record<KitId, { name: string; pieces: Piece[] }> = {
  tree: {
    name: 'Tree',
    pieces: [
      { name: 'Trunk', at: [0, 0, 0], size: [2, 8, 2], color: '#6b4423', material: 'Wood' },
      { name: 'Leaves', at: [0, 6, 0], size: [10, 7, 10], color: '#2f9e44', material: 'LeafyGrass', shape: 'Ball' },
    ],
  },
  pine: {
    name: 'Pine tree',
    pieces: [
      { name: 'Trunk', at: [0, 0, 0], size: [1.6, 5, 1.6], color: '#5c3a1e', material: 'Wood' },
      { name: 'Layer1', at: [0, 3, 0], size: [9, 3, 9], color: '#237a3b', material: 'LeafyGrass' },
      { name: 'Layer2', at: [0, 6, 0], size: [6.5, 3, 6.5], color: '#2b8a43', material: 'LeafyGrass' },
      { name: 'Layer3', at: [0, 9, 0], size: [4, 3, 4], color: '#34a04f', material: 'LeafyGrass' },
      { name: 'Tip', at: [0, 12, 0], size: [1.8, 2.5, 1.8], color: '#3bb35a', material: 'LeafyGrass' },
    ],
  },
  house: {
    name: 'House',
    pieces: [
      { name: 'Floor', at: [0, 0, 0], size: [20, 1, 16], color: '#8d6e4c', material: 'WoodPlanks' },
      { name: 'BackWall', at: [0, 1, -7.5], size: [20, 10, 1], color: '#e9d8b4', material: 'Brick' },
      { name: 'LeftWall', at: [-9.5, 1, 0], size: [1, 10, 14], color: '#e9d8b4', material: 'Brick' },
      { name: 'RightWall', at: [9.5, 1, 0], size: [1, 10, 14], color: '#e9d8b4', material: 'Brick' },
      { name: 'FrontLeft', at: [-6.5, 1, 7.5], size: [7, 10, 1], color: '#e9d8b4', material: 'Brick' },
      { name: 'FrontRight', at: [6.5, 1, 7.5], size: [7, 10, 1], color: '#e9d8b4', material: 'Brick' },
      { name: 'DoorTop', at: [0, 8, 7.5], size: [6, 3, 1], color: '#e9d8b4', material: 'Brick' },
      { name: 'Roof', at: [0, 11, 0], size: [22, 1.5, 18], color: '#a8432f', material: 'Slate' },
      { name: 'RoofTop', at: [0, 12.5, 0], size: [14, 1.5, 12], color: '#a8432f', material: 'Slate' },
      { name: 'Light', at: [0, 9, 0], size: [2, 0.6, 2], color: '#fff3b0', material: 'Neon', light: { color: '#ffe9a8', brightness: 1.2, range: 22 } },
    ],
  },
  bridge: {
    name: 'Bridge',
    pieces: [
      { name: 'Deck', at: [0, 0, 0], size: [8, 1, 32], color: '#8d6e4c', material: 'WoodPlanks' },
      { name: 'RailLeft', at: [-3.7, 1, 0], size: [0.6, 3, 32], color: '#6b4423', material: 'Wood' },
      { name: 'RailRight', at: [3.7, 1, 0], size: [0.6, 3, 32], color: '#6b4423', material: 'Wood' },
      { name: 'PostA', at: [-3.7, 1, -15.5], size: [1, 5, 1], color: '#5c3a1e', material: 'Wood' },
      { name: 'PostB', at: [3.7, 1, -15.5], size: [1, 5, 1], color: '#5c3a1e', material: 'Wood' },
      { name: 'PostC', at: [-3.7, 1, 15.5], size: [1, 5, 1], color: '#5c3a1e', material: 'Wood' },
      { name: 'PostD', at: [3.7, 1, 15.5], size: [1, 5, 1], color: '#5c3a1e', material: 'Wood' },
    ],
  },
  stairs: {
    name: 'Stairs',
    pieces: Array.from({ length: 10 }, (_, i): Piece => ({ name: `Step${i + 1}`, at: [0, i * 1, -i * 2], size: [8, 1 + 0, 2], color: i % 2 ? '#a0a4ad' : '#b6bac2', material: 'Concrete' })).map((p, i) => ({ ...p, size: [8, i + 1, 2] as Vec3, at: [0, 0, -i * 2] as Vec3 })),
  },
  tower: {
    name: 'Tower',
    pieces: [
      { name: 'Base', at: [0, 0, 0], size: [14, 2, 14], color: '#7b7f8a', material: 'Cobblestone' },
      { name: 'Shaft', at: [0, 2, 0], size: [10, 22, 10], color: '#9a9ea8', material: 'Cobblestone' },
      { name: 'Top', at: [0, 24, 0], size: [14, 2, 14], color: '#7b7f8a', material: 'Cobblestone' },
      { name: 'MerlonA', at: [-5.5, 26, -5.5], size: [3, 3, 3], color: '#9a9ea8', material: 'Cobblestone' },
      { name: 'MerlonB', at: [5.5, 26, -5.5], size: [3, 3, 3], color: '#9a9ea8', material: 'Cobblestone' },
      { name: 'MerlonC', at: [-5.5, 26, 5.5], size: [3, 3, 3], color: '#9a9ea8', material: 'Cobblestone' },
      { name: 'MerlonD', at: [5.5, 26, 5.5], size: [3, 3, 3], color: '#9a9ea8', material: 'Cobblestone' },
    ],
  },
  lamp: {
    name: 'Street lamp',
    pieces: [
      { name: 'Pole', at: [0, 0, 0], size: [0.8, 12, 0.8], color: '#2b2f3a', material: 'Metal' },
      { name: 'Arm', at: [1.4, 11.2, 0], size: [3, 0.6, 0.6], color: '#2b2f3a', material: 'Metal' },
      { name: 'Bulb', at: [2.6, 10.4, 0], size: [1.6, 0.8, 1.6], color: '#fff3b0', material: 'Neon', light: { color: '#ffe9a8', brightness: 1.5, range: 26 } },
    ],
  },
  campfire: {
    name: 'Campfire',
    pieces: [
      { name: 'StoneA', at: [-2, 0, 0], size: [1.6, 1, 1.6], color: '#7b7f8a', material: 'Cobblestone' },
      { name: 'StoneB', at: [2, 0, 0], size: [1.6, 1, 1.6], color: '#7b7f8a', material: 'Cobblestone' },
      { name: 'StoneC', at: [0, 0, -2], size: [1.6, 1, 1.6], color: '#7b7f8a', material: 'Cobblestone' },
      { name: 'StoneD', at: [0, 0, 2], size: [1.6, 1, 1.6], color: '#7b7f8a', material: 'Cobblestone' },
      { name: 'Log', at: [0, 0, 0], size: [3.4, 0.9, 0.9], color: '#5c3a1e', material: 'Wood' },
      { name: 'Fire', at: [0, 0.9, 0], size: [1.6, 2.4, 1.6], color: '#ff8a1f', material: 'Neon', light: { color: '#ff9d3c', brightness: 2, range: 30 } },
    ],
  },
  fence: {
    name: 'Fence',
    pieces: [
      ...[-8, -4, 0, 4, 8].map((x, i): Piece => ({ name: `Post${i + 1}`, at: [x, 0, 0], size: [0.8, 4, 0.8], color: '#8d6e4c', material: 'Wood' })),
      { name: 'RailTop', at: [0, 2.6, 0], size: [17, 0.6, 0.4], color: '#a0825b', material: 'WoodPlanks' },
      { name: 'RailLow', at: [0, 1, 0], size: [17, 0.6, 0.4], color: '#a0825b', material: 'WoodPlanks' },
    ],
  },
  pyramid: {
    name: 'Pyramid',
    pieces: Array.from({ length: 6 }, (_, i): Piece => ({ name: `Level${i + 1}`, at: [0, i * 3, 0], size: [36 - i * 6, 3, 36 - i * 6], color: '#e0c06a', material: 'Sandstone' })),
  },
};

export const KIT_LIST: { id: KitId; label: string; hint: string }[] = [
  { id: 'tree', label: 'Tree', hint: 'Round leafy tree' },
  { id: 'pine', label: 'Pine tree', hint: 'Tall evergreen' },
  { id: 'house', label: 'House', hint: 'With a door and light' },
  { id: 'bridge', label: 'Bridge', hint: 'Wood, with rails' },
  { id: 'stairs', label: 'Stairs', hint: 'Ten steps up' },
  { id: 'tower', label: 'Tower', hint: 'Stone castle tower' },
  { id: 'lamp', label: 'Street lamp', hint: 'Glows at night' },
  { id: 'campfire', label: 'Campfire', hint: 'Warm light' },
  { id: 'fence', label: 'Fence', hint: 'Wood fence' },
  { id: 'pyramid', label: 'Pyramid', hint: 'Six sandy levels' },
];

/**
 * Builds a ready-made model as new instances: one Model plus its parts (and lights).
 * @param id - which model
 * @param x - world x of the model's middle
 * @param groundY - world y of the surface it stands on
 * @param z - world z of the model's middle
 * @returns the new instances (the Model first)
 */
export function buildKit(id: KitId, x: number, groundY: number, z: number): PlaceInstance[] {
  const kit = KITS[id];
  const model = createInstance('Model', 'Workspace', {}, kit.name);
  const out: PlaceInstance[] = [model];
  for (const pc of kit.pieces) {
    const part = createInstance('Part', model.id, {
      position: [Math.round((x + pc.at[0]) * 100) / 100, Math.round((groundY + pc.at[1] + pc.size[1] / 2) * 100) / 100, Math.round((z + pc.at[2]) * 100) / 100],
      size: pc.size,
      color: pc.color,
      material: pc.material || 'Plastic',
      anchored: true,
      ...(pc.shape ? { shape: pc.shape } : {}),
    }, pc.name);
    out.push(part);
    if (pc.light) out.push(createInstance('PointLight', part.id, { color: pc.light.color, brightness: pc.light.brightness, range: pc.light.range }));
  }
  return out;
}
