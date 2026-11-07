import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { studioApi, type ProjectSummary } from './studio-api.js';
import styles from './home.module.css';

const TEMPLATES: { id: PlaceTemplate; name: string; desc: string; preview: string }[] = [
  { id: 'baseplate', name: 'Baseplate', desc: 'A flat grey baseplate with a spawn.', preview: 'linear-gradient(160deg,#87c5ff 0 55%,#5b5d69 55%)' },
  { id: 'obby', name: 'Sky Islands Obby', desc: '5 stages: lava, moving platforms, spinner, jump pad, truss tower — with checkpoints & timer.', preview: 'linear-gradient(160deg,#87c5ff 0 45%,#ff5a5f 45% 55%,#ffb400 55% 65%,#00c2a8 65% 75%,#5b5d69 75%)' },
  { id: 'empty', name: 'Empty', desc: 'Just the services. Build from scratch.', preview: 'linear-gradient(160deg,#1b1f2a,#2a3040)' },
];

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

  const create = async (template: PlaceTemplate) => {
    try {
      setError('');
      const project = await studioApi.createProject(name.trim() || `My ${template} place`, template);
      navigate(`/studio/${project.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className={styles.home}>
      <header className={styles.top}>
        <span className={styles.brand}><span className={styles.logo}>◆</span> Blox Studio</span>
        <a className={styles.docsLink} href="https://create.roblox.com/docs/cloud/open-cloud/usage-place-publishing" target="_blank" rel="noreferrer">How publishing works ↗</a>
      </header>
      <section className={styles.hero}>
        <h1>Build Roblox experiences in your browser.</h1>
        <p>Place parts, script in Luau, and publish straight to your Roblox experience — no install needed.</p>
        <input className={styles.nameInput} placeholder="Name your new place" value={name} onChange={(e) => setName(e.target.value)} />
      </section>
      <section>
        <h2 className={styles.sectionTitle}>New place</h2>
        <div className={styles.grid}>
          {TEMPLATES.map((t) => (
            <button type="button" key={t.id} className={styles.card} onClick={() => create(t.id)}>
              <div className={styles.preview} style={{ background: t.preview }} />
              <div className={styles.cardBody}><strong>{t.name}</strong><span>{t.desc}</span></div>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className={styles.sectionTitle}>My places</h2>
        {error && <p className={styles.error}>{error}</p>}
        {!projects && !error && <p className={styles.muted}>Loading…</p>}
        {projects?.length === 0 && <p className={styles.muted}>No places yet — pick a template above.</p>}
        <div className={styles.list}>
          {projects?.map((p) => (
            <div key={p.id} className={styles.row}>
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
          ))}
        </div>
      </section>
    </div>
  );
}
