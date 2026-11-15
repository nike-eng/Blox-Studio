import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const instances = JSON.parse(fs.readFileSync(new URL('./fixtures/obby-instances.json', import.meta.url), 'utf8'));
const project = { id: 'a'.repeat(24), name: 'Test obby', instances, universeId: '', placeId: '', publishHistory: [], updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
const cors = { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type, authorization, x-owner-key, x-owner', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };

test('editor opens a place and draws the 3D world', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('PAGE', m.type(), m.text().slice(0, 300)); });
  await page.route('http://api.test/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': req.headers()['access-control-request-headers'] || cors['access-control-allow-headers'] } });
    const url = new URL(req.url());
    if (url.pathname.startsWith('/projects/') && req.method() !== 'DELETE') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(project) });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' });
  });

  await page.goto(`/studio/${project.id}`);
  const canvas = page.locator('canvas').first();
  await page.waitForTimeout(12000); // let the page, textures and shadows settle
  // Print the screenshot into the log (artifacts cannot be downloaded from where Claude works), plus the page text.
  const shot = await page.screenshot({ type: 'jpeg', quality: 55 });
  console.log('TEXT', (await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\n/g, ' | '));
  console.log('SHOT:' + shot.toString('base64'));
  await expect(canvas).toBeVisible({ timeout: 5000 });

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
