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
    await expect(page.locator('#productGrid, .sample-section')).toHaveCount(0);
    await page.locator('#accountButton').click();
    await expect(page.locator('#accountModal')).toBeVisible();
    await page.getByRole('button', { name: 'Close account dialog' }).click();
    await page.getByRole('button', { name: 'Open basket' }).click();
    await expect(page.locator('#basketCheckoutNotice')).toBeVisible();
    await expect(page.locator('#cartCount')).toHaveText('0');
    await page.getByRole('button', { name: 'Close basket dialog' }).click();
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

for (const width of [320, 402, 1280]) {
  test(`approved branding on sign-in and every role dashboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = [];
    page.on('request', request => {
      if (request.method() === 'POST') writes.push(new URL(request.url()).pathname);
    });
    const approved = '/assets/brand/nexahub-logo.webp';
    for (const route of ['/sign-in', '/customer', '/seller', '/rider', '/admin']) {
      await page.goto(route);
      const headerLogo = page.locator(`.header img[src="${approved}"]`);
      const pageLogo = route === '/sign-in'
        ? page.locator(`#accountModal img[src="${approved}"]`)
        : page.locator(`#platformMount .platform-hero img[src="${approved}"]`);
      for (const logo of [headerLogo, pageLogo]) {
        if (route !== '/sign-in' || logo === pageLogo) await expect(logo).toBeVisible();
        await expect.poll(() => logo.evaluate(img => img.complete && img.naturalWidth)).toBe(1020);
        const geometry = await logo.evaluate(img => {
          const rect = img.getBoundingClientRect();
          return { ratio: rect.width / rect.height, expectedRatio: img.naturalWidth / img.naturalHeight,
            width: rect.width, fits: rect.left >= 0 && rect.right <= innerWidth };
        });
        expect(Math.abs(geometry.ratio - geometry.expectedRatio)).toBeLessThan(0.03);
        expect(geometry.width).toBeGreaterThan(100);
        expect(geometry.fits).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(writes).toEqual([]);
  });
}

test('browser favicon is the approved 64px image on dashboard routes', async ({ page }) => {
  await page.goto('/admin');
  const dimensions = await page.evaluate(async () => {
    const img = new Image();
    img.src = document.querySelector('link[rel="icon"]').href;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(dimensions).toEqual([64, 64]);
});
