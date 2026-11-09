import type { PlaceInstance, PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // The free server sleeps when nobody uses it and can take about a minute to wake up.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 75000);
  let res: Response;
  try {
    res = await fetch(`${serviceUrl()}${path}`, {
      ...init,
      signal: abort.signal,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-owner-key': ownerKey(), ...(init.headers || {}) },
    });
  } catch {
    throw new ApiError(abort.signal.aborted ? 'The server took too long to answer.' : 'Could not reach the VoxMesa server. Check your internet connection.', 0);
  } finally {
    clearTimeout(timer);
  }
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
  /** URL to download the .rbxlx file. */
  exportUrl: (id: string) => `${serviceUrl()}/projects/${id}/export?key=${ownerKey()}`,
};
