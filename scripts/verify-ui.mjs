/**
 * CityGuide browser verification.
 *
 * Drives the real application in a real browser against the running API and the
 * real database. It exists to catch what a successful build cannot: React
 * runtime errors, broken interactions, and flows that only fail once state and
 * network calls are involved.
 *
 * It also refreshes the screenshots referenced by the README.
 *
 *   pnpm run verify:ui [baseUrl]
 *
 * Prerequisites:
 *   1. The API must be running and serving the built SPA:
 *        pnpm run build && pnpm run start
 *   2. Playwright must be able to launch a browser. An installed Chrome is used
 *      when available (no download); otherwise install the bundled Chromium:
 *        pnpm exec playwright install chromium
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright is an optional development dependency rather than a declared one,
 * so a production install does not carry it. The import is dynamic so a missing
 * package produces instructions instead of a module-resolution stack trace.
 */
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'Playwright is required for browser verification but is not installed.\n\n' +
      '  pnpm add -D playwright\n' +
      '  pnpm exec playwright install chromium\n\n' +
      'If Google Chrome or Microsoft Edge is already installed, only the first\n' +
      'command is needed — the script will use the installed browser.\n',
  );
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:4000';
const SHOT_DIR = process.argv[3] ?? path.join(repoRoot, 'docs', 'screenshots');

const DESKTOP = { width: 1440, height: 950 };
const MOBILE = { width: 390, height: 844 };

/**
 * Launches a browser, preferring a Chrome already installed on the machine so
 * no large download is needed. Falls back to Playwright's bundled Chromium.
 */
async function launchBrowser() {
  const attempts = [
    { channel: 'chrome', label: 'installed Google Chrome' },
    { channel: 'msedge', label: 'installed Microsoft Edge' },
    { label: 'bundled Chromium' },
  ];

  const problems = [];

  for (const attempt of attempts) {
    try {
      const browser = await chromium.launch({
        headless: true,
        ...(attempt.channel ? { channel: attempt.channel } : {}),
      });
      console.log(`Browser: ${attempt.label}\n`);
      return browser;
    } catch (error) {
      problems.push(`${attempt.label}: ${error.message.split('\n')[0]}`);
    }
  }

  console.error('Could not launch a browser.\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nInstall one with:  pnpm exec playwright install chromium');
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(Math.min(title.length, 70)));
}

