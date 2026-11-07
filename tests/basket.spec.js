const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'nexahub.sampleBasket.v1';
const headphones = { name: 'Wireless headphones', price: 3499, quantity: 2 };
const planner = { name: 'Business planner template', price: 850, quantity: 1 };

test.beforeEach(async ({ page }) => {
  // Exercise the real storefront, but basket checks must not depend on
  // third-party CDN availability or make requests to the live auth service.
  await page.route('https://**/*', route => route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#cartCount')).toHaveText('0');
  test.info().annotations.push({ type: 'isolation', description: 'Fresh browser context per test' });
  // Report script crashes even if the remaining UI assertions happen to pass.
  page.__basketErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.__basketErrors, 'storefront has no uncaught JavaScript errors').toEqual([]);
});

async function addProduct(page, name) {
  await page.locator('.product').filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Add to basket', exact: true }).click();
}

async function openBasket(page) {
  await page.locator('button').filter({ has: page.locator('#cartCount') }).click();
  await expect(page.locator('#cartModal')).toBeVisible();
}

async function reloadAndOpen(page) {
  await page.reload();
  await openBasket(page);
}

async function savedBasket(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

async function expectEmpty(page) {
  await expect(page.locator('#cartCount')).toHaveText('0');
  await expect(page.locator('#cartItems')).toHaveText('Your basket is empty.');
  await expect(page.locator('.basket-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear basket', exact: true })).toBeHidden();
  await expect(page.locator('#cartItems')).not.toContainText('Total:');
}

test('restores items, quantities, line totals and basket total after reload', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await expect(page.locator('#cartCount')).toHaveText('3');
  expect(await savedBasket(page)).toEqual([headphones, planner]);

  await reloadAndOpen(page);
  await expect(page.locator('#cartCount')).toHaveText('3');
  await expect(page.locator('.basket-row')).toHaveCount(2);
  await expect(page.getByLabel(`Quantity of ${headphones.name}`, { exact: true })).toHaveText('2');
  await expect(page.getByLabel(`Quantity of ${planner.name}`, { exact: true })).toHaveText('1');
  await expect(page.getByLabel(`Line total for ${headphones.name}`, { exact: true })).toHaveText('KSh 6,998');
  await expect(page.getByLabel(`Line total for ${planner.name}`, { exact: true })).toHaveText('KSh 850');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 7,848');
  await expect(page.locator('#cartNotice')).toBeHidden();
});

test('removal updates count and total and stays removed after reload', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: `Remove ${headphones.name} from basket`, exact: true }).click();
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  expect(await savedBasket(page)).toEqual([planner]);

  await reloadAndOpen(page);
  await expect(page.locator('#cartItems')).not.toContainText(headphones.name);
  await expect(page.locator('.basket-row')).toHaveCount(1);
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  await expect(page.locator('#cartCount')).toHaveText('1');

  await page.getByRole('button', { name: `Remove ${planner.name} from basket`, exact: true }).click();
  await expectEmpty(page);
  await reloadAndOpen(page);
  await expectEmpty(page);
  expect(await savedBasket(page)).toEqual([]);
});

test('clearing a populated basket persists the empty state and allows adding again', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await expectEmpty(page);
  expect(await savedBasket(page)).toEqual([]);
  await reloadAndOpen(page);
  await expectEmpty(page);
  await page.locator('#cartModal .close').click();
  await addProduct(page, planner.name);
  await reloadAndOpen(page);
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  expect(await savedBasket(page)).toEqual([planner]);
});

const invalidData = [
  ['broken JSON', '{not-json'],
  ['null', 'null'],
  ['non-array object', JSON.stringify({ items: [planner] })],
  ['invalid name', JSON.stringify([{ ...planner, name: '   ' }])],
  ['invalid price', JSON.stringify([{ ...planner, price: -850 }])],
  ['non-numeric price', JSON.stringify([{ ...planner, price: '850' }])],
  ['invalid quantity', JSON.stringify([{ ...planner, quantity: 0 }])],
  ['fractional quantity', JSON.stringify([{ ...planner, quantity: 1.5 }])],
  ['combined quantity over limit', JSON.stringify([{ ...planner, quantity: 100 }, headphones])],
  ['unsafe total', JSON.stringify([{ ...planner, price: Number.MAX_SAFE_INTEGER, quantity: 2 }])],
];

