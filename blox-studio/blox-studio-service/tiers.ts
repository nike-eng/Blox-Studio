/** The three plans. Everyone starts on Free. */
export type Tier = 'free' | 'pro' | 'expert';

const MB = 1024 * 1024;

/** What each plan allows. `null` means no limit. Change the numbers here. */
export const LIMITS: Record<Tier, { projects: number | null; uploadBytes: number }> = {
  free: { projects: 5, uploadBytes: 70 * MB },
  pro: { projects: 25, uploadBytes: 250 * MB },
  expert: { projects: null, uploadBytes: 500 * MB },
};

const NAMES: Record<Tier, string> = { free: 'Free', pro: 'Pro', expert: 'Expert' };

const list = (v: string | undefined) => (v || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Which plan a person is on. For now it is set by hand: put emails in the Render settings
 * EXPERT_EMAILS or PRO_EMAILS (comma separated). Anyone else, and guests, are on Free.
 * @param email - signed-in email, if any
 * @param env - environment variables
 * @returns the plan
 */
export function tierFor(email: string | undefined, env: Record<string, string | undefined> = process.env): Tier {
  const e = (email || '').trim().toLowerCase();
  if (!e) return 'free';
  if (list(env.EXPERT_EMAILS).includes(e)) return 'expert';
  if (list(env.PRO_EMAILS).includes(e)) return 'pro';
  return 'free';
}

/**
 * Whether one more place may be made.
 * @param tier - the plan
 * @param count - places already owned
 * @returns null when allowed, otherwise a sentence to show the person
 */
export function checkCreate(tier: Tier, count: number): string | null {
  const max = LIMITS[tier].projects;
  if (max === null || count < max) return null;
  return `${NAMES[tier]} allows ${max} places and you have ${count}. Delete or clean up places you do not need, or upgrade.`;
}

/**
 * Whether a file of this size still fits the upload space.
 * @param tier - the plan
 * @param used - bytes already uploaded
 * @param adding - size of the new file
 * @returns null when allowed, otherwise a sentence to show the person
 */
export function checkUpload(tier: Tier, used: number, adding: number): string | null {
  const max = LIMITS[tier].uploadBytes;
  if (used + adding <= max) return null;
  return `${NAMES[tier]} includes ${Math.round(max / MB)} MB of uploads and you have used ${Math.round(used / MB)} MB. Delete files you do not need, or upgrade.`;
}
