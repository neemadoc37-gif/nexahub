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
    await page.locator('#authSubmit').click();
    expect(await page.locator('#authName').evaluate(input => input.validity.valueMissing)).toBe(true);
    await page.locator('#authModeToggle').click();
    await expect(page.locator('#authName')).toBeHidden();
    await page.locator('#resetPassword').click();
    await expect(page.locator('#authMessage')).toContainText('Enter your email address first');
    await page.getByRole('button', { name: 'Close account dialog' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('#productGrid .product')).toHaveCount(8);
    expect(authMutations).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

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
