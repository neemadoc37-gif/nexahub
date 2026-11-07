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
