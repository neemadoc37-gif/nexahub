const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'nexahub.marketplaceBasket.v2';
const headphones = { name: 'Wireless headphones', price: 3499, quantity: 2 };
const planner = { name: 'Business planner template', price: 850, quantity: 1 };
const testPrices = { [headphones.name]: headphones.price, [planner.name]: planner.price, 'Everyday travel backpack': 2750 };

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
  const price = testPrices[name];
  if (!price) throw new Error(`Missing isolated basket fixture price for ${name}.`);
  await page.evaluate(({ itemName, itemPrice }) => window.addCart(itemName, itemPrice), {
    itemName: name,
    itemPrice: price,
  });
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

async function expectBasketContents(page, items) {
  await expect(page.locator('.basket-row')).toHaveCount(items.length);
  await expect(page.locator('#cartCount')).toHaveText(
    String(items.reduce((sum, item) => sum + item.quantity, 0)));
  for (const item of items) {
    await expect(page.getByLabel(`Quantity of ${item.name}`, { exact: true }))
      .toHaveText(String(item.quantity));
    await expect(page.getByLabel(`Line total for ${item.name}`, { exact: true }))
      .toHaveText(`KSh ${(item.price * item.quantity).toLocaleString('en-KE')}`);
  }
  await expect(page.locator('#cartItems > p')).toHaveText(
    `Total: KSh ${items.reduce((sum, item) => sum + item.price * item.quantity, 0).toLocaleString('en-KE')}`);
}

async function expectBasket(page, items) {
  await expectBasketContents(page, items);
  expect(await savedBasket(page)).toEqual(items);
}

async function expectEmpty(page) {
  await expect(page.locator('#cartCount')).toHaveText('0');
  await expect(page.locator('#cartItems')).toHaveText('You have no selections yet.');
  await expect(page.locator('.basket-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Clear selections', exact: true })).toBeHidden();
  await expect(page.locator('#cartItems')).not.toContainText('Total:');
}

async function expectNoBasketOverflow(page) {
  const layout = await page.locator('#cartModal .modal').evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      // Check all rows, even those below the visible part of the dialog.
      outsideDialog: [...dialog.querySelectorAll('.basket-row, .basket-row *')]
        .filter(element => {
          const box = element.getBoundingClientRect();
          return box.left < rect.left - 1 || box.right > rect.right + 1;
        }).map(element => element.className || element.tagName),
    };
  });
  expect(layout.pageOverflow, 'page has no horizontal overflow').toBeLessThanOrEqual(1);
  expect(layout.dialogOverflow, 'basket has no horizontal overflow').toBeLessThanOrEqual(1);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.outsideDialog, 'row content stays inside the dialog').toEqual([]);
}

async function expectMobileReachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const dialog = element.closest('.modal').getBoundingClientRect();
    const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.left >= dialog.left && box.right <= dialog.right &&
      box.top >= dialog.top && box.bottom <= dialog.bottom &&
      (target === element || element.contains(target));
  }), 'element is inside the scrollport and not covered').toBe(true);
}

