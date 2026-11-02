import * as THREE from 'three';

/**
 * Procedurally generated, Roblox-style material textures (grayscale detail maps that are
 * multiplied with the part color, exactly like Roblox tints its material textures).
 * Generated once per material on a small canvas — no network requests.
 */
const cache = new Map<string, THREE.Texture | null>();
const SIZE = 128;

/** Studs covered by one texture tile, per material (Roblox tiles roughly every 4–8 studs). */
export const TILE_STUDS: Record<string, number> = {
  Grass: 8, LeafyGrass: 8, Sand: 8, Snow: 8, Rock: 8, Slate: 8, Basalt: 8, Concrete: 8, Granite: 8, Pebble: 6,
  Cobblestone: 6, Brick: 6, Wood: 6, WoodPlanks: 8, DiamondPlate: 4, Metal: 8, CorrodedMetal: 8, Marble: 10,
  CrackedLava: 10, Sandstone: 8, Fabric: 4, Ice: 10,
};

function rand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function noise(ctx: CanvasRenderingContext2D, r: () => number, amount: number, base = 200, dot = 2) {
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE * 0.25; i++) {
    const v = base + (r() - 0.5) * amount;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.floor(r() * SIZE), Math.floor(r() * SIZE), dot, dot);
  }
}

function draw(material: string, ctx: CanvasRenderingContext2D): boolean {
  const r = rand(material.length * 7919 + material.charCodeAt(0));
  switch (material) {
    case 'Grass':
    case 'LeafyGrass':
      noise(ctx, r, 70, 205, 2);
      ctx.strokeStyle = 'rgba(120,120,120,0.35)';
      for (let i = 0; i < 260; i++) {
        const x = r() * SIZE, y = r() * SIZE;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); ctx.stroke();
      }
      return true;
    case 'Sand': case 'Snow': case 'Concrete': case 'Sandstone':
      noise(ctx, r, material === 'Concrete' ? 45 : 35, 215, 1);
      return true;
    case 'Rock': case 'Slate': case 'Basalt': case 'Granite': case 'Pebble': case 'Cobblestone':
      noise(ctx, r, 60, 190, 3);
      ctx.strokeStyle = 'rgba(70,70,70,0.5)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < (material === 'Cobblestone' || material === 'Pebble' ? 40 : 14); i++) {
        const x = r() * SIZE, y = r() * SIZE, rad = 6 + r() * 14;
        ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); ctx.stroke();
      }
      return true;
    case 'Brick': {
      ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, SIZE, SIZE);
      const rows = 8, h = SIZE / rows, w = SIZE / 4;
      for (let y = 0; y < rows; y++) {
        for (let x = -1; x < 5; x++) {
          const v = 190 + (r() - 0.5) * 40;
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x * w + (y % 2 ? w / 2 : 0) + 2, y * h + 2, w - 4, h - 4);
        }
      }
      return true;
    }
    case 'Wood': case 'WoodPlanks': {
      ctx.fillStyle = '#cfcfcf'; ctx.fillRect(0, 0, SIZE, SIZE);
      for (let y = 0; y < SIZE; y += 2) {
        const v = 195 + Math.sin(y * 0.35 + r() * 2) * 18 + (r() - 0.5) * 12;
        ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, y, SIZE, 2);
      }
      if (material === 'WoodPlanks') {
        ctx.fillStyle = 'rgba(60,60,60,0.6)';
        for (let y = 0; y < SIZE; y += SIZE / 4) ctx.fillRect(0, y, SIZE, 2);
        for (let i = 0; i < 4; i++) ctx.fillRect(((i * 37) % 4) * (SIZE / 4) + (i % 2) * 20, i * (SIZE / 4), 2, SIZE / 4);
      }
      return true;
    }
    case 'DiamondPlate': {
      ctx.fillStyle = '#c4c4c4'; ctx.fillRect(0, 0, SIZE, SIZE);
      const step = SIZE / 8;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          ctx.save();
          ctx.translate(x * step + step / 2, y * step + step / 2);
          ctx.rotate((x + y) % 2 ? Math.PI / 4 : -Math.PI / 4);
          ctx.fillStyle = '#efefef'; ctx.fillRect(-step * 0.35, -1.6, step * 0.7, 3.2);
          ctx.fillStyle = '#8a8a8a'; ctx.fillRect(-step * 0.35, 1.6, step * 0.7, 1);
          ctx.restore();
        }
      }
      return true;
    }
    case 'Metal': case 'CorrodedMetal':
      noise(ctx, r, material === 'CorrodedMetal' ? 90 : 18, 210, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let y = 0; y < SIZE; y += 3) ctx.fillRect(0, y, SIZE, 1);
      return true;
    case 'Marble': {
      ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.strokeStyle = 'rgba(150,150,150,0.45)';
      for (let i = 0; i < 9; i++) {
        ctx.lineWidth = 0.5 + r() * 1.5;
        ctx.beginPath(); let x = r() * SIZE, y = 0; ctx.moveTo(x, y);
        while (y < SIZE) { x += (r() - 0.5) * 14; y += 6 + r() * 8; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      return true;
    }
    case 'CrackedLava': {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#5a5a5a';
      for (let i = 0; i < 22; i++) {
        const x = r() * SIZE, y = r() * SIZE;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2, rad = 8 + r() * 10;
          ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        }
        ctx.fill();
      }
      return true;
    }
    case 'Fabric':
      ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < SIZE; i += 4) { ctx.fillRect(i, 0, 2, SIZE); ctx.fillRect(0, i, SIZE, 1); }
      return true;
    case 'Ice':
      noise(ctx, r, 20, 235, 2);
      return true;
    default:
      return false;
  }
}

/**
 * Returns the shared base detail texture for a Roblox material, or null for flat materials
 * (Plastic, SmoothPlastic, Neon, Glass, Foil, ForceField).
 * @param material - Roblox material name
 * @returns texture (do not mutate; clone with {@link tiledTexture})
 */
export function materialTexture(material: string): THREE.Texture | null {
  if (cache.has(material)) return cache.get(material)!;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx || !draw(material, ctx)) { cache.set(material, null); return null; }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(material, tex);
  return tex;
}

const tiled = new Map<string, THREE.Texture>();

/**
 * Returns a texture tiled for a part's top face size (shares the GPU image with the base texture).
 * Repeat values are quantized so parts of similar size share one texture object.
 * @param material - Roblox material
 * @param sx - part width in studs
 * @param sz - part depth in studs
 * @returns tiled texture or null
 */
export function tiledTexture(material: string, sx: number, sz: number): THREE.Texture | null {
  const base = materialTexture(material);
  if (!base) return null;
  const studs = TILE_STUDS[material] ?? 8;
  const rx = Math.max(0.25, Math.round((sx / studs) * 4) / 4);
  const rz = Math.max(0.25, Math.round((sz / studs) * 4) / 4);
  const key = `${material}:${rx}:${rz}`;
  let t = tiled.get(key);
  if (!t) {
    t = base.clone();
    t.repeat.set(rx, rz);
    t.needsUpdate = true;
    tiled.set(key, t);
  }
  return t;
}
