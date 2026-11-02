import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SCRIPT_CLASSES, type PlaceInstance, type Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { studioApi, type Project } from './studio-api.js';
import { usePlaceEditor } from './use-place-editor.js';
import { Viewport } from './viewport.js';
import { ExplorerPanel } from './explorer-panel.js';
import { PropertiesPanel } from './properties-panel.js';
import { ScriptEditor } from './script-editor.js';
import { Ribbon, type InsertPreset } from './ribbon.js';
import { PublishDialog } from './publish-dialog.js';
import { Playtest } from './playtest.js';
import styles from './studio.module.css';

function Editor({ project, setProject }: { project: Project; setProject: (p: Project) => void }) {
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const pending = useRef<PlaceInstance[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insertPointRef = useRef<() => Vec3>(() => [0, 5, 0]);
  const [openScriptId, setOpenScriptId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'publish' | 'settings' | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'explorer' | 'properties' | null>(null);
  const [playing, setPlaying] = useState<PlaceInstance[] | null>(null);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const instances = pending.current;
    if (!instances) return;
    pending.current = null;
    setSaveState('saving');
    try {
      await studioApi.updateProject(project.id, { instances });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [project.id]);

  const onChange = useCallback((instances: PlaceInstance[]) => {
    pending.current = instances;
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);

  const editor = usePlaceEditor(project.instances, onChange);

  useEffect(() => () => { flush(); }, [flush]);  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
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
      else if (mod && e.key.toLowerCase() === 'd' && editor.selectedId) { e.preventDefault(); editor.duplicate(editor.selectedId); }
      else if (mod && e.key.toLowerCase() === 'g' && editor.selectedId) { e.preventDefault(); editor.group(editor.selectedId); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedId) { editor.remove(editor.selectedId); }
      else if (e.key === '1') editor.setTool('select');
      else if (e.key === '2') editor.setTool('move');
      else if (e.key === '3') editor.setTool('scale');
      else if (e.key === '4') editor.setTool('rotate');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, flush, playing]);

  const insertPreset = (preset: InsertPreset) => {
    const position = insertPointRef.current();
    const shape = preset.props?.shape;
    const size: Vec3 | undefined = shape === 'Ball' || shape === 'Cylinder' ? [4, 4, 4] : undefined;
    editor.insert(preset.className, 'Workspace', { position, ...(size ? { size } : {}), ...preset.props }, preset.name);
  };

  const insertScript = () => {
    const sel = editor.selected;
    const parent = sel && !SCRIPT_CLASSES.includes(sel.className) ? sel.id : 'ServerScriptService';
    const s = editor.insert('Script', parent);
    setOpenScriptId(s.id);
  };

  const openScript = openScriptId ? editor.byId.get(openScriptId) : null;

  const saveIds = async (universeId: string, placeId: string) => {
    const updated = await studioApi.updateProject(project.id, { universeId, placeId });
    setProject({ ...project, universeId: updated.universeId, placeId: updated.placeId });
  };

  return (
    <div className={styles.studio}>
      <div className={styles.titleBar}>
        <Link to="/" className={styles.brand}><span className={styles.logo}>◆</span> Blox Studio</Link>
        <span className={styles.projectName}>{project.name}</span>
      </div>
      <Ribbon
        editor={editor}
        onInsert={insertPreset}
        onInsertScript={insertScript}
        saveState={saveState}
        onPlay={() => setPlaying(editor.instances)}
        onPublish={() => setDialog('publish')}
        onExport={async () => { await flush(); window.open(studioApi.exportUrl(project.id), '_blank'); }}
        onSettings={() => setDialog('settings')}
      />
      <div className={styles.workArea}>
        <main className={styles.center}>
          {openScript ? (
            <ScriptEditor
              script={openScript}
              onChange={(source) => { if (source !== openScript.props.source) editor.updateProps(openScript.id, { source }); }}
              onClose={() => setOpenScriptId(null)}
            />
          ) : (
            <div className={styles.viewport}>
              {/* Unmounted during playtest so the GPU only renders one scene. */}
              {!playing && <Viewport editor={editor} insertPointRef={insertPointRef} />}
              <div className={styles.viewportHint}>Drag to orbit · Right-drag to pan · Scroll to zoom · 1–4 switch tools</div>
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