async function tapMobile(locator) {
  await expectMobileReachable(locator);
  await locator.tap();
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test.describe(`phone basket at ${viewport.width}px`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('long names, quantity changes, removal and clearing can be recovered with touch', async ({ page }) => {
      // Freeze the Undo deadline so geometry assertions do not race its timer.
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      const longItem = {
        name: `Sample extended product name ${'with detailed specifications '.repeat(3)}`.slice(0, 120).trim(),
        price: 3499,
        quantity: 2,
      };
      const unbrokenItem = { name: 'X'.repeat(120), price: 850, quantity: 1 };
      const original = [longItem, unbrokenItem];
      await page.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify(items)),
        { key: STORAGE_KEY, items: original });
      await reloadAndOpen(page);
      await expectBasket(page, original);
      await expectNoBasketOverflow(page);
      for (const item of original) {
        await expectMobileReachable(page.getByText(item.name, { exact: true }));
        await expectMobileReachable(page.getByLabel(`Line total for ${item.name}`, { exact: true }));
        await expectMobileReachable(page.getByLabel(`Quantity of ${item.name}`, { exact: true }));
      }

      const increase = page.getByRole('button', { name: `Increase quantity of ${longItem.name}`, exact: true });
      const decrease = page.getByRole('button', { name: `Decrease quantity of ${longItem.name}`, exact: true });
      await tapMobile(increase);
      await expectBasket(page, [{ ...longItem, quantity: 3 }, unbrokenItem]);
      await tapMobile(decrease);
      await expectBasket(page, original);
      await expectNoBasketOverflow(page);

      const undo = page.getByRole('button', { name: 'Undo', exact: true });
      await tapMobile(page.getByRole('button', { name: `Remove ${longItem.name} from your selections`, exact: true }));
      await expectBasket(page, [unbrokenItem]);
      await expectMobileReachable(page.locator('#cartUndo'));
      await expectNoBasketOverflow(page);
      await tapMobile(undo);
      await expectBasket(page, original);
      await expect(page.locator('#cartUndo')).toBeHidden();

      await tapMobile(page.getByRole('button', { name: 'Clear selections', exact: true }));
      await expectEmpty(page);
      expect(await savedBasket(page)).toEqual([]);
      await expectMobileReachable(page.locator('#cartUndo'));
      await expectNoBasketOverflow(page);
      await tapMobile(undo);
      await expectBasket(page, original);
      await expectNoBasketOverflow(page);
      await expectMobileReachable(page.locator('#cartItems > p'));

      const checkout = page.getByRole('button', { name: /checkout|place order/i });
      await expect(page.locator('#basketCheckoutNotice')).toContainText(
        'cannot place product orders or service reservations');
      await expect(checkout).toHaveCount(0);
      await expectBasket(page, original);
      await reloadAndOpen(page);
      await expectBasket(page, original);
      await expectNoBasketOverflow(page);
    });

    test('a full large basket scrolls to controls, recovery and totals without offering fake checkout', async ({ page }) => {
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      // Twenty distinct rows reach the existing combined 100-item cap.
      const items = Array.from({ length: 20 }, (_, index) => ({
        name: `Sample product ${index + 1}: ${'LongDescription'.repeat(7)}`.slice(0, 120),
        price: 850 + index,
        quantity: 5,
      }));
      await page.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify(items)),
        { key: STORAGE_KEY, items });
      await reloadAndOpen(page);
      await expectBasket(page, items);
      await expectNoBasketOverflow(page);
      const dialog = page.locator('#cartModal .modal');
      expect(await dialog.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      for (const button of await page.getByRole('button', { name: /^Increase quantity of / }).all()) {
        await expect(button).toBeDisabled();
      }

      const last = items[items.length - 1];
      const decrease = page.getByRole('button', { name: `Decrease quantity of ${last.name}`, exact: true });
      const increase = page.getByRole('button', { name: `Increase quantity of ${last.name}`, exact: true });
      await tapMobile(decrease);
      expect(await dialog.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await expectBasket(page, [...items.slice(0, -1), { ...last, quantity: 4 }]);
      await tapMobile(increase);
      await expectBasket(page, items);
      await expect(increase).toBeDisabled();
      await expectMobileReachable(page.getByLabel(`Quantity of ${last.name}`, { exact: true }));
      await expectMobileReachable(page.getByLabel(`Line total for ${last.name}`, { exact: true }));

      await tapMobile(page.getByRole('button', { name: `Remove ${last.name} from your selections`, exact: true }));
      await expectBasket(page, items.slice(0, -1));
      await expectMobileReachable(page.locator('#cartUndo'));
      await expectNoBasketOverflow(page);
      await tapMobile(page.getByRole('button', { name: 'Undo', exact: true }));
      await expectBasket(page, items);
      await expect(increase).toBeDisabled();
      await expectMobileReachable(page.locator('#cartItems > p'));
      await expectMobileReachable(page.getByRole('button', { name: 'Clear selections', exact: true }));
      await expectMobileReachable(page.locator('#basketCheckoutNotice'));
      await expect(page.getByRole('button', { name: /checkout|place order/i })).toHaveCount(0);
      await expectBasket(page, items);
      await expectNoBasketOverflow(page);
      // Scroll back from the footer: earlier rows must remain usable too.
      await expectMobileReachable(page.getByRole('button', {
        name: `Decrease quantity of ${items[0].name}`, exact: true,
      }));
      await expectNoBasketOverflow(page);
    });
  });
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

