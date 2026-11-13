/**
 * Who is signed in on this device. The sign-in email link opens the editor with the session in the address
 * (after the #), we keep it in the browser, and send it to the VoxMesa server with every request.
 */
export type Session = { accessToken: string; refreshToken: string; /** Unix seconds. */ expiresAt: number; email: string };

const STORE = 'voxmesa-session';
let memory: Session | null = null;
const listeners = new Set<() => void>();

/**
 * Reads the email address out of a sign-in token (for display only; the server does the real checking).
 * @param jwt - access token
 * @returns email, or '' when it cannot be read
 */
export function decodeEmail(jwt: string): string {
  try {
    const part = jwt.split('.')[1] || '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const email = (JSON.parse(json) as { email?: unknown }).email;
    return typeof email === 'string' ? email : '';
  } catch { return ''; }
}

/** What the address bar said after the person tapped the email link. */
export type HashResult = { session?: Session; error?: string };

/**
 * Reads a sign-in result from the part of the address after the #.
 * @param hash - location.hash
 * @param nowSec - current time in seconds (for tests)
 * @returns the session or an error message, or null when the address has nothing to do with sign-in
 */
export function parseAuthHash(hash: string, nowSec = Math.floor(Date.now() / 1000)): HashResult | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const err = p.get('error_description') || p.get('error');
  if (err) {
    return { error: /expired|invalid|otp/i.test(`${err} ${p.get('error_code') || ''}`) ? 'That sign-in link has expired or was already used. Ask for a new one.' : 'Sign-in did not work. Ask for a new link.' };
  }
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  const expiresAt = Number(p.get('expires_at')) || nowSec + (Number(p.get('expires_in')) || 3600);
  return { session: { accessToken, refreshToken, expiresAt, email: decodeEmail(accessToken) } };
}

/**
 * Whether a session is about to stop working.
 * @param s - the session
 * @param nowSec - current time in seconds
 * @param marginSec - how early to renew
 * @returns true when it should be renewed now
 */
export const isExpiring = (s: Session, nowSec = Math.floor(Date.now() / 1000), marginSec = 90): boolean => s.expiresAt - marginSec <= nowSec;

/**
 * The saved session, if any.
 * @returns session or null
 */
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Session>;
      if (typeof s.accessToken === 'string' && typeof s.refreshToken === 'string' && typeof s.expiresAt === 'number') return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt, email: s.email || '' };
    }
  } catch { /* storage unavailable or damaged */ }
  return memory;
}

/**
 * Saves (or clears, with null) the session and tells the screen.
 * @param s - session or null to sign out
 */
export function saveSession(s: Session | null): void {
  memory = s;
  try { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn());
}

/**
 * Calls `fn` whenever someone signs in or out.
 * @param fn - listener
 * @returns function that stops listening
 */
export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Looks at the address bar for a sign-in result, saves it, and cleans the address.
 * Call once when the page opens.
 * @returns what happened, or null when this was not a sign-in visit
 */
export function captureSignInFromUrl(): HashResult | null {
  if (typeof location === 'undefined') return null;
  const r = parseAuthHash(location.hash);
  if (!r) return null;
  if (r.session) saveSession(r.session);
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
  return r;
}
