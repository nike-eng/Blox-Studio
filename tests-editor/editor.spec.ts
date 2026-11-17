import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

type Part = { id: string; className: string; name: string; parentId: string | null; props: Record<string, unknown> };
const instances: Part[] = JSON.parse(fs.readFileSync(new URL('./fixtures/obby-instances.json', import.meta.url), 'utf8'));
const ID = 'a'.repeat(24);
const cors = { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };

/** A big flat field of simple coloured slabs, to measure how heavy many parts are. */
function stress(n: number): Part[] {
  const keep = instances.filter((i) => ['Workspace', 'Lighting'].includes(i.className));
  const ws = keep.find((k) => k.className === 'Workspace')?.id ?? null;
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({ id: `s${i}`, className: 'Part', name: `Slab${i}`, parentId: ws, props: { position: [(i % 40) * 6 - 120, 1 + (i % 7), Math.floor(i / 40) * 6 - 90], size: [4, 1, 4], color: ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b'][i % 4], material: 'Plastic' } });
  }
  return [...keep, ...parts];
}

async function openPlace(page: Page, inst: Part[]) {
  const project = { id: ID, name: 'Test place', instances: inst, universeId: '', placeId: '', publishHistory: [], updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://api.test/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': req.headers()['access-control-request-headers'] || 'content-type' } });
    const body = new URL(req.url()).pathname.startsWith('/projects/') && req.method() !== 'DELETE' ? JSON.stringify(project) : '{}';
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body });
  });
  await page.goto(`/studio/${ID}`);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(10_000); // textures and shadows settle
  return errors;
}

const stats = (page: Page) => page.evaluate(() => (window as unknown as { __voxStats?: { calls: number; triangles: number } }).__voxStats);

async function printShot(page: Page, label: string) {
  const shot = await page.screenshot({ type: 'jpeg', quality: 55 });
  console.log(`SHOT[${label}]:` + shot.toString('base64')); // artifacts cannot be downloaded from where Claude works
}

test('editor opens a place and draws the 3D world', async ({ page }) => {
  const errors = await openPlace(page, instances);
  await printShot(page, 'obby');
  console.log('STATS obby', JSON.stringify(await stats(page)));
  expect(errors).toEqual([]);
});

test('editor stays light with 1200 parts', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = await openPlace(page, stress(1200));
  const s = await stats(page);
  console.log('STATS stress', JSON.stringify(s));
  expect(s).toBeTruthy();
  expect(s!.calls).toBeLessThan(100);

  // Batched parts must still be clickable: some click on the field should select one and show its properties.
  const box = (await page.locator('canvas').first().boundingBox())!;
  let picked = false;
  for (const fy of [0.55, 0.65, 0.75, 0.85, 0.45]) {
    for (const fx of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(250);
      if (!(await page.getByText('Select an object in the viewport').isVisible())) { picked = true; break; }
    }
    if (picked) break;
  }
  console.log('PICKED', picked);
  await printShot(page, 'stress-picked');
  expect(picked).toBe(true);
  expect(errors).toEqual([]);
});

for (const [label, size] of [['phone-portrait', { width: 412, height: 780 }], ['phone-landscape', { width: 880, height: 380 }]] as const) {
  test(`editor layout on ${label}`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors = await openPlace(page, instances);
    await printShot(page, label);
    expect(errors).toEqual([]);
  });
}
