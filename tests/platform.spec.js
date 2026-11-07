const { test, expect } = require('@playwright/test');

// These are anonymous integration checks against the real app. They never
// create accounts, submit credentials, send an STK prompt or move money.
for (const width of [402, 1280]) {
  test(`workspace navigation and public rider form work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [], mutations = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST') mutations.push(new URL(request.url()).pathname);
    });
    await page.goto('/');
    await expect(page.locator('.platform-nav')).toBeVisible();
    await page.locator('.platform-nav').getByRole('link', { name: 'Rider desk', exact: true }).click();
    await expect(page).toHaveURL(/workspace=rider/);
    await expect(page.getByRole('heading', { name: 'Independent work, responsibly' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rider application', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Available jobs', exact: true })).toBeVisible();
    await page.locator('#platformMount').getByRole('button', { name: 'Validate and check readiness' }).click();
    const workspace = page.locator('#platformMount');
    expect(await workspace.getByLabel('Full name', { exact: true }).evaluate(input => input.validity.valueMissing)).toBe(true);
    await workspace.getByLabel('Full name', { exact: true }).fill('Browser test fixture');
    await workspace.getByLabel('Phone number', { exact: true }).fill('0712345678');
    await workspace.getByLabel('City', { exact: true }).fill('Test zone');
    await workspace.getByLabel('Vehicle', { exact: true }).selectOption('bicycle');
    await workspace.getByLabel('I consent to submit these details for rider registration').check();
    await page.locator('#platformMount').getByRole('button', { name: 'Validate and check readiness' }).click();
    await expect(page.locator('#accountModal')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(mutations).toEqual([]);
    await page.locator('.platform-nav').getByRole('link', { name: 'Storefront', exact: true }).click();
    await expect(page.locator('#platformMount')).toBeHidden();
    await expect(page.locator('#productGrid .product')).toHaveCount(8);
    await page.getByRole('button', { name: 'Add to basket', exact: true }).first().click();
    await expect(page.locator('#cartCount')).toHaveText('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const [route, heading] of [
  ['customer', 'Your NexaHub'],
  ['seller', 'A clearer view of your store'],
  ['delivery', 'Track an order'],
  ['payments', 'M-PESA, not a mock checkout'],
  ['admin', 'Administration'],
]) {
  test(`signed-out ${route} page never loads private records`, async ({ page }) => {
    const privateRequests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/api\/(customer|seller$|rider$|admin)/.test(request.url())) privateRequests.push(request.url());
    });
    await page.goto('/?workspace=' + route);
    await expect(page.locator('#platformMount').getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.locator('#platformMount .platform-authbar')).toContainText('Sign in');
    await page.locator('#platformMount .platform-authbar').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('#accountModal')).toBeVisible();
    expect(privateRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('public catalog is real published inventory or an explicit service error, never a sample fallback', async ({ page }) => {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/catalog');
  await page.goto('/?workspace=catalog');
  const result = await response;
  const body = await result.json();
  if (result.ok()) {
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.every(product => product.status === 'published')).toBe(true);
    if (!body.products.length) await expect(page.locator('#platformMount')).toContainText('No published products');
  } else {
    expect(body.error.message).toBeTruthy();
    await expect(page.locator('#platformMount')).toContainText(body.error.message);
  }
  await page.getByRole('button', { name: 'Discover', exact: true }).click();
  await expect(page.locator('#platformMount')).toBeHidden();
  await expect(page.locator('#productGrid')).toBeVisible();
});

test('API refuses unverified sessions and unconfigured financial callbacks', async ({ request }) => {
  const readiness = await request.get('/api/readiness');
  expect(readiness.status()).toBe(200);
  const data = await readiness.json();
  expect(data.live_money_enabled).toBe(false);
  for (const name of ['payments', 'delivery', 'rider_registration', 'seller_writes']) expect(data[name].enabled).toBe(false);
  for (const path of ['/api/customer/orders', '/api/customer/bookings', '/api/customer/payments', '/api/seller', '/api/rider', '/api/admin']) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('sign_in_required');
  }
  const invalid = await request.get('/api/admin?role=admin', { headers: { Authorization: 'Bearer forged' } });
  expect(invalid.status()).toBe(401);
  const callback = await request.post('/api/payments/mpesa/callback', { data: { ResultCode: 0, paid: true } });
  expect(callback.status()).toBe(503);
  expect((await callback.json()).error.code).toBe('callbacks_disabled');
  const stk = await request.post('/api/payments/mpesa/stk', { data: { order_id: 'unverified', phone: '0712345678' } });
  expect(stk.status()).toBe(401);
  const size = await request.post('/api/riders/applications', { data: { text: 'a'.repeat(17000) } });
  expect(size.status()).toBe(413);
  const type = await request.post('/api/admin/actions', { data: 'not json', headers: { 'Content-Type': 'text/plain' } });
  expect(type.status()).toBe(415);
});
