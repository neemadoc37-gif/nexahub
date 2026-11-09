const { test, expect } = require('@playwright/test');

// Real SDK, no account creation, mocked sessions, email sends, or transactions.
for (const viewport of [{ width: 1280, height: 900 }, { width: 402, height: 874 }]) {
  test(`anonymous account controls and validation at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const pageErrors = [];
    const authMutations = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('/auth/v1/')) {
        authMutations.push(new URL(request.url()).pathname);
      }
    });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() =>
      typeof nexahubSupabase?.auth?.signUp
    )).toBe('function');
    await page.locator('#accountButton').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#authEmail')).toBeVisible();
    await expect(page.locator('#googleSignIn')).toBeEnabled();
    await expect(page.locator('#authName')).toBeHidden();
    await page.locator('#authSubmit').click();
    expect(await page.locator('#authEmail').evaluate(input => input.validity.valueMissing)).toBe(true);
    await page.locator('#authModeToggle').click();
    await expect(page.locator('#authName')).toBeVisible();
    await expect(page.locator('#authSubmit')).toHaveText('Create account');
    await expect(page.locator('#accountIntro')).toHaveText('Create your account with your email address and password.');
    await expect(page.locator('#resendConfirmation')).toBeHidden();
    await page.locator('#authSubmit').click();
    expect(await page.locator('#authName').evaluate(input => input.validity.valueMissing)).toBe(true);
    await page.locator('#authModeToggle').click();
    await expect(page.locator('#authName')).toBeHidden();
    await page.locator('#resetPassword').click();
    await expect(page.locator('#authMessage')).toContainText('Enter your email address first');
    await page.getByRole('button', { name: 'Close account dialog' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#productGrid, .sample-section')).toHaveCount(0);
    expect(authMutations).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test('FIXTURE: immediate Supabase session signs the new customer in without an email step', async ({ page }) => {
  await page.goto('/register');
  await page.evaluate(() => {
    if (window.Platform) window.Platform.authChanged = () => {};
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'fixture@example.invalid',
      user_metadata: { display_name: 'Fixture Customer' },
    };
    nexahubSupabase = {
      auth: {
        signUp: async () => ({ data: { user, session: { user } }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { display_name: 'Fixture Customer', phone: null },
              error: null,
            }),
          }),
        }),
      }),
    };
  });
  await page.locator('#authName').fill('Fixture Customer');
  await page.locator('#authEmail').fill('fixture@example.invalid');
  await page.locator('#authPassword').fill('FixturePass123');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#accountButton')).toHaveText('My account');
  await expect(page.locator('#dashboardPanel')).toBeVisible();
  await expect(page.locator('#authMessage')).toContainText('Your customer profile is ready.');
});

test('FIXTURE: no session never claims registration or sign-in succeeded', async ({ page }) => {
  await page.goto('/register');
  await page.evaluate(() => {
    nexahubSupabase = {
      auth: {
        signUp: async () => ({
          data: { user: { id: '22222222-2222-4222-8222-222222222222' }, session: null },
          error: null,
        }),
      },
    };
  });
  await page.locator('#authName').fill('Fixture Customer');
  await page.locator('#authEmail').fill('fixture@example.invalid');
  await page.locator('#authPassword').fill('FixturePass123');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#authMessage')).toContainText('Supabase returned no sign-in session');
  await expect(page.locator('#authMessage')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#accountButton')).toHaveText('Sign in');
  await expect(page.locator('#dashboardPanel')).toBeHidden();
});

// Error URLs exercise local error handling only, never a successful login.
for (const scenario of [
  { name: 'expired confirmation query', path: '/?campaign=welcome&error=access_denied&error_code=otp_expired&error_description=private-detail', text: 'expired or is invalid' },
  { name: 'cancelled Google fragment', path: '/#error=access_denied&error_description=private-detail', text: 'cancelled or access was denied' },
  { name: 'unknown provider error', path: '/?error=server_error&error_description=%3Cimg%20src=x%20onerror=alert(1)%3E', text: 'could not be completed' },
]) {
  test(`auth return: ${scenario.name} is explained without exposing provider details`, async ({ page }) => {
    const writes = [];
    page.on('request', request => {
      if (request.method() !== 'GET' && request.url().includes('.supabase.co/')) writes.push(request.method());
    });
    await page.goto(scenario.path);
    await expect(page.locator('#accountModal')).toBeVisible();
    await expect(page.locator('#authMessage')).toContainText(scenario.text);
    await expect(page.locator('#authMessage')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#dashboardPanel')).toBeHidden();
    await expect(page.locator('#googleSignIn')).toBeEnabled();
    await expect(page.locator('#authMessage')).not.toContainText('private-detail');
    expect(await page.locator('#authMessage img').count()).toBe(0);
    const url = new URL(page.url());
    expect(url.searchParams.has('error')).toBe(false);
    expect(url.searchParams.has('error_description')).toBe(false);
    expect(url.hash).toBe('');
    if (scenario.name === 'expired confirmation query') expect(url.searchParams.get('campaign')).toBe('welcome');
    await page.locator('#authModeToggle').click();
    await expect(page.locator('#authMessage')).toBeEmpty();
    expect(writes).toEqual([]);
  });
}
