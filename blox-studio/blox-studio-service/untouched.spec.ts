import { createPlaceTemplate } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { fingerprint, isUntouchedTemplate } from './untouched.js';

describe('isUntouchedTemplate', () => {
  it('recognises every starter template, even though ids are random each time', () => {
    for (const t of ['baseplate', 'obby', 'empty'] as const) {
      expect(isUntouchedTemplate(createPlaceTemplate(t))).toBe(true);
    }
    expect(fingerprint(createPlaceTemplate('obby'))).toBe(fingerprint(createPlaceTemplate('obby')));
  });

  it('notices any change', () => {
    const edited = createPlaceTemplate('obby');
    const part = edited.find((i) => i.className === 'Part')!;
    part.props = { ...part.props, position: [999, 1, 1] };
    expect(isUntouchedTemplate(edited)).toBe(false);

    const renamed = createPlaceTemplate('baseplate'); renamed[renamed.length - 1].name = 'My house';
    expect(isUntouchedTemplate(renamed)).toBe(false);

    const added = createPlaceTemplate('empty'); added.push({ ...added[0], id: 'zzz', name: 'Extra', className: 'Folder' });
    expect(isUntouchedTemplate(added)).toBe(false);
    expect(isUntouchedTemplate([])).toBe(false);
  });
});
