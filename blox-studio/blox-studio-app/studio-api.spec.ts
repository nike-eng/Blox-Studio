import { loadSession, saveSession } from './auth-session.js';
import { studioApi } from './studio-api.js';

type Call = { url: string; headers: Record<string, string> };
const now = () => Math.floor(Date.now() / 1000);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const good = (expiresAt = now() + 3600) => ({ accessToken: 'tok-1', refreshToken: 'ref-1', expiresAt, email: 'me@example.com' });

/** Replaces fetch with a fake server for one test. */
function fakeServer(handler: (url: string, call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  (globalThis as { fetch: unknown }).fetch = async (url: string, init: RequestInit = {}) => {
    const call = { url, headers: { ...((init.headers as Record<string, string>) || {}) } };
    calls.push(call);
    return handler(url, call);
  };
  return calls;
}

describe('studioApi sign-in', () => {
  it('sends only the browser key as a guest, and the token too when signed in', async () => {
    saveSession(null);
    const calls = fakeServer(() => json(200, []));
    await studioApi.listProjects();
    expect(calls[0].headers['x-owner-key'].length).toBeGreaterThan(31);
    expect(calls[0].headers.Authorization).toBeUndefined();
    saveSession(good());
    await studioApi.listProjects();
    expect(calls[1].headers.Authorization).toBe('Bearer tok-1');
    expect(calls[1].headers['x-owner-key']).toBe(calls[0].headers['x-owner-key']);
    saveSession(null);
  });

  it('renews a token that is about to run out before asking', async () => {
    saveSession(good(now() + 10));
    const calls = fakeServer((url) => (url.endsWith('/auth/refresh') ? json(200, { accessToken: 'tok-2', refreshToken: 'ref-2', expiresAt: now() + 3600 }) : json(200, [])));
    await studioApi.listProjects();
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['refresh', 'projects']);
    expect(calls[1].headers.Authorization).toBe('Bearer tok-2');
    expect(loadSession()!.refreshToken).toBe('ref-2');
    saveSession(null);
  });

  it('renews once and retries when the server says the token ran out', async () => {
    saveSession(good());
    let first = true;
    const calls = fakeServer((url, call) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'tok-2', refreshToken: 'ref-2', expiresAt: now() + 3600 });
      if (first) { first = false; return json(401, { message: 'Your sign-in has expired. Please sign in again.' }); }
      return json(200, [{ id: 'a', via: call.headers.Authorization }]);
    });
    const list = await studioApi.listProjects();
    expect(list).toEqual([{ id: 'a', via: 'Bearer tok-2' }]);
    expect(calls.length).toBe(3);
    saveSession(null);
  });

  it('signs out only when the server refuses the renewal, not when the connection is bad', async () => {
    saveSession(good(now() + 10));
    fakeServer((url) => (url.endsWith('/auth/refresh') ? json(503, { message: 'busy' }) : json(200, [])));
    await studioApi.listProjects();
    expect(loadSession()!.refreshToken).toBe('ref-1'); // still signed in

    (globalThis as { fetch: unknown }).fetch = async (url: string) => { if (url.endsWith('/auth/refresh')) throw new TypeError('offline'); return json(200, []); };
    await studioApi.listProjects();
    expect(loadSession()!.refreshToken).toBe('ref-1');

    const calls = fakeServer((url) => (url.endsWith('/auth/refresh') ? json(401, { message: 'expired' }) : json(200, [])));
    await studioApi.listProjects();
    expect(loadSession()).toBe(null); // refused for real: signed out, continues as a guest
    expect(calls[calls.length - 1].headers.Authorization).toBeUndefined();
  });

  it('does not retry forever on a plain 401', async () => {
    saveSession(good());
    const calls = fakeServer((url) => (url.endsWith('/auth/refresh') ? json(200, { accessToken: 'tok-2', refreshToken: 'ref-2', expiresAt: now() + 3600 }) : json(401, { message: 'Your sign-in has expired. Please sign in again.' })));
    let message = '';
    try { await studioApi.listProjects(); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/sign in again/);
    expect(calls.length).toBe(3);
    saveSession(null);
  });
});
