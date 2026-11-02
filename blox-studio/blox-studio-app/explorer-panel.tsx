import { useState } from 'react';
import { SCRIPT_CLASSES, SERVICE_CLASSES, type ClassName, type PlaceInstance } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['Lighting', 'ReplicatedStorage', 'StarterGui']));
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const { instances, selectedId, setSelectedId, insert, reparent } = editor;

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
