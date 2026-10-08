/**
 * One-time seed-data generator (development tool, not part of the running app).
 *
 * The application's database is the source of truth for attractions and never
 * calls an external API to render them. This script exists only to populate
 * that database with accurate data: for each landmark it asks the Wikipedia
 * REST API for the article summary, and takes the real coordinates, a lead
 * image hosted on Wikimedia, and a short factual extract.
 *
 * Its output is committed as `database/seed/attractions.json`, so nothing here
 * runs at build or request time. Re-run it only to refresh the catalogue:
 *
 *   node backend/scripts/resolve-attraction-data.mjs
 *
 * Wikipedia asks API clients to identify themselves:
 * https://meta.wikimedia.org/wiki/User-Agent_policy
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const outputFile = path.resolve(currentDir, '..', '..', 'database', 'seed', 'attractions.json');

const USER_AGENT =
  'CityGuideSeedGenerator/1.0 (tourism itinerary demo app; contact: cityguide-app@example.com)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The curated catalogue. `wikipedia` is the article title used to resolve
 * coordinates and imagery; `address` and `category` are authored by hand.
 */
const CATALOGUE = [
  {
    slug: 'british-museum',
    name: 'British Museum',
    category: 'Museum',
    address: 'Great Russell Street, Bloomsbury, London WC1B 3DG',
    wikipedia: 'British Museum',
    imageAlt: 'The colonnaded Greek Revival facade of the British Museum',
  },
  {
    slug: 'tate-modern',
    name: 'Tate Modern',
    category: 'Museum',
    address: 'Bankside, London SE1 9TG',
    wikipedia: 'Tate Modern',
    imageAlt: 'The Tate Modern housed in the former Bankside Power Station',
  },
  {
    slug: 'national-gallery',
    name: 'National Gallery',
    category: 'Museum',
    address: 'Trafalgar Square, London WC2N 5DN',
    wikipedia: 'National Gallery',
    imageAlt: 'The neoclassical facade of the National Gallery on Trafalgar Square',
  },
  {
    slug: 'natural-history-museum',
    name: 'Natural History Museum',
    category: 'Museum',
    address: 'Cromwell Road, South Kensington, London SW7 5BD',
    wikipedia: 'Natural History Museum, London',
    imageAlt: 'The Romanesque terracotta entrance of the Natural History Museum',
  },
  {
    slug: 'victoria-and-albert-museum',
    name: 'Victoria and Albert Museum',
    category: 'Museum',
    address: 'Cromwell Road, South Kensington, London SW7 2RL',
    wikipedia: 'Victoria and Albert Museum',
    imageAlt: 'The Victorian facade of the Victoria and Albert Museum',
  },
  {
    slug: 'tower-of-london',
    name: 'Tower of London',
    category: 'Historical',
    address: 'London EC3N 4AB',
    wikipedia: 'Tower of London',
    imageAlt: 'The White Tower at the centre of the Tower of London',
  },
  {
    slug: 'westminster-abbey',
    name: "Westminster Abbey",
    category: 'Religious',
    address: "Dean's Yard, London SW1P 3PA",
    wikipedia: 'Westminster Abbey',
    imageAlt: 'The gothic west front of Westminster Abbey',
  },
  {
    slug: 'st-pauls-cathedral',
    name: "St Paul's Cathedral",
    category: 'Religious',
    address: "St Paul's Churchyard, London EC4M 8AD",
    wikipedia: "St Paul's Cathedral",
    imageAlt: "The dome of St Paul's Cathedral seen from Ludgate Hill",
  },
  {
    slug: 'buckingham-palace',
    name: 'Buckingham Palace',
    category: 'Historical',
    address: 'London SW1A 1AA',
    wikipedia: 'Buckingham Palace',
    imageAlt: 'The east front of Buckingham Palace',
  },
  {
    slug: 'palace-of-westminster',
    name: 'Palace of Westminster and Big Ben',
    category: 'Historical',
    address: 'Westminster, London SW1A 0AA',
    wikipedia: 'Palace of Westminster',
    imageAlt: 'The Palace of Westminster and the Elizabeth Tower',
  },
  {
    slug: 'hyde-park',
    name: 'Hyde Park',
    category: 'Nature',
    address: 'London W2 2UH',
    wikipedia: 'Hyde Park, London',
    imageAlt: 'The Serpentine lake in Hyde Park',
  },
  {
    slug: 'regents-park',
    name: "Regent's Park",
    category: 'Nature',
    address: "London NW1 4NR",
    wikipedia: "Regent's Park",
    imageAlt: "Boating lake and gardens in Regent's Park",
  },
  {
    slug: 'kew-gardens',
    name: 'Royal Botanic Gardens, Kew',
    category: 'Nature',
    address: 'Richmond, London TW9 3AB',
    wikipedia: 'Kew Gardens',
    imageAlt: 'The Palm House at Kew Gardens',
  },
  {
    slug: 'hampstead-heath',
    name: 'Hampstead Heath',
    category: 'Nature',
    address: 'London NW3 2QD',
    wikipedia: 'Hampstead Heath',
    imageAlt: 'Open grassland and ancient trees on Hampstead Heath',
  },
  {
    slug: 'the-shard',
    name: 'The Shard',
    category: 'Entertainment',
    address: '32 London Bridge Street, London SE1 9SG',
    wikipedia: 'The Shard',
    imageAlt: 'The Shard rising above London Bridge',
  },
  {
    slug: 'london-eye',
    name: 'London Eye',
    category: 'Entertainment',
    address: 'Riverside Building, County Hall, London SE1 7PB',
    wikipedia: 'London Eye',
    imageAlt: 'The London Eye observation wheel on the South Bank',
  },
  {
    slug: 'camden-market',
    name: 'Camden Market',
    category: 'Shopping',
    address: 'Camden Lock Place, London NW1 8AF',
    wikipedia: 'Camden Market',
    imageAlt: 'Market stalls beside the Regent\u2019s Canal at Camden Lock',
  },
  {
    slug: 'borough-market',
    name: 'Borough Market',
    category: 'Food',
    address: '8 Southwark Street, London SE1 1TL',
    wikipedia: 'Borough Market',
    imageAlt: 'Traders\u2019 stalls under the railway arches at Borough Market',
  },
  {
    slug: 'covent-garden',
    name: 'Covent Garden',
    category: 'Shopping',
    address: 'London WC2E 8RF',
    wikipedia: 'Covent Garden',
    imageAlt: 'The covered market hall at Covent Garden',
  },
  {
    slug: 'shakespeares-globe',
    name: "Shakespeare's Globe",
    category: 'Cultural',
    address: '21 New Globe Walk, London SE1 9DT',
    wikipedia: "Shakespeare's Globe",
    imageAlt: "The thatched open-air auditorium of Shakespeare's Globe",
  },
  {
    slug: 'royal-albert-hall',
    name: 'Royal Albert Hall',
    category: 'Cultural',
    address: 'Kensington Gore, London SW7 2AP',
    wikipedia: 'Royal Albert Hall',
    imageAlt: 'The elliptical auditorium exterior of the Royal Albert Hall',
  },
  {
    slug: 'royal-observatory-greenwich',
    name: 'Royal Observatory, Greenwich',
    category: 'Historical',
    address: 'Blackheath Avenue, Greenwich, London SE10 8XJ',
    wikipedia: 'Royal Observatory, Greenwich',
    imageAlt: 'The Royal Observatory on the hill in Greenwich Park',
  },
  {
    slug: 'the-o2',
    name: 'The O2',
    category: 'Entertainment',
    address: 'Peninsula Square, London SE10 0DX',
    wikipedia: 'The O2 Arena',
    imageAlt: 'The dome of The O2 arena in Greenwich',
    commonsSearch: 'The O2 Arena London dome',
  },
  {
    slug: 'queen-elizabeth-olympic-park',
    name: 'Queen Elizabeth Olympic Park',
    category: 'Adventure',
    address: 'Stratford, London E20 2ST',
    wikipedia: 'Queen Elizabeth Olympic Park',
    imageAlt: 'The Queen Elizabeth Olympic Park with the stadium in view',
  },
  {
    slug: 'sky-garden',
    name: 'Sky Garden',
    category: 'Entertainment',
    address: '1 Sky Garden Walk, London EC3M 8AF',
    wikipedia: 'Sky Garden',
    imageAlt: 'The glass Sky Garden atrium above the City of London',
    // The Wikipedia article carries no machine-readable coordinates, so the
    // position of the host building (20 Fenchurch Street) is supplied directly.
    coordinates: { lat: 51.5112, lon: -0.0834 },
    commonsSearch: 'Sky Garden London Fenchurch',
  },
  {
    slug: 'brick-lane',
    name: 'Brick Lane',
    category: 'Food',
    address: 'Brick Lane, Spitalfields, London E1 6QL',
    wikipedia: 'Brick Lane',
    imageAlt: 'Street art and market stalls along Brick Lane',
  },
];

