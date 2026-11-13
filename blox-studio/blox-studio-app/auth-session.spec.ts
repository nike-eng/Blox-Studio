import { decodeEmail, isExpiring, loadSession, onAuthChange, parseAuthHash, saveSession } from './auth-session.js';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const jwt = (payload: unknown) => `${b64url({ alg: 'none' })}.${b64url(payload)}.sig`;

describe('sign-in link', () => {
  it('reads the session from the address after the #', () => {
    const token = jwt({ email: 'me@example.com', sub: 'u-1' });
    const r = parseAuthHash(`#access_token=${token}&expires_at=2000000000&refresh_token=r-123&token_type=bearer&type=magiclink`, 1000);
    expect(r).toEqual({ session: { accessToken: token, refreshToken: 'r-123', expiresAt: 2000000000, email: 'me@example.com' } });
  });

  it('works out the expiry from expires_in when expires_at is missing', () => {
    const r = parseAuthHash('#access_token=a.b.c&refresh_token=r&expires_in=3600', 1000);
    expect(r!.session!.expiresAt).toBe(4600);
  });

  it('turns an expired link into a friendly message', () => {
    const r = parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(r!.error).toMatch(/expired or was already used/);
    expect(parseAuthHash('#error=server_error&error_description=boom')!.error).toMatch(/did not work/);
  });

  it('ignores addresses that have nothing to do with sign-in', () => {
    expect(parseAuthHash('')).toBe(null);
    expect(parseAuthHash('#section-2')).toBe(null);
    expect(parseAuthHash('#access_token=only-one')).toBe(null);
  });

  it('decodes the email from a token, and never throws on junk', () => {
    expect(decodeEmail(jwt({ email: 'x@y.z' }))).toBe('x@y.z');
    expect(decodeEmail('nonsense')).toBe('');
    expect(decodeEmail(jwt({ sub: 1 }))).toBe('');
  });

  it('renews a little before the session ends', () => {
    const s = { accessToken: 'a', refreshToken: 'r', expiresAt: 1000, email: '' };
    expect(isExpiring(s, 900)).toBe(false);
    expect(isExpiring(s, 915)).toBe(true);
  });

  it('keeps the session when storage is unavailable, and tells listeners', () => {
    let n = 0; const stop = onAuthChange(() => { n += 1; });
    expect(loadSession()).toBe(null);
    saveSession({ accessToken: 'a', refreshToken: 'r', expiresAt: 5, email: 'e' });
    expect(loadSession()!.refreshToken).toBe('r');
    saveSession(null);
    expect(loadSession()).toBe(null);
    expect(n).toBe(2);
    stop();
  });
});
