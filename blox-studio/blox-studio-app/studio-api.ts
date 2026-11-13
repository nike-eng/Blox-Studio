import type { PlaceInstance, PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { decodeEmail, isExpiring, loadSession, saveSession, type Session } from './auth-session.js';

/**
 * Publish history entry.
 */
export type PublishRecord = { versionNumber: number; versionType: string; publishedAt: string };

/**
 * Project summary as returned by the project list.
 */
export type ProjectSummary = {
  id: string;
  name: string;
  universeId?: string;
  placeId?: string;
  publishHistory: PublishRecord[];
  updatedAt: string;
  createdAt: string;
};

/**
 * Full project including the place instances.
 */
export type Project = ProjectSummary & { instances: PlaceInstance[] };

/**
 * Base URL of the VoxMesa service behind the platform gateway.
 * @returns base url
 */
export function serviceUrl(): string {
  // Standalone hosting (Cloudflare etc.): the build sets VITE_SERVICE_URL to the server's address.
  const direct = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SERVICE_URL;
  if (direct) return direct.replace(/\/+$/, '');
  const base = (typeof process !== 'undefined' && process.env?.BACKEND_URL) || '';
  return `${base}/blox-studio-service`;
}

/**
 * Full public address of an AI link for a token.
 * @param token - the one-time token returned when the link was made
 * @returns the link to paste into an AI app
 */
export function aiLinkUrl(token: string): string {
  const base = serviceUrl();
  const origin = /^https?:/.test(base) ? '' : (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}${base}/mcp/${token}`;
}

let memoryToken = '';

/**
 * Private key that proves which projects belong to this browser. Created once and kept in localStorage.
 * @returns the owner key
 */
export function ownerKey(): string {
  try {
    const saved = localStorage.getItem('blox-studio-owner');
    if (saved && saved.length >= 32) return saved;
  } catch { /* storage unavailable */ }
  if (memoryToken) return memoryToken;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  memoryToken = key;
  try { localStorage.setItem('blox-studio-owner', key); } catch { /* storage unavailable */ }
  return key;
}

/**
 * An error from the server. `status` is 0 when the server could not be reached at all.
 */
export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = 'ApiError'; }
  /** True for problems that usually go away on their own (server waking up, bad connection). */
  get temporary(): boolean { return this.status === 0 || this.status >= 500 || this.status === 429; }
}

type Renewal = { session: Session } | { signedOut: true } | { later: true };
let renewing: Promise<Renewal> | null = null;

/** Gets a fresh sign-in token from the server (one at a time). Only a refusal from the server signs the person out; a bad connection never does. */
function renew(): Promise<Renewal> {
  if (!renewing) renewing = doRenew().finally(() => { renewing = null; });
  return renewing;
}

async function doRenew(): Promise<Renewal> {
  const s = loadSession();
  if (!s) return { signedOut: true };
  try {
    const res = await fetch(`${serviceUrl()}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
    if (res.status === 400 || res.status === 401) { saveSession(null); return { signedOut: true }; }
    if (!res.ok) return { later: true };
    const j = (await res.json()) as { accessToken: string; refreshToken: string; expiresAt: number };
    const next: Session = { accessToken: j.accessToken, refreshToken: j.refreshToken, expiresAt: j.expiresAt, email: decodeEmail(j.accessToken) || s.email };
    saveSession(next);
    return { session: next };
  } catch { return { later: true }; }
}

