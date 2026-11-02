import type { ClassName } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import styles from './studio.module.css';

const ICONS: Record<ClassName, { color: string; glyph: string }> = {
  Workspace: { color: '#4aa3ff', glyph: 'W' },
  Lighting: { color: '#ffcc33', glyph: 'L' },
  ReplicatedStorage: { color: '#b07cff', glyph: 'R' },
  ServerScriptService: { color: '#43c6ac', glyph: 'S' },
  StarterGui: { color: '#ff8a5b', glyph: 'G' },
  Part: { color: '#9aa0a6', glyph: '■' },
  TrussPart: { color: '#9aa0a6', glyph: '#' },
  SpawnLocation: { color: '#7bd88f', glyph: '⬡' },
  Model: { color: '#58a6ff', glyph: 'M' },
  Folder: { color: '#e3b341', glyph: 'F' },
  Script: { color: '#56d364', glyph: '{}' },
  LocalScript: { color: '#79c0ff', glyph: '{}' },
  ModuleScript: { color: '#d2a8ff', glyph: '{}' },
  PointLight: { color: '#ffd866', glyph: '✦' },
};

/**
 * Small colored badge representing a Roblox class in the Explorer.
 * @param props.className - Roblox class name
 */
export function ClassIcon({ className }: { className: ClassName }) {
  const icon = ICONS[className];
  return (
    <span className={styles.classIcon} style={{ color: icon.color, borderColor: icon.color }} aria-hidden>
      {icon.glyph}
    </span>
  );
}