/** Console and page errors collected across the whole run. */
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`[${label}] ${message.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(`[${label}] ${error.message.slice(0, 300)}`);
  });
  page.on('response', (response) => {
    // 404s for remote images are expected and not application failures.
    if (response.status() >= 500) {
      failedRequests.push(`[${label}] ${response.status()} ${response.url()}`);
    }
  });
}

/**
 * Screenshots the whole page.
 *
 * Attraction photography is lazy-loaded, so a full-page capture taken without
 * scrolling shows empty placeholders for everything below the fold. Scrolling
 * through the page first, then waiting for the images to settle, produces a
 * screenshot that reflects what a user actually sees.
 */
async function shot(page, name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let offset = 0; offset < document.body.scrollHeight; offset += step) {
      window.scrollTo(0, offset);
      await new Promise((resolve) => setTimeout(resolve, 140));
    }
    window.scrollTo(0, 0);
  });

  // Give any images that just entered the viewport time to decode.
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('img')].every((image) => image.complete),
      { timeout: 12_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });
}

/** Counts attraction images that actually decoded. */
async function imageStats(page) {
  return page.evaluate(() => {
    const images = [...document.querySelectorAll('article img')];
    return {
      total: images.length,
      loaded: images.filter((image) => image.complete && image.naturalWidth > 0).length,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Run                                                                         */
/* -------------------------------------------------------------------------- */

const browser = await launchBrowser();

try {
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 1,
    locale: 'en-GB',
  });

  const page = await context.newPage();
  watch(page, 'desktop');

  /* --- Landing ----------------------------------------------------------- */
  section('Landing page');

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

  check(
    'hero headline renders',
    await page.getByRole('heading', { name: /discover the city/i }).isVisible(),
  );

  // Featured attractions must come from the database, not a hard-coded list.
  const featuredCards = page.locator('article').filter({ hasText: 'View details' });
  const featuredCount = await featuredCards.count();
  check('featured attractions load from the API', featuredCount >= 3, `found ${featuredCount}`);

  const firstFeaturedName = (await featuredCards.first().locator('h3').innerText()).trim();
  check('a featured attraction has a real name', firstFeaturedName.length > 2, firstFeaturedName);

  const categoryTiles = page.locator('a[href*="category="]');
  check('category tiles render', (await categoryTiles.count()) >= 6);

  check(
    'footer attribution is present',
    await page.getByRole('link', { name: /OpenStreetMap contributors/i }).first().isVisible(),
  );

  await shot(page, '01-landing.png');

  // `shot` scrolls the page, so lazy images have had their chance to load.
  const landingImages = await imageStats(page);
  check(
    'attraction photography actually decodes',
    landingImages.loaded >= 4,
    `${landingImages.loaded}/${landingImages.total} images loaded`,
  );

  /* --- Attractions catalogue -------------------------------------------- */
  section('Attraction catalogue');

  await page.goto(`${BASE_URL}/attractions`, { waitUntil: 'networkidle' });

  const resultText = await page.locator('text=/attractions? (match|in the catalogue)/').first().innerText();
  check('result count is displayed', /\d/.test(resultText), resultText);

  const cardsBefore = await page.locator('article').count();
  check('catalogue lists attractions', cardsBefore >= 12, `${cardsBefore} cards`);

  // Search
  const searchBox = page.getByLabel('Search attractions');
  await searchBox.fill('museum');
  await page.waitForTimeout(900); // debounce + fetch

  check('search term is reflected in the URL', page.url().includes('search=museum'), page.url());

  const searchedNames = await page.locator('article h3').allInnerTexts();
  check('search returns only matching results', searchedNames.length > 0 && searchedNames.length < cardsBefore,
    `${searchedNames.length} results`);
  // Search deliberately spans name, description, address and category, so the
  // assertion checks the term appears somewhere in each card rather than
  // assuming it must be in the title.
  const searchedCards = await page.locator('article').allInnerTexts();
  check(
    'every search result genuinely contains the term',
    searchedCards.length > 0 && searchedCards.every((text) => text.toLowerCase().includes('museum')),
    searchedCards.map((text) => text.split('\n')[0]).join(' | '),
  );

  await shot(page, '02-attractions.png');

  // Category filter combined with search
  await page.getByLabel('Category').selectOption('museum');
  await page.waitForTimeout(800);
  check('category filter is applied to the URL', page.url().includes('category=museum'), page.url());

  // Clear
  await page.getByRole('button', { name: /clear filters/i }).first().click();
  await page.waitForTimeout(800);
  const clearedCount = await page.locator('article').count();
  check('clearing filters restores the full list', clearedCount === cardsBefore,
    `${clearedCount} vs ${cardsBefore}`);

  // Category filter alone, then open the first result
  await page.getByLabel('Category').selectOption('nature');
  await page.waitForTimeout(800);
  const natureNames = await page.locator('article h3').allInnerTexts();
  check('category filtering returns matching attractions', natureNames.length > 0,
    natureNames.join(' | '));

  await page.getByRole('button', { name: /clear filters/i }).first().click();
  await page.waitForTimeout(800);

  /* --- Attraction detail ------------------------------------------------- */
  section('Attraction detail');

  // Open a specific, geographically interesting attraction.
  await page.goto(`${BASE_URL}/attractions?search=Tower%20of%20London`, { waitUntil: 'networkidle' });
  await page.locator('article h3 a').first().click();
  await page.waitForURL(/\/attractions\/\d+/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  check('detail page opened', /\/attractions\/\d+/.test(page.url()), page.url());

  const detailHeading = (await page.locator('h1').first().innerText()).trim();
  check('attraction name is shown as the page heading', detailHeading.length > 2, `h1="${detailHeading}"`);

  check('description section is present', await page.getByRole('heading', { name: /about this place/i }).isVisible());
  check('location section is present', await page.getByRole('heading', { name: /^location$/i }).isVisible());

  // The map is Leaflet inside a container; tiles load from OpenStreetMap.
  const mapTiles = await page.locator('.leaflet-tile').count();
  check('interactive map renders tiles', mapTiles > 0, `${mapTiles} tiles`);
  check(
    'map attribution is visible',
    await page.locator('.leaflet-control-attribution').first().isVisible(),
  );

  const coordinatesText = await page.getByText(/^-?\d+\.\d+, -?\d+\.\d+$/).first().innerText();
  check('coordinates are displayed', /\d/.test(coordinatesText), coordinatesText);

  check('save action is offered', await page.getByRole('button', { name: /^save/i }).first().isVisible());
  check(
    'add to itinerary is offered',
    await page.getByRole('button', { name: /add to itinerary/i }).first().isVisible(),
  );

  await shot(page, '03-attraction-detail.png');

  const detailUrl = page.url();

  /* --- Authentication ---------------------------------------------------- */
  section('Authentication');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

  // Use the seeded demo traveler via its one-click button.
  await page.getByRole('button', { name: /traveler@cityguide\.test/i }).click();
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL(/\/attractions/, { timeout: 15_000 });
  check('signing in with a demo account succeeds', page.url().includes('/attractions'), page.url());

  const cookieNames = (await context.cookies()).map((cookie) => cookie.name);
  check('a session cookie was set', cookieNames.some((name) => name.includes('cityguide')), cookieNames.join(','));

  const sessionCookie = (await context.cookies()).find((cookie) => cookie.name.includes('cityguide'));
  check('the session cookie is httpOnly', sessionCookie?.httpOnly === true);

  await page.reload({ waitUntil: 'networkidle' });
  check(
    'the session survives a page reload',
    await page.getByRole('button', { name: /account menu|Sam Rivera/i }).first().isVisible().catch(() => false)
      || (await page.locator('header').innerText()).includes('Sam'),
  );

  /* --- Save flow --------------------------------------------------------- */
  section('Saving places');

  // The seeded traveler arrives with a shortlist, so confirm it renders before
  // testing a fresh save. The detail page's own save control lives in the
  // sidebar; the related-attraction cards below have their own save buttons, so
  // the selector is scoped to avoid matching those.
  await page.goto(`${BASE_URL}/saved`, { waitUntil: 'networkidle' });
  const seededSaves = await page.locator('article').count();
  check('the saved places page lists the shortlist', seededSaves >= 3, `${seededSaves} saved`);

  await page.goto(detailUrl, { waitUntil: 'networkidle' });

  // The control is labelled "Save" or "Saved" depending on state, so the
  // selector accepts either.
  const detailSaveButton = () =>
    page.locator('aside').getByRole('button', { name: /^saved?$/i }).first();

  check('the detail page offers a save control', await detailSaveButton().isVisible());

  const savedBefore = (await detailSaveButton().getAttribute('aria-pressed')) === 'true';

  // Toggle it and confirm the control reflects the server's answer.
  await detailSaveButton().click();
  await page.waitForTimeout(1600);

  const toggledPressed = await detailSaveButton().getAttribute('aria-pressed');
  check(
    'toggling save updates the control state',
    toggledPressed === String(!savedBefore),
    `was ${savedBefore}, now aria-pressed=${toggledPressed}`,
  );

  // Restore the starting state so the shortlist size is predictable.
  if (savedBefore) {
    await detailSaveButton().click();
    await page.waitForTimeout(1400);
  }

  // Save a place that is not in the seeded shortlist, through the catalogue UI.
  await page.goto(`${BASE_URL}/attractions?search=Camden`, { waitUntil: 'networkidle' });
  const unsavedCard = page
    .locator('article')
    .filter({ has: page.getByRole('button', { name: /^Save / }) })
    .first();

  const candidateName = (await unsavedCard.locator('h3').innerText()).trim();
  await unsavedCard.getByRole('button', { name: /^Save / }).click();
  await page.waitForTimeout(1600);

  check(
    'the card save control switches to the saved state',
    await page
      .locator('article')
      .filter({ hasText: candidateName })
      .getByRole('button', { name: /^Remove / })
      .first()
      .isVisible(),
  );

  await page.goto(`${BASE_URL}/saved`, { waitUntil: 'networkidle' });
  const savedNames = await page.locator('article h3').allInnerTexts();
  check(
    'the newly saved place appears in the shortlist',
    savedNames.some((name) => name.includes(candidateName)),
    `${candidateName} not among: ${savedNames.join(' | ')}`,
  );
  check(
    'the shortlist grew by exactly one',
    savedNames.length === seededSaves + 1,
    `${savedNames.length} vs ${seededSaves + 1}`,
  );

  /* --- Itinerary builder ------------------------------------------------- */
  section('Itinerary planning');

  await page.goto(`${BASE_URL}/itineraries`, { waitUntil: 'networkidle' });

  const existingPlans = await page.getByRole('link', { name: /open plan/i }).count();

  if (existingPlans === 0) {
    await page.getByRole('button', { name: /new itinerary|create your first itinerary/i }).first().click();
    await page.getByLabel('Itinerary name').fill('Browser Verification Plan');
    await page.getByRole('button', { name: /create itinerary/i }).click();
    await page.waitForTimeout(1500);
  }

  // Open the first plan.
  await page.getByRole('link', { name: /open plan/i }).first().click();
  await page.waitForURL(/\/itineraries\/\d+/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  const itineraryUrl = page.url();
  check('itinerary builder opened', /\/itineraries\/\d+/.test(itineraryUrl), itineraryUrl);

  /**
   * Stop rows only. The page also contains a breadcrumb `<ol>`, so the list is
   * identified by the reorder controls each stop carries rather than by tag.
   */
  const stopRows = () =>
    page.locator('li').filter({ has: page.getByRole('button', { name: /^Move .* (up|down)$/ }) });

  // Add stops if there are fewer than three.
  let stopCount = await stopRows().count();
  if (stopCount < 3) {
    await page.getByRole('button', { name: /add stop/i }).first().click();
    await page.waitForTimeout(700);

    for (let index = 0; index < 3; index += 1) {
      const addButton = page.getByRole('button', { name: /^add$/i }).filter({ hasNot: page.locator('[disabled]') }).first();
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
        await page.waitForTimeout(1200);
      }
    }

    await page.getByRole('button', { name: /^done$/i }).click();
    await page.waitForTimeout(800);
    stopCount = await stopRows().count();
  }

  check('the itinerary has at least three stops', stopCount >= 3, `${stopCount} stops`);
  await shot(page, '04-itinerary.png');

  // Reorder using the accessible move buttons.
  const namesBefore = await stopRows().locator('h2').allInnerTexts();
  await page.getByRole('button', { name: /^Move .* down$/ }).first().click();
  await page.waitForTimeout(1600); // debounce + persist

  const namesAfter = await stopRows().locator('h2').allInnerTexts();
  check(
    'moving a stop changes the displayed order',
    JSON.stringify(namesBefore) !== JSON.stringify(namesAfter),
    `${namesBefore.join(' > ')}  ==>  ${namesAfter.join(' > ')}`,
  );

  check(
    'the first two stops swapped',
    namesAfter[0] === namesBefore[1] && namesAfter[1] === namesBefore[0],
    `${namesAfter.slice(0, 2).join(' | ')}`,
  );

  // The real test: reload and confirm the order came back from the database.
  await page.reload({ waitUntil: 'networkidle' });
  const namesAfterReload = await stopRows().locator('h2').allInnerTexts();
  check(
    'the new order persists across a full page reload',
    JSON.stringify(namesAfterReload) === JSON.stringify(namesAfter),
    `${namesAfter.join(' > ')}  vs  ${namesAfterReload.join(' > ')}`,
  );

  // Position badges must read 1..N with no gaps after the reorder.
  const positionBadges = (await stopRows().allInnerTexts()).map((text) => text.trim().split('\n')[0]);
  const expectedPositions = Array.from({ length: positionBadges.length }, (_, index) => String(index + 1));
  check(
    'stop positions are numbered sequentially from 1',
    JSON.stringify(positionBadges) === JSON.stringify(expectedPositions),
    positionBadges.join(','),
  );

  /* --- Profile ----------------------------------------------------------- */
  section('Profile');

  await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle' });
  check('profile shows the account name', await page.getByRole('heading', { level: 1 }).isVisible());
  check('role badge is displayed', await page.getByText(/Traveler/).first().isVisible());
  check('saved place statistic is shown', await page.getByText(/Saved places/i).first().isVisible());
  check('itinerary statistic is shown', await page.getByText(/Itineraries/i).first().isVisible());

  /* --- Authorization in the UI ------------------------------------------- */
  section('Authorization');

  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
  const adminBlocked = await page.getByText(/do not have permission/i).isVisible().catch(() => false);
  check('a traveler cannot open the admin dashboard', adminBlocked);

  await page.goto(`${BASE_URL}/curator`, { waitUntil: 'networkidle' });
  const curatorBlocked = await page.getByText(/do not have permission/i).isVisible().catch(() => false);
  check('a traveler cannot open the curator dashboard', curatorBlocked);

  const navText = await page.locator('header').innerText();
  check('admin links are hidden from a traveler', !/Admin Dashboard/i.test(navText), navText.slice(0, 120));

  /* --- Curator flow ------------------------------------------------------ */
  section('Curator dashboard');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /sign out/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);

  await context.clearCookies();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /curator@cityguide\.test/i }).click();
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/attractions/, { timeout: 15_000 });

  await page.goto(`${BASE_URL}/curator`, { waitUntil: 'networkidle' });
  check('curator dashboard loads', await page.getByRole('heading', { name: /catalogue overview/i }).isVisible());
  check('dashboard shows catalogue totals', await page.getByText(/Total attractions/i).first().isVisible());
  await shot(page, '05-curator.png');

  await page.goto(`${BASE_URL}/curator/attractions`, { waitUntil: 'networkidle' });
  const managedRows = await page.locator('tbody tr').count();
  check('curator sees the attraction table', managedRows > 0, `${managedRows} rows`);

  // Open the editor and exercise the address lookup.
  await page.goto(`${BASE_URL}/curator/attractions/new`, { waitUntil: 'networkidle' });
  check('attraction form loads', await page.getByLabel('Attraction name').isVisible());

  const uniqueName = `Browser Verification Attraction ${Date.now()}`;
  await page.getByLabel('Attraction name').fill(uniqueName);
  await page
    .getByLabel('Description')
    .fill('Created by the browser verification run to confirm the curator flow works end to end.');
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Address').fill('Tower Bridge, London');

  await shot(page, '06-curator-form.png');

  // User-triggered geocoding through the backend.
  await page.getByRole('button', { name: /look up location/i }).click();
  await page.waitForTimeout(4000);

  const latValue = await page.getByLabel('Latitude').inputValue();
  const lngValue = await page.getByLabel('Longitude').inputValue();
  const geocoded = Number.parseFloat(latValue) > 51 && Number.parseFloat(latValue) < 52;

  check('address lookup fills the latitude', geocoded, `latitude="${latValue}"`);
  check('address lookup fills the longitude', Number.parseFloat(lngValue) < 0, `longitude="${lngValue}"`);
  check(
    'geocoding attribution is shown to the curator',
    await page.getByText(/OpenStreetMap/i).first().isVisible(),
  );
  check('a map preview appears for the coordinates', (await page.locator('.leaflet-tile').count()) > 0);

  await page.getByRole('button', { name: /create attraction/i }).click();
  await page.waitForURL(/\/curator\/attractions$/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  check('creating an attraction returns to the management table', page.url().endsWith('/curator/attractions'));

  // Confirm it is publicly visible.
  await page.goto(`${BASE_URL}/attractions?search=${encodeURIComponent(uniqueName)}`, {
    waitUntil: 'networkidle',
  });
  const publicHits = await page.locator('article h3').allInnerTexts();
  check('the new attraction appears in public search', publicHits.some((name) => name.includes(uniqueName)),
    publicHits.join(' | '));

  // Edit it and confirm the change persists.
  await page.goto(`${BASE_URL}/curator/attractions?search=${encodeURIComponent(uniqueName)}`, {
    waitUntil: 'networkidle',
  });
  await page.getByRole('link', { name: /^Edit /i }).first().click();
  await page.waitForURL(/\/edit$/, { timeout: 15_000 });
  await page.getByLabel('Attraction name').fill(`${uniqueName} (Edited)`);
  await page.getByRole('button', { name: /save changes/i }).click();
  await page.waitForURL(/\/curator\/attractions$/, { timeout: 15_000 });

  await page.goto(`${BASE_URL}/attractions?search=${encodeURIComponent(uniqueName)}`, {
    waitUntil: 'networkidle',
  });
  const editedHits = await page.locator('article h3').allInnerTexts();
  check('the edit persists for public readers', editedHits.some((name) => name.includes('(Edited)')),
    editedHits.join(' | '));

  // Category management.
  await page.goto(`${BASE_URL}/curator/categories`, { waitUntil: 'networkidle' });
  const categoryRows = await page.locator('tbody tr').count();
  check('category management lists categories', categoryRows >= 9, `${categoryRows} rows`);

  /* --- Admin flow -------------------------------------------------------- */
  section('Admin dashboard');

  await context.clearCookies();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /admin@cityguide\.test/i }).click();
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/attractions/, { timeout: 15_000 });

  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
  check('admin overview loads', await page.getByRole('heading', { name: /system overview/i }).isVisible());
  check('user totals are shown', await page.getByText(/Total users/i).first().isVisible());
  check('recent activity is shown', await page.getByRole('heading', { name: /recent activity/i }).isVisible());
  await shot(page, '07-admin.png');

  await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle' });
  const userRows = await page.locator('tbody tr').count();
  check('user management lists accounts', userRows >= 4, `${userRows} rows`);
  check(
    'the signed-in administrator is marked',
    await page.getByText('You', { exact: true }).first().isVisible(),
  );

  // Search for a specific account.
  await page.getByLabel('Search users').fill('curator@cityguide.test');
  await page.waitForTimeout(1200);
  const filteredRows = await page.locator('tbody tr').count();
  check('user search filters the table', filteredRows === 1, `${filteredRows} rows`);

  await page.goto(`${BASE_URL}/admin/audit-logs`, { waitUntil: 'networkidle' });
  const auditRows = await page.locator('tbody tr').count();
  check('audit log is populated', auditRows > 5, `${auditRows} rows`);

  const auditText = await page.locator('tbody').innerText();
  check('the audit log records attraction creation', /Attraction.*create/i.test(auditText));
  check('the audit log records sign-ins', /Auth.*login/i.test(auditText));
  check('the audit log records geocoding lookups', /Geocode.*lookup/i.test(auditText));
  check('the audit log never exposes a password hash', !auditText.includes('scrypt$'));
  await shot(page, '08-audit-log.png');

  // Filter by action.
  await page.getByLabel('Action').selectOption('attraction.create');
  await page.waitForTimeout(1000);
  const filteredAudit = await page.locator('tbody').innerText();
  check('audit log filtering works', /Attraction.*create/i.test(filteredAudit));

  /* --- Responsive -------------------------------------------------------- */
  section('Responsive layout');

  const mobileContext = await browser.newContext({
    viewport: MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  watch(mobilePage, 'mobile');

  await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  const mobileLandingOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check('landing page has no horizontal overflow on mobile', !mobileLandingOverflow);

  await shot(mobilePage, '09-mobile.png');

  await mobilePage.goto(`${BASE_URL}/attractions`, { waitUntil: 'networkidle' });
  const mobileListOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check('attractions page has no horizontal overflow on mobile', !mobileListOverflow);
  check(
    'mobile navigation toggle is available',
    await mobilePage.getByRole('button', { name: /open menu/i }).isVisible(),
  );

  // The mobile menu must actually open.
  await mobilePage.getByRole('button', { name: /open menu/i }).click();
  await mobilePage.waitForTimeout(400);
  check(
    'the mobile menu opens',
    await mobilePage.getByRole('navigation', { name: 'Main' }).last().isVisible(),
  );

  await mobilePage.goto(`${BASE_URL}/attractions`, { waitUntil: 'networkidle' });
  const tabletPage = await context.newPage();
  await tabletPage.setViewportSize({ width: 834, height: 1112 });
  await tabletPage.goto(`${BASE_URL}/attractions`, { waitUntil: 'networkidle' });
  const tabletOverflow = await tabletPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check('attractions page has no horizontal overflow on tablet', !tabletOverflow);
  await tabletPage.close();

  await mobileContext.close();

  /* --- Error surfaces ---------------------------------------------------- */
  section('Error handling in the UI');

  const anonContext = await browser.newContext({ viewport: DESKTOP });
  const anonPage = await anonContext.newPage();
  watch(anonPage, 'anon');

  await anonPage.goto(`${BASE_URL}/attractions/999999`, { waitUntil: 'networkidle' });
  check(
    'a missing attraction shows a friendly message, not a crash',
    await anonPage.getByText(/could not be found/i).first().isVisible(),
  );

  await anonPage.goto(`${BASE_URL}/this-route-does-not-exist`, { waitUntil: 'networkidle' });
  check(
    'an unknown route shows the 404 page',
    await anonPage.getByText(/page does not exist/i).first().isVisible(),
  );

  await anonPage.goto(`${BASE_URL}/saved`, { waitUntil: 'networkidle' });
  check(
    'a signed-out visitor is redirected away from saved places',
    anonPage.url().includes('/login'),
    anonPage.url(),
  );

  await anonContext.close();

  /* --- Console health ---------------------------------------------------- */
  section('Runtime health');

  // Failed remote image loads are outside the application's control.
  const realConsoleErrors = consoleErrors.filter(
    (entry) => !/Failed to load resource|net::ERR|favicon|upload\.wikimedia\.org|tile\.openstreetmap/i.test(entry),
  );

  check(
    'no uncaught JavaScript errors on any page',
    pageErrors.length === 0,
    pageErrors.slice(0, 5).join('\n          '),
  );
  check(
    'no unexpected console errors',
    realConsoleErrors.length === 0,
    realConsoleErrors.slice(0, 5).join('\n          '),
  );
  check(
    'no server errors (5xx) during the run',
    failedRequests.length === 0,
    failedRequests.slice(0, 5).join('\n          '),
  );
} finally {
  await browser.close();
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                     */
/* -------------------------------------------------------------------------- */

console.log(`\n${'='.repeat(64)}`);
console.log(`UI checks passed: ${passed}`);
console.log(`UI checks failed: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(`  - ${failure}`);
}
console.log(`Screenshots written to ${SHOT_DIR}`);

process.exit(failures.length === 0 ? 0 : 1);
