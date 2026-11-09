import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ClassName, InstanceProps } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import type { PlaceEditor, Tool } from './use-place-editor.js';
import { Icon, type IconName } from './icons.js';
import s from './studio-chrome.module.css';
import { BrandMark } from './brand-mark.js';

/**
 * One thing the Add menu can put into the place.
 */
export type InsertItem = {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  className: ClassName | 'Light';
  name?: string;
  props?: InstanceProps;
};

/** Basic shapes. */
export const SHAPES: InsertItem[] = [
  { id: 'block', label: 'Block', hint: 'A solid box', icon: 'block', className: 'Part', props: { shape: 'Block' } },
  { id: 'sphere', label: 'Sphere', hint: 'A round ball', icon: 'sphere', className: 'Part', props: { shape: 'Ball' } },
  { id: 'wedge', label: 'Wedge', hint: 'A ramp', icon: 'wedge', className: 'Part', props: { shape: 'Wedge' } },
  { id: 'cornerwedge', label: 'Corner wedge', hint: 'A pointed corner ramp', icon: 'cornerwedge', className: 'Part', props: { shape: 'CornerWedge' } },
  { id: 'cylinder', label: 'Cylinder', hint: 'A can or pillar', icon: 'cylinder', className: 'Part', props: { shape: 'Cylinder' } },
  { id: 'truss', label: 'Truss', hint: 'A ladder players can climb', icon: 'truss', className: 'TrussPart' },
  { id: 'spawn', label: 'Spawn', hint: 'Where players start', icon: 'spawn', className: 'SpawnLocation' },
];

/** Course pieces that already have gameplay built in. */
export const OBBY: InsertItem[] = [
  { id: 'kill', label: 'Lava brick', hint: 'Touch it and you reset', icon: 'kill', className: 'Part', name: 'KillBrick', props: { size: [8, 1, 8], color: '#ff1f1f', material: 'Neon', behavior: 'kill' } },
  { id: 'checkpoint', label: 'Checkpoint', hint: 'Saves your progress', icon: 'checkpoint', className: 'Part', name: 'Checkpoint', props: { size: [12, 1, 12], color: '#22c55e', material: 'SmoothPlastic', behavior: 'checkpoint' } },
  { id: 'mover', label: 'Moving platform', hint: 'Slides back and forth', icon: 'mover', className: 'Part', name: 'MovingPlatform', props: { size: [8, 1, 8], color: '#f59e0b', material: 'DiamondPlate', motion: 'move', moveOffset: [12, 0, 0], moveTime: 2.5 } },
  { id: 'spinner', label: 'Spinner', hint: 'A spinning bar', icon: 'spinner', className: 'Part', name: 'Spinner', props: { size: [20, 1, 1], color: '#ff1f1f', material: 'Neon', behavior: 'kill', motion: 'spin', spinSpeed: 1.5, canCollide: false } },
  { id: 'jumppad', label: 'Jump pad', hint: 'Launches you up', icon: 'jumppad', className: 'Part', name: 'JumpPad', props: { size: [5, 0.4, 5], color: '#4ade80', material: 'Neon', behavior: 'jumpPad', jumpPower: 100 } },
  { id: 'fade', label: 'Fading tile', hint: 'Disappears when stepped on', icon: 'fade', className: 'Part', name: 'FadeTile', props: { size: [6, 0.6, 6], color: '#7dd3fc', material: 'Glass', transparency: 0.2, behavior: 'fade' } },
  { id: 'finish', label: 'Finish line', hint: 'Ends the run', icon: 'finish', className: 'Part', name: 'Finish', props: { size: [10, 0.4, 10], color: '#ffd60a', material: 'Neon', behavior: 'finish' } },
];

