const { test, expect } = require('@playwright/test');

for (const width of [320, 402, 1280]) {
  test(`redesigned Preview loads assets and customer navigation without overflow at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.hero h1')).toContainText('Your World.');
    await expect(page.locator('#liveProducts')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#liveBusinesses')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(page.locator('.header')).not.toContainText('dashboard');
    await expect(page.locator('.header')).not.toContainText('Workspaces');
    await expect(page.locator('.categories .cat')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const path of ['/assets/marketplace.css', '/assets/storefront.js', '/assets/marketplace/marketplace-hero.jpg']) {
      expect((await request.get(path)).status()).toBe(200);
    }
    expect(errors).toEqual([]);
  });
}

test('anonymous direct admin visits reveal no dashboard or private controls', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.locator('#platformMount h1')).toHaveText('This page is unavailable');
  await expect(page.locator('#platformMount')).not.toContainText('Owner management');
  await expect(page.locator('#platformMount')).not.toContainText('Restricted action request');
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  for (const path of ['/api/admin', '/api/account/access', '/api/customer/profile']) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

test('FIXTURE: homepage uses real endpoint responses, never sample cards as live inventory', async ({ page }) => {
  const seller = '11111111-1111-4111-8111-111111111111';
  const product = '22222222-2222-4222-8222-222222222222';
  await page.route('**/api/catalog**', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      products: [{ id: product, seller_id: seller, title: 'Isolated published listing', status: 'published', price: 50, currency: 'KES', listing_type: 'service', description: '<b>Literal fixture text</b>' }],
      categories: [], limit: 50,
    }),
  }));
  await page.route('**/api/businesses', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ businesses: [
      { id: seller, store_name: 'Isolated approved store', description: 'Not an actual merchant', status: 'approved' },
      { id: product, store_name: 'Pending fixture must not appear', status: 'pending' },
    ] }),
  }));
  await page.goto('/');
  await expect(page.locator('#liveProducts .market-card')).toHaveCount(1);
  await expect(page.locator('#liveProducts')).toContainText('<b>Literal fixture text</b>');
  await expect(page.locator('#liveProducts b')).toHaveCount(0);
  await expect(page.locator('#liveProducts a')).toHaveAttribute('href', '/catalog?product=' + product);
  await expect(page.locator('#liveBusinesses .business-card')).toHaveCount(1);
  await expect(page.locator('#liveBusinesses')).not.toContainText('Pending fixture');
  await page.locator('#liveBusinesses .business-card').click();
  await expect(page).toHaveURL(new RegExp('seller=' + seller));
  await expect(page.locator('#platformMount')).toContainText('selected business');
});

test('FIXTURE: unavailable live inventory is explicit and can be retried without sample substitution', async ({ page }) => {
  let fail = true;
  await page.route('**/api/catalog', route => route.fulfill({
    status: fail ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(fail ? { error: { message: 'Isolated failure' } } : { products: [], categories: [] }),
  }));
  await page.route('**/api/businesses', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ businesses: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('#liveProducts')).toContainText('could not be loaded');
  await expect(page.locator('#liveProducts .product')).toHaveCount(0);
  await expect(page.locator('#productGrid .product')).toHaveCount(8);
  fail = false;
  await page.locator('#liveProducts').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#liveProducts')).toContainText('no live listings');
  await expect(page.locator('#liveBusinesses')).toContainText('No approved businesses');
});

test('FIXTURE: editable admin metadata cannot reveal an internal dashboard', async ({ page }) => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'fixture@example.invalid', user_metadata: { role: 'admin' },
  };
  await page.route('https://oixruhlxundtgmhzeysj.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/token')
      ? { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user }
      : path.startsWith('/rest/') ? [{ display_name: 'Isolated customer', phone: '' }] : user;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/account/access', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ admin: false }),
  }));
  await page.route('**/api/admin', route => route.fulfill({
    status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Owner access required' } }),
  }));
  await page.goto('/sign-in');
  await page.locator('#authEmail').fill(user.email);
  await page.locator('#authPassword').fill('IsolatedFixturePassword!2026');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#accountButton')).toHaveText('My account');
  await page.keyboard.press('Escape');
  await page.goto('/admin');
  await expect(page.locator('#platformMount h1')).toHaveText('This page is unavailable');
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await expect(page.locator('#platformMount')).not.toContainText('Restricted action request');
});
