import type { ClassName, InstanceProps } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import type { PlaceEditor, Tool } from './use-place-editor.js';
import styles from './studio.module.css';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select', key: '1', icon: '⬉' },
  { id: 'move', label: 'Move', key: '2', icon: '✥' },
  { id: 'scale', label: 'Scale', key: '3', icon: '⤡' },
  { id: 'rotate', label: 'Rotate', key: '4', icon: '⟳' },
];

/**
 * A ribbon insert preset: class + property overrides + display name.
 */
export type InsertPreset = { label: string; className: ClassName; icon: string; props?: InstanceProps; name?: string };

const PARTS: InsertPreset[] = [
  { label: 'Block', className: 'Part', props: { shape: 'Block' }, icon: '■' },
  { label: 'Sphere', className: 'Part', props: { shape: 'Ball' }, icon: '●' },
  { label: 'Cylinder', className: 'Part', props: { shape: 'Cylinder' }, icon: '▬' },
  { label: 'Truss', className: 'TrussPart', icon: '#' },
  { label: 'Spawn', className: 'SpawnLocation', icon: '⬡' },
];

const OBBY: InsertPreset[] = [
  { label: 'Kill brick', className: 'Part', icon: '☠', name: 'KillBrick', props: { size: [8, 1, 8], color: '#ff1f1f', material: 'Neon', behavior: 'kill' } },
  { label: 'Checkpoint', className: 'Part', icon: '⚑', name: 'Checkpoint', props: { size: [12, 1, 12], color: '#22c55e', material: 'SmoothPlastic', behavior: 'checkpoint' } },
  { label: 'Mover', className: 'Part', icon: '⇄', name: 'MovingPlatform', props: { size: [8, 1, 8], color: '#f59e0b', material: 'DiamondPlate', motion: 'move', moveOffset: [12, 0, 0], moveTime: 2.5 } },
  { label: 'Spinner', className: 'Part', icon: '✳', name: 'Spinner', props: { size: [20, 1, 1], color: '#ff1f1f', material: 'Neon', behavior: 'kill', motion: 'spin', spinSpeed: 1.5, canCollide: false } },
  { label: 'Jump pad', className: 'Part', icon: '⇪', name: 'JumpPad', props: { size: [5, 0.4, 5], color: '#4ade80', material: 'Neon', behavior: 'jumpPad', jumpPower: 100 } },
  { label: 'Fade tile', className: 'Part', icon: '◌', name: 'FadeTile', props: { size: [6, 0.6, 6], color: '#7dd3fc', material: 'Glass', transparency: 0.2, behavior: 'fade' } },
  { label: 'Finish', className: 'Part', icon: '🏁', name: 'Finish', props: { size: [10, 0.4, 10], color: '#ffd60a', material: 'Neon', behavior: 'finish' } },
];

/**
 * Props for the ribbon toolbar.
 */
export type RibbonProps = {
  editor: PlaceEditor;
  onInsert: (preset: InsertPreset) => void;
  onInsertScript: () => void;
  saveState: 'saved' | 'saving' | 'error';
  onPlay: () => void;
  onPublish: () => void;
  onExport: () => void;
  onSettings: () => void;
};

/**
 * Roblox Studio-style ribbon with Play, transform tools, part and obby-element insertion,
 * edit actions and publishing.
 */
export function Ribbon({ editor, onInsert, onInsertScript, saveState, onPlay, onPublish, onExport, onSettings }: RibbonProps) {
  const { tool, setTool, selectedId, duplicate, remove, group, undo, redo, canUndo, canRedo } = editor;
  const btn = (p: InsertPreset) => (
    <button type="button" key={p.label} className={styles.ribbonBtn} onClick={() => onInsert(p)} title={`Insert ${p.label}`}>
      <span className={styles.ribbonIcon}>{p.icon}</span>{p.label}
    </button>
  );
  return (
    <div className={styles.ribbon} role="toolbar">
      <div className={styles.ribbonGroup}>
        <div className={styles.ribbonButtons}>
          <button type="button" className={styles.playBtn} onClick={onPlay} title="Playtest (F5)">
            <span className={styles.playIcon} />Play
          </button>
        </div>
        <span className={styles.ribbonLabel}>Test</span>
      </div>
      <div className={styles.ribbonGroup}>
        <div className={styles.ribbonButtons}>
          {TOOLS.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`${styles.ribbonBtn} ${tool === t.id ? styles.ribbonBtnActive : ''}`}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
            >
              <span className={styles.ribbonIcon}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <span className={styles.ribbonLabel}>Tools</span>
      </div>
      <div className={styles.ribbonGroup}>
        <div className={styles.ribbonButtons}>
          {PARTS.map(btn)}
          <button type="button" className={styles.ribbonBtn} onClick={onInsertScript}>
            <span className={styles.ribbonIcon}>{'{}'}</span>Script
          </button>
        </div>
        <span className={styles.ribbonLabel}>Insert</span>
      </div>
      <div className={styles.ribbonGroup}>
        <div className={styles.ribbonButtons}>{OBBY.map(btn)}</div>
        <span className={styles.ribbonLabel}>Obby kit</span>
      </div>
      <div className={styles.ribbonGroup}>
        <div className={styles.ribbonButtons}>
          <button type="button" className={styles.ribbonBtn} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><span className={styles.ribbonIcon}>↶</span>Undo</button>
          <button type="button" className={styles.ribbonBtn} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)"><span className={styles.ribbonIcon}>↷</span>Redo</button>
          <button type="button" className={styles.ribbonBtn} disabled={!selectedId} onClick={() => selectedId && duplicate(selectedId)} title="Duplicate (Ctrl+D)"><span className={styles.ribbonIcon}>⧉</span>Duplicate</button>
          <button type="button" className={styles.ribbonBtn} disabled={!selectedId} onClick={() => selectedId && group(selectedId)} title="Group (Ctrl+G)"><span className={styles.ribbonIcon}>▣</span>Group</button>
          <button type="button" className={styles.ribbonBtn} disabled={!selectedId} onClick={() => selectedId && remove(selectedId)} title="Delete (Del)"><span className={styles.ribbonIcon}>🗑</span>Delete</button>
        </div>
        <span className={styles.ribbonLabel}>Edit</span>
      </div>
      <div className={`${styles.ribbonGroup} ${styles.ribbonRight}`}>
        <div className={styles.ribbonButtons}>
          <span className={styles.saveState} data-state={saveState}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'All changes saved'}
          </span>
          <button type="button" className={styles.ribbonBtn} onClick={onSettings}><span className={styles.ribbonIcon}>⚙</span>Game Settings</button>
          <button type="button" className={styles.ribbonBtn} onClick={onExport}><span className={styles.ribbonIcon}>⇩</span>.rbxlx</button>
          <button type="button" className={styles.publishBtn} onClick={onPublish}>Publish to Roblox</button>
        </div>
        <span className={styles.ribbonLabel}>File</span>
      </div>
    </div>
  );
}
