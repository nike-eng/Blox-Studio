import { useEffect, useState, type FormEvent } from 'react';
import { captureSignInFromUrl, loadSession, onAuthChange } from './auth-session.js';
import { studioApi } from './studio-api.js';
import styles from './home.module.css';

/**
 * Sign-in card for the projects page: email link sign-in, the signed-in state, and the offer to move
 * places made before signing in into the account.
 * @param props.onChange - called when who is signed in changes (so the list of places can reload)
 */
export function AccountCard({ onChange }: { onChange: () => void }) {
  const [session, setSession] = useState(() => loadSession());
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [guestCount, setGuestCount] = useState(0);

  // The email link brings the person back here with the sign-in in the address bar.
  useEffect(() => {
    const r = captureSignInFromUrl();
    if (r?.error) setError(r.error);
    setSession(loadSession());
    return onAuthChange(() => { setSession(loadSession()); onChange(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offer to move places made on this browser before signing in.
  const signedIn = !!session;
  useEffect(() => {
    if (!signedIn) { setGuestCount(0); return; }
    let alive = true;
    studioApi.guestProjects().then((g) => { if (alive) setGuestCount(g.count); }).catch(() => { /* the offer is optional */ });
    return () => { alive = false; };
  }, [signedIn]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    setState('sending');
    try {
      await studioApi.startSignIn(email.trim());
      setState('sent');
    } catch (err) {
      setState('idle');
      setError((err as Error).message);
    }
  };

  const move = async () => {
    setError('');
    try {
      const { moved } = await studioApi.claimGuestProjects();
      setGuestCount(0);
      setMessage(moved ? `Moved ${moved} ${moved === 1 ? 'place' : 'places'} into your account.` : 'Nothing to move.');
      onChange();
    } catch (err) { setError((err as Error).message); }
  };

  if (session) {
    return (
      <section className={styles.account} aria-label="Account">
        <div className={styles.accountRow}>
          <span>Signed in as <strong>{session.email || 'your account'}</strong></span>
          <button type="button" className={styles.accountBtnGhost} onClick={() => studioApi.signOut()}>Sign out</button>
        </div>
        {guestCount > 0 && (
          <div className={styles.accountNote}>
            <span>You have {guestCount} {guestCount === 1 ? 'place' : 'places'} made on this browser before signing in. Move {guestCount === 1 ? 'it' : 'them'} into your account?</span>
            <span className={styles.accountActions}>
              <button type="button" className={styles.accountBtn} onClick={move}>Move {guestCount === 1 ? 'it' : 'them'}</button>
              <button type="button" className={styles.accountBtnGhost} onClick={() => setGuestCount(0)}>Not now</button>
            </span>
          </div>
        )}
        {message && <p className={styles.accountOk} role="status">{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </section>
    );
  }

  return (
    <section className={styles.account} aria-label="Sign in">
      <strong>Keep your places on every device</strong>
      {state === 'sent' ? (
        <p className={styles.accountOk} role="status">
          Check your email for a sign-in link and tap it. It can take a minute.{' '}
          <button type="button" className={styles.accountLink} onClick={() => setState('idle')}>Use another email</button>
        </p>
      ) : (
        <form className={styles.accountForm} onSubmit={send}>
          <input
            className={styles.nameInput}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
            required
          />
          <button type="submit" className={styles.accountBtn} disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a link'}</button>
        </form>
      )}
      <span className={styles.muted}>No password. You can keep using VoxMesa without signing in; places then stay on this browser only.</span>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