test('startup restores legacy rows as trimmed, merged items through edits and reloads', async ({ page }) => {
  const legacyRows = [
    { name: ` \t${headphones.name} `, price: headphones.price },
    { ...planner, name: ` ${planner.name}\n`, quantity: 2 },
    headphones,
    { name: planner.name, price: planner.price },
    { ...headphones, name: ` ${headphones.name}\n`, quantity: 3 },
  ];
  // Seed only once in this page: same-tab writes do not fire storage events.
  // Reload must load these rows before any customer interaction, and later
  // reloads must read actual saved edits rather than re-seeding the fixture.
  await page.evaluate(({ key, rows }) => localStorage.setItem(key, JSON.stringify(rows)),
    { key: STORAGE_KEY, rows: legacyRows });
  const restored = [{ ...headphones, quantity: 6 }, { ...planner, quantity: 3 }];
  await reloadAndOpen(page);
  await expectBasketContents(page, restored);
  await expect(page.locator('.basket-name')).toHaveText([headphones.name, planner.name]);
  await expect(page.locator('#cartCount')).toHaveText('9');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 23,544');
  await expect(page.locator('#cartNotice')).toBeHidden();

  // Loading normalizes in memory without rewriting valid legacy storage.
  expect(await savedBasket(page)).toEqual(legacyRows);
  await reloadAndOpen(page);
  await expectBasketContents(page, restored);

  await page.getByRole('button', { name: `Decrease quantity of ${headphones.name}`, exact: true }).click();
  await expectBasket(page, [{ ...headphones, quantity: 5 }, restored[1]]);
  await page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true }).click();
  const edited = [{ ...headphones, quantity: 5 }, { ...planner, quantity: 4 }];
  await expectBasket(page, edited);
  await reloadAndOpen(page);
  await expectBasket(page, edited);

  // Adding the catalog product must update its normalized row, not duplicate it.
  await page.locator('#cartModal .close').click();
  await addProduct(page, headphones.name);
  await openBasket(page);
  const added = [{ ...headphones, quantity: 6 }, edited[1]];
  await expectBasket(page, added);
  await reloadAndOpen(page);
  await expectBasket(page, added);

  await page.getByRole('button', { name: `Remove ${planner.name} from your selections`, exact: true }).click();
  await expectBasket(page, [added[0]]);
  await reloadAndOpen(page);
  await expectBasket(page, [added[0]]);
  await expect(page.locator('#cartNotice')).toBeHidden();
});

test('quantity increases and decreases update both rows and persist totals after reload', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  const increase = page.getByRole('button', { name: `Increase quantity of ${headphones.name}`, exact: true });
  const decrease = page.getByRole('button', { name: `Decrease quantity of ${headphones.name}`, exact: true });

  await increase.focus();
  await page.keyboard.press('Enter');
  await expect(increase).toBeFocused();
  await expectBasket(page, [headphones, planner]);
  // A second keyboard activation must still reach the replacement button.
  await page.keyboard.press('Space');
  await expect(increase).toBeFocused();
  await expectBasket(page, [{ ...headphones, quantity: 3 }, planner]);
  await page.keyboard.press('Shift+Tab');
  await expect(decrease).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(decrease).toBeFocused();
  await expectBasket(page, [headphones, planner]);

  await page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true }).click();
  const result = [headphones, { ...planner, quantity: 2 }];
  await expectBasket(page, result);
  await reloadAndOpen(page);
  await expectBasket(page, result);
});

test('quantity cannot fall below one and keyboard focus moves to the usable increase control', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, headphones.name);
  await openBasket(page);
  const decrease = page.getByRole('button', { name: `Decrease quantity of ${headphones.name}`, exact: true });
  const increase = page.getByRole('button', { name: `Increase quantity of ${headphones.name}`, exact: true });
  const minimum = [{ ...headphones, quantity: 1 }];

  await decrease.focus();
  await page.keyboard.press('Enter');
  await expect(decrease).toBeDisabled();
  await expect(increase).toBeFocused();
  // Native activation of the disabled button must not remove or decrement the row.
  await decrease.evaluate(button => button.click());
  await expectBasket(page, minimum);
  await reloadAndOpen(page);
  await expectBasket(page, minimum);
  await expect(decrease).toBeDisabled();

  await increase.focus();
  await page.keyboard.press('Space');
  await expect(increase).toBeFocused();
  await expect(decrease).toBeEnabled();
  await page.keyboard.press('Shift+Tab');
  await expect(decrease).toBeFocused();
  await page.keyboard.press('Space');
  await expect(increase).toBeFocused();
  await expectBasket(page, minimum);
});

