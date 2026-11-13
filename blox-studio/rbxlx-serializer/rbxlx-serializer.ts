import type { PlaceInstance, Vec3 } from './place-types.js';
import { PART_CLASSES, SCRIPT_CLASSES } from './place-types.js';
import { MATERIALS } from './materials.js';
import { BLOX_CLIENT_RUNTIME, BLOX_SERVER_RUNTIME } from './blox-runtime.js';

const SHAPE_TOKENS: Record<string, number> = { Ball: 0, Block: 1, Cylinder: 2 };
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cdata(value: string): string {
  return `<![CDATA[${value.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

function num(n: number | undefined, fallback = 0): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return String(Math.round(v * 10000) / 10000);
}

/**
 * Base64-encodes an ASCII string (works in both browser and Node without globals).
 * @param text - ASCII text
 * @returns base64 string
 */
export function asciiToBase64(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i) & 255;
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) & 255 : NaN;
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) & 255 : NaN;
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (Number.isNaN(b) ? '=' : B64[(n >> 6) & 63])
      + (Number.isNaN(c) ? '=' : B64[n & 63]);
  }
  return out;
}

/**
 * Converts a hex color (`#rrggbb`) to the Roblox `Color3uint8` packed integer.
 * @param hex - hex color string
 * @returns packed ARGB integer
 */
export function hexToColor3uint8(hex = '#a3a2a5'): number {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const rgb = parseInt(clean, 16);
  return (0xff000000 + (Number.isNaN(rgb) ? 0 : rgb)) >>> 0;
}

function color3(name: string, hex: string): string {
  const c = hexToColor3uint8(hex);
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  return `<Color3 name="${name}"><R>${num(r)}</R><G>${num(g)}</G><B>${num(b)}</B></Color3>`;
}

/**
 * Computes the 3x3 rotation matrix (row-major) for XYZ Euler angles in degrees.
 * Matches three.js `Euler` order `XYZ`, which shares Roblox's right-handed Y-up axes.
 * @param rotation - euler angles in degrees
 * @returns 9 matrix entries R00..R22
 */
export function eulerToMatrix(rotation: Vec3 = [0, 0, 0]): number[] {
  const [x, y, z] = rotation.map((deg) => (deg * Math.PI) / 180);
  const a = Math.cos(x), b = Math.sin(x);
  const c = Math.cos(y), d = Math.sin(y);
  const e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ];
}

function cframe(position: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0]): string {
  const m = eulerToMatrix(rotation);
  const keys = ['R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'];
  return `<CoordinateFrame name="CFrame"><X>${num(position[0])}</X><Y>${num(position[1])}</Y><Z>${num(position[2])}</Z>${
    keys.map((k, i) => `<${k}>${num(m[i])}</${k}>`).join('')
  }</CoordinateFrame>`;
}

/**
 * Returns the CollectionService tags that drive gameplay for a part in the generated runtime.
 * @param inst - instance
 * @returns list of tags (empty when the part has no behavior or motion)
 */
export function gameplayTags(inst: PlaceInstance): string[] {
  const p = inst.props;
  const tags: string[] = [];
  switch (p.behavior) {
    case 'kill': tags.push('BloxKill'); break;
    case 'checkpoint': tags.push('BloxCheckpoint', `BloxStage=${Math.max(2, Math.round(p.checkpoint ?? 2))}`); break;
    case 'finish': tags.push('BloxFinish'); break;
    case 'jumpPad': tags.push('BloxJumpPad', `BloxJump=${num(p.jumpPower, 100)}`); break;
    case 'fade': tags.push('BloxFade'); break;
    default: break;
  }
  if (p.motion === 'move') {
    const o = p.moveOffset || [0, 0, 0];
    tags.push('BloxMove', `BloxMoveArgs=${num(o[0])},${num(o[1])},${num(o[2])},${num(p.moveTime, 3)}`);
  }
  if (p.motion === 'spin') tags.push('BloxSpin', `BloxSpinSpeed=${num(p.spinSpeed, 1.5)}`);
  return tags;
}

