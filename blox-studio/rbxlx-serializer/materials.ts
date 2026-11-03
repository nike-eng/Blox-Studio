/**
 * Roblox `Enum.Material` names mapped to their numeric token values used in .rbxlx files.
 */
export const MATERIALS: Record<string, number> = {
  Plastic: 256,
  SmoothPlastic: 272,
  Neon: 288,
  Wood: 512,
  WoodPlanks: 528,
  Marble: 784,
  Basalt: 788,
  Slate: 800,
  CrackedLava: 804,
  Concrete: 816,
  Granite: 832,
  Brick: 848,
  Pebble: 864,
  Cobblestone: 880,
  Rock: 896,
  CorrodedMetal: 1040,
  DiamondPlate: 1056,
  Foil: 1072,
  Metal: 1088,
  Grass: 1280,
  LeafyGrass: 1284,
  Sand: 1296,
  Fabric: 1312,
  Snow: 1328,
  Sandstone: 1360,
  Ice: 1536,
  Glass: 1568,
  ForceField: 1584,
};

/**
 * Material names, in display order.
 */
export const MATERIAL_NAMES = Object.keys(MATERIALS);
