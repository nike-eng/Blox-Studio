import mongoose, { Schema } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { createPlaceTemplate, type PlaceInstance, type PlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';

/**
 * Publish history entry for a project.
 */
export type PublishRecord = {
  /** Roblox place version number returned by Open Cloud. */
  versionNumber: number;
  /** `Saved` or `Published`. */
  versionType: string;
  /** ISO timestamp. */
  publishedAt: string;
};

/**
 * A Blox Studio project (one Roblox place).
 */
export type Project = {
  id: string;
  name: string;
  instances: PlaceInstance[];
  universeId?: string;
  placeId?: string;
  publishHistory: PublishRecord[];
  updatedAt: string;
  createdAt: string;
};

const ProjectSchema = new Schema(
  {
    name: { type: String, required: true },
    instances: { type: [Schema.Types.Mixed], default: [] },
    universeId: String,
    placeId: String,
    ownerHash: String,
    publishHistory: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, minimize: false }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ProjectModel: mongoose.Model<any> = mongoose.models.Project || mongoose.model('Project', ProjectSchema);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProject(doc: any): Project {
  return {
    id: String(doc._id),
    name: doc.name,
    instances: doc.instances || [],
    universeId: doc.universeId || '',
    placeId: doc.placeId || '',
    publishHistory: doc.publishHistory || [],
    updatedAt: new Date(doc.updatedAt).toISOString(),
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

const McpLinkSchema = new Schema({ tokenHash: { type: String, index: true, unique: true }, ownerHash: { type: String, index: true } }, { timestamps: true });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const McpLinkModel: mongoose.Model<any> = mongoose.models.McpLink || mongoose.model('McpLink', McpLinkSchema);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Data access for Blox Studio projects, backed by MongoDB.
 */
export class ProjectRepository {
  /**
   * Connects to the built-in MongoDB and seeds a sample project when empty.
   */
  async connect(): Promise<void> {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URL as string);
    }
    const count = await ProjectModel.countDocuments();
    if (count === 0) {
      await this.create('My First Obby', 'obby');
    }
  }

  /** Lists the owner's projects, most recently edited first (without instances). Projects made before owners existed are claimed by the first caller. */
  async list(ownerHash: string): Promise<Omit<Project, 'instances'>[]> {
    await ProjectModel.updateMany({ ownerHash: { $exists: false } }, { $set: { ownerHash } });
    const docs = await ProjectModel.find({ ownerHash }, { instances: 0 }).sort({ updatedAt: -1 }).lean();
    return docs.map((d) => {
      const { instances, ...rest } = toProject(d);
      return rest;
    });
  }

  /** Gets a single project by id. */
  async get(id: string): Promise<Project | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await ProjectModel.findById(id).lean();
    return doc ? toProject(doc) : null;
  }

  /** Whether the project exists and belongs to this owner. */
  async isOwner(id: string, ownerHash: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) return false;
    const doc = await ProjectModel.findById(id, { ownerHash: 1 }).lean();
    return !!doc && doc.ownerHash === ownerHash;
  }

  /** Creates a new project from a template. */
  async create(name: string, template: PlaceTemplate = 'baseplate', ownerHash = ''): Promise<Project> {
    const doc = await ProjectModel.create({ name, instances: createPlaceTemplate(template), ...(ownerHash ? { ownerHash } : {}) });
    return toProject(doc.toObject());
  }

  /** Updates editable fields of a project. */
  async update(id: string, patch: Partial<Pick<Project, 'name' | 'instances' | 'universeId' | 'placeId'>>): Promise<Project | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await ProjectModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    return doc ? toProject(doc) : null;
  }

  /** Appends a publish record. */
  async addPublish(id: string, record: PublishRecord): Promise<void> {
    await ProjectModel.findByIdAndUpdate(id, { $push: { publishHistory: { $each: [record], $position: 0 } } });
  }

  /** Makes a new private AI link token for this owner (replacing any old one). The raw token is returned once and only its hash is stored. */
  async createMcpLink(ownerHash: string): Promise<string> {
    await McpLinkModel.deleteMany({ ownerHash });
    const token = randomBytes(32).toString('hex');
    await McpLinkModel.create({ tokenHash: sha(token), ownerHash });
    return token;
  }

  /** Turns the owner's AI link off. */
  async revokeMcpLink(ownerHash: string): Promise<void> {
    await McpLinkModel.deleteMany({ ownerHash });
  }

  /** Whether the owner has an active AI link. */
  async hasMcpLink(ownerHash: string): Promise<boolean> {
    return (await McpLinkModel.countDocuments({ ownerHash })) > 0;
  }

  /** Finds the owner a token belongs to. */
  async ownerForMcpToken(token: string): Promise<string | null> {
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const doc = await McpLinkModel.findOne({ tokenHash: sha(token) }).lean();
    return doc ? String(doc.ownerHash) : null;
  }

  /** Deletes a project. */
  async remove(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) return false;
    const res = await ProjectModel.findByIdAndDelete(id);
    return !!res;
  }
}
