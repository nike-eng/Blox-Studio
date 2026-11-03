import { MATERIAL_NAMES, PART_CLASSES, SCRIPT_CLASSES, SERVICE_CLASSES, type PartBehavior, type PartMotion, type PartShape } from '@robloc/blox-studio.rbxlx-serializer';
import type { PlaceEditor } from './use-place-editor.js';
import { NumberField, PropRow, TextField, Vec3Field } from './property-fields.js';
import styles from './studio.module.css';

/**
 * Props for the Properties panel.
 */
export type PropertiesPanelProps = {
  editor: PlaceEditor;
  onOpenScript: (id: string) => void;
};

/**
 * Properties panel: edits the selected instance's Roblox properties.
 */
export function PropertiesPanel({ editor, onOpenScript }: PropertiesPanelProps) {
  const { selected: inst, updateProps, rename, byId } = editor;

  if (!inst) {
    return (
      <section className={styles.panel} aria-label="Properties">
        <header className={styles.panelHeader}>Properties</header>
        <p className={styles.empty}>Select an object in the viewport or Explorer to edit its properties.</p>
      </section>
    );
  }

  const p = inst.props;
  const set = (props: typeof p) => updateProps(inst.id, props);
  const isPart = PART_CLASSES.includes(inst.className);

  return (
    <section className={styles.panel} aria-label="Properties">
      <header className={styles.panelHeader}>Properties — {inst.className} "{inst.name}"</header>
      <div className={styles.panelBody}>
        <div className={styles.propGroup}>Data</div>
        <PropRow label="Name">
          {SERVICE_CLASSES.includes(inst.className)
            ? <span className={styles.readonly}>{inst.name}</span>
            : <TextField value={inst.name} onCommit={(v) => rename(inst.id, v)} />}
        </PropRow>
        <PropRow label="ClassName"><span className={styles.readonly}>{inst.className}</span></PropRow>
        <PropRow label="Parent"><span className={styles.readonly}>{inst.parentId ? byId.get(inst.parentId)?.name : 'game'}</span></PropRow>

        {isPart && (
          <>
            <div className={styles.propGroup}>Transform</div>
            <PropRow label="Position"><Vec3Field value={p.position || [0, 0, 0]} onCommit={(v) => set({ position: v })} /></PropRow>
            <PropRow label="Size"><Vec3Field value={p.size || [4, 1, 2]} min={0.05} onCommit={(v) => set({ size: v })} /></PropRow>
            <PropRow label="Orientation"><Vec3Field value={p.rotation || [0, 0, 0]} onCommit={(v) => set({ rotation: v })} /></PropRow>
            <div className={styles.propGroup}>Appearance</div>
            <PropRow label="Color">
              <input type="color" className={styles.colorInput} value={p.color || '#a3a2a5'} onChange={(e) => set({ color: e.target.value })} />
              <span className={styles.readonly}>{p.color}</span>
            </PropRow>
            <PropRow label="Material">
              <select className={styles.propInput} value={p.material || 'Plastic'} onChange={(e) => set({ material: e.target.value })}>
                {MATERIAL_NAMES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </PropRow>
            <PropRow label="Transparency"><NumberField value={p.transparency ?? 0} step={0.1} min={0} max={1} onCommit={(v) => set({ transparency: v })} /></PropRow>
            {inst.className === 'Part' && (
              <PropRow label="Shape">
                <select className={styles.propInput} value={p.shape || 'Block'} onChange={(e) => set({ shape: e.target.value as PartShape })}>
                  <option>Block</option><option>Ball</option><option>Cylinder</option><option>Wedge</option><option value="CornerWedge">Corner Wedge</option>
                </select>
              </PropRow>
            )}
            <div className={styles.propGroup}>Behavior</div>
            <PropRow label="Anchored"><input type="checkbox" checked={p.anchored !== false} onChange={(e) => set({ anchored: e.target.checked })} /></PropRow>
            <PropRow label="CanCollide"><input type="checkbox" checked={p.canCollide !== false} onChange={(e) => set({ canCollide: e.target.checked })} /></PropRow>
            <PropRow label="CastShadow"><input type="checkbox" checked={p.castShadow !== false} onChange={(e) => set({ castShadow: e.target.checked })} /></PropRow>

            <div className={styles.propGroup}>Gameplay</div>
            <PropRow label="On touch">
              <select className={styles.propInput} value={p.behavior || 'none'} onChange={(e) => set({ behavior: e.target.value as PartBehavior })}>
                <option value="none">Nothing</option>
                <option value="kill">Kill player</option>
                <option value="checkpoint">Checkpoint</option>
                <option value="finish">Finish line</option>
                <option value="jumpPad">Jump pad</option>
                <option value="fade">Disappear</option>
              </select>
            </PropRow>
            {p.behavior === 'checkpoint' && (
              <PropRow label="Stage"><NumberField value={p.checkpoint ?? 2} min={2} step={1} onCommit={(v) => set({ checkpoint: Math.round(v) })} /></PropRow>
            )}
            {p.behavior === 'jumpPad' && (
              <PropRow label="Launch speed"><NumberField value={p.jumpPower ?? 100} min={20} max={400} step={10} onCommit={(v) => set({ jumpPower: v })} /></PropRow>
            )}
            <PropRow label="Motion">
              <select className={styles.propInput} value={p.motion || 'none'} onChange={(e) => set({ motion: e.target.value as PartMotion, ...(e.target.value === 'move' && !p.moveOffset ? { moveOffset: [10, 0, 0], moveTime: 2.5 } : {}) })}>
                <option value="none">Static</option>
                <option value="move">Move back & forth</option>
                <option value="spin">Spin</option>
              </select>
            </PropRow>
            {p.motion === 'move' && (
              <>
                <PropRow label="Move offset"><Vec3Field value={p.moveOffset || [10, 0, 0]} onCommit={(v) => set({ moveOffset: v })} /></PropRow>
                <PropRow label="Trip seconds"><NumberField value={p.moveTime ?? 2.5} min={0.2} step={0.1} onCommit={(v) => set({ moveTime: v })} /></PropRow>
              </>
            )}
            {p.motion === 'spin' && (
              <PropRow label="Spin speed"><NumberField value={p.spinSpeed ?? 1.5} step={0.1} onCommit={(v) => set({ spinSpeed: v })} /></PropRow>
            )}
          </>
        )}

        {SCRIPT_CLASSES.includes(inst.className) && (
          <>
            <div className={styles.propGroup}>Source</div>
            <PropRow label="Lines"><span className={styles.readonly}>{(p.source || '').split('\n').length}</span></PropRow>
            <button type="button" className={styles.primaryBtn} onClick={() => onOpenScript(inst.id)}>Edit script</button>
          </>
        )}

        {inst.className === 'PointLight' && (
          <>
            <div className={styles.propGroup}>Light</div>
            <PropRow label="Brightness"><NumberField value={p.brightness ?? 1} step={0.5} min={0} onCommit={(v) => set({ brightness: v })} /></PropRow>
            <PropRow label="Range"><NumberField value={p.range ?? 16} min={0} max={60} onCommit={(v) => set({ range: v })} /></PropRow>
            <PropRow label="Color"><input type="color" className={styles.colorInput} value={p.color || '#ffffff'} onChange={(e) => set({ color: e.target.value })} /></PropRow>
          </>
        )}

        {inst.className === 'Lighting' && (
          <>
            <div className={styles.propGroup}>Appearance</div>
            <PropRow label="ClockTime"><NumberField value={p.clockTime ?? 14} step={0.5} min={0} max={24} onCommit={(v) => set({ clockTime: v })} /></PropRow>
            <PropRow label="Brightness"><NumberField value={p.brightness ?? 2} step={0.5} min={0} max={10} onCommit={(v) => set({ brightness: v })} /></PropRow>
            <PropRow label="Atmosphere"><NumberField value={p.atmosphere ?? 0.3} step={0.05} min={0} max={1} onCommit={(v) => set({ atmosphere: v })} /></PropRow>
            <PropRow label="Bloom"><input type="checkbox" checked={p.bloom !== false} onChange={(e) => set({ bloom: e.target.checked })} /></PropRow>
            <PropRow label="SunRays"><input type="checkbox" checked={p.sunRays !== false} onChange={(e) => set({ sunRays: e.target.checked })} /></PropRow>
          </>
        )}
      </div>
    </section>
  );
}
