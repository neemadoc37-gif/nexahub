const { test, expect } = require('@playwright/test');

for (const width of [320, 402, 1280]) {
  test(`redesigned Preview loads assets and customer navigation without overflow at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('.hero h1')).toContainText('Spinix One');
    await expect(page.locator('#liveProducts')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#liveBusinesses')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
    await expect(page.locator('.header')).not.toContainText('dashboard');
    await expect(page.locator('.header')).not.toContainText('Workspaces');
    await expect(page.locator('.categories .cat')).toHaveCount(9);
    await expect(page.locator('.categories .cat strong')).toHaveText([
      'Supermarkets', 'Restaurants', 'Pharmacies', 'Electronics',
      'Fashion', 'Home & living', 'Professional services',
      'Digital products', 'Travel & experiences',
    ]);
    await expect(page.locator('#paymentHeading')).toContainText('Checkout is not enabled yet');
    await expect(page.locator('#productGrid, .sample-section')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/SAMPLE|Add to sample basket/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const path of ['/assets/marketplace.css', '/assets/storefront.js', '/assets/brand/spinix-one-logo.svg', '/assets/marketplace/marketplace-hero.jpg', '/assets/marketplace/spinix-one-marketplace-hero.jpg']) {
      expect((await request.get(path)).status()).toBe(200);
    }
    expect((await request.get('/assets/marketplace/nexahub-editorial-stilllife.jpg')).status()).toBe(404);
    expect(errors).toEqual([]);
  });
}

test('homepage shows marketplace photography without the old Discover closer badge', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('.heroart')).toHaveAttribute('aria-label', /fresh groceries.*electronics/i);
  await expect(page.locator('.hero-stamp, .hero-caption')).toHaveCount(0);
  await expect(page.locator('.hero-image')).toHaveCSS('background-image', /spinix-one-marketplace-hero\.jpg/);
  await expect(page.locator('.nearby-section, .marketplace-scene')).toHaveCount(0);
  await expect(page.getByText('A MARKETPLACE FOR EVERY DAY')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'More than shopping.' })).toHaveCount(0);
  const sections = await page.locator('body > main:not(#platformMount) > section').evaluateAll(nodes => nodes.slice(0, 3).map(node => node.classList[0]));
  expect(sections).toEqual(['hero', 'about-section', 'category-section']);
  const pageLinks = await page.locator('.platform-nav a').allTextContents();
  expect(pageLinks.slice(0, 3).map(label => label.trim())).toEqual(['Home', 'About us', 'Shop the catalog']);
  await expect(page.locator('.nav a[href="/catalog"]')).toHaveCount(0);
  expect((await request.get('/assets/marketplace/spinix-one-marketplace-hero.jpg')).status()).toBe(200);
});

test('each marketplace category has a matching photo that loads', async ({ page }) => {
  await page.goto('/');
  const photos = page.locator('.categories .cat-photo');
  await expect(photos).toHaveCount(9);
  await photos.evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await expect.poll(
    () => photos.evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length),
    { timeout: 20000 },
  ).toBe(9);
});

test('homepage presents the About story once after the welcome hero', async ({ page }) => {
  await page.goto('/#about');
  const section = page.locator('#about');
  await expect(section.getByRole('heading', { level: 2 })).toHaveText('About SPINIX ONE');
  await expect(section).not.toContainText('Connecting Businesses. Empowering People.');
  await expect(section).toContainText('SPINIX ONE is a global marketplace designed to bring shopping, services and digital products together in one convenient destination.');
  await expect(section).toContainText('We connect customers with businesses, independent sellers and digital creators');
  await expect(section).toContainText('Whether you are shopping for everyday essentials, exploring new brands, booking a service or discovering digital products');
  await expect(section).toContainText('Showcase products and services, build an online presence and connect with potential customers.');
  await expect(section).toContainText('Discover a convenient range of products and services from businesses around the world.');
  await expect(page.locator('.hero-note')).toContainText('Connecting Businesses. Empowering People.');
  await expect(page.locator('.seller-section')).not.toContainText(/Connecting Businesses\. Empowering People\./i);
  await expect(page.locator('.footer')).toContainText('Connecting Businesses. Empowering People.');
});

test('dedicated About page presents brand principles and seller invitation', async ({ page }) => {
  await page.goto('/about');
  const about = page.locator('#platformMount .about-page');
  await expect(about.getByRole('heading', { level: 1, name: 'Welcome to SPINIX ONE' })).toBeVisible();
  await expect(about).toContainText(/Connecting Businesses\. ?Empowering People\./);
  await expect(about.locator('.about-vision')).toContainText('OUR VISION');
  await expect(about.locator('.about-mission')).toContainText('OUR MISSION');
  await expect(about.locator('.about-goals li')).toHaveCount(7);
  await expect(about.locator('.about-value')).toHaveCount(6);
  await expect(about.locator('.about-seller-invitation')).toContainText(/empower/i);
  await expect(page.locator('.platform-nav a[data-workspace="about"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.footer')).toContainText('SPINIX ONE connects customers with businesses');

  await page.goto('/seller');
  await expect(page.locator('.platform-hero')).toContainText('Connecting Businesses. Empowering People.');
});

test('Mystery Box remains a locked concept until rewards and approvals are ready', async ({ page, request }) => {
  await page.goto('/');
  const section = page.locator('#mystery-box');
  await expect(section.getByRole('heading', { level: 2 })).toHaveText('YOUR NEXT SURPRISE COULD BE AMAZING!');
  await expect(section.locator('.mystery-price')).toContainText('ONE BOX · ONE PRICE');
  await expect(section.locator('.mystery-price strong')).toHaveText('KSh 299');
  await expect(section.locator('.mystery-box-art')).toHaveCount(1);
  await expect(section.locator('.mystery-reward')).toHaveCount(7);
  await expect(section).toContainText('US$100 cash bundle (concept)');
  await expect(section).toContainText('KSh 100,000 in KSh 1,000 notes (concept)');
  await expect(section).toContainText('iPhone 16 Pro Max (concept)');
  await expect(section).toContainText('Samsung Galaxy S25 Ultra (concept)');
  await expect(section).toContainText('HP Laptop 15 (concept)');
  await expect(section.locator('.mystery-disclaimer')).toContainText('These photos illustrate possible reward types only');
  await expect(section.locator('.mystery-disclaimer')).toContainText('No prize inventory is confirmed or available');
  await expect(section.getByRole('button', { name: 'PAY KSh 299 TO UNLOCK THE BOX' })).toBeDisabled();
  await expect(section).toContainText('No real-money entries are accepted');
  await expect(section).toContainText('Admin reward inventory');
  expect((await request.get('/assets/marketplace/spinix-mystery-box.svg')).status()).toBe(200);

  await section.scrollIntoViewIfNeeded();
  const prizePhotos = section.locator('.mystery-reward-photo');
  await expect(prizePhotos).toHaveCount(7);
  await prizePhotos.evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
  await expect.poll(
    () => prizePhotos.evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length),
    { timeout: 20000 },
  ).toBe(7);
  for (const asset of [
    'spinix-reward-voucher.jpg',
    'spinix-reward-cash-usd.jpg',
    'spinix-reward-cash-ksh.jpg',
    'spinix-reward-iphone-16-pro-max.jpg',
    'spinix-reward-samsung-s25-ultra.jpg',
    'spinix-reward-hp-laptop-15.jpg',
    'spinix-reward-smartwatch.jpg',
  ]) {
    expect((await request.get(`/assets/marketplace/rewards/${asset}`)).status()).toBe(200);
  }
});

test('Spin & Win preview has exact sector counts and cannot assign a result', async ({ page }) => {
  await page.goto('/');
  const wheel = page.locator('.mystery-wheel-preview');
  const box = page.locator('.mystery-box-panel');
  await expect(box).toContainText('The wheel is inside the box and appears after verified payment unlocks it');
  await expect(wheel).toBeAttached();
  await expect(wheel).toBeHidden();
  await expect(wheel.locator('#mysteryWheelHeading')).toHaveText('The Spin & Win wheel');
  const segments = wheel.locator('.mystery-wheel-segment');
  const labels = await segments.evaluateAll(items => items.map(item =>
    item.innerHTML.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  ));
  expect(labels).toHaveLength(10);
  expect(labels.filter(label => label === 'ONE SPIN')).toHaveLength(1);
  expect(labels.filter(label => label === 'TRY AGAIN 1')).toHaveLength(1);
  expect(labels.filter(label => label === 'TRY AGAIN 2')).toHaveLength(1);
  for (const prize of ['CARREFOUR', 'US$100', 'KSh 100,000', 'iPHONE 16', 'SAMSUNG', 'HP LAPTOP', 'SMART']) {
    await expect(segments.filter({ hasText: prize })).toHaveCount(1);
  }
  await expect(wheel.locator('.mystery-wheel-pointer')).toBeAttached();
  await expect(wheel).toContainText('READY AFTER PAYMENT');
  await expect(wheel.locator('.mystery-wheel-button')).toBeDisabled();
  await expect(wheel).toContainText('Once a verified payment unlocks the box');
  await expect(wheel).toContainText('no payment, congratulations, spin or prize record is created here');
});

test('anonymous direct admin visits reveal no dashboard or private controls', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.locator('#platformMount h1')).toHaveText('This page is unavailable');
  await expect(page.locator('#platformMount')).not.toContainText('Owner management');
  await expect(page.locator('#platformMount')).not.toContainText('Restricted action request');
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await expect(page.locator('.platform-nav a[href="/admin"]')).toHaveCount(0);
  for (const path of ['/api/admin', '/api/account/access', '/api/customer/profile']) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

test('FIXTURE: homepage uses only published listings and their genuine media', async ({ page }) => {
  const seller = '11111111-1111-4111-8111-111111111111';
  const product = '22222222-2222-4222-8222-222222222222';
  const textOnlyProduct = '33333333-3333-4333-8333-333333333333';
  await page.route('**/api/catalog**', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      products: [
        { id: product, seller_id: seller, title: 'Isolated published listing', status: 'published', price: 50, currency: 'KES', listing_type: 'service', description: '<b>Literal fixture text</b>', image_url: '/assets/brand/spinix-one-icon.svg' },
        { id: textOnlyProduct, seller_id: seller, title: 'Listing without a photo', status: 'published', price: 19.99, currency: 'USD', listing_type: 'digital', image_url: '' },
      ],
      categories: [], limit: 50,
    }),
  }));
  await page.route('**/api/businesses', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ businesses: [
      { id: seller, store_name: 'Isolated approved store', description: 'Not an actual merchant', status: 'approved' },
      { id: product, store_name: 'Pending fixture must not appear', status: 'pending' },
    ] }),
  }));
  await page.goto('/');
  await expect(page.locator('#liveProducts .market-card')).toHaveCount(2);
  await expect(page.locator('#liveProducts')).toContainText('<b>Literal fixture text</b>');
  await expect(page.locator('#liveProducts b')).toHaveCount(0);
  const imageCard = page.locator(`#liveProducts a[href="/catalog?product=${product}"]`);
  await expect(imageCard.locator('.market-card-art img')).toHaveAttribute('src', /spinix-one-icon\.svg$/);
  await expect(imageCard).toContainText('Ksh');
  const noImageCard = page.locator(`#liveProducts a[href="/catalog?product=${textOnlyProduct}"]`);
  await expect(noImageCard).toContainText('19.99');
  await expect(noImageCard.locator('.market-card-art')).toHaveCount(0);
  await expect(page.locator('#liveBusinesses .business-card')).toHaveCount(1);
  await expect(page.locator('#liveBusinesses')).not.toContainText('Pending fixture');
  await page.locator('#liveBusinesses .business-card').click();
  await expect(page).toHaveURL(new RegExp('seller=' + seller));
  await expect(page.locator('#platformMount')).toContainText('selected business');
});