test('combined 100-item limit disables every increase and recovers after a decrease', async ({ page }) => {
  // Seed just below the boundary; cross it only through the real controls.
  const nearLimit = [{ ...headphones, quantity: 60 }, { ...planner, quantity: 39 }];
  await page.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify(items)),
    { key: STORAGE_KEY, items: nearLimit });
  await reloadAndOpen(page);
  await expectBasket(page, nearLimit);
  const increases = page.getByRole('button', { name: /^Increase quantity of / });
  const plannerIncrease = page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true });
  const plannerDecrease = page.getByRole('button', { name: `Decrease quantity of ${planner.name}`, exact: true });
  for (const button of await increases.all()) await expect(button).toBeEnabled();

  await plannerIncrease.focus();
  await page.keyboard.press('Enter');
  await expect(plannerDecrease).toBeFocused();
  const fullBasket = [nearLimit[0], { ...planner, quantity: 40 }];
  await expectBasket(page, fullBasket);
  for (const button of await increases.all()) {
    await expect(button).toBeDisabled();
    await button.evaluate(element => element.click());
  }
  await expectBasket(page, fullBasket);
  await reloadAndOpen(page);
  await expectBasket(page, fullBasket);
  for (const button of await increases.all()) await expect(button).toBeDisabled();

  // Product-card additions, including a new row, share the same combined cap.
  await page.locator('#cartModal .close').click();
  for (const name of [headphones.name, 'Everyday travel backpack']) {
    await addProduct(page, name);
    await expect(page.locator('#toast')).toHaveText('Your selections have reached the item limit.');
  }
  await openBasket(page);
  await expectBasket(page, fullBasket);

  const headphonesDecrease = page.getByRole('button', { name: `Decrease quantity of ${headphones.name}`, exact: true });
  await headphonesDecrease.focus();
  await page.keyboard.press('Space');
  await expect(headphonesDecrease).toBeFocused();
  const belowLimit = [{ ...headphones, quantity: 59 }, fullBasket[1]];
  await expectBasket(page, belowLimit);
  for (const button of await increases.all()) await expect(button).toBeEnabled();
  await reloadAndOpen(page);
  await expectBasket(page, belowLimit);
  for (const button of await increases.all()) await expect(button).toBeEnabled();

  // Capacity released in one row can be used by a different row.
  await plannerIncrease.focus();
  await page.keyboard.press('Space');
  await expect(plannerDecrease).toBeFocused();
  const result = [belowLimit[0], { ...planner, quantity: 41 }];
  await expectBasket(page, result);
  await reloadAndOpen(page);
  await expectBasket(page, result);
  for (const button of await increases.all()) await expect(button).toBeDisabled();
});

test('removal updates count and total and stays removed after reload', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: `Remove ${headphones.name} from your selections`, exact: true }).click();
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  expect(await savedBasket(page)).toEqual([planner]);

  await reloadAndOpen(page);
  await expect(page.locator('#cartItems')).not.toContainText(headphones.name);
  await expect(page.locator('.basket-row')).toHaveCount(1);
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  await expect(page.locator('#cartCount')).toHaveText('1');

  await page.getByRole('button', { name: `Remove ${planner.name} from your selections`, exact: true }).click();
  await expectEmpty(page);
  await reloadAndOpen(page);
  await expectEmpty(page);
  expect(await savedBasket(page)).toEqual([]);
});

test('clearing a populated basket persists the empty state and allows adding again', async ({ page }) => {
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
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
    await page.getByRole('button', { name: clearAll ? 'Clear selections' : `Remove ${headphones.name} from your selections`, exact: true }).click();
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
      await expect(page.locator('#basketCheckoutNotice')).toContainText(
        'cannot place product orders or service reservations');
    await expect(page.getByRole('button', { name: /checkout|place order/i })).toHaveCount(0);
  });
}

