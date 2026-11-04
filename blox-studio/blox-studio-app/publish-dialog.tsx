import { useEffect, useState } from 'react';
import { AiLink } from './ai-link.js';
import { studioApi, type Project, type PublishRecord } from './studio-api.js';
import styles from './studio.module.css';

/**
 * Props for the publish dialog.
 */
export type PublishDialogProps = {
  project: Project;
  /** Persists any pending edits before publishing. */
  flush: () => Promise<void>;
  onSaveIds: (universeId: string, placeId: string) => Promise<void>;
  onPublished: (record: PublishRecord) => void;
  onClose: () => void;
  /** Opens only the settings section. */
  settingsOnly?: boolean;
};

/**
 * Dialog that links the project to a Roblox experience and publishes it via Open Cloud.
 */
export function PublishDialog({ project, flush, onSaveIds, onPublished, onClose, settingsOnly }: PublishDialogProps) {
  const [universeId, setUniverseId] = useState(project.universeId || '');
  const [placeId, setPlaceId] = useState(project.placeId || '');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublishRecord | null>(null);
  const [check, setCheck] = useState<{ ready: boolean; items: { ok: boolean; text: string }[] } | null>(null);
  const [sure, setSure] = useState(false);

  // Re-check what is ready whenever the IDs change (after saving them).
  useEffect(() => {
    if (settingsOnly) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      try {
        if (/^\d+$/.test(universeId) && /^\d+$/.test(placeId) && (universeId !== project.universeId || placeId !== project.placeId)) await onSaveIds(universeId, placeId);
        const c = await studioApi.publishCheck(project.id);
        if (live) setCheck(c);
      } catch { if (live) setCheck(null); }
    }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [universeId, placeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!sure) return undefined; const t = setTimeout(() => setSure(false), 5000); return () => clearTimeout(t); }, [sure]);

  useEffect(() => {
    studioApi.robloxStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, []);

  const idsValid = /^\d+$/.test(universeId) && /^\d+$/.test(placeId);

  const run = async (versionType: 'Saved' | 'Published') => {
    setBusy(true); setError(''); setResult(null);
    try {
      await onSaveIds(universeId, placeId);
      await flush();
      const record = await studioApi.publish(project.id, versionType);
      setResult(record);
      onPublished(record);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.dialogHeader}>
          <h2>{settingsOnly ? 'Game Settings' : 'Publish to Roblox'}</h2>
          <button type="button" className={styles.scriptClose} onClick={onClose} aria-label="Close">✕</button>
        </header>

        {configured === false && (
          <div className={styles.notice}>
            The server has no Roblox Open Cloud API key yet. Create one at{' '}
            <a href="https://create.roblox.com/dashboard/credentials" target="_blank" rel="noreferrer">create.roblox.com → Credentials</a>{' '}
            with the <b>universe-places:write</b> permission for your experience, then add it as <code>ROBLOX_API_KEY</code>.
          </div>
        )}

        <label className={styles.field}>
          <span>Universe ID (Experience ID)</span>
          <input className={styles.textInput} inputMode="numeric" value={universeId} onChange={(e) => setUniverseId(e.target.value.trim())} placeholder="e.g. 5432109876" />
        </label>
        <label className={styles.field}>
          <span>Place ID</span>
          <input className={styles.textInput} inputMode="numeric" value={placeId} onChange={(e) => setPlaceId(e.target.value.trim())} placeholder="e.g. 1234567890" />
        </label>
        <p className={styles.hint}>
          Find both on the Creator Dashboard: open your experience → the Universe ID is in the URL / “Copy Universe ID”, and the Place ID is under Places → “Copy Place ID”.
        </p>

        {!settingsOnly && check && (
          <ul className={styles.checklist} aria-label="Ready to publish?">
            {check.items.map((it) => (
              <li key={it.text} data-ok={it.ok}><span className={styles.checkMark} aria-hidden="true">{it.ok ? '✅' : '⚠️'}</span><span>{it.text}</span></li>
            ))}
          </ul>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}
        {result && (
          <div className={styles.successBox}>
            ✅ {result.versionType === 'Published' ? 'Published' : 'Saved'} as version {result.versionNumber}.{' '}
            <a href={`https://www.roblox.com/games/${placeId}`} target="_blank" rel="noreferrer">Open on Roblox ↗</a>
          </div>
        )}

        <footer className={styles.dialogFooter}>
          {settingsOnly ? (
            <>
              <button type="button" className={styles.secondaryBtn} onClick={onClose}>Close</button>
              <button type="button" className={styles.publishBtn} disabled={busy || !idsValid} onClick={async () => { setBusy(true); await onSaveIds(universeId, placeId); setBusy(false); onClose(); }}>
                Save IDs
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.secondaryBtn} disabled={busy || !idsValid || !configured} onClick={() => run('Saved')}>
                Save to Roblox
              </button>
              <button
                type="button"
                className={styles.publishBtn}
                disabled={busy || !idsValid || !configured}
                onClick={() => { if (!sure) { setSure(true); return; } setSure(false); void run('Published'); }}
                title="Makes this version live for players"
              >
                {busy ? 'Publishing…' : sure ? 'Tap again to go live' : 'Publish live'}
              </button>
            </>
          )}
        </footer>

        {settingsOnly && <AiLink />}

        {!settingsOnly && project.publishHistory.length > 0 && (
          <div className={styles.history}>
            <div className={styles.propGroup}>Publish history</div>
            {project.publishHistory.slice(0, 5).map((h) => (
              <div key={`${h.versionNumber}-${h.publishedAt}`} className={styles.historyRow}>
                <span>v{h.versionNumber}</span><span>{h.versionType}</span><span>{new Date(h.publishedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