/** Wikimedia blocks generic clients; a descriptive UA is required. */
async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, '_'),
  )}?redirect=true`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Fallback image lookup.
 *
 * The REST summary omits a lead image for a few articles, but the MediaWiki
 * `pageimages` property usually still has one.
 */
async function fetchPageImage(title) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'original|thumbnail');
  url.searchParams.set('pithumbsize', '1200');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;

  const payload = await response.json();
  const pages = payload?.query?.pages ?? {};
  const first = Object.values(pages)[0];
  return first?.original?.source ?? first?.thumbnail?.source ?? null;
}

/**
 * Last-resort image lookup: search Wikimedia Commons directly.
 *
 * Used for articles whose own lead image is not freely licensed and therefore
 * is not exposed through `pageimages`.
 */
async function searchCommons(term) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', term);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', '8');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|mime');
  url.searchParams.set('iiurlwidth', '1280');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;

  const payload = await response.json();
  const pages = Object.values(payload?.query?.pages ?? {});

  // Prefer a photographic format over diagrams or maps.
  const candidate = pages.find((page) => /jpeg|jpg|png/i.test(page?.imageinfo?.[0]?.mime ?? ''));
  return candidate?.imageinfo?.[0]?.thumburl ?? candidate?.imageinfo?.[0]?.url ?? null;
}

/** Removes the tracking query string Wikipedia appends to image URLs. */
function cleanImageUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.search = '';
    return url.toString();
  } catch {
    return value;
  }
}

async function resolveOne(entry) {
  const summary = await fetchSummary(entry.wikipedia);

  // Authored overrides win; otherwise use the article's coordinates.
  const latitude = entry.coordinates?.lat ?? summary.coordinates?.lat ?? null;
  const longitude = entry.coordinates?.lon ?? summary.coordinates?.lon ?? null;

  if (latitude === null || longitude === null) {
    throw new Error('no coordinates in the article summary');
  }

  // The lead image is served from upload.wikimedia.org and is stable.
  let imageUrl = summary.originalimage?.source ?? summary.thumbnail?.source ?? null;
  if (!imageUrl) imageUrl = await fetchPageImage(entry.wikipedia);
  if (!imageUrl && entry.commonsSearch) imageUrl = await searchCommons(entry.commonsSearch);

  return {
    slug: entry.slug,
    name: entry.name,
    category: entry.category,
    address: entry.address,
    latitude,
    longitude,
    imageUrl: cleanImageUrl(entry.imageUrl ?? imageUrl),
    imageAlt: entry.imageAlt,
    description: summary.extract,
    wikipedia: summary.content_urls?.desktop?.page ?? null,
  };
}

async function main() {
  const results = [];
  const failures = [];

  for (const entry of CATALOGUE) {
    try {
      const resolved = await resolveOne(entry);
      results.push(resolved);
      console.log(
        `ok    ${resolved.name.padEnd(38)} ${resolved.latitude.toFixed(4)}, ${resolved.longitude.toFixed(4)}  img:${resolved.imageUrl ? 'yes' : 'NO'}`,
      );
    } catch (error) {
      failures.push({ entry, message: error.message });
      console.log(`FAIL  ${entry.name}: ${error.message}`);
    }

    // Be polite to the Wikimedia API.
    await sleep(250);
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(
    outputFile,
    `${JSON.stringify(
      {
        generatedBy: 'backend/scripts/resolve-attraction-data.mjs',
        generatedAt: new Date().toISOString(),
        sources: {
          coordinates: 'Wikipedia REST API article summary (coordinates field)',
          images: 'Wikimedia Commons lead images served from upload.wikimedia.org',
          descriptions: 'Wikipedia article extracts (CC BY-SA 4.0)',
          attribution: 'https://www.wikipedia.org/ and https://commons.wikimedia.org/',
        },
        attractions: results,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\nWrote ${results.length} attractions to ${outputFile}`);
  if (failures.length) {
    console.log(`${failures.length} entr(ies) failed and were skipped:`);
    for (const failure of failures) console.log(`  - ${failure.entry.name}: ${failure.message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Generator failed:', error);
  process.exit(1);
});
