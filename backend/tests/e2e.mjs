/**
 * End-to-end API verification.
 *
 * Exercises the acceptance flows from the project brief against a running
 * server, using real HTTP requests and a real cookie jar. Nothing is mocked:
 * every assertion reflects what the API actually persisted.
 *
 *   node backend/tests/e2e.mjs [baseUrl]
 *
 * The script is self-contained — it registers its own traveler rather than
 * depending on seeded accounts — but it does use the seeded curator and
 * administrator to verify role enforcement, because those roles cannot be
 * self-assigned through the API (by design).
 */
const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:4000';

/* -------------------------------------------------------------------------- */
/* Tiny test harness                                                           */
/* -------------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

/* -------------------------------------------------------------------------- */
/* HTTP client with a cookie jar                                               */
/* -------------------------------------------------------------------------- */

function createClient(label) {
  /** name -> value */
  const cookies = new Map();

  function cookieHeader() {
    if (cookies.size === 0) return undefined;
    return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  function storeCookies(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const entry of raw) {
      const [pair] = entry.split(';');
      const index = pair.indexOf('=');
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(entry)) cookies.delete(name);
      else cookies.set(name, value);
    }
  }

  async function request(method, path, body) {
    const headers = { Accept: 'application/json' };
    const cookie = cookieHeader();
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });

    storeCookies(response);

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text.slice(0, 300) };
      }
    }

    return { status: response.status, body: payload };
  }

  return {
    label,
    cookies,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    clearCookies: () => cookies.clear(),
  };
}

/** Extracts `data` from a success envelope. */
const dataOf = (response) => response.body?.data ?? null;
/** Extracts `error` from a failure envelope. */
const errorOf = (response) => response.body?.error ?? null;

