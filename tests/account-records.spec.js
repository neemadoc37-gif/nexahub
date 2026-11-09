const { test, expect } = require('@playwright/test');

// Isolated fixtures only. These users, listings and records never reach Supabase.
const project = 'https://oixruhlxundtgmhzeysj.supabase.co';
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.invalid', user_metadata: {} };
const order = {
  id: '22222222-2222-4222-8222-222222222222', order_number: 'NH-FIXTURE-007',
  status: 'pending', total_amount: 100, currency: 'KES', created_at: '2026-11-01T10:00:00Z',
};
const category = { id: '33333333-3333-4333-8333-333333333333', name: 'Fixture appointments', slug: 'fixture' };
const products = [
  { id: '44444444-4444-4444-8444-444444444444', title: 'Fixture consultation', description: 'Isolated listing, never published', category_id: category.id, listing_type: 'service', status: 'published', price: 100, currency: 'KES' },
  { id: '55555555-5555-4555-8555-555555555555', title: 'Fixture digital guide', description: '<strong>Literal fixture description</strong>', category_id: category.id, listing_type: 'digital', status: 'published', price: 20, currency: 'USD' },
];

async function accountFixtures(page, state = {}) {
  const mutations = [];
  await page.route(`${project}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/token') ? {
      access_token: 'fixture-token', refresh_token: 'fixture-refresh',
      token_type: 'bearer', expires_in: 3600, user,
    } : path.startsWith('/rest/') ? [{ display_name: 'Modal fixture', phone: '' }] : user;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/customer/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') mutations.push(path);
    let body, status = 200;
    if (path.endsWith('/profile')) body = { profile: { id: user.id, display_name: 'Profile loaded from records API', phone: '', country_code: 'KE', created_at: '2026-10-01T10:00:00Z' } };
    else if (path.endsWith('/orders')) body = { orders: state.emptyOrders ? [] : [order], limit: 50 };
    else if (path.endsWith('/orders/' + order.id)) body = { order, items: [] };
    else if (path.endsWith('/bookings')) {
      if (state.bookingError) { status = 503; body = { error: { message: 'Fixture booking policy unavailable' } }; }
      else body = { bookings: [{
        id: '66666666-6666-4666-8666-666666666666', product_id: products[0].id,
        start_at: 'bookingStart' in state ? state.bookingStart : '2026-12-03T09:15:00Z', notes: '<strong>Literal booking note</strong>',
        status: 'pending', created_at: '2026-11-01T10:00:00Z',
      }], limit: 50 };
    } else if (path.endsWith('/payments')) {
      if (state.paymentError) { status = 403; body = { error: { message: 'Fixture payment policy unavailable' } }; }
      else body = { payments: [{
        id: '77777777-7777-4777-8777-777777777777', order_id: order.id, customer_id: user.id,
        provider: 'mpesa', provider_reference: 'FIXTURE-REFERENCE-NOT-SETTLED',
        amount: 100, currency: 'KES', status: 'pending', created_at: '2026-11-01T10:00:00Z',
      }], limit: 50, scope: 'most_recent_50_payments' };
    } else { status = 404; body = { error: { message: 'Unexpected fixture endpoint' } }; }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return mutations;
}

async function signInFixture(page, path = '/customer') {
  await page.goto(path);
  await page.locator('#platformMount .platform-authbar').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#authEmail').fill(user.email);
  await page.locator('#authPassword').fill('IsolatedFixturePassword!2026');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#accountButton')).toHaveText('My account');
  await page.keyboard.press('Escape');
}

test('FIXTURE: profile, order number, booking details and payment reference are read from account APIs', async ({ page }) => {
  const mutations = await accountFixtures(page);
  await signInFixture(page);
  const mount = page.locator('#platformMount');
  await expect(mount).toContainText('Profile loaded from records API');
  await expect(mount).toContainText('KE');
  await expect(mount).toContainText(order.order_number);
  await expect(mount).toContainText('<strong>Literal booking note</strong>');
  await expect(mount).toContainText('FIXTURE-REFERENCE-NOT-SETTLED');
  const bookingDate = await page.evaluate(() => new Date('2026-12-03T09:15:00Z').toLocaleString('en-KE'));
  await expect(mount).toContainText(bookingDate);
  await expect(mount.locator('strong').filter({ hasText: 'Literal booking note' })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('FIXTURE: booking/payment failures do not hide valid orders or profile; account refresh recovers', async ({ page }) => {
  const state = { bookingError: true, paymentError: true };
  await accountFixtures(page, state);
  await signInFixture(page);
  const mount = page.locator('#platformMount');
  await expect(mount).toContainText(order.order_number);
  await expect(mount).toContainText('Profile loaded from records API');
  await expect(mount).toContainText('Fixture booking policy unavailable');
  await expect(mount).toContainText('Fixture payment policy unavailable');
  state.bookingError = false; state.paymentError = false;
  await mount.getByRole('button', { name: 'Refresh account', exact: true }).click();
  await expect(mount).toContainText('FIXTURE-REFERENCE-NOT-SETTLED');
  await expect(mount).not.toContainText('Fixture booking policy unavailable');
});

test('FIXTURE: a valid owned order detail opens even outside the first 50 list records', async ({ page }) => {
  await accountFixtures(page, { emptyOrders: true });
  await signInFixture(page, '/customer?order=' + order.id);
  await expect(page.locator('#orderDetailPanel')).toContainText(order.order_number);
  await expect(page.locator('#orderDetailPanel').getByRole('button', { name: 'Track delivery', exact: true })).toBeVisible();
});

test('FIXTURE: an unscheduled booking never displays a fabricated 1970 start date', async ({ page }) => {
  await accountFixtures(page, { bookingStart: null });
  await signInFixture(page);
  await expect(page.locator('#platformMount')).toContainText('Starts Date unavailable');
  await expect(page.locator('#platformMount')).not.toContainText('1970');
});

for (const width of [402, 1280]) {
  test(`FIXTURE: catalog filters, clear, refresh and listing details work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests = [];
    await page.route('**/api/catalog**', route => {
      const url = new URL(route.request().url());
      requests.push(url);
      let body;
      if (url.pathname !== '/api/catalog') body = { product: products.find(p => url.pathname.endsWith(p.id)) };
      else body = {
        products: products.filter(p =>
          (!url.searchParams.get('listing_type') || p.listing_type === url.searchParams.get('listing_type'))
          && (!url.searchParams.get('category') || p.category_id === url.searchParams.get('category'))
          && (!url.searchParams.get('q') || p.title.toLowerCase().includes(url.searchParams.get('q').toLowerCase()))),
        categories: [category], limit: 50,
      };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/catalog');
    const mount = page.locator('#platformMount');
    await expect(mount.locator('.platform-product')).toHaveCount(2);
    await mount.getByLabel('Listing type', { exact: true }).selectOption('service');
    await mount.getByLabel('Category', { exact: true }).selectOption(category.id);
    await mount.getByRole('button', { name: /Search catalog|Apply filters/i }).click();
    await expect(page).toHaveURL(/listing_type=service/);
    await expect(mount.locator('.platform-product')).toHaveCount(1);
    expect(requests.at(-1).searchParams.get('category')).toBe(category.id);
    await page.reload();
    await expect(mount.getByLabel('Listing type', { exact: true })).toHaveValue('service');
    await expect(mount.getByLabel('Category', { exact: true })).toHaveValue(category.id);
    await mount.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(mount.locator('.platform-product')).toHaveCount(2);
    await page.goBack();
    await expect(mount.locator('.platform-product')).toHaveCount(1);
    await page.goto('/catalog?product=' + products[1].id);
    await expect(mount).toContainText('<strong>Literal fixture description</strong>');
    await expect(mount).toContainText('digital');
    await expect(mount.locator('strong').filter({ hasText: 'Literal fixture description' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
