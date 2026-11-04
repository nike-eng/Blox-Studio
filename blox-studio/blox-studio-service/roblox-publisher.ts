/**
 * Options for publishing a place to Roblox.
 */
export type PublishOptions = {
  /** Roblox universe (experience) id. */
  universeId: string;
  /** Roblox place id inside the universe. */
  placeId: string;
  /** `Saved` keeps it as a draft version, `Published` makes it live. */
  versionType: 'Saved' | 'Published';
  /** Serialized .rbxlx place file. */
  rbxlx: string;
};

/**
 * Result of a successful publish.
 */
export type PublishResult = { versionNumber: number };

/**
 * Turns a Roblox error code into plain words. The raw Roblox reply is never shown (it can contain details we should not leak).
 * @param status - HTTP status from Roblox
 */
export function friendlyPublishError(status: number): string {
  switch (status) {
    case 400: return 'Roblox could not read this place file. Try Export and open it in Roblox Studio to see what is wrong.';
    case 401: return 'The server\'s Roblox key is missing or wrong. The owner needs to create a new Open Cloud key and set it as ROBLOX_API_KEY.';
    case 403: return 'Roblox said no. The Open Cloud key needs the "universe-places:write" permission for this exact game, and its IP list must allow the server.';
    case 404: return 'Roblox could not find that game or place. Check the Universe ID and Place ID in Game settings.';
    case 409: return 'Roblox is busy with another change to this place. Wait a moment and try again.';
    case 429: return 'Roblox says you are publishing too fast. Wait a minute and try again.';
    default: return status >= 500 ? 'Roblox is having problems right now. Try again in a few minutes.' : `Roblox did not accept the publish (error ${status}).`;
  }
}

/**
 * Publishes places to Roblox using the official Open Cloud Place Publishing API.
 * Requires an Open Cloud API key with `universe-places:write` permission for the universe.
 * @see https://create.roblox.com/docs/cloud/open-cloud/usage-place-publishing
 */
export class RobloxPublisher {
  constructor(private apiKey = process.env.ROBLOX_API_KEY) {}

  /** Whether an API key is configured. */
  get configured(): boolean {
    return !!(process.env.ROBLOX_API_KEY || this.apiKey);
  }

  /**
   * Uploads the place file as a new place version.
   * @param options - publish options
   * @returns the new version number
   */
  async publish(options: PublishOptions): Promise<PublishResult> {
    const key = process.env.ROBLOX_API_KEY || this.apiKey;
    if (!key) throw new Error('ROBLOX_API_KEY is not configured on the server.');
    if (!/^\d+$/.test(options.universeId) || !/^\d+$/.test(options.placeId)) {
      throw new Error('Universe ID and Place ID must be numeric.');
    }
    const url = `https://apis.roblox.com/universes/v1/${options.universeId}/places/${options.placeId}/versions?versionType=${options.versionType}`;
    if (options.rbxlx.length > 90 * 1024 * 1024) throw new Error('This place is too big to publish (over 90 MB). Remove some parts and try again.');
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'x-api-key': key, 'Content-Type': 'application/xml' },
        body: options.rbxlx,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new Error('Could not reach Roblox (it took too long or the connection failed). Wait a minute and try again.');
    }
    const text = await res.text();
    if (!res.ok) throw new Error(friendlyPublishError(res.status));
    let versionNumber: number;
    try { versionNumber = JSON.parse(text).versionNumber; } catch { versionNumber = NaN; }
    if (typeof versionNumber !== 'number' || Number.isNaN(versionNumber)) throw new Error('Roblox accepted the file but did not say which version it made. Check your game on the Roblox website.');
    return { versionNumber };
  }
}
