import { test, expect } from '@playwright/test';

test('landing page loads with its headline and an Open editor link', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/VoxMesa/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build 3D games with your');
  await expect(page.getByRole('link', { name: /open editor/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('page does not scroll sideways', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
