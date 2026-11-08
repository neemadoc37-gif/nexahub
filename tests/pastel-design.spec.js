const { test, expect } = require('@playwright/test');

const categories = [
  ['supermarkets', 'Supermarkets'],
  ['restaurants', 'Restaurants'],
  ['pharmacies', 'Pharmacies'],
  ['electronics', 'Electronics'],
  ['fashion', 'Fashion'],
  ['home-living', 'Home & living'],
  ['services', 'Professional services'],
  ['digital-products', 'Digital products'],
  ['travel', 'Travel & experiences'],
];

for (const width of [320, 402, 1280]) {
  test(`premium storefront and nine categories fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const theme = await page.evaluate(() => {
      const color = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
      return {
        hasTopbar: document.querySelector('.topbar') !== null,
        header: color('.header'),
        page: color('body'),
        hero: getComputedStyle(document.querySelector('.hero-image')).backgroundImage,
        categoryCards: [...document.querySelectorAll('.cat')].map(node => getComputedStyle(node).backgroundColor),
        fits: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(theme.hasTopbar).toBe(false);
    expect(theme.header).toBe('rgb(255, 255, 255)');
    expect(theme.page).toBe('rgb(255, 250, 242)');
    expect(theme.hero).toContain('spinix-one-marketplace-hero.jpg');
    expect(theme.hero).not.toContain('nexahub-editorial-stilllife');
    expect(new Set(theme.categoryCards)).toEqual(new Set(['rgb(255, 255, 255)']));
    expect(theme.fits).toBe(true);

    await expect(page.locator('.hero h1')).toContainText('Spinix One');
    await expect(page.locator('.header .logo img')).toHaveAttribute('src', '/assets/brand/spinix-one-logo.svg');
    await expect(page.locator('.categories .cat')).toHaveCount(categories.length);
    await expect(page.locator('.categories .cat-photo')).toHaveCount(categories.length);
    await expect(page.locator('.nearby-section, .marketplace-scene')).toHaveCount(0);
    await expect(page.getByText('A MARKETPLACE FOR EVERY DAY')).toHaveCount(0);
    const firstSections = await page.locator('body > main:not(#platformMount) > section').evaluateAll(nodes => nodes.slice(0, 3).map(node => node.classList[0]));
    expect(firstSections).toEqual(['hero', 'about-section', 'category-section']);
    const pageNav = await page.locator('.platform-nav a').allTextContents();
    expect(pageNav.slice(0, 3).map(label => label.trim())).toEqual(['Home', 'About us', 'Shop the catalog']);
    await expect(page.locator('#paymentHeading')).toContainText('Checkout is not enabled yet');
    await expect(page.locator('#payment-information')).toContainText('not being accepted in this Preview');
    await expect(page.locator('.platform-nav a[href="/admin"]')).toHaveCount(0);
    for (const [slug, label] of categories) {
      await expect(page.locator(`.categories a[href="/catalog?category=${slug}"]`)).toContainText(label);
      await expect(page.locator(`.nav a[href="/catalog?category=${slug}"]`)).toContainText(label);
    }
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(page.locator('#productGrid, .sample-section')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/SAMPLE|Add to sample basket/i);

    await page.locator('#accountButton').click();
    await expect(page.locator('#accountModal')).toBeVisible();
    await page.getByRole('button', { name: 'Close account dialog' }).click();
    await page.locator('#marketplaceSearch').fill('premium journey check');
    await page.locator('.live-search button[type="submit"]').click();
    await expect(page).toHaveURL(/\/catalog\?q=premium(?:\+|%20)journey(?:\+|%20)check/);
    await expect(page.locator('#platformMount')).toBeVisible();
  });
}

test('legacy demo basket entries do not appear as real products or get deleted', async ({ page }) => {
  const legacyEntry = JSON.stringify([{ name: 'Wireless headphones', price: 3499, quantity: 1 }]);
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('nexahub.sampleBasket.v1', value), legacyEntry);
  await page.reload();
  await expect(page.locator('#cartCount')).toHaveText('0');
  await expect(page.locator('#liveProducts')).not.toContainText('Wireless headphones');
  await expect(page.locator('#productGrid, .sample-section')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open my selections' }).click();
  await expect(page.locator('#cartItems')).toHaveText('You have no selections yet.');
  await expect(page.locator('#basketCheckoutNotice')).toContainText('Guest checkout is not enabled yet');
  expect(await page.evaluate(() => localStorage.getItem('nexahub.sampleBasket.v1'))).toBe(legacyEntry);
});

test('the retired staged product image is no longer publicly served', async ({ request }) => {
  expect((await request.get('/assets/marketplace/marketplace-hero.jpg')).status()).toBe(200);
  expect((await request.get('/assets/marketplace/nexahub-editorial-stilllife.jpg')).status()).toBe(404);
});
