import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SCRIPT_CLASSES, runStudioScript, type Interpreter, type OutputKind, type OutputLine, type PlaceInstance, type Vec3 } from '@robloc/blox-studio.rbxlx-serializer';
import { studioApi, type Project } from './studio-api.js';
import { usePlaceEditor } from './use-place-editor.js';
import { Viewport } from './viewport.js';
import { ExplorerPanel } from './explorer-panel.js';
import { PropertiesPanel } from './properties-panel.js';
import { ScriptEditor } from './script-editor.js';
import { TopBar, ToolRail, AddMenu, SelectionBar, SNAPS, type SnapLevel, type InsertItem } from './studio-chrome.js';
import chrome from './studio-chrome.module.css';
import { OutputPanel } from './output-panel.js';
import { PublishDialog } from './publish-dialog.js';
import { Playtest } from './playtest.js';
import styles from './studio.module.css';

function Editor({ project, setProject }: { project: Project; setProject: (p: Project) => void }) {
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  const pending = useRef<PlaceInstance[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insertPointRef = useRef<() => Vec3>(() => [0, 5, 0]);
  const focusRef = useRef<(pos: Vec3) => void>(() => undefined);
  const [addOpen, setAddOpen] = useState(false);
  const [multi, setMulti] = useState(false);
  const [snap, setSnap] = useState<SnapLevel>('normal');
  const [space, setSpace] = useState<'world' | 'local'>('world');
  const [openScriptId, setOpenScriptId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'publish' | 'settings' | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'explorer' | 'properties' | null>(null);
  const [playing, setPlaying] = useState<PlaceInstance[] | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const runner = useRef<Interpreter | null>(null);
  const lineId = useRef(0);

  const lastSeen = useRef(project.updatedAt);
  const applyingRemote = useRef(false);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const instances = pending.current;
    if (!instances) return;
    pending.current = null;
    setSaveState('saving');
    try {
      const saved = await studioApi.updateProject(project.id, { instances });
      if (saved?.updatedAt) lastSeen.current = saved.updatedAt;
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [project.id]);

  const onChange = useCallback((instances: PlaceInstance[]) => {
    if (applyingRemote.current) { applyingRemote.current = false; return; } // came from the server, nothing to save
    pending.current = instances;
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);

  const editor = usePlaceEditor(project.instances, onChange);
  const latest = useRef(editor.instances);
  latest.current = editor.instances;

  // Pick up edits made elsewhere (for example by a connected AI). Only when nothing of yours is waiting to be saved,
  // and it lands as one undo step so you can take it back.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible' || pending.current || saveStateRef.current !== 'saved') return;
      try {
        const remote = await studioApi.getProject(project.id);
        if (remote.updatedAt === lastSeen.current || pending.current) return;
        lastSeen.current = remote.updatedAt;
        if (JSON.stringify(remote.instances) !== JSON.stringify(latest.current)) {
          applyingRemote.current = true;
          editor.setAll(remote.instances);
        }
      } catch { /* offline: try again next time */ }
    }, 5000);
    return () => clearInterval(id);
  }, [project.id, editor.setAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const log = useCallback((kind: OutputKind, text: string) => {
    setOutputLines((ls) => [...ls.slice(-499), { id: ++lineId.current, kind, text, time: Date.now() }]);
  }, []);

  /** Runs Luau against the place; whatever it changes lands as ONE undo step. */
  const runLuau = useCallback(async (source: string, chunk: string, scriptId?: string, echo = false) => {
    if (runner.current) return;
    setOutputOpen(true);
    if (echo) log('info', `> ${source.split('\n')[0]}${source.includes('\n') ? ' …' : ''}`);
    const base = latest.current;
    setRunning(true);
    try {
      const res = await runStudioScript(source, base, { chunk, scriptId, out: log, onStart: (it) => { runner.current = it; } });
      if (res.changed) {
        if (latest.current !== base) log('warn', 'You edited the place while the script was running, so its changes were not applied. Run it again.');
        else editor.setAll(res.instances);
      }
    } finally {
      runner.current = null;
      setRunning(false);
    }
  }, [log, editor]);

  useEffect(() => () => { flush(); }, [flush]);

  // Safari on iPad can close the tab without unmounting, so save as soon as the page is hidden.
  useEffect(() => {
    const save = () => { flush(); };
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', onHide); };
  }, [flush]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (playing) return;
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === 'F5') { e.preventDefault(); setPlaying(editor.instances); return; }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) editor.redo(); else editor.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); }
      else if (mod && e.key.toLowerCase() === 'd' && editor.selectedId) { e.preventDefault(); editor.duplicateMany(editor.pickedIds); }
      else if (mod && e.key.toLowerCase() === 'g' && editor.selectedId) { e.preventDefault(); editor.groupMany(editor.pickedIds); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedId) { editor.removeMany(editor.pickedIds); }
      else if (mod && e.key.toLowerCase() === 'c' && editor.selectedId) { e.preventDefault(); editor.copy(editor.selectedId); }
      else if (mod && e.key.toLowerCase() === 'x' && editor.selectedId) { e.preventDefault(); editor.cut(editor.selectedId); }
      else if (mod && e.key.toLowerCase() === 'u' && editor.selectedId) { e.preventDefault(); editor.ungroup(editor.selectedId); }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); editor.paste(editor.selectedId ?? undefined); }
      else if (e.altKey && e.key.toLowerCase() === 'a' && editor.selected?.props.position) { editor.updateProps(editor.selected.id, { anchored: editor.selected.props.anchored === false }); }
      else if (e.key.toLowerCase() === 'f' && !mod) { const p = editor.selected?.props.position; if (p) focusRef.current(p); }
      else if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); setSpace((x) => (x === 'world' ? 'local' : 'world')); }
      else if (e.key === 'Escape') { setAddOpen(false); editor.setSelectedId(null); }
      else if (e.key === '1') editor.setTool('select');
      else if (e.key === '2') editor.setTool('move');
      else if (e.key === '3') editor.setTool('scale');
      else if (e.key === '4') editor.setTool('rotate');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, flush, playing]);

  /** Finds an empty spot near the camera target so new parts never pile up on each other. */
  const freeSpot = (size: Vec3): Vec3 => {
    const [bx, by, bz] = insertPointRef.current();
    const taken = editor.instances.filter((i) => i.props.position && i.props.size && Math.max(...i.props.size) < 200);
    const clash = (x: number, z: number) =>
      taken.some((i) => {
        const [px, , pz] = i.props.position!;
        const [sx, , sz] = i.props.size!;
        return Math.abs(px - x) < (sx + size[0]) / 2 + 0.5 && Math.abs(pz - z) < (sz + size[2]) / 2 + 0.5;
      });
    for (let k = 0; k < 60; k += 1) {
      const r = k === 0 ? 0 : 5 * Math.sqrt(k);
      const a = k * 2.399963;
      const x = Math.round(bx + r * Math.cos(a));
      const z = Math.round(bz + r * Math.sin(a));
      if (!clash(x, z)) {
        // Sit on whatever is underneath (the baseplate, a platform), like Roblox Studio does.
        const ground = editor.instances.reduce((top, i) => {
          if (!i.props.position || !i.props.size) return top;
          const [px, py, pz] = i.props.position;
          const [sx, sy, sz] = i.props.size;
          const under = Math.abs(px - x) <= sx / 2 && Math.abs(pz - z) <= sz / 2;
          return under && py + sy / 2 <= by + 0.01 ? Math.max(top, py + sy / 2) : top;
        }, 0);
        return [x, Math.round((ground + size[1] / 2) * 100) / 100, z];
      }
    }
    return [bx, by, bz];
  };

  const insertItem = (item: InsertItem) => {
    setAddOpen(false);
    const sel = editor.selected;
    if (item.className === 'Light') {
      const onPart = sel && sel.props.position && !SCRIPT_CLASSES.includes(sel.className) && sel.className !== 'Folder' && sel.className !== 'Model';
      if (onPart) { editor.insert('PointLight', sel.id); return; }
      const spot = freeSpot([2, 2, 2]);
      const bulb = editor.insert('Part', 'Workspace', { position: spot, size: [2, 2, 2], shape: 'Ball', color: '#fff3b0', material: 'Neon', anchored: true }, 'LightBulb');
      editor.insert('PointLight', bulb.id);
      editor.setSelectedId(bulb.id);
      return;
    }
    if (item.className === 'Script' || item.className === 'LocalScript' || item.className === 'ModuleScript') {
      const parent = item.className === 'Script' ? 'ServerScriptService' : item.className === 'ModuleScript' ? 'ReplicatedStorage' : 'StarterGui';
      const created = editor.insert(item.className, parent);
      setOpenScriptId(created.id);
      return;
    }
    if (item.className === 'Folder' || item.className === 'Model') {
      editor.insert(item.className, 'Workspace', undefined, item.name);
      return;
    }
    const shape = item.props?.shape;
    const size = (item.props?.size as Vec3 | undefined) ?? (shape === 'Ball' || shape === 'Cylinder' || shape === 'Wedge' || shape === 'CornerWedge' ? [4, 4, 4] : [4, 1, 2]);
    const position = freeSpot(size);
    const created = editor.insert(item.className, 'Workspace', { position, ...(shape === 'Ball' || shape === 'Cylinder' || shape === 'Wedge' || shape === 'CornerWedge' ? { size } : {}), ...item.props }, item.name);
    editor.setSelectedId(created.id);
    if (editor.tool === 'select') editor.setTool('move');
  };

  const openScript = openScriptId ? editor.byId.get(openScriptId) : null;

  const saveIds = async (universeId: string, placeId: string) => {
    const updated = await studioApi.updateProject(project.id, { universeId, placeId });
    setProject({ ...project, universeId: updated.universeId, placeId: updated.placeId });
  };

  return (
    <div className={styles.studio}>
      <TopBar
        projectName={project.name}
        saveState={saveState}
        editor={editor}
        onPlay={() => setPlaying(editor.instances)}
        onExport={async () => { await flush(); window.open(studioApi.exportUrl(project.id), '_blank'); }}
        onPublish={() => setDialog('publish')}
        onSettings={() => setDialog('settings')}
        onToggleOutput={() => setOutputOpen((o) => !o)}
        outputOpen={outputOpen}
        outputErrors={outputLines.filter((l) => l.kind === 'error').length}
      />
      <div className={styles.workArea}>
        <main className={styles.center}>
          {openScript ? (
            <ScriptEditor
              script={openScript}
              onChange={(source) => { if (source !== openScript.props.source) editor.updateProps(openScript.id, { source }); }}
              onClose={() => setOpenScriptId(null)}
              onRun={(src) => { void runLuau(src, openScript.name, openScript.id); }}
              running={running}
            />
          ) : (
            <div className={styles.viewport}>
              {/* Unmounted during playtest so the GPU only renders one scene. */}
              {!playing && <Viewport editor={editor} insertPointRef={insertPointRef} focusRef={focusRef} snap={SNAPS[snap]} space={space} multiMode={multi} />}
              {!playing && (
                <>
                  <ToolRail multi={multi} setMulti={setMulti} tool={editor.tool} setTool={editor.setTool} snap={snap} setSnap={setSnap} space={space} setSpace={setSpace} />
                  <div className={chrome.hint}>Drag to look around · Right-drag to move · Scroll to zoom · F to focus</div>
                  <AddMenu open={addOpen} onToggle={() => setAddOpen((o) => !o)} onPick={insertItem} />
                  {!addOpen && <SelectionBar editor={editor} onFocus={() => { const p = editor.selected?.props.position; if (p) focusRef.current(p); }} />}
                </>
              )}
            </div>
          )}
        </main>
        <aside className={`${styles.sidebar} ${mobilePanel ? styles.sidebarOpen : ''}`}>
          <div className={mobilePanel === 'properties' ? styles.hideMobile : ''}>
            <ExplorerPanel editor={editor} onOpenScript={setOpenScriptId} />
          </div>
          <div className={mobilePanel === 'explorer' ? styles.hideMobile : ''}>
            <PropertiesPanel editor={editor} onOpenScript={setOpenScriptId} />
          </div>
        </aside>
      </div>
      {outputOpen && !playing && (
        <OutputPanel
          lines={outputLines}
          running={running}
          onClear={() => setOutputLines([])}
          onRun={(src) => { void runLuau(src, 'Command', undefined, true); }}
          onStop={() => runner.current?.abort()}
          onClose={() => setOutputOpen(false)}
        />
      )}
      <nav className={styles.mobileTabs}>
        <button type="button" onClick={() => setMobilePanel(null)} data-active={!mobilePanel}>Viewport</button>
        <button type="button" onClick={() => setMobilePanel('explorer')} data-active={mobilePanel === 'explorer'}>Explorer</button>
        <button type="button" onClick={() => setMobilePanel('properties')} data-active={mobilePanel === 'properties'}>Properties</button>
      </nav>
      {playing && <Playtest instances={playing} onStop={() => setPlaying(null)} />}
      {dialog && (
        <PublishDialog
          project={project}
          settingsOnly={dialog === 'settings'}
          flush={flush}
          onSaveIds={saveIds}
          onPublished={(record) => setProject({ ...project, publishHistory: [record, ...project.publishHistory] })}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/**
 * Studio page: loads a project and renders the full editor.
 */
export function StudioPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    studioApi.getProject(id).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className={styles.loading}>{error} · <Link to="/">Back to projects</Link></div>;
  if (!project) return <div className={styles.loading}>Loading place…</div>;
  return <Editor project={project} setProject={setProject} />;
}
