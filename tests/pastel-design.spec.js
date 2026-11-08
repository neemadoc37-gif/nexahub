const { test, expect } = require('@playwright/test');

for (const width of [320, 402, 1280]) {
  test(`pastel storefront keeps public actions usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const theme = await page.evaluate(() => {
      const color = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
      return {
        header: color('.header'),
        page: color('body'),
        categories: [...document.querySelectorAll('.cat')].map(node => {
          const style = getComputedStyle(node);
          return style.backgroundColor + style.backgroundImage;
        }),
        fits: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    const channels = color => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    expect(Math.max(...channels(theme.header))).toBeLessThan(100);
    expect(Math.min(...channels(theme.page))).toBeGreaterThanOrEqual(245);
    expect(new Set(theme.categories).size).toBeGreaterThanOrEqual(4);
    expect(theme.fits).toBe(true);
    await expect(page.locator('.header a[href="/admin"]')).toHaveCount(0);
    await expect(page.locator('.hero h1')).toContainText('Your World.');
    await expect(page.locator('.header .logo img')).toHaveAttribute('src', '/assets/brand/nexahub-logo.webp');

    await page.locator('#accountButton').click();
    await expect(page.locator('#accountModal')).toBeVisible();
    await page.getByRole('button', { name: 'Close account dialog' }).click();
    await page.locator('#marketplaceSearch').fill('pastel journey check');
    await page.locator('.live-search button[type="submit"]').click();
    await expect(page).toHaveURL(/\/catalog\?q=pastel(?:\+|%20)journey(?:\+|%20)check/);
    await expect(page.locator('#platformMount')).toBeVisible();
  });
}

test('redesign does not turn illustrative stock into real inventory or enable collections', async ({ page, request }) => {
  await page.route('**/api/catalog', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ products: [], categories: [] }),
  }));
  await page.route('**/api/businesses', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ businesses: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('#liveProducts .market-card')).toHaveCount(0);
  await expect(page.locator('#marketplace')).toContainText('not for sale');
  await page.getByRole('button', { name: 'Add to sample basket' }).first().click();
  await expect(page.locator('#cartCount')).toHaveText('1');
  const callback = await request.post('/api/payments/mpesa/callback', {
    data: { ResultCode: 0, paid: true },
  });
  expect(callback.status()).toBe(503);
  expect((await callback.json()).error.code).toBe('callbacks_disabled');
});
