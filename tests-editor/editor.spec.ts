import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const instances = JSON.parse(fs.readFileSync(new URL('./fixtures/obby-instances.json', import.meta.url), 'utf8'));
const project = { id: 'a'.repeat(24), name: 'Test obby', instances, universeId: '', placeId: '', publishHistory: [], updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

test('editor opens a place and draws the 3D world', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://api.test/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    if (url.pathname.startsWith('/projects/') && req.method() !== 'DELETE') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(project) });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' });
  });

  await page.goto(`/studio/${project.id}`);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6000); // let textures and shadows settle
  await page.screenshot({ path: 'editor-results/editor.png' });

  // The canvas must not be a flat single colour.
  const varied = await canvas.evaluate((c: HTMLCanvasElement) => {
    const t = document.createElement('canvas'); t.width = 64; t.height = 64;
    const x = t.getContext('2d')!; x.drawImage(c, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data; const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return seen.size;
  });
  expect(varied).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});