for (const clearAll of [false, true]) {
  test(`undo ${clearAll ? 'clearing' : 'row removal'} restores quantities, totals and saved state`, async ({ page }) => {
    await addProduct(page, headphones.name);
    await addProduct(page, headphones.name);
    await addProduct(page, planner.name);
    await openBasket(page);
    await page.getByRole('button', { name: clearAll ? 'Clear basket' : `Remove ${headphones.name} from basket`, exact: true }).click();
    expect(await savedBasket(page)).toEqual(clearAll ? [] : [planner]);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cartUndo')).toBeHidden();
    await expect(page.locator('#cartCount')).toHaveText('3');
    await expect(page.getByLabel(`Quantity of ${headphones.name}`, { exact: true })).toHaveText('2');
    await expect(page.getByLabel(`Line total for ${headphones.name}`, { exact: true })).toHaveText('KSh 6,998');
    await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 7,848');
    expect(await savedBasket(page)).toEqual([headphones, planner]);
    await reloadAndOpen(page);
    await expect(page.locator('#cartCount')).toHaveText('3');
    await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 7,848');
    await expect(page.locator('#cartModal')).toContainText('Sample basket only. Checkout is a preview; no payment will be collected.');
    await page.getByRole('button', { name: 'Continue to checkout (preview)', exact: true }).click();
    await expect(page.locator('#toast')).toHaveText('Checkout is a preview only. No payment will be collected.');
  });
}

test('undo expires after eight seconds and cannot restore the deletion later', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await page.clock.fastForward(7999);
  await expect(page.locator('#cartUndo')).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.locator('#cartUndo')).toBeHidden();
  await page.evaluate(() => undoCartRemoval());
  await expectEmpty(page);
  expect(await savedBasket(page)).toEqual([]);
});

test('only the latest deletion can be undone, with its own expiry', async ({ page }) => {
  await page.clock.install();
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: `Remove ${headphones.name} from basket`, exact: true }).click();
  await page.clock.fastForward(4000);
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await page.clock.fastForward(4001);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await savedBasket(page)).toEqual([planner]);
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
});

