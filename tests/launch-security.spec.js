const { test, expect } = require('@playwright/test');

test('security headers protect HTML, API and missing paths without exposing Python version', async ({ request }) => {
  for (const path of ['/', '/register', '/admin', '/api/readiness', '/api/customer/orders', '/not-a-page']) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers.server).not.toContain('Python');
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain("base-uri 'self'");
    expect(headers['content-security-policy']).toContain('https://oixruhlxundtgmhzeysj.supabase.co');
    expect(headers['content-security-policy']).toContain('https://replit.com');
    expect(headers['permissions-policy']).toContain('camera=()');
  }
});

test('cross-site browser writes fail before auth or data operations', async ({ request }) => {
  const result = await request.post('/api/sellers/applications', {
    headers: { Origin: 'https://untrusted.example' },
    data: { store_name: 'Isolated test, not saved' },
  });
  expect(result.status()).toBe(403);
  expect((await result.json()).error.code).toBe('cross_origin_request');
  const callback = await request.post('/api/payments/mpesa/callback', {
    headers: { Origin: 'https://untrusted.example' },
    data: { ResultCode: 0, paid: true },
  });
  expect(callback.status()).toBe(503);
  expect((await callback.json()).error.code).toBe('callbacks_disabled');
});

for (const rejected of [false, true]) {
  test(`FIXTURE: confirmation resend ${rejected ? 'shows provider rejection' : 'uses existing Supabase project'} without creating users`, async ({ page }) => {
    const requests = [];
    await page.route('https://oixruhlxundtgmhzeysj.supabase.co/auth/v1/resend**', async route => {
      requests.push({ body: route.request().postDataJSON(), url: new URL(route.request().url()) });
      await route.fulfill({
        status: rejected ? 429 : 200,
        contentType: 'application/json',
        body: JSON.stringify(rejected ? { code: 'over_email_send_rate_limit', msg: 'Please wait before requesting another email.' } : {}),
      });
    });
    await page.goto('/sign-in');
    await expect.poll(() => page.evaluate(() => typeof nexahubSupabase?.auth?.resend)).toBe('function');
    await page.locator('#resendConfirmation').click();
    await expect(page.locator('#authMessage')).toContainText('Enter your email address');
    expect(requests).toEqual([]);
    await page.locator('#authEmail').fill('fixture@example.invalid');
    await page.locator('#resendConfirmation').click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].body.type).toBe('signup');
    expect(requests[0].body.email).toBe('fixture@example.invalid');
    expect(requests[0].url.searchParams.get('redirect_to')).toBe(new URL(page.url()).origin);
    await expect(page.locator('#authMessage')).toContainText(rejected ? 'Please wait' : 'If an unconfirmed account exists');
    if (rejected) await expect(page.locator('#authMessage')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#resendConfirmation')).toBeEnabled();
  });
}