test('FIXTURE: unavailable live inventory is explicit and can be retried without sample substitution', async ({ page }) => {
  let fail = true;
  await page.route('**/api/catalog', route => route.fulfill({
    status: fail ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(fail ? { error: { message: 'Isolated failure' } } : { products: [], categories: [] }),
  }));
  await page.route('**/api/businesses', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ businesses: [] }),
  }));
  await page.goto('/');
  await expect(page.locator('#liveProducts')).toContainText('could not be loaded');
  await expect(page.locator('#liveProducts .product')).toHaveCount(0);
  await expect(page.locator('#productGrid, .sample-section')).toHaveCount(0);
  fail = false;
  await page.locator('#liveProducts').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#liveProducts')).toContainText('no live listings');
  await expect(page.locator('#liveBusinesses')).toContainText('No approved businesses');
});

test('FIXTURE: editable admin metadata cannot reveal an internal dashboard', async ({ page }) => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'fixture@example.invalid', user_metadata: { role: 'admin' },
  };
  await page.route('https://oixruhlxundtgmhzeysj.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/token')
      ? { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user }
      : path.startsWith('/rest/') ? [{ display_name: 'Isolated customer', phone: '' }] : user;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/account/access', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ admin: false }),
  }));
  await page.route('**/api/admin', route => route.fulfill({
    status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Owner access required' } }),
  }));
  await page.goto('/sign-in');
  await page.locator('#authEmail').fill(user.email);
  await page.locator('#authPassword').fill('IsolatedFixturePassword!2026');
  await page.locator('#authSubmit').click();
  await expect(page.locator('#accountButton')).toHaveText('My account');
  await page.keyboard.press('Escape');
  await page.goto('/admin');
  await expect(page.locator('#platformMount h1')).toHaveText('This page is unavailable');
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  await expect(page.locator('#platformMount')).not.toContainText('Restricted action request');
});