/* -------------------------------------------------------------------------- */
/* Flows                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log(`CityGuide end-to-end API verification`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}`);

  /* --- Health ------------------------------------------------------------ */
  section('Health and public discovery');

  const health = await createClient('anon').get('/api/health');
  check('GET /api/health responds 200', health.status === 200, `got ${health.status}`);
  check('health reports the database driver', Boolean(dataOf(health)?.database));

  const anon = createClient('anon');

  const categories = await anon.get('/api/categories');
  const categoryItems = dataOf(categories)?.items ?? [];
  check('GET /api/categories returns the seeded categories', categoryItems.length >= 9,
    `got ${categoryItems.length}`);
  check(
    'categories carry attraction counts',
    categoryItems.every((category) => typeof category.attractionCount === 'number'),
  );

  const list = await anon.get('/api/attractions?limit=5');
  const listData = dataOf(list);
  check('GET /api/attractions responds 200', list.status === 200);
  check('attraction list is paginated', Boolean(listData?.pagination));
  check('attraction list honours the limit', listData?.items?.length === 5,
    `got ${listData?.items?.length}`);
  check(
    'attractions embed their category',
    listData?.items?.every((item) => item.category?.name && item.category?.slug),
  );
  check(
    'attractions expose coordinates',
    listData?.items?.some((item) => typeof item.latitude === 'number'),
  );

  const search = await anon.get('/api/attractions?search=museum');
  const searchItems = dataOf(search)?.items ?? [];
  check('keyword search returns matches', searchItems.length > 0, `got ${searchItems.length}`);
  check(
    'keyword search only returns matching records',
    searchItems.every((item) =>
      `${item.name} ${item.description} ${item.address} ${item.category?.name}`
        .toLowerCase()
        .includes('museum'),
    ),
  );

  const museumCategory = categoryItems.find((category) => category.slug === 'museum');
  const filtered = await anon.get(`/api/attractions?category=${museumCategory?.slug}&limit=50`);
  const filteredItems = dataOf(filtered)?.items ?? [];
  check('category filtering works', filteredItems.length > 0, `got ${filteredItems.length}`);
  check(
    'category filter returns only that category',
    filteredItems.every((item) => item.category.id === museumCategory?.id),
  );

  const combined = await anon.get('/api/attractions?search=museum&category=historical');
  check(
    'combined search + category filter can legitimately return nothing',
    Array.isArray(dataOf(combined)?.items),
  );

  const sorted = await anon.get('/api/attractions?sort=name_asc&limit=10');
  const sortedNames = (dataOf(sorted)?.items ?? []).map((item) => item.name);
  check(
    'sorting by name is applied',
    JSON.stringify(sortedNames) === JSON.stringify([...sortedNames].sort((a, b) => a.localeCompare(b))),
    sortedNames.join(' | '),
  );

  const emptySearch = await anon.get('/api/attractions?search=zzzzz-no-such-place');
  check('empty search results are reported honestly',
    dataOf(emptySearch)?.items?.length === 0 && dataOf(emptySearch)?.pagination?.totalItems === 0);

  const detail = await anon.get(`/api/attractions/${listData.items[0].id}`);
  check('GET /api/attractions/:id returns the attraction', detail.status === 200);
  check('detail includes an address', typeof dataOf(detail)?.attraction?.address === 'string');

  const missing = await anon.get('/api/attractions/999999');
  check('unknown attraction returns 404', missing.status === 404, `got ${missing.status}`);
  check('404 uses the error envelope', errorOf(missing)?.code === 'NOT_FOUND');

  /* --- Traveler flow ----------------------------------------------------- */
  section('Traveler flow: register, discover, save, plan, reorder, persist');

  const traveler = createClient('traveler');
  const unique = Date.now();
  const travelerEmail = `e2e.traveler.${unique}@example.com`;
  const travelerPassword = 'Traveler123!';

  const registered = await traveler.post('/api/auth/register', {
    name: 'E2E Traveler',
    email: travelerEmail,
    password: travelerPassword,
  });
  check('POST /api/auth/register responds 201', registered.status === 201, `got ${registered.status}`);
  check('registration returns the traveler role', dataOf(registered)?.user?.role === 'traveler');
  check('registration never echoes the password', !JSON.stringify(registered.body).includes(travelerPassword));
  check('registration sets a session cookie', traveler.cookies.size > 0);

  const me = await traveler.get('/api/auth/me');
  check('GET /api/auth/me identifies the session', dataOf(me)?.authenticated === true);
  check('the session belongs to the new account', dataOf(me)?.user?.email === travelerEmail);

  const duplicateEmail = await createClient('dup').post('/api/auth/register', {
    name: 'Duplicate',
    email: travelerEmail,
    password: travelerPassword,
  });
  check('duplicate email is rejected with 409', duplicateEmail.status === 409, `got ${duplicateEmail.status}`);

  const weakPassword = await createClient('weak').post('/api/auth/register', {
    name: 'Weak',
    email: `weak.${unique}@example.com`,
    password: 'short',
  });
  check('weak password is rejected with 422', weakPassword.status === 422, `got ${weakPassword.status}`);
  check(
    'validation failure lists the offending field',
    errorOf(weakPassword)?.details?.some((entry) => entry.field === 'password'),
  );

  const badLogin = await createClient('bad').post('/api/auth/login', {
    email: travelerEmail,
    password: 'WrongPassword1',
  });
  check('wrong password returns 401', badLogin.status === 401, `got ${badLogin.status}`);
  check('invalid credentials use a stable code', errorOf(badLogin)?.code === 'INVALID_CREDENTIALS');

  const unknownUser = await createClient('unknown').post('/api/auth/login', {
    email: `nobody.${unique}@example.com`,
    password: 'Whatever123',
  });
  check('unknown account returns the same generic 401', unknownUser.status === 401);

  // Save at least three attractions.
  const toSave = (dataOf(await traveler.get('/api/attractions?limit=6'))?.items ?? []).slice(0, 4);
  check('at least three attractions are available to save', toSave.length >= 3);

  for (const attraction of toSave.slice(0, 3)) {
    const saved = await traveler.post('/api/saved-places', { attractionId: attraction.id });
    check(`save "${attraction.name}" responds 201`, saved.status === 201, `got ${saved.status}`);
  }

  const duplicateSave = await traveler.post('/api/saved-places', { attractionId: toSave[0].id });
  check('saving the same attraction twice is rejected with 409', duplicateSave.status === 409,
    `got ${duplicateSave.status}`);
  check('duplicate save uses DUPLICATE_RESOURCE', errorOf(duplicateSave)?.code === 'DUPLICATE_RESOURCE');

  const savedList = await traveler.get('/api/saved-places');
  check('GET /api/saved-places lists three saves', dataOf(savedList)?.items?.length === 3,
    `got ${dataOf(savedList)?.items?.length}`);
  check(
    'saved places embed the full attraction',
    dataOf(savedList)?.items?.every((entry) => entry.attraction?.name && entry.savedAt),
  );

  const savedFlag = await traveler.get(`/api/attractions/${toSave[0].id}`);
  check('attraction detail reflects the viewer\'s save state', dataOf(savedFlag)?.attraction?.isSaved === true);

  const savedCount = await traveler.get(`/api/attractions/${toSave[0].id}`);
  check('attraction detail reports how many users saved it',
    typeof dataOf(savedCount)?.attraction?.savedCount === 'number');

  // Itinerary creation and ordering.
  const createdItinerary = await traveler.post('/api/itineraries', {
    name: 'E2E Day Plan',
    description: 'Created by the automated verification run.',
  });
  check('POST /api/itineraries responds 201', createdItinerary.status === 201,
    `got ${createdItinerary.status}`);

  const itineraryId = dataOf(createdItinerary)?.itinerary?.id;
  check('the itinerary has an id', Number.isInteger(itineraryId));

  const emptyItinerary = await traveler.get(`/api/itineraries/${itineraryId}`);
  check('a new itinerary starts empty', dataOf(emptyItinerary)?.items?.length === 0);

  for (const attraction of toSave.slice(0, 3)) {
    const added = await traveler.post(`/api/itineraries/${itineraryId}/items`, {
      attractionId: attraction.id,
    });
    check(`add "${attraction.name}" to the itinerary`, added.status === 201, `got ${added.status}`);
  }

  const duplicateStop = await traveler.post(`/api/itineraries/${itineraryId}/items`, {
    attractionId: toSave[0].id,
  });
  check('adding the same stop twice is rejected with 409', duplicateStop.status === 409,
    `got ${duplicateStop.status}`);

  const withItems = await traveler.get(`/api/itineraries/${itineraryId}`);
  const itemsNow = dataOf(withItems)?.items ?? [];
  check('the itinerary holds three ordered stops', itemsNow.length === 3, `got ${itemsNow.length}`);
  check(
    'positions are dense and start at zero',
    JSON.stringify(itemsNow.map((item) => item.position)) === JSON.stringify([0, 1, 2]),
    JSON.stringify(itemsNow.map((item) => item.position)),
  );

  // Reorder: reverse the list.
  const reversedIds = itemsNow.map((item) => item.id).reverse();
  const reordered = await traveler.patch(`/api/itineraries/${itineraryId}/items/order`, {
    itemIds: reversedIds,
  });
  check('PATCH items/order responds 200', reordered.status === 200, `got ${reordered.status}`);

  const afterReorder = await traveler.get(`/api/itineraries/${itineraryId}`);
  const reorderedItems = dataOf(afterReorder)?.items ?? [];
  check(
    'the new order is persisted in the database',
    JSON.stringify(reorderedItems.map((item) => item.id)) === JSON.stringify(reversedIds),
    JSON.stringify(reorderedItems.map((item) => item.id)),
  );
  check(
    'positions remain dense after reordering',
    JSON.stringify(reorderedItems.map((item) => item.position)) === JSON.stringify([0, 1, 2]),
  );
  check(
    'the reordered stops keep their attractions attached',
    reorderedItems.every((item) => item.attraction?.name),
  );

  const partialReorder = await traveler.patch(`/api/itineraries/${itineraryId}/items/order`, {
    itemIds: [reversedIds[0]],
  });
  check('a partial reorder payload is rejected with 422', partialReorder.status === 422,
    `got ${partialReorder.status}`);

  const foreignReorder = await traveler.patch(`/api/itineraries/${itineraryId}/items/order`, {
    itemIds: [...reversedIds.slice(0, 2), 999999],
  });
  check('reordering with a foreign item id is rejected', foreignReorder.status === 422,
    `got ${foreignReorder.status}`);

  const removed = await traveler.delete(`/api/itineraries/${itineraryId}/items/${reversedIds[0]}`);
  check('removing a stop responds 200', removed.status === 200, `got ${removed.status}`);

  const afterRemoval = await traveler.get(`/api/itineraries/${itineraryId}`);
  const remaining = dataOf(afterRemoval)?.items ?? [];
  check('removing a stop leaves two', remaining.length === 2, `got ${remaining.length}`);
  check(
    'positions are re-packed after removal',
    JSON.stringify(remaining.map((item) => item.position)) === JSON.stringify([0, 1]),
    JSON.stringify(remaining.map((item) => item.position)),
  );

  // Re-add a stop at an explicit index to prove insertion works.
  const inserted = await traveler.post(`/api/itineraries/${itineraryId}/items`, {
    attractionId: toSave[3].id,
    position: 0,
  });
  check('inserting a stop at position 0 responds 201', inserted.status === 201, `got ${inserted.status}`);

  const afterInsert = await traveler.get(`/api/itineraries/${itineraryId}`);
  const insertedItems = dataOf(afterInsert)?.items ?? [];
  check('the inserted stop is first', insertedItems[0]?.attraction?.id === toSave[3].id,
    JSON.stringify(insertedItems.map((item) => item.attraction?.id)));
  check(
    'positions stay dense after insertion',
    JSON.stringify(insertedItems.map((item) => item.position)) === JSON.stringify([0, 1, 2]),
  );

  // Persistence across a fresh session: sign out, sign back in, re-read.
  section('Persistence across a new session');

  await traveler.post('/api/auth/logout');
  const afterLogout = await traveler.get('/api/auth/me');
  check('after logout the session is anonymous', dataOf(afterLogout)?.authenticated === false);

  const protectedAfterLogout = await traveler.get('/api/saved-places');
  check('saved places require authentication', protectedAfterLogout.status === 401,
    `got ${protectedAfterLogout.status}`);

  const freshLogin = await traveler.post('/api/auth/login', {
    email: travelerEmail,
    password: travelerPassword,
  });
  check('signing back in succeeds', freshLogin.status === 200, `got ${freshLogin.status}`);

  const reloaded = await traveler.get(`/api/itineraries/${itineraryId}`);
  const reloadedItems = dataOf(reloaded)?.items ?? [];
  check('the itinerary survives a new session', reloaded.status === 200 && reloadedItems.length === 3);
  check(
    'the saved order survives a new session',
    JSON.stringify(reloadedItems.map((item) => item.attraction?.id)) ===
      JSON.stringify(insertedItems.map((item) => item.attraction?.id)),
  );

  const savedStillThere = await traveler.get('/api/saved-places');
  check('saved places survive a new session', dataOf(savedStillThere)?.items?.length === 3,
    `got ${dataOf(savedStillThere)?.items?.length}`);

  const unsaved = await traveler.delete(`/api/saved-places/attraction/${toSave[0].id}`);
  check('unsaving by attraction id responds 200', unsaved.status === 200, `got ${unsaved.status}`);

  const unsavedAgain = await traveler.delete(`/api/saved-places/attraction/${toSave[0].id}`);
  check('unsaving twice returns 404, not a crash', unsavedAgain.status === 404,
    `got ${unsavedAgain.status}`);

  const finalSaved = await traveler.get('/api/saved-places');
  check('the shortlist reflects the removal', dataOf(finalSaved)?.items?.length === 2,
    `got ${dataOf(finalSaved)?.items?.length}`);

  /* --- Profile ----------------------------------------------------------- */
  section('Traveler profile');

  const profile = await traveler.get('/api/users/profile');
  check('GET /api/users/profile responds 200', profile.status === 200);
  check('profile reports the role', dataOf(profile)?.user?.role === 'traveler');
  check('profile reports saved place count', dataOf(profile)?.stats?.savedPlaces === 2,
    JSON.stringify(dataOf(profile)?.stats));
  check('profile reports itinerary count', dataOf(profile)?.stats?.itineraryCount === 1,
    JSON.stringify(dataOf(profile)?.stats));
  check('profile never exposes a password hash', !JSON.stringify(profile.body).includes('scrypt$'));

  const updatedProfile = await traveler.patch('/api/users/profile', { name: 'Renamed Traveler' });
  check('PATCH /api/users/profile updates the name', dataOf(updatedProfile)?.user?.name === 'Renamed Traveler');

  const badProfile = await traveler.patch('/api/users/profile', { email: 'not-an-email' });
  check('invalid profile email is rejected with 422', badProfile.status === 422, `got ${badProfile.status}`);

  /* --- Authorization ----------------------------------------------------- */
  section('Authorization: a traveler cannot act as a curator or admin');

  const travelerCreatesAttraction = await traveler.post('/api/attractions', {
    name: 'Unauthorized Attraction',
    description: 'This should never be created.',
    categoryId: categoryItems[0].id,
    address: '1 Nowhere Street, London',
  });
  check('traveler POST /api/attractions is forbidden (403)', travelerCreatesAttraction.status === 403,
    `got ${travelerCreatesAttraction.status}`);
  check('the rejection uses the FORBIDDEN code', errorOf(travelerCreatesAttraction)?.code === 'FORBIDDEN');

  const travelerEdits = await traveler.patch(`/api/attractions/${toSave[0].id}`, {
    name: 'Hijacked Name',
  });
  check('traveler PATCH /api/attractions/:id is forbidden', travelerEdits.status === 403,
    `got ${travelerEdits.status}`);

  const travelerDeletes = await traveler.delete(`/api/attractions/${toSave[0].id}`);
  check('traveler DELETE /api/attractions/:id is forbidden', travelerDeletes.status === 403,
    `got ${travelerDeletes.status}`);

  const travelerCategory = await traveler.post('/api/categories', { name: 'Rogue Category' });
  check('traveler POST /api/categories is forbidden', travelerCategory.status === 403,
    `got ${travelerCategory.status}`);

  const travelerGeocode = await traveler.post('/api/location/geocode', {
    address: '10 Downing Street, London',
  });
  check('traveler POST /api/location/geocode is forbidden', travelerGeocode.status === 403,
    `got ${travelerGeocode.status}`);

  const travelerAdmin = await traveler.get('/api/admin/overview');
  check('traveler GET /api/admin/overview is forbidden', travelerAdmin.status === 403,
    `got ${travelerAdmin.status}`);

  const travelerAdminUsers = await traveler.get('/api/admin/users');
  check('traveler GET /api/admin/users is forbidden', travelerAdminUsers.status === 403,
    `got ${travelerAdminUsers.status}`);

  const travelerAudit = await traveler.get('/api/admin/audit-logs');
  check('traveler GET /api/admin/audit-logs is forbidden', travelerAudit.status === 403,
    `got ${travelerAudit.status}`);

  const travelerCurator = await traveler.get('/api/curator/overview');
  check('traveler GET /api/curator/overview is forbidden', travelerCurator.status === 403,
    `got ${travelerCurator.status}`);

  const attractionAfterAttempts = await anon.get(`/api/attractions/${toSave[0].id}`);
  check(
    'the attraction is unchanged after the rejected writes',
    dataOf(attractionAfterAttempts)?.attraction?.name === toSave[0].name,
    dataOf(attractionAfterAttempts)?.attraction?.name,
  );

  /* --- Cross-user privacy ------------------------------------------------ */
  section('Itinerary privacy between travelers');

  const intruder = createClient('intruder');
  await intruder.post('/api/auth/register', {
    name: 'Intruder',
    email: `e2e.intruder.${unique}@example.com`,
    password: 'Intruder123!',
  });

  const readForeign = await intruder.get(`/api/itineraries/${itineraryId}`);
  check("a traveler cannot read another traveler's itinerary", readForeign.status === 403,
    `got ${readForeign.status}`);

  const itemsForeign = await intruder.get(`/api/itineraries/${itineraryId}/items`);
  check("a traveler cannot list another traveler's stops", itemsForeign.status === 403,
    `got ${itemsForeign.status}`);

  const editForeign = await intruder.patch(`/api/itineraries/${itineraryId}`, { name: 'Stolen' });
  check("a traveler cannot rename another traveler's itinerary", editForeign.status === 403,
    `got ${editForeign.status}`);

  const addForeign = await intruder.post(`/api/itineraries/${itineraryId}/items`, {
    attractionId: toSave[0].id,
  });
  check("a traveler cannot add stops to another traveler's itinerary", addForeign.status === 403,
    `got ${addForeign.status}`);

  const deleteForeign = await intruder.delete(`/api/itineraries/${itineraryId}`);
  check("a traveler cannot delete another traveler's itinerary", deleteForeign.status === 403,
    `got ${deleteForeign.status}`);

  const ownList = await intruder.get('/api/itineraries');
  check("a new traveler's own itinerary list is empty", dataOf(ownList)?.items?.length === 0);

  /* --- Curator flow ------------------------------------------------------ */
  section('Curator flow: create, geocode, edit, verify publicly visible');

  const curator = createClient('curator');
  const curatorLogin = await curator.post('/api/auth/login', {
    email: 'curator@cityguide.test',
    password: 'Curator123!',
  });
  check('the seeded curator can sign in', curatorLogin.status === 200, `got ${curatorLogin.status}`);
  check('the curator role is reported', dataOf(curatorLogin)?.user?.role === 'curator');

  const curatorOverview = await curator.get('/api/curator/overview');
  check('GET /api/curator/overview responds 200', curatorOverview.status === 200);
  check('the overview reports catalogue stats',
    typeof dataOf(curatorOverview)?.stats?.totalAttractions === 'number');

  const newAttractionName = `E2E Riverside Walk ${unique}`;

  // Geocoding: user-triggered, through the backend, with a real external call.
  const geocoded = await curator.post('/api/location/geocode', {
    address: 'Tower Bridge, London',
  });
  const location = dataOf(geocoded)?.location;
  check('POST /api/location/geocode responds 200', geocoded.status === 200, `got ${geocoded.status}`);
  check('geocoding returns a latitude', typeof location?.latitude === 'number');
  check('geocoding returns a longitude', typeof location?.longitude === 'number');
  check('geocoding returns a display name', typeof location?.displayName === 'string' && location.displayName.length > 0);
  check('geocoding reports OpenStreetMap attribution', Boolean(location?.attribution?.text));
  check('coordinates are plausible for London',
    location?.latitude > 51.3 && location.latitude < 51.7, String(location?.latitude));

  // The second identical lookup must be served from the cache.
  const cachedGeocode = await curator.post('/api/location/geocode', {
    address: 'Tower Bridge, London',
  });
  check('a repeated address is served from the cache',
    dataOf(cachedGeocode)?.location?.fromCache === true);

  const noResults = await curator.post('/api/location/geocode', {
    address: 'zzzzqqq nonexistent place 12345',
  });
  check('an unmatched address returns 404 with a helpful code',
    noResults.status === 404 && errorOf(noResults)?.code === 'GEOCODING_NO_RESULTS',
    `got ${noResults.status} ${errorOf(noResults)?.code}`);

  const shortAddress = await curator.post('/api/location/geocode', { address: 'ab' });
  check('a too-short address is rejected with 422', shortAddress.status === 422,
    `got ${shortAddress.status}`);

  /**
   * Coordinates come from a live third-party service, so the coordinate-specific
   * assertions below are conditional. Everything else still runs, which keeps a
   * geocoder outage from masking unrelated regressions.
   */
  const hasCoordinates =
    typeof location?.latitude === 'number' && typeof location?.longitude === 'number';
  check('geocoding produced usable coordinates', hasCoordinates,
    hasCoordinates ? undefined : 'upstream geocoder did not return coordinates');

  // Create the attraction, using the geocoded coordinates when available.
  const created = await curator.post('/api/attractions', {
    name: newAttractionName,
    description:
      'A self-guided walk along the south bank of the Thames, created during automated verification.',
    categoryId: museumCategory.id,
    address: 'Tower Bridge Road, London SE1 2UP',
    latitude: hasCoordinates ? location.latitude : null,
    longitude: hasCoordinates ? location.longitude : null,
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Tower_Bridge_from_Shad_Thames.jpg/1280px-Tower_Bridge_from_Shad_Thames.jpg',
  });
  check('curator POST /api/attractions responds 201', created.status === 201, `got ${created.status}`);

  const createdId = dataOf(created)?.attraction?.id;
  check('the created attraction has an id', Number.isInteger(createdId));
  check('the attraction records its author', Boolean(dataOf(created)?.attraction?.createdBy));

  if (hasCoordinates) {
    check(
      'the stored coordinates match the geocoded values',
      dataOf(created)?.attraction?.latitude === location.latitude,
      `${dataOf(created)?.attraction?.latitude} vs ${location.latitude}`,
    );
  }

  const invalidAttraction = await curator.post('/api/attractions', {
    name: 'X',
    description: 'too short',
    categoryId: 999999,
    address: 'no',
  });
  check('invalid attraction input is rejected with 422', invalidAttraction.status === 422,
    `got ${invalidAttraction.status}`);
  check('validation details name the bad fields',
    (errorOf(invalidAttraction)?.details ?? []).length >= 3,
    JSON.stringify(errorOf(invalidAttraction)?.details));

  const badCoordinates = await curator.post('/api/attractions', {
    name: 'Bad Coordinates Place',
    description: 'Coordinates outside the valid range should be refused.',
    categoryId: museumCategory.id,
    address: '1 Somewhere, London',
    latitude: 200,
    longitude: 500,
  });
  check('out-of-range coordinates are rejected with 422', badCoordinates.status === 422,
    `got ${badCoordinates.status}`);

  // Public visibility.
  const publicSearch = await anon.get(
    `/api/attractions?search=${encodeURIComponent(newAttractionName)}`,
  );
  check('the new attraction appears in public search',
    dataOf(publicSearch)?.items?.some((item) => item.id === createdId));

  const publicDetail = await anon.get(`/api/attractions/${createdId}`);
  check('the new attraction is publicly readable', publicDetail.status === 200);

  // Edit and confirm the change persists.
  const updatedName = `${newAttractionName} (Updated)`;
  const edited = await curator.patch(`/api/attractions/${createdId}`, {
    name: updatedName,
    address: 'Tower Bridge Road, London SE1 2UP, United Kingdom',
  });
  check('curator PATCH responds 200', edited.status === 200, `got ${edited.status}`);
  check('the update is reflected in the response', dataOf(edited)?.attraction?.name === updatedName);

  const afterEdit = await anon.get(`/api/attractions/${createdId}`);
  check('the edit persisted for public readers',
    dataOf(afterEdit)?.attraction?.name === updatedName);
  if (hasCoordinates) {
    check(
      'the unchanged fields survived a partial update',
      dataOf(afterEdit)?.attraction?.latitude === location.latitude,
      `${dataOf(afterEdit)?.attraction?.latitude} vs ${location.latitude}`,
    );
  }

  const partialCoordinate = await curator.patch(`/api/attractions/${createdId}`, {
    latitude: 51.5,
  });
  check('updating only one coordinate is rejected with 422', partialCoordinate.status === 422,
    `got ${partialCoordinate.status}`);

  const emptyPatch = await curator.patch(`/api/attractions/${createdId}`, {});
  check('an empty PATCH body is rejected with 422', emptyPatch.status === 422,
    `got ${emptyPatch.status}`);

  /* --- Category management ----------------------------------------------- */
  section('Category management');

  const categoryName = `E2E Category ${unique}`;
  const createdCategory = await curator.post('/api/categories', {
    name: categoryName,
    description: 'Created during automated verification.',
  });
  check('curator POST /api/categories responds 201', createdCategory.status === 201,
    `got ${createdCategory.status}`);
  check('the category receives a slug', Boolean(dataOf(createdCategory)?.category?.slug));

  const categoryId = dataOf(createdCategory)?.category?.id;

  const duplicateCategory = await curator.post('/api/categories', { name: categoryName });
  check('a duplicate category name is rejected with 409', duplicateCategory.status === 409,
    `got ${duplicateCategory.status}`);

  const renamedCategory = await curator.patch(`/api/categories/${categoryId}`, {
    description: 'Updated during automated verification.',
  });
  check('curator PATCH /api/categories/:id responds 200', renamedCategory.status === 200);

  const categoryInUse = await curator.delete(`/api/categories/${museumCategory.id}`);
  check('deleting a category still in use is refused with 409', categoryInUse.status === 409,
    `got ${categoryInUse.status}`);

  const deletedCategory = await curator.delete(`/api/categories/${categoryId}`);
  check('an unused category can be deleted', deletedCategory.status === 200,
    `got ${deletedCategory.status}`);

  /* --- Admin flow -------------------------------------------------------- */
  section('Administrator flow');

  const admin = createClient('admin');
  const adminLogin = await admin.post('/api/auth/login', {
    email: 'admin@cityguide.test',
    password: 'Admin123!',
  });
  check('the seeded administrator can sign in', adminLogin.status === 200, `got ${adminLogin.status}`);
  check('the admin role is reported', dataOf(adminLogin)?.user?.role === 'admin');

  const overview = await admin.get('/api/admin/overview');
  check('GET /api/admin/overview responds 200', overview.status === 200);
  check('the overview reports user totals', typeof dataOf(overview)?.system?.users?.total === 'number');
  check('the overview includes recent activity', Array.isArray(dataOf(overview)?.recentActivity));

  const curatorOverviewAsAdmin = await admin.get('/api/curator/overview');
  check('an administrator may also use the curator dashboard', curatorOverviewAsAdmin.status === 200);

  const adminCreatesAttraction = await admin.post('/api/attractions', {
    name: `Admin Created ${unique}`,
    description: 'Created by an administrator to confirm the role can manage the catalogue.',
    categoryId: museumCategory.id,
    address: '1 Admin Street, London',
  });
  check('an administrator can create attractions', adminCreatesAttraction.status === 201,
    `got ${adminCreatesAttraction.status}`);

  const users = await admin.get('/api/admin/users?limit=50');
  check('GET /api/admin/users responds 200', users.status === 200);
  check('the user list includes the registered traveler',
    dataOf(users)?.items?.some((user) => user.email === travelerEmail));
  check('the user list reports per-user totals',
    dataOf(users)?.items?.every((user) => typeof user.itineraryCount === 'number'));

  const filteredUsers = await admin.get('/api/admin/users?role=curator');
  check('the user list filters by role',
    (dataOf(filteredUsers)?.items ?? []).every((user) => user.role === 'curator'));

  const searchedUsers = await admin.get('/api/admin/users?search=curator%40cityguide.test');
  check('the user list supports search', dataOf(searchedUsers)?.items?.length === 1,
    `got ${dataOf(searchedUsers)?.items?.length}`);

  // Promote a throwaway account, then put it back.
  const promoEmail = `e2e.promo.${unique}@example.com`;
  const promo = createClient('promo');
  await promo.post('/api/auth/register', {
    name: 'Promotion Candidate',
    email: promoEmail,
    password: 'Promote123!',
  });
  const promoId = dataOf(await promo.get('/api/auth/me'))?.user?.id;

  const promoted = await admin.patch(`/api/admin/users/${promoId}/role`, { role: 'curator' });
  check('an administrator can promote a traveler to curator', promoted.status === 200,
    `got ${promoted.status}`);
  check('the promotion persisted', dataOf(promoted)?.user?.role === 'curator');

  const demoted = await admin.patch(`/api/admin/users/${promoId}/role`, { role: 'traveler' });
  check('an administrator can demote back to traveler', demoted.status === 200);

  const selfDemotion = await admin.patch(`/api/admin/users/${dataOf(adminLogin)?.user?.id}/role`, {
    role: 'traveler',
  });
  check('demoting the last administrator is refused with 409', selfDemotion.status === 409,
    `got ${selfDemotion.status}`);

  const invalidRole = await admin.patch(`/api/admin/users/${promoId}/role`, { role: 'superuser' });
  check('an unknown role is rejected with 422', invalidRole.status === 422, `got ${invalidRole.status}`);

  const deletedUser = await admin.delete(`/api/admin/users/${promoId}`);
  check('an administrator can delete a user', deletedUser.status === 200, `got ${deletedUser.status}`);

  const selfDelete = await admin.delete(`/api/admin/users/${dataOf(adminLogin)?.user?.id}`);
  check('an administrator cannot delete their own account here', selfDelete.status === 422,
    `got ${selfDelete.status}`);

  /* --- Audit trail ------------------------------------------------------- */
  section('Audit trail and logging');

  const auditLogs = await admin.get('/api/admin/audit-logs?limit=100');
  const logs = dataOf(auditLogs)?.items ?? [];
  check('GET /api/admin/audit-logs responds 200', auditLogs.status === 200);
  check('the audit trail is populated', logs.length > 0, `got ${logs.length}`);

  const actions = new Set(logs.map((entry) => entry.action));
  for (const expected of [
    'attraction.create',
    'attraction.update',
    'category.create',
    'auth.login',
    'auth.register',
    'saved_place.create',
    'itinerary.create',
    'itinerary_item.reorder',
    'user.role_change',
    'geocode.lookup',
  ]) {
    check(`the audit trail records ${expected}`, actions.has(expected));
  }
  check('audit entries record the acting user',
    logs.some((entry) => entry.actor?.id && entry.actor?.name));
  check('audit entries never contain password material',
    !JSON.stringify(logs).includes('scrypt$') && !JSON.stringify(logs).includes(travelerPassword));

  const filteredLogs = await admin.get('/api/admin/audit-logs?action=attraction.create');
  check('audit logs can be filtered by action',
    (dataOf(filteredLogs)?.items ?? []).every((entry) => entry.action === 'attraction.create'));

  const auditActions = await admin.get('/api/admin/audit-logs/actions');
  check('distinct audit actions are listed', (dataOf(auditActions)?.actions ?? []).length > 0);

  /* --- Error handling ---------------------------------------------------- */
  section('Error handling and malformed input');

  const malformed = await fetch(`${BASE_URL}/api/attractions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ this is not json',
  });
  const malformedBody = await malformed.json();
  check('malformed JSON returns 400', malformed.status === 400, `got ${malformed.status}`);
  check('malformed JSON uses the error envelope', malformedBody?.success === false);
  check('malformed JSON does not leak a stack trace',
    !JSON.stringify(malformedBody).includes('at Object.'));

  const unknownRoute = await anon.get('/api/does-not-exist');
  check('an unknown API route returns 404', unknownRoute.status === 404, `got ${unknownRoute.status}`);
  check('unknown route errors are JSON, not HTML',
    unknownRoute.body?.success === false && errorOf(unknownRoute)?.code === 'NOT_FOUND');

  const badId = await anon.get('/api/attractions/not-a-number');
  check('a non-numeric id is rejected with 422', badId.status === 422, `got ${badId.status}`);

  const badLimit = await anon.get('/api/attractions?limit=5000');
  check('an out-of-range limit is rejected with 422', badLimit.status === 422, `got ${badLimit.status}`);

  const badSort = await anon.get('/api/attractions?sort=drop%20table');
  check('a non-whitelisted sort key is rejected with 422', badSort.status === 422, `got ${badSort.status}`);

  const injected = await anon.get("/api/attractions?search=%27%20OR%201%3D1%20--");
  check('SQL metacharacters in search are handled safely',
    injected.status === 200 && Array.isArray(dataOf(injected)?.items),
    `got ${injected.status}`);

  const wildcardSearch = await anon.get('/api/attractions?search=%25');
  check('a literal % search is treated as text, not a wildcard',
    dataOf(wildcardSearch)?.items?.length === 0,
    `got ${dataOf(wildcardSearch)?.items?.length}`);

  const badRoleHeader = await anon.get('/api/admin/users');
  check('an anonymous admin request returns 401, not 403', badRoleHeader.status === 401,
    `got ${badRoleHeader.status}`);

  /* --- Attribution ------------------------------------------------------- */
  section('External API attribution');

  const attribution = await anon.get('/api/location/attribution');
  check('attribution is served for map clients', Boolean(dataOf(attribution)?.attribution?.text));
  check('attribution names OpenStreetMap',
    (dataOf(attribution)?.attribution?.text ?? '').includes('OpenStreetMap'));

  /* --- Summary ----------------------------------------------------------- */
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Checks passed: ${passed}`);
  console.log(`Checks failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed checks:');
    for (const label of failures) console.log(`  - ${label}`);
  }
  console.log(`Finished: ${new Date().toISOString()}`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nVerification run crashed:', error);
  process.exit(1);
});
