import { useEffect, useState } from 'react';
import { studioApi, aiLinkUrl } from './studio-api.js';
import styles from './studio.module.css';

/**
 * "Connect an AI" section of Game settings: makes a private link an AI assistant (like Claude) can use to
 * look at and edit your places. The link is shown once; making a new one or turning it off cancels the old one.
 */
export function AiLink() {
  const [active, setActive] = useState<boolean | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { studioApi.aiLinkStatus().then((s) => setActive(s.active)).catch(() => setActive(null)); }, []);

  const make = async () => {
    setBusy(true); setError(''); setCopied(false);
    try { const { token } = await studioApi.createAiLink(); setUrl(aiLinkUrl(token)); setActive(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const off = async () => {
    setBusy(true); setError('');
    try { await studioApi.revokeAiLink(); setUrl(''); setActive(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { const el = document.getElementById('aiLinkBox') as HTMLTextAreaElement | null; el?.select(); }
  };

  return (
    <section className={styles.aiLink} aria-label="Connect an AI">
      <div className={styles.propGroup}>Connect an AI</div>
      <p className={styles.hint}>
        Let an AI assistant (like Claude) build in your places by chatting. It can look at, add, change and delete parts and run scripts. It <b>cannot publish</b>, and you can undo what it does.
      </p>
      {url ? (
        <>
          <textarea id="aiLinkBox" className={styles.aiLinkBox} readOnly value={url} rows={3} onFocus={(e) => e.currentTarget.select()} />
          <div className={styles.aiLinkRow}>
            <button type="button" className={styles.publishBtn} onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
            <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={off}>Turn off</button>
          </div>
          <div className={styles.notice}>
            Keep this link private: anyone who has it can edit your places. It is shown only now. In your AI app, add it as a <b>custom connector</b> (paste the link as the server address). If you lose it, make a new one.
          </div>
        </>
      ) : (
        <div className={styles.aiLinkRow}>
          <button type="button" className={styles.secondaryBtn} disabled={busy || active === null} onClick={make}>{active ? 'Make a new link' : 'Make an AI link'}</button>
          {active && <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={off}>Turn off</button>}
        </div>
      )}
      {active && !url && <p className={styles.hint}>An AI link is on. A new link replaces it.</p>}
      {error && <div className={styles.errorBox}>{error}</div>}
    </section>
  );
}
