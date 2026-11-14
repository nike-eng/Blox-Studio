import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { studioApi, type ProjectSummary } from './studio-api.js';
import { BrandMark } from './brand-mark.js';
import { AccountCard } from './account-card.js';
import { Icon } from './icons.js';
import { WorldScene, TEMPLATE_SCENES, HERO_SCENE, gameScene, type Scene } from './world-scene.js';
import styles from './home.module.css';


const TEMPLATES: { id: PlaceTemplate; name: string; desc: string; tag: string }[] = [
  { id: 'baseplate', name: 'Flat ground', desc: 'A flat grey floor with a spawn point.', tag: 'Starter' },
  { id: 'obby', name: 'Sky Islands Course', desc: '5 stages: lava, moving platforms, spinner, jump pad and truss tower, with checkpoints and a timer.', tag: 'Ready to play' },
  { id: 'empty', name: 'Empty', desc: 'Just the services. Build from scratch.', tag: 'Blank' },
];

const edited = (p: ProjectSummary) => `Edited ${new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
const statusOf = (p: ProjectSummary) => (p.publishHistory[0] ? `v${p.publishHistory[0].versionNumber} on Roblox` : p.placeId ? 'Linked' : 'Not published');

/** The picture at the top of a card. */
function Preview({ scene, className, tag }: { scene: Scene; className: string; tag?: string }) {
  return <div className={className} style={{ background: scene.bg }}><WorldScene scene={scene} className={styles.scene} />{tag && <span className={styles.tag}>{tag}</span>}</div>;
}


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
        <Preview scene={gameScene(p.id)} className={styles.preview} />
        <div className={styles.cardBody}>
          <strong>{p.name}</strong>
          <span className={styles.meta}>{edited(p)}</span>
          <span className={p.placeId ? styles.badgeLinked : styles.badge}>{statusOf(p)}</span>
        </div>
      </Link>
      <button
        type="button"
        className={styles.cardDelete}
        onClick={async () => { if (window.confirm(`Delete "${p.name}"?`)) { await studioApi.deleteProject(p.id); load(); } }}
        aria-label={`Delete ${p.name}`}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );

  const renderRow = (p: ProjectSummary, selecting: boolean) => (
    <div key={p.id} className={styles.row}>
      {selecting && <input type="checkbox" className={styles.tick} checked={chosen.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />}
      <Link to={`/studio/${p.id}`} className={styles.rowMain}>
        <strong>{p.name}</strong>
        <span className={styles.muted}>{edited(p)}</span>
      </Link>
      <span className={p.placeId ? styles.badgeLinked : styles.badge}>{statusOf(p)}</span>
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={async () => { if (window.confirm(`Delete "${p.name}"?`)) { await studioApi.deleteProject(p.id); load(); } }}
        aria-label={`Delete ${p.name}`}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );

  const pickedT = TEMPLATES.find((t) => t.id === picked);
  const latest = games.reduce<ProjectSummary | null>((a, p) => (!a || new Date(p.updatedAt) > new Date(a.updatedAt) ? p : a), null);
  const jumpToNew = () => document.getElementById('new-games')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className={styles.home}>
      <header className={styles.top}>
        <Link to="/" className={styles.brand}><span className={styles.logo}><BrandMark size={28} /></span><span>VoxMesa</span></Link>
        <a className={styles.docsLink} href="https://create.roblox.com/docs/cloud/open-cloud/usage-place-publishing" target="_blank" rel="noreferrer">How publishing works</a>
      </header>
      <section className={styles.stage}>
        <div className={styles.heroText}>
          <h1>Build <span className={styles.mark}>3D games</span> in your browser.</h1>
          <p>Place parts, write Lua scripts and press Play. Export a place file or publish to your own Roblox experience. Nothing to install.</p>
          <div className={styles.cta}>
            {latest ? (
              <Link to={`/studio/${latest.id}`} className={styles.ctaMain}>Continue “{latest.name}”</Link>
            ) : (
              <button type="button" className={styles.ctaMain} onClick={jumpToNew}>Start your first game</button>
            )}
            {latest && <button type="button" className={styles.ctaGhost} onClick={jumpToNew}>New game</button>}
          </div>
        </div>
        <div className={styles.heroArt}><WorldScene scene={HERO_SCENE} className={styles.scene} twinkleClass={styles.twinkle} driftClass={styles.drift} sunClass={styles.glow} /></div>
      </section>
      <AccountCard onChange={load} refreshKey={projects?.length ?? 0} />
      <section>
        <h2 className={styles.sectionTitle} id="new-games">New games</h2>
        <p className={styles.hint}>Pick a starter, give it a name and press Create.</p>
        <div className={styles.grid}>
          {TEMPLATES.map((t) => (
            <button type="button" key={t.id} className={`${styles.card} ${picked === t.id ? styles.cardOn : ''}`} aria-pressed={picked === t.id} onClick={() => setPicked(t.id)}>
              {picked === t.id && <span className={styles.checkBadge}><Icon name="check" size={16} /></span>}
              <Preview scene={TEMPLATE_SCENES[t.id]} className={styles.preview} tag={t.tag} />
              <div className={styles.cardBody}><strong>{t.name}</strong><span className={styles.desc}>{t.desc}</span></div>
            </button>
          ))}
        </div>
        {pickedT && (
          <form className={styles.createBar} onSubmit={(e) => { e.preventDefault(); create(); }}>
            <label className={styles.createName}>
              <span className={styles.muted}>Name your new {pickedT.name.toLowerCase()} place (optional)</span>
              <input className={styles.nameInput} placeholder={`My ${pickedT.name.toLowerCase()} place`} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" className={styles.accountBtn} disabled={creating}>{creating ? 'Creating…' : 'Create place'}</button>
          </form>
        )}
      </section>
      <section>
        <h2 className={styles.sectionTitle}>My games{projects && <span className={styles.count}>{games.length}</span>}</h2>
        <p className={styles.hint}>Places you changed or published. Tap one to keep building.</p>
        {error && <p className={styles.error}>{error}</p>}
        {!projects && !error && <p className={styles.muted}>Loading…</p>}
        {projects && games.length === 0 && <p className={styles.empty}>No saved games yet. Make a place above, change something and press Save. It will show up here.</p>}
        <div className={`${styles.grid} ${styles.gameGrid}`}>{games.map(renderCard)}</div>
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
            <summary className={styles.olderSummary}>Older versions <span className={styles.count}>{older.length}</span></summary>
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
