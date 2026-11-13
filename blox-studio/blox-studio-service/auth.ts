import { createHash } from 'node:crypto';

/** A signed-in person, as Supabase reports them. */
export type AuthUser = { id: string; email: string };

/** Checks a Supabase access token and returns who it belongs to, or null when it is invalid or expired. */
export type TokenVerifier = (token: string) => Promise<AuthUser | null>;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * The key a signed-in person's projects are stored under. It is derived from their Supabase user id,
 * so it is the same on every device. (Guests keep using the hash of their browser key.)
 * @param userId - Supabase user id
 * @returns owner hash
 */
export const userOwnerHash = (userId: string): string => sha(`user:${userId}`);

/**
 * Owner hash for a guest's private browser key.
 * @param key - the browser key
 * @returns owner hash
 */
export const guestOwnerHash = (key: string): string => sha(key);

/**
 * Remembers verified tokens for a short time so every request does not have to ask Supabase.
 * Failed checks are remembered for a much shorter time.
 * @param inner - the real verifier
 * @param ttlMs - how long a good answer is reused
 * @param now - clock (for tests)
 * @returns a caching verifier
 */
export function cachedVerifier(inner: TokenVerifier, ttlMs = 60_000, now: () => number = Date.now): TokenVerifier {
  const seen = new Map<string, { user: AuthUser | null; until: number }>();
  return async (token) => {
    const t = now();
    const hit = seen.get(token);
    if (hit && hit.until > t) return hit.user;
    const user = await inner(token);
    if (seen.size > 500) { for (const [k, v] of seen) if (v.until <= t) seen.delete(k); if (seen.size > 500) seen.clear(); }
    seen.set(token, { user, until: t + (user ? ttlMs : 5_000) });
    return user;
  };
}

/** Who is calling, worked out from the request headers. */
export type Caller =
  | { ok: true; ownerHash: string; user?: AuthUser }
  | { ok: false; status: number; message: string };

/**
 * Works out who is making a request: a signed-in person (Authorization: Bearer <token>) or a guest (x-owner-key).
 * A request that carries a token that no longer works is refused instead of silently turning into a guest,
 * so signed-in people never see an empty guest list by accident.
 * @param headers - authorization header and owner key (header or query)
 * @param verify - token verifier
 * @returns the caller, or why they were refused
 */
export async function resolveCaller(headers: { authorization?: string; ownerKey?: string }, verify: TokenVerifier): Promise<Caller> {
  const m = /^Bearer\s+(\S+)$/i.exec(headers.authorization || '');
  if (m) {
    const user = await verify(m[1]);
    if (!user) return { ok: false, status: 401, message: 'Your sign-in has expired. Please sign in again.' };
    return { ok: true, ownerHash: userOwnerHash(user.id), user };
  }
  const key = headers.ownerKey || '';
  if (key.length < 32) return { ok: false, status: 401, message: 'Open VoxMesa in the browser to use your projects.' };
  return { ok: true, ownerHash: guestOwnerHash(key) };
}

/**
 * Checks that a sign-in email link will send people back to one of our own sites.
 * @param redirectTo - the address the link should open
 * @param requestOrigin - the Origin header of the request
 * @param allowed - allowed site origins (CORS_ORIGIN)
 * @returns true when it is safe to use
 */
export function safeRedirect(redirectTo: unknown, requestOrigin: string | undefined, allowed: string[]): redirectTo is string {
  if (typeof redirectTo !== 'string' || !requestOrigin || !allowed.includes(requestOrigin)) return false;
  try {
    const u = new URL(redirectTo);
    return u.origin === requestOrigin && (u.protocol === 'https:' || u.hostname === 'localhost');
  } catch { return false; }
}

/** Loose email check (Supabase does the real one). */
export const looksLikeEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * Tiny in-memory limiter: at most `max` hits per `windowMs` for each key.
 * @param max - hits allowed
 * @param windowMs - window length
 * @param now - clock (for tests)
 * @returns function that returns true while the key is still allowed
 */
export function makeLimiter(max: number, windowMs: number, now: () => number = Date.now): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key) => {
    const t = now();
    const recent = (hits.get(key) || []).filter((x) => x > t - windowMs);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(t); hits.set(key, recent);
    if (hits.size > 2000) hits.clear();
    return true;
  };
}

/**
 * Turns a Supabase sign-in error into a sentence a person can act on.
 * @param message - Supabase's error text
 * @returns plain-language message
 */
export function friendlyAuthError(message: string): string {
  if (/not authorized/i.test(message)) return 'This email cannot get sign-in links yet. The VoxMesa owner still has to finish the email setup.';
  if (/rate limit|too many|seconds/i.test(message)) return 'Too many emails were sent. Wait a few minutes and try again.';
  if (/invalid.*email|email.*invalid/i.test(message)) return 'That email address does not look right.';
  return 'Could not send the sign-in email. Try again in a minute.';
}
