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
const KEY_STORE = 'voxmesa.robloxKey';
function readKey(): string { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } }
function writeKey(v: string): void { try { if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); } catch { /* private mode: the key just is not remembered */ } }

export function PublishDialog({ project, flush, onSaveIds, onPublished, onClose, settingsOnly }: PublishDialogProps) {
  const [universeId, setUniverseId] = useState(project.universeId || '');
  const [placeId, setPlaceId] = useState(project.placeId || '');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublishRecord | null>(null);
  const [check, setCheck] = useState<{ ready: boolean; items: { ok: boolean; text: string }[] } | null>(null);
  const [sure, setSure] = useState(false);
  const [apiKey, setApiKey] = useState(() => readKey());
  const [remember, setRemember] = useState(() => !!readKey());
  const [showKey, setShowKey] = useState(false);

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
  const keyOk = apiKey.length >= 20 && !/\s/.test(apiKey);
  const canPublish = keyOk || configured === true;

  const run = async (versionType: 'Saved' | 'Published') => {
    setBusy(true); setError(''); setResult(null);
    try {
      await onSaveIds(universeId, placeId);
      await flush();
      writeKey(remember ? apiKey : '');
      const record = await studioApi.publish(project.id, versionType, keyOk ? apiKey : undefined);
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

        {!settingsOnly && (
          <div className={styles.field}>
            <label htmlFor="rbx-key"><span>Roblox API key</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="rbx-key"
                className={styles.textInput}
                style={{ flex: 1, minWidth: 0 }}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value.trim())}
                placeholder="Paste your key here"
              />
              <button type="button" className={styles.secondaryBtn} onClick={() => setShowKey((v) => !v)} aria-pressed={showKey}>{showKey ? 'Hide' : 'Show'}</button>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: '0.85rem' }}>
              <input type="checkbox" checked={remember} onChange={(e) => { setRemember(e.target.checked); if (!e.target.checked) writeKey(''); }} />
              Remember it on this device
            </label>
            <p className={styles.hint}>
              Make a key at <a href="https://create.roblox.com/dashboard/credentials" target="_blank" rel="noreferrer">create.roblox.com → Credentials</a>:
              {' '}Create API Key → add <b>Place Publishing</b> (<code>universe-places:write</code>) for your experience → Save. It stays on this device and is only sent to Roblox when you publish. Never share it.
            </p>
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
            {[{ ok: canPublish, text: canPublish ? 'A Roblox API key is ready.' : 'Paste your Roblox API key above.' }, ...check.items.slice(1)].map((it) => (
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
              <button type="button" className={styles.secondaryBtn} disabled={busy || !idsValid || !canPublish} onClick={() => run('Saved')}>
                Save to Roblox
              </button>
              <button
                type="button"
                className={styles.publishBtn}
                disabled={busy || !idsValid || !canPublish}
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
