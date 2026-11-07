const { test, expect } = require('@playwright/test');

for (const width of [320, 402, 1280]) {
  test(`approved brand images load without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const logos = page.locator('.logo img');
    await expect(logos).toHaveCount(2);
    for (const logo of await logos.all()) {
      await expect(logo).toHaveAttribute('alt', /NexaHub/i);
      await expect.poll(() => logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const bounds = await logo.boundingBox();
      expect(bounds.width).toBeGreaterThan(100);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/assets/brand/favicon.png');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/assets/brand/apple-touch-icon.png');
    await expect(page.locator('#productGrid .product')).toHaveCount(8);
    await page.locator('#accountButton').click();
    await expect(page.locator('#accountModal')).toBeVisible();
    await page.getByRole('button', { name: 'Close account dialog' }).click();
    await page.getByRole('button', { name: 'Add to basket' }).first().click();
    await expect(page.locator('#cartCount')).toHaveText('1');
  });
}

test('brand assets support GET/HEAD without exposing workspace files', async ({ request }) => {
  for (const [path, type] of [
    ['/assets/brand/nexahub-logo.webp', 'image/webp'],
    ['/assets/brand/favicon.png', 'image/png'],
    ['/assets/brand/apple-touch-icon.png', 'image/png'],
    ['/favicon.ico', 'image/png'],
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe(type);
    expect((await response.body()).length).toBeGreaterThan(0);
    const head = await request.head(path);
    expect(head.status()).toBe(200);
    expect(head.headers()['content-type']).toBe(type);
    expect((await head.body()).length).toBe(0);
  }
  for (const path of ['/server.py', '/.replit', '/assets/brand/', '/assets/brand/unknown.png', '/assets/brand/../../server.py']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
