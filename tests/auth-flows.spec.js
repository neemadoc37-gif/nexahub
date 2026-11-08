const { test, expect } = require('@playwright/test');

const project = 'https://oixruhlxundtgmhzeysj.supabase.co';
const uid = '11111111-1111-4111-8111-111111111111';
// Isolated browser fixtures only: none of these records reach Supabase.
const fixtureUser = {
  id: uid, aud: 'authenticated', role: 'authenticated',
  email: 'fixture@example.invalid', user_metadata: { display_name: 'Fixture Customer' },
};
const fixtureSession = {
  access_token: 'fixture-token', refresh_token: 'fixture-refresh',
  token_type: 'bearer', expires_in: 3600, user: fixtureUser,
};

test('LIVE: Preview sends invalid login to Supabase and shows the provider rejection', async ({ page }) => {
  await page.goto('/');
  await page.locator('#accountButton').click();
  await page.locator('#authEmail').fill('nexahub-negative-check@example.invalid');
  await page.locator('#authPassword').fill('NotAnExistingAccount!2026');
  const response = page.waitForResponse(r =>
    r.url().startsWith(`${project}/auth/v1/token`) && r.request().method() === 'POST');
  await page.locator('#authSubmit').click();
  expect((await response).status()).toBe(400);
  await expect(page.locator('#authMessage')).toContainText('Invalid login credentials');
  await expect(page.locator('#dashboardPanel')).toBeHidden();
});

test('LIVE diagnostic: Google button sends the configured client and callback (not a completed login)', async ({ page }) => {
  let googleURL;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'accounts.google.com' && url.searchParams.has('redirect_uri')) googleURL = url;
  });
  await page.goto('/');
  await page.locator('#accountButton').click();
  await page.locator('#googleSignIn').click();
  await expect.poll(() => googleURL?.hostname, { timeout: 20000 }).toBe('accounts.google.com');
  expect(googleURL.searchParams.get('client_id')).toBe(
    '786403845062-9tuamqbe2ngfu729tk3e2jrc6c3p6qcf.apps.googleusercontent.com');
  expect(googleURL.searchParams.get('redirect_uri')).toBe(`${project}/auth/v1/callback`);
});

async function fixtures(page, { missing = false, denied = false } = {}) {
  let profile = missing ? null : { display_name: 'Fixture Customer', phone: '' };
  const writes = [];
  await page.route(`${project}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    let body = {};
    let status = 200;
    if (url.pathname.endsWith('/token')) body = fixtureSession;
    else if (url.pathname.endsWith('/user')) body = fixtureUser;
    else if (url.pathname.endsWith('/logout')) { status = 204; body = null; }
    else if (url.pathname === '/rest/v1/profiles') {
      if (request.method() === 'POST') {
        writes.push({ body: request.postDataJSON(), prefer: request.headers().prefer });
        if (denied) {
          status = 403;
          body = { code: '42501', message: 'RLS denied fixture insert' };
        } else {
          profile = { display_name: request.postDataJSON().display_name, phone: '' };
          status = 201;
          body = null;
        }
      } else body = profile ? [profile] : [];
    }
    await route.fulfill({
      status, contentType: 'application/json',
      body: body === null ? '' : JSON.stringify(body),
    });
  });
  // No authenticated fixture requests may reach the real backend either.
  await page.route('**/api/**', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ orders: [], bookings: [], payments: [] }),
  }));
  return writes;
}

for (const missing of [false, true]) {
  test(`FIXTURE: login, ${missing ? 'create missing' : 'retrieve existing'} profile, reload and logout`, async ({ page }) => {
    const writes = await fixtures(page, { missing });
    await page.goto('/');
    await page.locator('#accountButton').click();
    await page.locator('#authEmail').fill(fixtureUser.email);
    await page.locator('#authPassword').fill('FixturePassword!2026');
    await page.locator('#authSubmit').click();
    await expect(page.locator('#profileName')).toHaveValue('Fixture Customer');
    await expect(page.locator('#authMessage')).toContainText('Your customer profile is ready');
    await expect(page.locator('#authPassword')).toHaveValue('');
    if (missing) {
      expect(writes.length).toBeGreaterThan(0);
      for (const write of writes) {
        expect(write.body.id).toBe(uid);
        expect(write.body).not.toHaveProperty('role');
        expect(write.prefer).toContain('resolution=ignore-duplicates');
      }
    } else expect(writes).toEqual([]);
    await page.reload();
    await expect(page.locator('#accountButton')).toHaveText('My account');
    await page.locator('#accountButton').click();
    await expect(page.locator('#profileName')).toHaveValue('Fixture Customer');
    await page.locator('#signOut').click();
    await expect(page.locator('#accountButton')).toHaveText('Sign in');
    await expect(page.locator('#authMessage')).toContainText('You have signed out');
    await expect(page.locator('#profileName')).toHaveValue('');
  });
}

test('FIXTURE: denied profile creation never claims profile success', async ({ page }) => {
  await fixtures(page, { missing: true, denied: true });
  await page.goto('/');
  await page.locator('#accountButton').click();
  await page.locator('#authEmail').fill(fixtureUser.email);
  await page.locator('#authPassword').fill('FixturePassword!2026');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#authMessage')).toContainText('existing access policies');
  await expect(page.locator('#authMessage')).toHaveAttribute('role', 'alert');
});

test('arbitrary recovery URL does not authorize password updates', async ({ page }) => {
  await page.goto('/?type=recovery');
  await page.locator('#accountButton').click();
  await expect(page.locator('#recoveryPanel')).toBeHidden();
  await expect(page.locator('#authPanel')).toBeVisible();
});
