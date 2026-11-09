const { test, expect } = require('@playwright/test');

test('direct workspace routes reload and serve the current source build', async ({ page, request }) => {
  const build = await (await request.get('/api/build')).json();
  expect(build.build_id).toMatch(/^[0-9a-f]{12}$/);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [path, heading] of [
    ['/workspaces', 'Explore or manage your account'],
    ['/customer', 'Your Spinix One'],
    ['/seller', 'Sell products or offer services'],
    ['/rider', 'Independent work, responsibly'],
    ['/delivery', 'Track an order'],
    ['/payments', 'M-PESA, not a mock checkout'],
    ['/admin', 'This page is unavailable'],
    ['/catalog', 'Published catalog'],
    ['/terms', 'Terms & Conditions'],
  ]) {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['x-nexahub-build']).toBe(build.build_id);
    await expect(page.locator('#platformMount h1')).toHaveText(heading);
    await expect(page.locator('#previewBuild')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#platformMount h1')).toHaveText(heading);
  }
  expect(errors).toEqual([]);
  expect((await request.get('/not-a-route')).status()).toBe(404);
  expect((await request.get('/server.py')).status()).toBe(404);
});

for (const width of [402, 1280]) {
  test(`public homepage hides internal dashboards while legacy partner routes remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#categoryHeading')).toBeVisible();
    const joinSeller = page.getByRole('link', { name: 'JOIN AS A SELLER', exact: true }).first();
    await expect(joinSeller).toBeVisible();
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(page.locator('.header')).not.toContainText('Workspaces');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await joinSeller.click();
    await expect(page).toHaveURL(/\/seller$/);
    await expect(page.locator('#platformMount')).toContainText('Applications are not accepting submissions yet');
    await page.goto('/workspaces');
    await expect(page).toHaveURL(/\/workspaces$/);
    const directory = page.locator('#platformMount');
    for (const path of ['/customer', '/seller', '/rider', '/delivery', '/catalog', '/payments']) {
      await expect(directory.locator(`a[href="${path}"]`)).toBeVisible();
    }
    await expect(directory).toContainText('Registration not open');
    await directory.locator('a[href="/rider"]').click();
    await expect(page.getByRole('heading', { name: 'Rider application', exact: true })).toBeVisible();
    await page.goBack();
    await expect(directory.locator('h1')).toHaveText('Explore or manage your account');
    await page.goForward();
    await expect(directory.locator('h1')).toHaveText('Independent work, responsibly');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('direct auth routes open real account controls without submitting anything', async ({ page }) => {
  const mutations = [];
  page.on('request', request => {
    if (request.method() === 'POST') mutations.push(new URL(request.url()).pathname);
  });
  for (const path of ['/register', '/register?workspace=customer', '/sign-in', '/forgot-password']) {
    await page.goto(path);
    await expect(page.locator('#accountModal')).toBeVisible();
    await expect(page.locator('#platformMount')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('This workspace is private');
    await expect(page.locator('#categoryHeading')).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof nexahubSupabase?.auth?.signInWithPassword)).toBe('function');
    await expect(page.locator('#accountIntro')).not.toContainText('Authentication is a preview');
    if (path.startsWith('/register')) {
      await expect(page.locator('#authName')).toBeVisible();
      await expect(page.locator('#authSubmit')).toHaveText('Create account');
    } else {
      await expect(page.locator('#authName')).toBeHidden();
      await expect(page.locator('#authSubmit')).toHaveText('Sign in');
    }
    await page.keyboard.press('Escape');
  }
  expect(mutations).toEqual([]);
});

test('public product and business endpoints load without an account', async ({ request }) => {
  const [catalogResponse, businessResponse] = await Promise.all([
    request.get('/api/catalog'),
    request.get('/api/businesses'),
  ]);
  expect(catalogResponse.status()).toBe(200);
  expect(businessResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  const businesses = await businessResponse.json();
  expect(Array.isArray(catalog.products)).toBe(true);
  expect(Array.isArray(catalog.categories)).toBe(true);
  expect(Array.isArray(businesses.businesses)).toBe(true);
  expect(catalog.products.every(item => item.status === 'published')).toBe(true);
  expect(businesses.businesses.every(item => item.status === 'approved')).toBe(true);
});

test('seller page does not collect application details when secure storage is unavailable', async ({ page }) => {
  await page.goto('/seller');
  await expect(page.locator('#platformMount')).toContainText('Applications are not accepting submissions yet');
  await expect(page.locator('#platformMount input[name="store_name"]')).toHaveCount(0);
  await expect(page.locator('#platformMount')).not.toContainText('Preview');
});

test('footer terms link opens the public draft terms page without sign-in', async ({ page }) => {
  await page.goto('/');
  const terms = page.locator('.footer a[href="/terms"]');
  await expect(terms).toBeVisible();
  await terms.click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.locator('.legal-page h1')).toHaveText('Terms & Conditions');
  await expect(page.locator('.legal-disclaimer')).toContainText('not legal advice');
  await expect(page.locator('.legal-current-state')).toContainText('not currently accepting orders');
  await expect(page.locator('#accountModal')).toBeHidden();
});

test('old workspace links stay usable and switching routes clears old record filters', async ({ page }) => {
  await page.goto('/?workspace=customer&order=11111111-1111-4111-8111-111111111111&q=old');
  await expect(page.locator('#platformMount h1')).toHaveText('Your Spinix One');
  await page.locator('.footer a[href="/seller"]').click();
  await expect(page).toHaveURL(/\/seller$/);
  await page.getByRole('link', { name: 'Spinix One home', exact: true }).click();
  await expect(page.locator('#platformMount')).toBeHidden();
  await expect(page.locator('#categoryHeading')).toBeVisible();
  await expect(page.locator('#liveProducts')).toBeHidden();
});

test('footer categories and live marketplace search remain reachable from a workspace', async ({ page }) => {
  await page.goto('/seller');
  await page.locator('.footer a[href="/catalog?category=supermarkets"]').click();
  await expect(page).toHaveURL(/\/catalog\?category=supermarkets$/);
  await expect(page.locator('#platformMount h1')).toHaveText('Published catalog');
  await page.goto('/admin');
  await page.locator('#marketplaceSearch').fill('headphones');
  await page.getByRole('button', { name: 'Search the live catalog', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\?q=headphones$/);
  await expect(page.locator('#platformMount').getByLabel('Search published products')).toHaveValue('headphones');
});

test('FIXTURE: order detail links preserve the owned order for payment and tracking', async ({ page }) => {
  // Isolated fixtures, never inserted into Supabase or sent to the real backend.
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', user_metadata: {} };
  const order = { id: '22222222-2222-4222-8222-222222222222', customer_id: user.id, total_amount: 100, currency: 'KES', status: 'pending', created_at: '2026-11-01' };
  await page.route('https://oixruhlxundtgmhzeysj.supabase.co/**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(route.request().url().includes('/token')
      ? { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user }
      : route.request().url().includes('/rest/') ? [{ display_name: 'Fixture', phone: '' }] : user),
  }));
  await page.route('**/api/customer/**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(route.request().url().endsWith('/orders') ? { orders: [order] }
      : route.request().url().endsWith(order.id) ? { order, items: [] } : { bookings: [], payments: [] }),
  }));
  await page.goto('/customer');
  await page.locator('#platformMount .platform-authbar').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#authEmail').fill(user.email);
  await page.locator('#authPassword').fill('FixturePassword!2026');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#accountButton')).toHaveText('My account');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^View order / }).click();
  await page.locator('#orderDetailPanel').getByRole('button', { name: 'Payment readiness', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/payments\\?order=${order.id}$`));
  await expect(page.locator('select[name="order_id"]')).toHaveValue(order.id);
  await page.locator('.footer a[href="/customer"]').click();
  await page.getByRole('button', { name: /^View order / }).click();
  await page.getByRole('button', { name: 'Track delivery', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/delivery\\?order=${order.id}$`));
  for (const input of await page.locator('#platformMount input[name="order_id"]').all()) await expect(input).toHaveValue(order.id);
});