/** Roblox class written to the file: wedge shapes are their own classes in Roblox. */
function robloxClass(inst: PlaceInstance): string {
  if (inst.className === 'Part' && inst.props.shape === 'Wedge') return 'WedgePart';
  if (inst.className === 'Part' && inst.props.shape === 'CornerWedge') return 'CornerWedgePart';
  return inst.className;
}

function propertiesFor(inst: PlaceInstance): string {
  const p = inst.props;
  const out: string[] = [`<string name="Name">${escapeXml(inst.name)}</string>`];

  if (PART_CLASSES.includes(inst.className)) {
    const size = p.size || [4, 1, 2];
    out.push(
      `<bool name="Anchored">${p.anchored !== false}</bool>`,
      `<bool name="CanCollide">${p.canCollide !== false}</bool>`,
      `<bool name="CastShadow">${p.castShadow !== false}</bool>`,
      cframe(p.position, p.rotation),
      `<Color3uint8 name="Color3uint8">${hexToColor3uint8(p.color)}</Color3uint8>`,
      `<token name="Material">${MATERIALS[p.material || 'Plastic'] ?? 256}</token>`,
      `<float name="Transparency">${num(p.transparency)}</float>`,
      `<float name="Reflectance">${num(p.reflectance)}</float>`,
      `<Vector3 name="size"><X>${num(size[0])}</X><Y>${num(size[1])}</Y><Z>${num(size[2])}</Z></Vector3>`,
      `<token name="TopSurface">0</token>`,
      `<token name="BottomSurface">0</token>`
    );
    if (inst.className === 'Part' && p.shape !== 'Wedge' && p.shape !== 'CornerWedge') {
      out.push(`<token name="shape">${SHAPE_TOKENS[p.shape || 'Block'] ?? 1}</token>`);
    }
    if (inst.className === 'SpawnLocation') {
      out.push(`<int name="Duration">0</int>`, `<bool name="Neutral">true</bool>`);
    }
    const tags = gameplayTags(inst);
    if (tags.length) out.push(`<BinaryString name="Tags">${asciiToBase64(tags.join('\0'))}</BinaryString>`);
  }

  if (SCRIPT_CLASSES.includes(inst.className)) {
    out.push(`<ProtectedString name="Source">${cdata(p.source || '')}</ProtectedString>`);
  }

  if (inst.className === 'PointLight') {
    out.push(
      `<float name="Brightness">${num(p.brightness, 1)}</float>`,
      `<float name="Range">${num(p.range, 16)}</float>`,
      `<bool name="Shadows">true</bool>`,
      color3('Color', p.color || '#ffffff')
    );
  }

  if (inst.className === 'Lighting') {
    out.push(
      `<float name="ClockTime">${num(p.clockTime, 14)}</float>`,
      `<float name="Brightness">${num(p.brightness, 2)}</float>`,
      `<bool name="GlobalShadows">true</bool>`,
      `<token name="Technology">4</token>`,
      `<float name="EnvironmentDiffuseScale">1</float>`,
      `<float name="EnvironmentSpecularScale">1</float>`,
      `<float name="ShadowSoftness">0.2</float>`,
      color3('Ambient', '#464650'),
      color3('OutdoorAmbient', '#8c8c9a')
    );
  }

  return out.join('');
}

type RawItem = { className: string; props: string; children?: RawItem[] };

