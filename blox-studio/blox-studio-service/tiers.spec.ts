import { checkCreate, checkUpload, LIMITS, tierFor } from './tiers.js';

describe('tiers', () => {
  it('starts everyone on Free and sets Pro/Expert from the settings, ignoring case and spaces', () => {
    const env = { EXPERT_EMAILS: ' Me@Example.com , other@x.io', PRO_EMAILS: 'friend@x.io' };
    expect(tierFor('me@example.com', env)).toBe('expert');
    expect(tierFor('FRIEND@x.io', env)).toBe('pro');
    expect(tierFor('stranger@x.io', env)).toBe('free');
    expect(tierFor(undefined, env)).toBe('free');
    expect(tierFor('me@example.com', {})).toBe('free');
  });

  it('blocks making a place at the limit, never before, and never for Expert', () => {
    expect(checkCreate('free', 4)).toBe(null);
    expect(checkCreate('free', 5)).toMatch(/Free allows 5 places and you have 5/);
    expect(checkCreate('free', 73)).toMatch(/you have 73/);
    expect(checkCreate('pro', 24)).toBe(null);
    expect(checkCreate('pro', 25)).toMatch(/Pro allows 25/);
    expect(checkCreate('expert', 100000)).toBe(null);
    expect(LIMITS.expert.projects).toBe(null);
  });

  it('blocks uploads that would pass the space, allows exact fit', () => {
    const mb = 1024 * 1024;
    expect(checkUpload('free', 65 * mb, 5 * mb)).toBe(null);
    expect(checkUpload('free', 66 * mb, 5 * mb)).toMatch(/70 MB of uploads and you have used 66 MB/);
    expect(checkUpload('pro', 0, 5 * mb)).toBe(null);
  });
});
