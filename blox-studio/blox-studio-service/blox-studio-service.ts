import { toRbxlx, type PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { ProjectRepository, type Project } from './project-repository.js';
import { RobloxPublisher } from './roblox-publisher.js';

/**
 * Blox Studio service: project storage, .rbxlx export and Roblox publishing.
 */
export class BloxStudioService {
  constructor(
    readonly projects = new ProjectRepository(),
    readonly publisher = new RobloxPublisher()
  ) {}

  /** Connects storage. */
  async init() {
    await this.projects.connect();
  }

  /** Returns serialized .rbxlx for a project. */
  exportPlace(project: Project): string {
    return toRbxlx(project.instances);
  }

  /** Creates a project. */
  createProject(name: string, template?: PlaceTemplate, ownerHash = '') {
    return this.projects.create(name, template, ownerHash);
  }

  /**
   * Publishes a project to Roblox and records history.
   * @param id - project id
   * @param versionType - `Saved` or `Published`
   */
  async publish(id: string, versionType: 'Saved' | 'Published') {
    const project = await this.projects.get(id);
    if (!project) throw new Error('Project not found');
    if (!project.universeId || !project.placeId) {
      throw new Error('Set the Universe ID and Place ID in Game Settings before publishing.');
    }
    const result = await this.publisher.publish({
      universeId: project.universeId,
      placeId: project.placeId,
      versionType,
      rbxlx: this.exportPlace(project),
    });
    const record = { versionNumber: result.versionNumber, versionType, publishedAt: new Date().toISOString() };
    await this.projects.addPublish(id, record);
    return record;
  }

  /** Creates a new service instance. */
  static from() {
    return new BloxStudioService();
  }
}