/** Scripts, lights and containers. */
export const MORE: InsertItem[] = [
  { id: 'script', label: 'Script', hint: 'Runs on the server', icon: 'script', className: 'Script' },
  { id: 'localscript', label: 'Local script', hint: 'Runs on the player', icon: 'localscript', className: 'LocalScript' },
  { id: 'module', label: 'Module', hint: 'Code other scripts reuse', icon: 'module', className: 'ModuleScript' },
  { id: 'light', label: 'Light', hint: 'A glowing point', icon: 'light', className: 'Light' },
  { id: 'folder', label: 'Folder', hint: 'Keeps things tidy', icon: 'folder', className: 'Folder' },
  { id: 'model', label: 'Model', hint: 'A group of parts', icon: 'model', className: 'Model' },
];

const TOOLS: { id: Tool; label: string; key: string; icon: IconName; hint: string }[] = [
  { id: 'select', label: 'Select', key: '1', icon: 'select', hint: 'Tap things to pick them' },
  { id: 'move', label: 'Move', key: '2', icon: 'move', hint: 'Drag the arrows' },
  { id: 'scale', label: 'Scale', key: '3', icon: 'scale', hint: 'Drag the handles to resize' },
  { id: 'rotate', label: 'Rotate', key: '4', icon: 'rotate', hint: 'Drag the rings to turn' },
];

/**
 * Props for the top bar.
 */
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

export type TopBarProps = {
  projectName: string;
  saveState: SaveState;
  /** Saves the place now. */
  onSave: () => void;
  /** Called before leaving the editor; return false to stay (for example when there are unsaved changes). */
  confirmLeave?: () => boolean;
  /** True while a save is taking long (the free server may be waking up). */
  saveSlow?: boolean;
  editor: PlaceEditor;
  onPlay: () => void;
  onExport: () => void;
  onPublish: () => void;
  onSettings: () => void;
  /** Shows or hides the Output window. */
  onToggleOutput?: () => void;
  outputOpen?: boolean;
  /** Number of errors waiting in Output. */
  outputErrors?: number;
};

const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved', unsaved: 'Save', saving: 'Saving…', error: 'Retry save' };

/**
 * The Save button. It lights up when there is something to save and says clearly what happened.
 */
export function SaveButton({ state, slow, onSave }: { state: SaveState; slow?: boolean; onSave: () => void }) {
  const title = state === 'saved' ? 'Everything is saved' : state === 'saving' ? (slow ? 'Waking up the server, this can take a minute…' : 'Saving…') : state === 'error' ? 'Saving failed. Tap to try again (Ctrl+S)' : 'Save your place (Ctrl+S)';
  return (
    <button type="button" className={s.saveBtn} data-state={state} onClick={onSave} disabled={state === 'saving'} title={title} aria-label={SAVE_LABEL[state]}>
      <Icon name={state === 'saved' ? 'check' : 'save'} size={18} />
      <span className={s.saveBtnText}>{state === 'saving' && slow ? 'Waking server…' : SAVE_LABEL[state]}</span>
      {state === 'unsaved' && <span className={s.saveDot} aria-hidden="true" />}
    </button>
  );
}

/**
 * Slim top bar: where you are, undo/redo, and the three big actions (Play, Export, Publish).
 */
