import { RobloxPublisher } from './roblox-publisher.js';

describe('roblox publisher', () => {
  it('rejects non-numeric universe and place ids', async () => {
    const publisher = new RobloxPublisher('test-key');
    await expect(
      publisher.publish({ universeId: 'abc', placeId: '1', versionType: 'Saved', rbxlx: '<roblox/>' })
    ).rejects.toThrow('numeric');
  });
});
