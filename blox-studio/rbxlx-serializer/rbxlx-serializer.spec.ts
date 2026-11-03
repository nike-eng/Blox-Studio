import { toRbxlx, hexToColor3uint8, createPlaceTemplate, asciiToBase64 } from './index.js';

describe('rbxlx-serializer', () => {
  it('serializes a place with nested parts and scripts', () => {
    const xml = toRbxlx(createPlaceTemplate('obby'));
    expect(xml).toContain('<Item class="Workspace"');
    expect(xml).toContain('<Item class="TrussPart"');
    expect(xml).toContain('<ProtectedString name="Source"><![CDATA[');
    expect(xml.startsWith('<roblox')).toBe(true);
  });

  it('injects the gameplay runtime and tags when parts have behaviors', () => {
    const xml = toRbxlx(createPlaceTemplate('obby'));
    expect(xml).toContain('<string name="Name">BloxRuntime</string>');
    expect(xml).toContain('<string name="Name">BloxClient</string>');
    expect(xml).toContain(`<BinaryString name="Tags">${asciiToBase64('BloxKill')}</BinaryString>`);
    expect(toRbxlx(createPlaceTemplate('baseplate'))).not.toContain('BloxRuntime');
  });

  it('packs colors and base64-encodes tags', () => {
    expect(hexToColor3uint8('#ff0000')).toBe(0xffff0000);
    expect(asciiToBase64('Blox')).toBe('QmxveA==');
  });
});
