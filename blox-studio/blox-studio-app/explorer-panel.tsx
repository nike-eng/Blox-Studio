import { useState } from 'react';
import { SCRIPT_CLASSES, SERVICE_CLASSES, type ClassName, type PlaceInstance } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { subtreeIds } from './use-place-editor.js';
import type { PlaceEditor } from './use-place-editor.js';
import { ClassIcon } from './class-icon.js';
import styles from './studio.module.css';

const INSERTABLE: ClassName[] = ['Part', 'TrussPart', 'SpawnLocation', 'Model', 'Folder', 'Script', 'LocalScript', 'ModuleScript', 'PointLight'];

/**
 * Props for the Explorer panel.
 */
export type ExplorerPanelProps = {
  editor: PlaceEditor;
  /** Opens a script in the script editor. */
  onOpenScript: (id: string) => void;
};

/**
 * Explorer panel: the place's instance hierarchy with selection, insert menus and drag-to-reparent.
 */
export function ExplorerPanel({ editor, onOpenScript }: ExplorerPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['Lighting', 'ReplicatedFirst', 'ReplicatedStorage', 'ServerStorage', 'StarterGui', 'StarterPack', 'StarterPlayer']));
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const { instances, selectedId, setSelectedId, insert, reparent, rename, duplicate, copy, paste, canPaste, group, remove } = editor;

  const childrenOf = (id: string | null) => instances.filter((i) => i.parentId === id);
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsed(next);
  };

  const renderNode = (inst: PlaceInstance, depth: number) => {
    const kids = childrenOf(inst.id);
    const open = !collapsed.has(inst.id);
    const isService = SERVICE_CLASSES.includes(inst.className);
    const matches = !filter || inst.name.toLowerCase().includes(filter.toLowerCase());
    return (
      <div key={inst.id}>
        {matches && (
          <div
            className={`${styles.treeRow} ${selectedId === inst.id ? styles.treeRowSelected : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => setSelectedId(inst.id)}
            onDoubleClick={() => SCRIPT_CLASSES.includes(inst.className) && onOpenScript(inst.id)}
            draggable={!isService}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', inst.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dragged = e.dataTransfer.getData('text/plain');
              if (dragged && dragged !== inst.id) reparent(dragged, inst.id);
            }}
          >
            <button
              type="button"
              className={styles.treeToggle}
              style={{ visibility: kids.length ? 'visible' : 'hidden' }}
              onClick={(e) => { e.stopPropagation(); toggle(inst.id); }}
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              {open ? '▾' : '▸'}
            </button>
            <ClassIcon className={inst.className} />
            <span className={styles.treeName}>{inst.name}</span>
            {!isService && (
              <button
                type="button"
                className={styles.treeAdd}
                style={{ width: 26, height: 22 }}
                title="Actions: rename, copy, move into…"
                onClick={(e) => { e.stopPropagation(); setActionsFor(actionsFor === inst.id ? null : inst.id); setMovingId(null); setMenuFor(null); }}
              >
                ⋯
              </button>
            )}
            <button
              type="button"
              className={styles.treeAdd}
              title="Insert object"
              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === inst.id ? null : inst.id); }}
            >
              +
            </button>
          </div>
        )}
        {actionsFor === inst.id && !isService && (
          <div className={styles.insertMenu} style={{ marginLeft: 20 + depth * 14, ...(movingId === inst.id ? { gridTemplateColumns: '1fr' } : {}) }}>
            {movingId === inst.id ? (
              <>
                <div className={styles.empty} style={{ gridColumn: '1 / -1', padding: '0.2rem 0.4rem' }}>Move “{inst.name}” into:</div>
                {instances
                  .filter((t) => !subtreeIds(instances, inst.id).has(t.id) && !SCRIPT_CLASSES.includes(t.className) && t.className !== 'PointLight' && !['TrussPart', 'SpawnLocation', 'Part'].includes(t.className))
                  .map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      className={styles.insertItem}
                      style={{ minHeight: 32 }}
                      onClick={() => { reparent(inst.id, t.id); setActionsFor(null); setMovingId(null); }}
                    >
                      <ClassIcon className={t.className} /> {t.name}
                    </button>
                  ))}
              </>
            ) : (
              <>
                {[
                  ['Rename', () => { const name = window.prompt('New name', inst.name); if (name && name.trim()) rename(inst.id, name.trim()); setActionsFor(null); }],
                  ['Duplicate', () => { duplicate(inst.id); setActionsFor(null); }],
                  ['Copy', () => { copy(inst.id); setActionsFor(null); }],
                  [canPaste ? 'Paste into' : 'Paste (copy first)', () => { if (canPaste) paste(inst.id); setActionsFor(null); }],
                  ['Group', () => { group(inst.id); setActionsFor(null); }],
                  ['Move into…', () => setMovingId(inst.id)],
                  ['Delete', () => { remove(inst.id); setActionsFor(null); }],
                ].map(([label, run]) => (
                  <button type="button" key={label as string} className={styles.insertItem} style={{ minHeight: 32 }} onClick={run as () => void}>
                    {label as string}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {menuFor === inst.id && (
          <div className={styles.insertMenu} style={{ marginLeft: 20 + depth * 14 }}>
            {INSERTABLE.map((cls) => (
              <button
                type="button"
                key={cls}
                className={styles.insertItem}
                onClick={() => {
                  const created = insert(cls, inst.id, inst.props.position && cls === 'Part' ? { position: [inst.props.position[0], inst.props.position[1] + 3, inst.props.position[2]] } : undefined);
                  setMenuFor(null);
                  const next = new Set(collapsed); next.delete(inst.id); setCollapsed(next);
                  if (SCRIPT_CLASSES.includes(cls)) onOpenScript(created.id);
                }}
              >
                <ClassIcon className={cls} /> {cls}
              </button>
            ))}
          </div>
        )}
        {(open || filter) && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <section className={styles.panel} aria-label="Explorer">
      <header className={styles.panelHeader}>Explorer</header>
      <input
        className={styles.filterInput}
        placeholder="Filter workspace (Ctrl+Shift+X)"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className={styles.panelBody}>{childrenOf(null).map((s) => renderNode(s, 0))}</div>
    </section>
  );
}