export function TopBar({ projectName, saveState, onSave, confirmLeave, saveSlow, editor, onPlay, onExport, onPublish, onSettings, onToggleOutput, outputOpen, outputErrors = 0 }: TopBarProps) {
  const { undo, redo, canUndo, canRedo } = editor;
  return (
    <header className={s.top} role="toolbar" aria-label="Studio">
      <Link to="/projects" className={s.brand} title="Back to your places" onClick={(e) => { if (confirmLeave && !confirmLeave()) e.preventDefault(); }}>
        <span className={s.logo}><BrandMark size={24} /></span>
        <span className={s.brandText}>VoxMesa</span>
      </Link>
      <span className={s.projectName} title={projectName}>{projectName}</span>
      <SaveButton state={saveState} slow={saveSlow} onSave={onSave} />
      <span className={s.spacer} />
      <div className={s.group}>
        <button type="button" className={s.iconBtn} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo"><Icon name="undo" /></button>
        <button type="button" className={s.iconBtn} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Y)" aria-label="Redo"><Icon name="redo" /></button>
      </div>
      <button type="button" className={s.playBtn} onClick={onPlay} title="Try your game (F5)">
        <Icon name="play" size={18} /><span className={s.btnText}>Play</span>
      </button>
      <button type="button" className={s.iconBtn} onClick={onExport} title="Get the Roblox file (.rbxlx)" aria-label="Export"><Icon name="download" /></button>
      {onToggleOutput && (
        <button type="button" className={s.iconBtn} onClick={onToggleOutput} title="Output and Command Bar" aria-label="Output" aria-pressed={!!outputOpen} style={outputOpen ? { background: '#262932', color: '#2f9bff' } : outputErrors ? { color: '#ff6b6b' } : undefined}>
          <Icon name="terminal" />
        </button>
      )}
      <button type="button" className={s.iconBtn} onClick={onSettings} title="Game settings" aria-label="Game settings"><Icon name="settings" /></button>
      <button type="button" className={s.publishBtn} onClick={onPublish} title="Publish to Roblox">
        <Icon name="publish" size={18} /><span className={s.btnText}>Publish</span>
      </button>
    </header>
  );
}

/**
 * Props for the tool rail.
 */
export type SnapLevel = 'off' | 'fine' | 'normal' | 'big';
/** What each snap level means, in studs and degrees. */
export const SNAPS: Record<SnapLevel, { label: string; studs: number; degrees: number }> = {
  off: { label: 'Off', studs: 0, degrees: 0 },
  fine: { label: 'Fine', studs: 0.25, degrees: 5 },
  normal: { label: '1 stud', studs: 1, degrees: 15 },
  big: { label: '5 studs', studs: 5, degrees: 45 },
};
const SNAP_ORDER: SnapLevel[] = ['off', 'fine', 'normal', 'big'];

export type ToolRailProps = {
  multi: boolean;
  setMulti: (m: boolean) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  snap: SnapLevel;
  setSnap: (s: SnapLevel) => void;
  space: 'world' | 'local';
  setSpace: (s: 'world' | 'local') => void;
};

/**
 * Vertical rail with the four tools, each with a label so nothing has to be guessed.
 */
export function ToolRail({ tool, setTool, snap, setSnap, space, setSpace, multi, setMulti }: ToolRailProps) {
  return (
    <nav className={s.rail} aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          type="button"
          key={t.id}
          className={`${s.railBtn} ${tool === t.id ? s.railBtnOn : ''}`}
          onClick={() => setTool(t.id)}
          title={`${t.label}: ${t.hint} (${t.key})`}
          aria-pressed={tool === t.id}
        >
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </button>
      ))}
      <div className={s.railSep} />
      <button
        type="button"
        className={`${s.railBtn} ${multi ? s.railBtnOn : ''}`}
        onClick={() => setMulti(!multi)}
        aria-pressed={multi}
        title="Select multiple: tap several things to pick them together (on a keyboard, hold Shift)"
      >
        <Icon name="duplicate" size={22} />
        <span>Multi</span>
      </button>
      <button
        type="button"
        className={s.railBtn}
        onClick={() => setSnap(SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length])}
        title="Snap: how far things jump when you drag. Tap to change."
      >
        <span className={s.railValue}>{SNAPS[snap].label}</span>
        <span>Snap</span>
      </button>
      <button
        type="button"
        className={s.railBtn}
        onClick={() => setSpace(space === 'world' ? 'local' : 'world')}
        title="World: move along the map's axes. Local: move along the part's own axes (Ctrl+L)."
        disabled={tool === 'select' || tool === 'scale'}
      >
        <span className={s.railValue}>{space === 'world' ? 'World' : 'Local'}</span>
        <span>Axes</span>
      </button>
    </nav>
  );
}

