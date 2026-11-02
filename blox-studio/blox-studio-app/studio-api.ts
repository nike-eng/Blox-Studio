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
 * Base URL of the Blox Studio service behind the platform gateway.
 * @returns base url
 */
export function serviceUrl(): string {
  const base = (typeof process !== 'undefined' && process.env?.BACKEND_URL) || '';
  return `${base}/blox-studio-service`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${serviceUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json as T;
}

/**
 * Client for the Blox Studio service REST API.
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
  /** URL to download the .rbxlx file. */
  exportUrl: (id: string) => `${serviceUrl()}/projects/${id}/export`,
};