test('undo expires after eight seconds and cannot restore the deletion later', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  await addProduct(page, planner.name);
  await openBasket(page);
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
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
  await page.getByRole('button', { name: `Remove ${headphones.name} from your selections`, exact: true }).click();
  await page.clock.fastForward(4000);
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
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
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
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
  await page.getByRole('button', { name: `Remove ${headphones.name} from your selections`, exact: true }).click();
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
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
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
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
  await expectEmpty(second);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(second.locator('#cartCount')).toHaveText('1');
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
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

for (const decreaseTab of ['first', 'second']) {
  test(`two tabs enforce the combined limit and recover after a decrease in the ${decreaseTab} tab`, async ({ page, context }) => {
    const nearLimit = [{ ...headphones, quantity: 60 }, { ...planner, quantity: 39 }];
    await page.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify(items)),
      { key: STORAGE_KEY, items: nearLimit });
    await reloadAndOpen(page);
    const { second, errors } = await openSecondTab(context);
    await openBasket(second);
    const tabs = [page, second];

    async function expectBoth(items, atLimit) {
      for (const tab of tabs) {
        await expectBasket(tab, items);
        const increases = tab.getByRole('button', { name: /^Increase quantity of / });
        await expect(increases).toHaveCount(items.length);
        for (const button of await increases.all()) {
          if (atLimit) await expect(button).toBeDisabled();
          else await expect(button).toBeEnabled();
        }
      }
    }

    async function expectFullBasketUnchanged(items) {
      await expectBoth(items, true);
      // Native disabled controls must not accept another item in either tab.
      for (const tab of tabs) {
        for (const button of await tab.getByRole('button', { name: /^Increase quantity of / }).all()) {
          await button.evaluate(element => element.click());
        }
      }
      await expectBoth(items, true);
    }

    await expectBoth(nearLimit, false);
    // Both tabs are already open: reaching 100 must disable every increase
    // in the receiving tab through the real storage event, without reloading.
    await page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true }).click();
    const fullBasket = [nearLimit[0], { ...planner, quantity: 40 }];
    await expectFullBasketUnchanged(fullBasket);

    const decreasing = decreaseTab === 'first' ? page : second;
    const increasing = decreaseTab === 'first' ? second : page;
    await decreasing.getByRole('button', { name: `Decrease quantity of ${headphones.name}`, exact: true }).click();
    const belowLimit = [{ ...headphones, quantity: 59 }, fullBasket[1]];
    // Await synchronization before the next write; concurrent-write conflict
    // resolution is deliberately outside this sequential-edit scenario.
    await expectBoth(belowLimit, false);
    for (const tab of tabs) await reloadAndOpen(tab);
    await expectBoth(belowLimit, false);

    // The other tab can use exactly the one newly available slot, even on a
    // different line: this is a combined cap, not a per-product cap.
    await increasing.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true }).click();
    const refilledBasket = [belowLimit[0], { ...planner, quantity: 41 }];
    await expectFullBasketUnchanged(refilledBasket);
    for (const tab of tabs) await reloadAndOpen(tab);
    await expectFullBasketUnchanged(refilledBasket);
    expect(errors, 'second tab has no uncaught JavaScript errors').toEqual([]);
  });
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
  await second.getByRole('button', { name: `Remove ${headphones.name} from your selections`, exact: true }).click();
  await openBasket(page);
  await expect(page.locator('.basket-row')).toHaveCount(1);
  await expect(page.locator('#cartCount')).toHaveText('1');
  await expect(page.locator('#cartItems')).not.toContainText(headphones.name);
  await expect(page.locator('#cartItems > p')).toHaveText('Total: KSh 850');
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
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
  await expect(page.locator('#cartNotice')).toContainText('invalid');
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

async function expectVisitOnlyWarning(page) {
  const notice = page.locator('#cartNotice');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice).toHaveText(
    'Your selections are available for this visit, but could not be saved in this browser.');
}

async function blockBasketSaving(page, failure) {
  // Faults and their restoration are document-local; reload uses real storage.
  await page.evaluate(({ failure, key }) => {
    if (failure === 'writes fail') {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(storageKey, value) {
        if (storageKey === key) throw new DOMException('Storage full', 'QuotaExceededError');
        return setItem.call(this, storageKey, value);
      };
      window.restoreBasketStorage = () => { Storage.prototype.setItem = setItem; };
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('Storage access denied', 'SecurityError'); },
      });
      window.restoreBasketStorage = () => {
        if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
        else delete window.localStorage;
      };
    }
  }, { failure, key: STORAGE_KEY });
}