/**
 * Props for the Add button and menu.
 */
export type AddMenuProps = { open: boolean; onToggle: () => void; onPick: (item: InsertItem) => void };

/**
 * The big "Add" button and the menu it opens. Every item has a real picture, a name and a one-line hint.
 */
export function AddMenu({ open, onToggle, onPick }: AddMenuProps) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) sheet.current?.focus();
  }, [open]);
  const tile = (item: InsertItem) => (
    <button type="button" key={item.id} className={s.tile} onClick={() => onPick(item)} title={item.hint}>
      <span className={s.tileIcon}><Icon name={item.icon} size={26} /></span>
      <span className={s.tileLabel}>{item.label}</span>
      <span className={s.tileHint}>{item.hint}</span>
    </button>
  );
  return (
    <>
      <button type="button" className={s.addBtn} onClick={onToggle} aria-expanded={open} aria-haspopup="dialog">
        <Icon name={open ? 'close' : 'plus'} size={22} /><span>{open ? 'Close' : 'Add'}</span>
      </button>
      {open && (
        <div className={s.sheet} ref={sheet} tabIndex={-1} role="dialog" aria-label="Add to your place">
          <h3 className={s.sheetTitle}>Shapes</h3>
          <div className={s.grid}>{SHAPES.map(tile)}</div>
          <h3 className={s.sheetTitle}>Course pieces</h3>
          <div className={s.grid}>{OBBY.map(tile)}</div>
          <h3 className={s.sheetTitle}>Scripts &amp; more</h3>
          <div className={s.grid}>{MORE.map(tile)}</div>
        </div>
      )}
    </>
  );
}

/**
 * Props for the selection bar.
 */
export type SelectionBarProps = { editor: PlaceEditor; onFocus: () => void };

/**
 * Floating bar that appears when something is selected, with the things you do to it.
 */
export function SelectionBar({ editor, onFocus }: SelectionBarProps) {
  const { selected, pickedIds, duplicateMany, copy, cut, paste, canPaste, groupMany, ungroup, removeMany, updateProps } = editor;
  if (!selected) return null;
  const many = pickedIds.length > 1;
  const isService = ['Workspace', 'Lighting', 'ReplicatedStorage', 'ServerScriptService', 'StarterGui'].includes(selected.className);
  const isContainer = !many && (selected.className === 'Model' || selected.className === 'Folder');
  const act = (icon: IconName, label: string, run: () => void, extra?: { disabled?: boolean; danger?: boolean }) => (
    <button
      type="button"
      key={label}
      className={`${s.selBtn} ${extra?.danger ? s.selDanger : ''}`}
      disabled={extra?.disabled}
      onClick={run}
      title={label}
    >
      <Icon name={icon} size={20} /><span>{label}</span>
    </button>
  );
  return (
    <div className={s.sel} role="toolbar" aria-label="Selected object">
      <span className={s.selName} title={selected.name}>{many ? `${pickedIds.length} picked` : selected.name}</span>
      {!many && act('focus', 'Focus', onFocus, { disabled: !selected.props.position })}
      {act('duplicate', 'Duplicate', () => duplicateMany(pickedIds), { disabled: isService })}
      {!many && act('copy', 'Copy', () => copy(selected.id), { disabled: isService })}
      {!many && act('cut', 'Cut', () => cut(selected.id), { disabled: isService })}
      {!many && act('paste', 'Paste', () => paste(selected.id), { disabled: !canPaste })}
      {!many && selected.props.position && act('anchor', selected.props.anchored === false ? 'Unanchored' : 'Anchored', () => updateProps(selected.id, { anchored: selected.props.anchored === false }))}
      {isContainer ? act('group', 'Ungroup', () => ungroup(selected.id)) : act('group', 'Group', () => groupMany(pickedIds), { disabled: isService })}
      {act('trash', 'Delete', () => removeMany(pickedIds), { disabled: isService, danger: true })}
    </div>
  );
}
