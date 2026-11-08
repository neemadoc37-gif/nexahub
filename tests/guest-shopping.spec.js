const { test, expect } = require('@playwright/test');

const physicalId = '33333333-3333-4333-8333-333333333333';
const digitalId = '44444444-4444-4444-8444-444444444444';
const serviceId = '55555555-5555-4555-8555-555555555555';
const categoryId = '66666666-6666-4666-8666-666666666666';

const products = [
  { id: physicalId, title: 'Guest fixture kettle', description: 'Test listing only.', listing_type: 'physical', price: 1250, currency: 'KES', category_id: categoryId, status: 'published' },
  { id: digitalId, title: 'Guest fixture guide', description: 'Test digital listing only.', listing_type: 'digital', price: 12.5, currency: 'USD', category_id: categoryId, status: 'published' },
  { id: serviceId, title: 'Guest fixture consultation', description: 'Test service listing only.', listing_type: 'service', price: 40, currency: 'USD', category_id: categoryId, status: 'published' },
];

async function useCatalogFixtures(page) {
  await page.route('https://**/*', route => route.abort());
  await page.route(/\/api\/catalog(?:\/[^?]*)?(?:\?.*)?$/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          products, categories: [{ id: categoryId, name: 'Test products', slug: 'test-products' }],
          limit: 50, selected_category_id: null, category_unavailable: false,
        }),
      });
      return;
    }
    const product = products.find(item => item.id === path.split('/').pop());
    await route.fulfill(product
      ? { status: 200, contentType: 'application/json', body: JSON.stringify({ product }) }
      : { status: 404, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Not found' } }) });
  });
}

test('guests can add published products to a persistent, currency-aware basket without placing orders', async ({ page }) => {
  const mutations = [];
  page.on('request', request => {
    if (request.method() !== 'GET') mutations.push(new URL(request.url()).pathname);
  });
  await useCatalogFixtures(page);
  await page.goto('/catalog');

  const mount = page.locator('#platformMount');
  await expect(mount.getByRole('heading', { name: 'Published catalog' })).toBeVisible();
  await expect(mount.locator('.platform-product')).toHaveCount(3);
  await mount.getByRole('button', { name: 'Add Guest fixture kettle to selections' }).click();
  await mount.getByRole('button', { name: 'Add Guest fixture guide to selections' }).click();

  const serviceCard = mount.locator('.platform-product').filter({ hasText: 'Guest fixture consultation' });
  await expect(serviceCard).toContainText('Service bookings are not enabled yet');
  await expect(serviceCard.getByRole('button', { name: /Add .* to selections/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Open my selections' }).click();
  await expect(page.locator('#basketCheckoutNotice')).toContainText('Guest checkout is not enabled yet');
  await expect(page.locator('#cartItems')).toContainText('Guest fixture kettle');
  await expect(page.locator('#cartItems')).toContainText('KSh 1,250');
  const usd = await page.evaluate(() => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(12.5));
  await expect(page.locator('#cartItems')).toContainText(usd);
  await expect(page.locator('#cartItems')).toContainText('Total:');

  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'nexahub.marketplaceBasket.v2');
  expect(saved).toEqual([
    { name: 'Guest fixture kettle', price: 1250, quantity: 1, productId: physicalId, currency: 'KES' },
    { name: 'Guest fixture guide', price: 12.5, quantity: 1, productId: digitalId, currency: 'USD' },
  ]);
  expect(mutations).toEqual([]);

  await page.reload();
  await page.getByRole('button', { name: 'Open my selections' }).click();
  await expect(page.locator('#cartItems')).toContainText('Guest fixture kettle');
  await expect(page.locator('#cartItems')).toContainText('Guest fixture guide');
  expect(mutations).toEqual([]);
});

test('digital product details do not claim a secure download', async ({ page }) => {
  await useCatalogFixtures(page);
  await page.goto(`/catalog?product=${digitalId}`);
  const mount = page.locator('#platformMount');
  await expect(mount.getByRole('heading', { name: 'Product details' })).toBeVisible();
  await expect(mount).toContainText('Secure digital delivery is not enabled');
  await expect(mount.getByRole('button', { name: 'Add Guest fixture guide to selections' })).toBeVisible();
});