/** Headers that say who is asking: the sign-in token when signed in, always the browser key (used to move guest projects into an account). */
async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'x-owner-key': ownerKey() };
  let s = loadSession();
  if (s && isExpiring(s)) {
    const r = await renew();
    if ('session' in r) s = r.session; else if ('signedOut' in r) s = null;
  }
  if (s) h.Authorization = `Bearer ${s.accessToken}`;
  return h;
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  // The free server sleeps when nobody uses it and can take about a minute to wake up.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 75000);
  let res: Response;
  try {
    res = await fetch(`${serviceUrl()}${path}`, {
      ...init,
      signal: abort.signal,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init.headers || {}) },
    });
  } catch {
    throw new ApiError(abort.signal.aborted ? 'The server took too long to answer.' : 'Could not reach the VoxMesa server. Check your internet connection.', 0);
  } finally {
    clearTimeout(timer);
  }
  // A token can run out between "is it still good?" and "the server got it": renew once and try again.
  if (res.status === 401 && !retried && loadSession() && 'session' in (await renew())) return request<T>(path, init, true);
  const text = await res.text().catch(() => '');
  let json: { message?: string } = {};
  try { json = text ? JSON.parse(text) : {}; } catch {
    // Not JSON: the page itself (no server connected) or a "waking up" page from the host.
    throw new ApiError('The VoxMesa server is not answering yet. It may be waking up, so try again in a minute.', res.status >= 500 ? res.status : 503);
  }
  if (!res.ok) throw new ApiError(json.message || `Request failed (${res.status})`, res.status);
  return json as T;
}

/**
 * Client for the VoxMesa service REST API.
 */
export const studioApi = {
  /** Uploads an image or binary file to Supabase Storage and returns its public URL. */
  async uploadFile(file: File | Blob, filename = 'upload.bin'): Promise<string> {
    const form = new FormData();
    form.append('file', file, filename);

    const res = await fetch(`${serviceUrl()}/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: await authHeaders(),
      body: form,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(data.message || `Upload failed (${res.status})`, res.status);
    }
    return data.url;
  },
  /** Lists projects. */
  listProjects: () => request<ProjectSummary[]>('/projects'),
  /** Gets a project. */
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  /** Creates a project from a template. */
  createProject: (name: string, template: PlaceTemplate) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name, template }) }),
  /** Saves fields on a project. */
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'instances' | 'universeId' | 'placeId'>>) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
  /** Deletes a project. */
  deleteProject: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
  /** Publishes a project to Roblox. */
  publish: (id: string, versionType: 'Saved' | 'Published') =>
    request<PublishRecord>(`/projects/${id}/publish`, { method: 'POST', body: JSON.stringify({ versionType }) }),
  /** Whether the Roblox API key is configured on the server. */
  robloxStatus: () => request<{ configured: boolean }>('/roblox/status'),
  /** Plain-language checklist of what is ready for publishing. */
  publishCheck: (id: string) => request<{ ready: boolean; items: { ok: boolean; text: string }[] }>(`/projects/${id}/publish-check`),
  /** Whether an AI link is switched on. */
  aiLinkStatus: () => request<{ active: boolean }>('/mcp-link'),
  /** Makes a new private AI link (the old one stops working). The token is shown once. */
  createAiLink: () => request<{ token: string }>('/mcp-link', { method: 'POST' }),
  /** Turns the AI link off. */
  revokeAiLink: () => request<{ ok: boolean }>('/mcp-link', { method: 'DELETE' }),
  /** Downloads the .rbxlx file (sent with the sign-in token, so it works for accounts too). */
  async downloadExport(id: string, fallbackName = 'place.rbxlx'): Promise<void> {
    const res = await fetch(`${serviceUrl()}/projects/${id}/export`, { credentials: 'include', headers: await authHeaders() });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(j.message || `Export failed (${res.status})`, res.status);
    }
    const name = /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
  /** Who is signed in on this device (email), or not. */
  account: () => request<{ signedIn: boolean; email: string }>('/account'),
  /** Sends a sign-in link to an email address. The link opens the editor back on this site. */
  startSignIn: (email: string) =>
    request<{ ok: boolean }>('/auth/email', { method: 'POST', body: JSON.stringify({ email, redirectTo: `${window.location.origin}/projects` }) }),
  /** How many projects were made on this browser before signing in. */
  guestProjects: () => request<{ count: number }>('/account/guest'),
  /** Moves this browser's projects into the signed-in account. */
  claimGuestProjects: () => request<{ moved: number }>('/account/claim', { method: 'POST' }),
  /** Signs out on this device only. Projects stay in the account. */
  signOut: () => saveSession(null),
};
