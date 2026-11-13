import { cachedVerifier, friendlyAuthError, guestOwnerHash, looksLikeEmail, makeLimiter, resolveCaller, safeRedirect, userOwnerHash, type AuthUser } from './auth.js';

const KEY = 'k'.repeat(40);
const me: AuthUser = { id: 'u-1', email: 'me@example.com' };
const verify = async (t: string) => (t === 'good' ? me : null);

describe('resolveCaller', () => {
  it('treats a valid token as the signed-in person, on every device', async () => {
    const a = await resolveCaller({ authorization: 'Bearer good', ownerKey: 'a'.repeat(40) }, verify);
    const b = await resolveCaller({ authorization: 'bearer good', ownerKey: 'b'.repeat(40) }, verify);
    expect(a).toEqual({ ok: true, ownerHash: userOwnerHash('u-1'), user: me });
    expect(b.ok && a.ok && a.ownerHash === b.ownerHash).toBeTruthy();
    expect(userOwnerHash('u-1')).not.toBe(guestOwnerHash('u-1'));
  });

  it('refuses a token that stopped working instead of falling back to guest', async () => {
    const r = await resolveCaller({ authorization: 'Bearer old', ownerKey: KEY }, verify);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(401); expect(r.message).toMatch(/sign in again/); }
  });

  it('keeps guests working with their browser key', async () => {
    const r = await resolveCaller({ ownerKey: KEY }, verify);
    expect(r).toEqual({ ok: true, ownerHash: guestOwnerHash(KEY) });
    const none = await resolveCaller({ ownerKey: 'short' }, verify);
    expect(none.ok).toBe(false);
  });
});

describe('cachedVerifier', () => {
  it('asks Supabase once per minute per token, and re-checks bad tokens soon', async () => {
    let calls = 0; let t = 0;
    const v = cachedVerifier(async (tok) => { calls += 1; return tok === 'good' ? me : null; }, 60_000, () => t);
    await v('good'); await v('good'); expect(calls).toBe(1);
    t = 61_000; await v('good'); expect(calls).toBe(2);
    await v('bad'); await v('bad'); expect(calls).toBe(3);
    t = 67_000; await v('bad'); expect(calls).toBe(4);
  });
});

describe('sign-in helpers', () => {
  it('only sends links back to our own site', () => {
    const allowed = ['https://blox-studio.example.workers.dev'];
    const origin = 'https://blox-studio.example.workers.dev';
    expect(safeRedirect(`${origin}/projects`, origin, allowed)).toBe(true);
    expect(safeRedirect('https://evil.example/projects', origin, allowed)).toBe(false);
    expect(safeRedirect(`${origin}/projects`, 'https://evil.example', allowed)).toBe(false);
    expect(safeRedirect(`${origin}/projects`, undefined, allowed)).toBe(false);
    expect(safeRedirect('javascript:alert(1)', origin, allowed)).toBe(false);
    expect(safeRedirect(undefined, origin, allowed)).toBe(false);
    expect(safeRedirect('http://localhost:5173/projects', 'http://localhost:5173', ['http://localhost:5173'])).toBe(true);
    expect(safeRedirect('http://example.com/projects', 'http://example.com', ['http://example.com'])).toBe(false);
  });

  it('checks email shape', () => {
    expect(looksLikeEmail('me@example.com')).toBe(true);
    expect(looksLikeEmail('nope')).toBe(false);
    expect(looksLikeEmail('a b@c.d')).toBe(false);
    expect(looksLikeEmail(42)).toBe(false);
  });

  it('limits how often one key can ask for an email', () => {
    let t = 0; const ok = makeLimiter(3, 10_000, () => t);
    expect([ok('a'), ok('a'), ok('a'), ok('a')]).toEqual([true, true, true, false]);
    expect(ok('b')).toBe(true);
    t = 10_001; expect(ok('a')).toBe(true);
  });

  it('explains sign-in errors in plain words', () => {
    expect(friendlyAuthError('Email address "x@y.z" is not authorized')).toMatch(/cannot get sign-in links/);
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/Too many/);
    expect(friendlyAuthError('Unable to validate email address: invalid format')).toMatch(/does not look right/);
    expect(friendlyAuthError('boom')).toMatch(/Could not send/);
  });
});
