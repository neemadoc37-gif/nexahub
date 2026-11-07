const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  // Focus behavior must work even when authentication's CDN is unavailable.
  await page.route('https://**/*', route => route.abort());
  page.__dialogErrors = [];
  page.on('pageerror', error => page.__dialogErrors.push(error.message));
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(page.__dialogErrors).toEqual([]);
});

const basketTrigger = page => page.locator('button').filter({ has: page.locator('#cartCount') });

for (const kind of ['basket', 'account']) {
  test(`${kind} traps both Tab directions and restores focus on every close`, async ({ page }) => {
    const trigger = kind === 'basket' ? basketTrigger(page) : page.locator('#accountButton');
    const dialog = page.getByRole('dialog', { name: kind === 'basket' ? 'Your basket' : 'Welcome to NexaHub' });
    const close = page.getByRole('button', { name: `Close ${kind} dialog` });
    const last = kind === 'basket'
      ? page.getByRole('button', { name: 'Continue to checkout (preview)', exact: true })
      : page.locator('#resetPassword');

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(kind === 'basket' ? last : page.locator('#authEmail')).toBeFocused();
    // Background controls cannot receive focus while the dialog is modal.
    await page.locator('#searchInput').evaluate(input => input.focus());
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('.header')).not.toHaveAttribute('inert');

    await page.keyboard.press('Enter');
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('account navigation includes newly shown signup fields and skips busy buttons', async ({ page }) => {
  await page.locator('#accountButton').click();
  await page.locator('#authModeToggle').click();
  await expect(page.getByRole('dialog', { name: 'Create your NexaHub account' })).toBeVisible();
  const close = page.getByRole('button', { name: 'Close account dialog' });
  await close.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#authName')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#authEmail')).toBeFocused();
  await page.evaluate(() => setAuthBusy(true));
  await page.locator('#authPassword').focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#authPassword')).toBeFocused();
  await page.evaluate(() => setAuthBusy(false));
  await page.locator('#authModeToggle').click();
  await close.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#authEmail')).toBeFocused();
});

for (const clearAll of [false, true]) {
  test(`${clearAll ? 'clearing' : 'removing'} basket focuses Undo and keeps recovery navigation inside`, async ({ page }) => {
    await page.locator('.add').first().click();
    await basketTrigger(page).click();
    const action = clearAll ? page.locator('#clearBasket')
      : page.getByRole('button', { name: /^Remove / }).first();
    await action.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#undoBasket')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Close basket dialog' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#undoBasket')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cartUndo')).toBeHidden();
    await expect(page.locator('#clearBasket')).toBeFocused();
    await expect(page.locator('#cartCount')).toHaveText('1');
  });
}

test('Undo expiry moves focus to close and updates the Tab boundaries', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator('.add').first().click();
  await basketTrigger(page).click();
  await page.locator('#clearBasket').click();
  await expect(page.locator('#undoBasket')).toBeFocused();
  await page.clock.fastForward(7999);
  await expect(page.locator('#undoBasket')).toBeFocused();
  await page.clock.fastForward(1);
  await expect(page.locator('#cartUndo')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Close basket dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Continue to checkout (preview)', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close basket dialog' })).toBeFocused();
});

test('Undo expiry after closing never steals focus from the trigger', async ({ page }) => {
  await page.clock.install();
  await page.locator('.add').first().click();
  await basketTrigger(page).click();
  await page.locator('#clearBasket').click();
  await page.keyboard.press('Escape');
  await expect(basketTrigger(page)).toBeFocused();
  await page.clock.fastForward(8001);
  await expect(basketTrigger(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#cartUndo')).toBeHidden();
});

test('dialog itself is a safe focus fallback when no controls are usable', async ({ page }) => {
  await basketTrigger(page).click();
  await page.locator('#cartModal button').evaluateAll(buttons => buttons.forEach(button => button.disabled = true));
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog', { name: 'Your basket' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('dialog', { name: 'Your basket' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(basketTrigger(page)).toBeFocused();
});

test('switching dialogs retains the original trigger and repeated opens do not replace it', async ({ page }) => {
  await basketTrigger(page).click();
  await page.evaluate(() => { openModal('accountModal'); openModal('accountModal'); });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Close account dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(basketTrigger(page)).toBeFocused();
});

test('automatic account opening without a trigger has a usable close fallback', async ({ page }) => {
  await page.goto('/?code=focus-test');
  await expect(page.getByRole('button', { name: 'Close account dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#accountButton')).toBeFocused();
});