test('undo merges restored items without overwriting subsequent basket edits', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await page.locator('#cartModal .close').click();
  await addProduct(page, headphones.name);
  await addProduct(page, 'Everyday travel backpack');
  await openBasket(page);
  await page.getByRole('button', { name: `Increase quantity of ${headphones.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await savedBasket(page)).toEqual([
    { ...headphones, quantity: 4 }, planner,
    { name: 'Everyday travel backpack', price: 2750, quantity: 1 },
  ]);
  await expect(page.locator('#cartCount')).toHaveText('6');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 17,596');
});

test('undo refuses an over-limit restore without losing edits or the pending undo', async ({ page }) => {
  await page.clock.install();
  await page.evaluate(({ key, item }) => localStorage.setItem(key, JSON.stringify([
    { ...item, quantity: 100 }
  ])), { key: STORAGE_KEY, item: headphones });
  await reloadAndOpen(page);
  await page.getByRole('button', { name: `Remove ${headphones.name} from basket`, exact: true }).click();
  await page.locator('#cartModal .close').click();
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#cartUndoMessage')).toContainText('100-item limit');
  expect(await savedBasket(page)).toEqual([planner]);
  await expect(page.locator('#cartCount')).toHaveText('1');
});

test('undo of a full basket keeps increases disabled at the limit', async ({ page }) => {
  await page.evaluate(({ key, item }) => localStorage.setItem(key, JSON.stringify([
    { ...item, quantity: 100 }
  ])), { key: STORAGE_KEY, item: planner });
  await reloadAndOpen(page);
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#cartCount')).toHaveText('100');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 85,000');
  await expect(page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true })).toBeDisabled();
  expect(await savedBasket(page)).toEqual([{ ...planner, quantity: 100 }]);
});

test('another tab receives an undo and invalidates an older pending undo', async ({ page, context }) => {
  const { second, errors } = await openSecondTab(context);
  await addProduct(page, planner.name);
  await openBasket(page);
  await openBasket(second);
  await expect(second.locator('#cartCount')).toHaveText('1');
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await expectEmpty(second);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(second.locator('#cartCount')).toHaveText('1');
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await expectEmpty(second);
  await second.locator('#cartModal .close').click();
  await addProduct(second, headphones.name);
  await expect(page.locator('#cartUndo')).toBeHidden();
  await page.evaluate(() => undoCartRemoval());
  expect(await savedBasket(page)).toEqual([{ ...headphones, quantity: 1 }]);
  expect(errors).toEqual([]);
});

async function openSecondTab(context) {
  const second = await context.newPage();
  await second.route('https://**/*', route => route.abort());
  const errors = [];
  second.on('pageerror', error => errors.push(error.message));
  await second.goto('/');
  return { second, errors };
}

test('two tabs share additions, quantity changes, removals and clearing without reloads', async ({ page, context }) => {
  const { second, errors } = await openSecondTab(context);
  await openBasket(second);
  await addProduct(page, headphones.name);
  await expect(second.locator('#cartCount')).toHaveText('1');
  await expect(second.getByLabel(`Quantity of ${headphones.name}`, { exact: true })).toHaveText('1');
  await expect(second.locator('#cartItems > p')).toHaveText('Total: KSh 3,499');
  await second.getByRole('button', { name: `Increase quantity of ${headphones.name}`, exact: true }).click();
  await expect(page.locator('#cartCount')).toHaveText('2');
  await openBasket(page);
  await expect(page.getByLabel(`Quantity of ${headphones.name}`, { exact: true })).toHaveText('2');
  await expect(page.getByLabel(`Line total for ${headphones.name}`, { exact: true })).toHaveText('KSh 6,998');
  await page.getByRole('button', { name: `Decrease quantity of ${headphones.name}`, exact: true }).click();
  await expect(second.getByLabel(`Quantity of ${headphones.name}`, { exact: true })).toHaveText('1');
  await page.locator('#cartModal .close').click();
  await addProduct(page, planner.name);
  await expect(second.locator('.basket-row')).toHaveCount(2);
  await expect(second.locator('#cartCount')).toHaveText('2');
  await expect(second.locator('#cartItems > p')).toHaveText('Total: KSh 4,349');
  await second.getByRole('button', { name: `Remove ${headphones.name} from basket`, exact: true }).click();
  await openBasket(page);
  await expect(page.locator('.basket-row')).toHaveCount(1);
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartItems')).not.toContainText(headphones.name);
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  await page.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await expectEmpty(second);
  await second.locator('#cartModal .close').click();
  await addProduct(second, planner.name);
  await expect(page.locator('#cartCount')).toHaveText('1');
  expect(await savedBasket(page)).toEqual([planner]);
  expect(errors).toEqual([]);
});

for (const clearAll of [false, true]) {
  test(`external ${clearAll ? 'localStorage clearing' : 'key removal'} empties the other tab`, async ({ page, context }) => {
    const { second, errors } = await openSecondTab(context);
    await openBasket(page);
    await addProduct(second, planner.name);
    await expect(page.locator('#cartCount')).toHaveText('1');
    await second.evaluate(({ key, clearAll }) => {
      if (clearAll) localStorage.clear();
      else localStorage.removeItem(key);
    }, { key: STORAGE_KEY, clearAll });
    await expectEmpty(page);
    expect(errors).toEqual([]);
  });
}

test('cross-tab data is validated and unrelated storage events leave the basket alone', async ({ page, context }) => {
  const { second, errors } = await openSecondTab(context);
  await addProduct(page, planner.name);
  await openBasket(page);
  await second.evaluate(key => {
    localStorage.setItem('unrelated-preference', 'changed');
    sessionStorage.setItem(key, 'invalid');
  }, STORAGE_KEY);
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartNotice')).toBeHidden();
  await second.evaluate(key => localStorage.setItem(key, '{invalid'), STORAGE_KEY);
  await expectEmpty(page);
  await expect(page.locator('#cartNotice')).toContainText('invalid or unreadable');
  expect(await savedBasket(second)).toBeNull();
  // Valid legacy rows still use the same normalization as startup loading.
  await second.evaluate(({ key, item }) => localStorage.setItem(key, JSON.stringify([
    { name: ` ${item.name} `, price: item.price }, item
  ])), { key: STORAGE_KEY, item: planner });
  await expect(page.locator('.basket-row')).toHaveCount(1);
  await expect(page.getByLabel(`Quantity of ${planner.name}`, { exact: true })).toHaveText('2');
  await expect(page.locator('#cartCount')).toHaveText('2');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 1,700');
  expect(errors).toEqual([]);
});

test('receiving another tab’s basket does not hide a local save-error notice or write it back', async ({ page, context }) => {
  const { second, errors } = await openSecondTab(context);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); };
  });
  await addProduct(page, headphones.name);
  await openBasket(page);
  await expect(page.locator('#cartNotice')).toContainText('could not be saved');
  await addProduct(second, planner.name);
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartItems')).not.toContainText(headphones.name);
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  await expect(page.locator('#cartNotice')).toBeVisible();
  await expect(page.locator('#cartNotice')).toContainText('could not be saved');
  expect(await savedBasket(second)).toEqual([planner]);
  expect(errors).toEqual([]);
});

for (const [label, raw] of invalidData) {
  test(`malformed saved data: ${label} is cleared safely`, async ({ page }) => {
    // Write once in this origin; an init script would reinsert corruption on
    // every reload and conceal whether the app really removed it.
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value),
      { key: STORAGE_KEY, value: raw });
    await reloadAndOpen(page);
    await expectEmpty(page);
    await expect(page.locator('#cartNotice')).toBeVisible();
    await expect(page.locator('#cartNotice')).toHaveText(
      'Saved basket data was invalid or unreadable, so it was cleared. Your basket is empty.');
    expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
    await reloadAndOpen(page);
    await expectEmpty(page);
    await expect(page.locator('#cartNotice')).toBeHidden();
    await page.locator('#cartModal .close').click();
    await addProduct(page, planner.name);
    await reloadAndOpen(page);
    await expect(page.locator('#cartCount')).toHaveText('1');
    await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
    expect(await savedBasket(page)).toEqual([planner]);
  });
}
