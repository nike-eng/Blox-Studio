import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { studioApi, type ProjectSummary } from './studio-api.js';
import { BrandMark } from './brand-mark.js';
import { AccountCard } from './account-card.js';
import styles from './home.module.css';

const TEMPLATES: { id: PlaceTemplate; name: string; desc: string; preview: string }[] = [
  { id: 'baseplate', name: 'Flat ground', desc: 'A flat grey floor with a spawn point.', preview: 'linear-gradient(160deg,#87c5ff 0 55%,#5b5d69 55%)' },
  { id: 'obby', name: 'Sky Islands Course', desc: '5 stages: lava, moving platforms, spinner, jump pad, truss tower — with checkpoints & timer.', preview: 'linear-gradient(160deg,#87c5ff 0 45%,#ff5a5f 45% 55%,#ffb400 55% 65%,#00c2a8 65% 75%,#5b5d69 75%)' },
  { id: 'empty', name: 'Empty', desc: 'Just the services. Build from scratch.', preview: 'linear-gradient(160deg,#1b1f2a,#2a3040)' },
];

const GAME_PREVIEWS = [
  'linear-gradient(160deg,#87c5ff 0 50%,#5b5d69 50%)',
  'linear-gradient(160deg,#9be7c4 0 50%,#3f5b4b 50%)',
  'linear-gradient(160deg,#ffd29a 0 50%,#6b4f3a 50%)',
  'linear-gradient(160deg,#c9b8ff 0 50%,#4b4468 50%)',
  'linear-gradient(160deg,#ffb3c1 0 50%,#6a4450 50%)',
];
/** A steady colour for a place, so each game card looks different but never changes. */
const previewFor = (id: string) => GAME_PREVIEWS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % GAME_PREVIEWS.length];

/**
 * Home page: create a new place from a template or open an existing project.
 */
