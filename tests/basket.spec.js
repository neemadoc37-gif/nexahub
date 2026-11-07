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