for (const failure of ['writes fail', 'access unavailable']) {
  for (const clearAll of [false, true]) {
    for (const recovery of ['reload', 'same-document save']) {
      test(`undo ${clearAll ? 'clearing' : 'row removal'} with storage ${failure} preserves visit-only edits until ${recovery}`, async ({ page }) => {
        await addProduct(page, headphones.name);
        await addProduct(page, headphones.name);
        await addProduct(page, planner.name);
        await openBasket(page);
        const original = [headphones, planner];
        await expectBasket(page, original);
        await blockBasketSaving(page, failure);

        await page.getByRole('button', {
          name: clearAll ? 'Clear selections' : `Remove ${headphones.name} from your selections`,
          exact: true,
        }).click();
        if (clearAll) await expectEmpty(page);
        else await expectBasketContents(page, [planner]);
        await expectVisitOnlyWarning(page);

        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expectBasketContents(page, original);
        await expect(page.locator('#cartUndo')).toBeHidden();
        await expectVisitOnlyWarning(page);

        // A post-Undo edit distinguishes the usable in-memory basket from the
        // saved original, even though Undo itself restored the same quantities.
        await page.getByRole('button', { name: `Increase quantity of ${headphones.name}`, exact: true }).click();
        const visitOnly = [{ ...headphones, quantity: 3 }, planner];
        await expectBasketContents(page, visitOnly);
        await expectVisitOnlyWarning(page);
        await page.locator('#cartModal .close').click();
        await openBasket(page);
        await expectBasketContents(page, visitOnly);
        await expectVisitOnlyWarning(page);
        if (failure === 'writes fail') expect(await savedBasket(page)).toEqual(original);

        if (recovery === 'reload') {
          await reloadAndOpen(page);
          await expectBasket(page, original);
          await expect(page.locator('#cartNotice')).toBeHidden();
        } else {
          // Restoring storage alone must not claim that unsaved edits were saved.
          await page.evaluate(() => window.restoreBasketStorage());
          expect(await savedBasket(page)).toEqual(original);
          await expectVisitOnlyWarning(page);
          await page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true }).click();
          const saved = [{ ...headphones, quantity: 3 }, { ...planner, quantity: 2 }];
          await expectBasket(page, saved);
          await expect(page.locator('#cartNotice')).toBeHidden();
          await reloadAndOpen(page);
          await expectBasket(page, saved);
          await expect(page.locator('#cartNotice')).toBeHidden();
        }
      });
    }
  }
}

for (const failure of ['writes fail', 'access unavailable']) {
  for (const operation of ['add', 'remove', 'clear']) {
    test(`${operation} remains usable for this visit when storage ${failure}, without promising persistence`, async ({ page }) => {
      await addProduct(page, headphones.name);
      await addProduct(page, headphones.name);
      await addProduct(page, planner.name);
      await openBasket(page);
      const original = [headphones, planner];
      await expectBasket(page, original);
      await expect(page.locator('#cartNotice')).toBeHidden();

      // Patch only this document, after saving a known basket. Reload removes
      // the fault, so the actual persisted state can be checked independently.
      await blockBasketSaving(page, failure);

      if (operation === 'add') {
        await page.locator('#cartModal .close').click();
        await addProduct(page, headphones.name);
        await openBasket(page);
        await expectBasketContents(page, [{ ...headphones, quantity: 3 }, planner]);
      } else if (operation === 'remove') {
        await page.getByRole('button', { name: `Remove ${headphones.name} from your selections`, exact: true }).click();
        await expectBasketContents(page, [planner]);
        await expect(page.locator('#cartItems')).not.toContainText(headphones.name);
      } else {
        await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
        await expectEmpty(page);
      }
      await expectVisitOnlyWarning(page);

      // Closing and reopening must neither discard the in-memory edit nor
      // dismiss its warning. Further shopping must remain possible as well.
      await page.locator('#cartModal .close').click();
      await openBasket(page);
      await expectVisitOnlyWarning(page);
      if (operation === 'clear') {
        await expectEmpty(page);
        await page.locator('#cartModal .close').click();
        await addProduct(page, planner.name);
        await openBasket(page);
        await expectBasketContents(page, [planner]);
      } else {
        await page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true }).click();
        await expectBasketContents(page, operation === 'add'
          ? [{ ...headphones, quantity: 3 }, { ...planner, quantity: 2 }]
          : [{ ...planner, quantity: 2 }]);
      }
      await expectVisitOnlyWarning(page);
      if (failure === 'writes fail') expect(await savedBasket(page)).toEqual(original);

      // Failed edits really are visit-only: reload restores the old saved
      // basket, including rows that appeared removed or cleared in this visit.
      await reloadAndOpen(page);
      await expectBasket(page, original);
      await expect(page.locator('#cartNotice')).toBeHidden();
      await page.getByRole('button', { name: `Increase quantity of ${planner.name}`, exact: true }).click();
      const recovered = [headphones, { ...planner, quantity: 2 }];
      await expectBasket(page, recovered);
      await expect(page.locator('#cartNotice')).toBeHidden();
      await reloadAndOpen(page);
      await expectBasket(page, recovered);
    });
  }
}