/** Post-processing and sky children generated for Lighting from its settings. */
function lightingExtras(inst: PlaceInstance): RawItem[] {
  const p = inst.props;
  const items: RawItem[] = [{ className: 'Sky', props: '<string name="Name">Sky</string><int name="StarCount">3000</int>' }];
  if ((p.atmosphere ?? 0.3) > 0) {
    items.push({
      className: 'Atmosphere',
      props: `<string name="Name">Atmosphere</string><float name="Density">${num(p.atmosphere, 0.3)}</float><float name="Offset">0.25</float>${color3('Color', '#c7d8ff')}${color3('Decay', '#6a7ca8')}<float name="Glare">0.2</float><float name="Haze">1.2</float>`,
    });
  }
  if (p.bloom !== false) {
    items.push({ className: 'BloomEffect', props: '<string name="Name">Bloom</string><float name="Intensity">0.6</float><float name="Size">28</float><float name="Threshold">1.4</float>' });
  }
  if (p.sunRays !== false) {
    items.push({ className: 'SunRaysEffect', props: '<string name="Name">SunRays</string><float name="Intensity">0.12</float><float name="Spread">0.8</float>' });
  }
  items.push({ className: 'ColorCorrectionEffect', props: '<string name="Name">ColorCorrection</string><float name="Saturation">0.15</float><float name="Contrast">0.08</float><float name="Brightness">0.02</float>' });
  return items;
}

/** Returns true if any part in the place uses gameplay behaviors or motion. */
function usesGameplay(instances: PlaceInstance[]): boolean {
  return instances.some((i) => PART_CLASSES.includes(i.className) && gameplayTags(i).length > 0);
}

/**
 * Serializes a Blox Studio place into Roblox XML place format (.rbxlx),
 * ready to be uploaded through the Roblox Open Cloud Place Publishing API
 * or opened in Roblox Studio. When parts use gameplay behaviors, the
 * `BloxRuntime` server script and `BloxClient` local script are injected automatically.
 * @param instances - flat instance list of the place
 * @returns the .rbxlx XML document
 */
export function toRbxlx(instances: PlaceInstance[]): string {
  const children = new Map<string | null, PlaceInstance[]>();
  instances.forEach((inst) => {
    const list = children.get(inst.parentId) || [];
    list.push(inst);
    children.set(inst.parentId, list);
  });
  const gameplay = usesGameplay(instances);

  let ref = 0;
  const nextRef = () => `RBX${(ref++).toString(16).toUpperCase().padStart(8, '0')}`;
  const renderRaw = (item: RawItem): string =>
    `<Item class="${item.className}" referent="${nextRef()}"><Properties>${item.props}</Properties>${(item.children || []).map(renderRaw).join('')}</Item>`;

  const render = (inst: PlaceInstance): string => {
    const referent = nextRef();
    const kids = (children.get(inst.id) || []).map(render);
    if (inst.className === 'Lighting') kids.push(...lightingExtras(inst).map(renderRaw));
    if (inst.className === 'StarterPlayerScripts' && gameplay) {
      kids.push(renderRaw({ className: 'LocalScript', props: `<string name="Name">BloxClient</string><ProtectedString name="Source">${cdata(BLOX_CLIENT_RUNTIME)}</ProtectedString>` }));
    }
    if (inst.className === 'ServerScriptService' && gameplay) {
      kids.push(renderRaw({ className: 'Script', props: `<string name="Name">BloxRuntime</string><ProtectedString name="Source">${cdata(BLOX_SERVER_RUNTIME)}</ProtectedString>` }));
    }
    return `<Item class="${robloxClass(inst)}" referent="${referent}"><Properties>${propertiesFor(inst)}</Properties>${kids.join('')}</Item>`;
  };

  const body = (children.get(null) || []).map(render);
  if (gameplay && !instances.some((i) => i.className === 'StarterPlayerScripts')) {
    body.push(renderRaw({
      className: 'StarterPlayer',
      props: '<string name="Name">StarterPlayer</string>',
      children: [{
        className: 'StarterPlayerScripts',
        props: '<string name="Name">StarterPlayerScripts</string>',
        children: [{ className: 'LocalScript', props: `<string name="Name">BloxClient</string><ProtectedString name="Source">${cdata(BLOX_CLIENT_RUNTIME)}</ProtectedString>` }],
      }],
    }));
  }
  return [
    '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">',
    '<External>null</External>',
    '<External>nil</External>',
    body.join('\n'),
    '</roblox>',
  ].join('\n');
}