export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const load = () => studioApi.listProjects().then(setProjects).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const [picked, setPicked] = useState<PlaceTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Tapping a template only selects it; a place is made when you press Create (and only once, even on a double tap).
  const create = async () => {
    const t = TEMPLATES.find((x) => x.id === picked);
    if (!t || creating) return;
    setCreating(true);
    try {
      setError('');
      const project = await studioApi.createProject(name.trim() || `My ${t.name.toLowerCase()} place`, t.id);
      navigate(`/studio/${project.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  // "My games" = places that were changed, named or published. "Older places" = copies still exactly a starter template.
  const isOlder = (p: ProjectSummary) => p.pristine === true && !p.placeId && !p.publishHistory.length;
  const games = projects?.filter((p) => !isOlder(p)) ?? [];
  const older = projects?.filter(isOlder) ?? [];
  const [why, setWhy] = useState('');
  const explain = () => { setWhy('Checking…'); studioApi.untouchedProjects().then((r) => setWhy(`Server checked ${r.checked} places, ${r.ids.length} unchanged.${r.hint ? ` ${r.hint}` : ''}`)).catch((e) => setWhy(e.message)); };
  const toggle = (id: string) => setChosen((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const closeCleanup = () => { setCleaning(false); setChosen(new Set()); };
  const removeChosen = async () => {
    const ids = [...chosen];
    if (!ids.length || deleting) return;
    if (!window.confirm(`Delete ${ids.length} ${ids.length === 1 ? 'place' : 'places'}? This cannot be undone.`)) return;
    setDeleting(true);
    try { await studioApi.deleteProjects(ids); closeCleanup(); await load(); } catch (e) { setError((e as Error).message); } finally { setDeleting(false); }
  };

  const renderCard = (p: ProjectSummary) => (
    <div key={p.id} className={styles.gameCard}>
      <Link to={`/studio/${p.id}`} className={styles.card}>
        <div className={styles.preview} style={{ background: previewFor(p.id) }} />
        <div className={styles.cardBody}>
          <strong>{p.name}</strong>
          <span>Edited {new Date(p.updatedAt).toLocaleString()}</span>
          <span className={p.placeId ? styles.badgeLinked : styles.badge}>
            {p.publishHistory[0] ? `v${p.publishHistory[0].versionNumber} on Roblox` : p.placeId ? 'Linked' : 'Not published'}
          </span>
        </div>
      </Link>
      <button
        type="button"
        className={styles.cardDelete}
        onClick={async () => { if (window.confirm(`Delete "${p.name}"?`)) { await studioApi.deleteProject(p.id); load(); } }}
        aria-label={`Delete ${p.name}`}
      >
        ✕
      </button>
    </div>
  );

  const renderRow = (p: ProjectSummary, selecting: boolean) => (
    <div key={p.id} className={styles.row}>
      {selecting && <input type="checkbox" className={styles.tick} checked={chosen.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />}
      <Link to={`/studio/${p.id}`} className={styles.rowMain}>
        <strong>{p.name}</strong>
        <span className={styles.muted}>Edited {new Date(p.updatedAt).toLocaleString()}</span>
      </Link>
      <span className={p.placeId ? styles.badgeLinked : styles.badge}>
        {p.publishHistory[0] ? `v${p.publishHistory[0].versionNumber} on Roblox` : p.placeId ? 'Linked' : 'Not published'}
      </span>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={async () => { if (window.confirm(`Delete "${p.name}"?`)) { await studioApi.deleteProject(p.id); load(); } }}
        aria-label={`Delete ${p.name}`}
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className={styles.home}>
      <header className={styles.top}>
        <Link to="/" className={styles.brand}><span className={styles.logo}><BrandMark size={26} /></span> VoxMesa</Link>
        <a className={styles.docsLink} href="https://create.roblox.com/docs/cloud/open-cloud/usage-place-publishing" target="_blank" rel="noreferrer">How publishing works ↗</a>
      </header>
      <section className={styles.hero}>
        <h1>Build 3D games in your browser.</h1>
        <p>Place parts, write Lua scripts and press Play. When you are ready, export a place file or publish it to your own experience. No install needed.</p>
        <input className={styles.nameInput} placeholder="Name your new place" value={name} onChange={(e) => setName(e.target.value)} />
      </section>
      <AccountCard onChange={load} refreshKey={projects?.length ?? 0} />
      <section>
        <h2 className={styles.sectionTitle}>New games</h2>
        <div className={styles.grid}>
          {TEMPLATES.map((t) => (
            <button type="button" key={t.id} className={`${styles.card} ${picked === t.id ? styles.cardOn : ''}`} aria-pressed={picked === t.id} onClick={() => setPicked(t.id)}>
              <div className={styles.preview} style={{ background: t.preview }} />
              <div className={styles.cardBody}><strong>{t.name}</strong><span>{t.desc}</span></div>
            </button>
          ))}
        </div>
        {picked && (
          <div className={styles.createBar}>
            <span>Ready: <strong>{TEMPLATES.find((t) => t.id === picked)?.name}</strong></span>
            <button type="button" className={styles.accountBtn} disabled={creating} onClick={create}>{creating ? 'Creating…' : 'Create place'}</button>
          </div>
        )}
      </section>
      <section>
        <h2 className={styles.sectionTitle}>My games{projects ? ` (${games.length})` : ''}</h2>
        {error && <p className={styles.error}>{error}</p>}
        {!projects && !error && <p className={styles.muted}>Loading…</p>}
        {projects && games.length === 0 && <p className={styles.muted}>Nothing here yet. Create a place above, change something and press Save: it will show up here.</p>}
        <div className={styles.grid}>{games.map(renderCard)}</div>
        {games.length >= 10 && older.length === 0 && (
          <p className={styles.muted}>
            Lots of places and none sorted as unused copies?{' '}
            <button type="button" className={styles.accountLink} onClick={explain}>Check why</button>
            {why && <span> {why}</span>}
          </p>
        )}
      </section>
      {older.length > 0 && (
        <section>
          <details className={styles.older}>
            <summary className={styles.olderSummary}>Older versions ({older.length})</summary>
            <p className={styles.muted}>Earlier copies and starter places that were never changed. Open one to start from it again, or clean them up.</p>
            <div className={styles.cleanBar}>
              {cleaning ? (
                <>
                  <span>Tick places to delete.</span>
                  <span className={styles.accountActions}>
                    <button type="button" className={styles.accountBtnGhost} onClick={() => setChosen(new Set(older.map((p) => p.id)))}>Select all ({older.length})</button>
                    <button type="button" className={styles.accountBtn} disabled={!chosen.size || deleting} onClick={removeChosen}>{deleting ? 'Deleting…' : `Delete ${chosen.size}`}</button>
                    <button type="button" className={styles.accountBtnGhost} onClick={closeCleanup}>Done</button>
                  </span>
                </>
              ) : (
                <button type="button" className={styles.accountBtnGhost} onClick={() => setCleaning(true)}>Clean up</button>
              )}
            </div>
            <div className={styles.list}>{older.map((p) => renderRow(p, cleaning))}</div>
          </details>
        </section>
      )}
      <p className={styles.disclaimer}>VoxMesa is an independent project. It is not affiliated with, endorsed by, or sponsored by Roblox Corporation. Roblox and Roblox Studio are trademarks of Roblox Corporation, named here only to describe file compatibility.</p>
    </div>
  );
}