test('storage unavailable at startup still allows visit-only additions, removals and clearing', async ({ page }) => {
  // Run before storefront scripts, and keep access denied through reloads.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage access denied', 'SecurityError'); },
    });
  });
  await reloadAndOpen(page);
  await expectEmpty(page);
  await expect(page.locator('#cartNotice')).toBeVisible();
  await expect(page.locator('#cartNotice')).toContainText('could not be accessed');

  await page.locator('#cartModal .close').click();
  await addProduct(page, headphones.name);
  await addProduct(page, planner.name);
  await openBasket(page);
  await expectBasketContents(page, [{ ...headphones, quantity: 1 }, planner]);
  await expectVisitOnlyWarning(page);
  await page.getByRole('button', { name: `Remove ${headphones.name} from your selections`, exact: true }).click();
  await expectBasketContents(page, [planner]);
  await expectVisitOnlyWarning(page);
  await page.getByRole('button', { name: 'Clear selections', exact: true }).click();
  await expectEmpty(page);
  await expectVisitOnlyWarning(page);
  await page.locator('#cartModal .close').click();
  await addProduct(page, planner.name);
  await openBasket(page);
  await expectBasketContents(page, [planner]);
  await expectVisitOnlyWarning(page);

  await reloadAndOpen(page);
  await expectEmpty(page);
  await expect(page.locator('#cartNotice')).toBeVisible();
  await expect(page.locator('#cartNotice')).toContainText('could not be accessed');
});

for (const failure of ['storage getter', 'getItem']) {
  test(`startup access denied by ${failure} leaves saved basket untouched`, async ({ page }) => {
    const raw = JSON.stringify([planner]);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw });
    await page.addInitScript(({ key, failure }) => {
      const storage = window.localStorage;
      const read = storage.getItem.bind(storage);
      let removals = 0;
      Storage.prototype.removeItem = () => { removals++; };
      window.inspectBlockedBasket = () => ({ raw: read(key), removals });
      if (failure === 'storage getter') {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new DOMException('Storage access denied', 'SecurityError'); },
        });
      } else {
        Storage.prototype.getItem = () => { throw new DOMException('Storage access denied', 'SecurityError'); };
      }
    }, { key: STORAGE_KEY, failure });

    for (let visit = 0; visit < 2; visit++) {
      await reloadAndOpen(page);
      await expectEmpty(page);
      await expect(page.locator('#cartNotice')).toHaveText(
        'Saved selections could not be accessed in this browser. No saved items are available for this visit.');
      await expect(page.locator('#toast')).toHaveText(
        'Saved selections could not be accessed. No saved data was cleared.');
      expect(await page.evaluate(() => window.inspectBlockedBasket())).toEqual({ raw, removals: 0 });
    }
  });
}

for (const [label, raw] of [['invalid JSON', '{invalid'], ['invalid basket structure', '{}']]) {
  test(`startup ${label} with failed cleanup reports retained data`, async ({ page }) => {
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw });
    await page.addInitScript(() => {
      Storage.prototype.removeItem = () => { throw new DOMException('Storage access denied', 'SecurityError'); };
    });

    for (let visit = 0; visit < 2; visit++) {
      await reloadAndOpen(page);
      await expectEmpty(page);
      await expect(page.locator('#cartNotice')).toHaveText(
        'Saved selection data was invalid, but could not be cleared in this browser.');
      await expect(page.locator('#toast')).toHaveText('Invalid saved selection data could not be cleared.');
      expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw);
    }
    // Cleanup failing must not prevent shopping or replacing invalid data
    // when saving is still available.
    await page.locator('#cartModal .close').click();
    await addProduct(page, planner.name);
    await reloadAndOpen(page);
    await expectBasket(page, [planner]);
    await expect(page.locator('#cartNotice')).toBeHidden();
  });
}

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
      'Saved selection data was invalid, so it was cleared.');
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
