/**
 * Validator unit tests.
 *
 * These cover the rules that are easy to get subtly wrong and expensive to get
 * wrong — particularly the distinction between an absent field ("leave
 * unchanged") and an explicit null ("clear this value"), which is what stops a
 * partial update from silently erasing data.
 *
 *   pnpm run test:unit
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  attractionCreateSchema,
  attractionListQuerySchema,
  attractionUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
} from '../../src/validators/attraction.validators.js';
import { loginSchema, registerSchema, updateProfileSchema } from '../../src/validators/auth.validators.js';
import {
  geocodeRequestSchema,
  itineraryCreateSchema,
  itineraryItemCreateSchema,
  itineraryReorderSchema,
  itineraryUpdateSchema,
  savedPlaceCreateSchema,
} from '../../src/validators/itinerary.validators.js';
import { formatIssues, idParam } from '../../src/validators/common.js';

/** A minimal valid attraction payload, overridable per test. */
function attractionPayload(overrides = {}) {
  return {
    name: 'City Museum',
    description: 'A fine museum of city history and design.',
    categoryId: 3,
    address: '1 Museum Way, Springfield',
    ...overrides,
  };
}

describe('attraction creation', () => {
  test('accepts a valid payload and coerces string coordinates', () => {
    const result = attractionCreateSchema.safeParse(
      attractionPayload({ latitude: '51.507351', longitude: '-0.127758' }),
    );

    assert.equal(result.success, true);
    assert.equal(result.data.latitude, 51.507351);
    assert.equal(result.data.longitude, -0.127758);
  });

  test('treats blank coordinates as "not geocoded"', () => {
    const result = attractionCreateSchema.safeParse(
      attractionPayload({ latitude: '', longitude: '' }),
    );

    assert.equal(result.success, true);
    assert.equal(result.data.latitude, null);
    assert.equal(result.data.longitude, null);
  });

  test('requires coordinates to be supplied as a pair', () => {
    const result = attractionCreateSchema.safeParse(
      attractionPayload({ latitude: '51.5', longitude: null }),
    );

    assert.equal(result.success, false);
    assert.match(formatIssues(result.error)[0].message, /both latitude and longitude/i);
  });

  test('rejects coordinates outside the valid range', () => {
    const latitude = attractionCreateSchema.safeParse(
      attractionPayload({ latitude: '151.5', longitude: '0' }),
    );
    assert.equal(latitude.success, false);
    assert.match(formatIssues(latitude.error)[0].message, /between -90 and 90/);

    const longitude = attractionCreateSchema.safeParse(
      attractionPayload({ latitude: '0', longitude: '200' }),
    );
    assert.equal(longitude.success, false);
    assert.match(formatIssues(longitude.error)[0].message, /between -180 and 180/);
  });

  test('rejects a non-numeric coordinate', () => {
    const result = attractionCreateSchema.safeParse(
      attractionPayload({ latitude: 'north', longitude: '0' }),
    );

    assert.equal(result.success, false);
    assert.match(formatIssues(result.error)[0].message, /must be a number/);
  });

  test('rejects image URLs that are not http(s)', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,<script>', 'not a url']) {
      const result = attractionCreateSchema.safeParse(attractionPayload({ imageUrl: value }));
      assert.equal(result.success, false, `should reject: ${value}`);
    }
  });

  test('accepts an https image URL', () => {
    const result = attractionCreateSchema.safeParse(
      attractionPayload({ imageUrl: 'https://example.org/photo.jpg' }),
    );

    assert.equal(result.success, true);
    assert.equal(result.data.imageUrl, 'https://example.org/photo.jpg');
  });

  test('strips unknown fields rather than passing them through', () => {
    const result = attractionCreateSchema.safeParse(
      attractionPayload({ role: 'admin', createdBy: 999 }),
    );

    assert.equal(result.success, true);
    assert.equal(result.data.role, undefined);
    assert.equal(result.data.createdBy, undefined);
  });
});

describe('attraction updates', () => {
  test('rejects an empty body', () => {
    assert.equal(attractionUpdateSchema.safeParse({}).success, false);
  });

  test('leaves omitted coordinates undefined so they are not overwritten', () => {
    const result = attractionUpdateSchema.safeParse({ name: 'Renamed Museum' });

    assert.equal(result.success, true);
    assert.equal(result.data.latitude, undefined);
    assert.equal(result.data.longitude, undefined);
    assert.equal(result.data.imageUrl, undefined);
  });

  test('distinguishes an explicit null (clear) from an omission (keep)', () => {
    const cleared = attractionUpdateSchema.safeParse({ latitude: null, longitude: null });

    assert.equal(cleared.success, true);
    assert.equal(cleared.data.latitude, null);
    assert.equal(cleared.data.longitude, null);
  });

  test('rejects updating only one coordinate', () => {
    assert.equal(attractionUpdateSchema.safeParse({ latitude: '51.5' }).success, false);
    assert.equal(attractionUpdateSchema.safeParse({ longitude: '-0.1' }).success, false);
  });

  test('rejects setting one coordinate while clearing the other', () => {
    assert.equal(
      attractionUpdateSchema.safeParse({ latitude: '51.5', longitude: null }).success,
      false,
    );
  });
});

describe('attraction list query', () => {
  test('applies documented defaults', () => {
    const result = attractionListQuerySchema.safeParse({});

    assert.equal(result.success, true);
    assert.equal(result.data.page, 1);
    assert.equal(result.data.limit, 12);
    assert.equal(result.data.sort, 'newest');
  });

  test('accepts every documented sort key', () => {
    for (const sort of ['newest', 'oldest', 'name_asc', 'name_desc', 'category', 'recently_updated']) {
      assert.equal(attractionListQuerySchema.safeParse({ sort }).success, true, sort);
    }
  });

  test('rejects a sort key that is not whitelisted', () => {
    // This is the guard that stops a client-supplied string reaching ORDER BY.
    assert.equal(attractionListQuerySchema.safeParse({ sort: 'name; DROP TABLE users' }).success, false);
  });

  test('rejects an out-of-range limit', () => {
    assert.equal(attractionListQuerySchema.safeParse({ limit: '5000' }).success, false);
    assert.equal(attractionListQuerySchema.safeParse({ limit: '0' }).success, false);
  });
});

describe('authentication', () => {
  test('normalises email casing and whitespace on registration', () => {
    const result = registerSchema.safeParse({
      name: 'Ada Lovelace',
      email: '  ADA@Example.COM ',
      password: 'Passw0rd!',
    });

    assert.equal(result.success, true);
    assert.equal(result.data.email, 'ada@example.com');
  });

  test('enforces the documented password rules', () => {
    const tooShort = registerSchema.safeParse({
      name: 'Ada',
      email: 'a@b.com',
      password: 'short',
    });
    assert.equal(tooShort.success, false);

    const noNumber = registerSchema.safeParse({
      name: 'Ada',
      email: 'a@b.com',
      password: 'onlyletters',
    });
    assert.equal(noNumber.success, false);

    const noLetter = registerSchema.safeParse({
      name: 'Ada',
      email: 'a@b.com',
      password: '12345678',
    });
    assert.equal(noLetter.success, false);
  });

  test('rejects an invalid email address', () => {
    assert.equal(
      registerSchema.safeParse({ name: 'Ada', email: 'not-an-email', password: 'Passw0rd!' }).success,
      false,
    );
  });

  test('does not impose password complexity at sign-in', () => {
    // Rejecting a short password at login would reveal which inputs are valid.
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'x' });
    assert.equal(result.success, true);
  });

  test('requires at least one field for a profile update', () => {
    assert.equal(updateProfileSchema.safeParse({}).success, false);
    assert.equal(updateProfileSchema.safeParse({ name: 'New Name' }).success, true);
  });
});

describe('categories', () => {
  test('accepts a name and optional description', () => {
    assert.equal(categoryCreateSchema.safeParse({ name: 'Historical' }).success, true);
    assert.equal(categoryCreateSchema.safeParse({ name: 'H', }).success, false);
  });

  test('converts a blank description to null and preserves omission on update', () => {
    const created = categoryCreateSchema.safeParse({ name: 'Food', description: '   ' });
    assert.equal(created.success, true);
    assert.equal(created.data.description, null);

    const updated = categoryUpdateSchema.safeParse({ name: 'Food and drink' });
    assert.equal(updated.success, true);
    assert.equal(updated.data.description, undefined);
  });

  test('rejects an empty category update', () => {
    assert.equal(categoryUpdateSchema.safeParse({}).success, false);
  });
});

describe('itineraries', () => {
  test('creates with a name and optional description', () => {
    assert.equal(itineraryCreateSchema.safeParse({ name: 'Day One' }).success, true);
    assert.equal(itineraryCreateSchema.safeParse({ name: 'D' }).success, false);
  });

  test('rejects an empty update but allows a name-only update', () => {
    assert.equal(itineraryUpdateSchema.safeParse({}).success, false);
    assert.equal(itineraryUpdateSchema.safeParse({ name: 'Day Two' }).success, true);
  });

  test('accepts an item with or without an insertion position', () => {
    assert.equal(itineraryItemCreateSchema.safeParse({ attractionId: 4 }).success, true);
    assert.equal(itineraryItemCreateSchema.safeParse({ attractionId: 4, position: 0 }).success, true);
    assert.equal(itineraryItemCreateSchema.safeParse({ attractionId: 4, position: -1 }).success, false);
  });

  test('accepts a reorder payload of unique ids', () => {
    const result = itineraryReorderSchema.safeParse({ itemIds: [3, 1, 2] });
    assert.equal(result.success, true);
  });

  test('rejects duplicate ids in a reorder payload', () => {
    assert.equal(itineraryReorderSchema.safeParse({ itemIds: [1, 1, 2] }).success, false);
  });

  test('rejects an empty or non-array reorder payload', () => {
    assert.equal(itineraryReorderSchema.safeParse({ itemIds: [] }).success, false);
    assert.equal(itineraryReorderSchema.safeParse({ itemIds: 'abc' }).success, false);
    assert.equal(itineraryReorderSchema.safeParse({}).success, false);
  });

  test('rejects a reorder payload beyond the item ceiling', () => {
    const tooMany = Array.from({ length: 201 }, (_, index) => index + 1);
    assert.equal(itineraryReorderSchema.safeParse({ itemIds: tooMany }).success, false);
  });
});

describe('saved places and geocoding', () => {
  test('requires a positive integer attraction id', () => {
    assert.equal(savedPlaceCreateSchema.safeParse({ attractionId: 3 }).success, true);
    assert.equal(savedPlaceCreateSchema.safeParse({ attractionId: '3' }).success, true);
    assert.equal(savedPlaceCreateSchema.safeParse({ attractionId: 0 }).success, false);
    assert.equal(savedPlaceCreateSchema.safeParse({ attractionId: -1 }).success, false);
    assert.equal(savedPlaceCreateSchema.safeParse({ attractionId: 'abc' }).success, false);
  });

  test('requires a usable address for a lookup', () => {
    assert.equal(geocodeRequestSchema.safeParse({ address: 'Tower Bridge, London' }).success, true);
    assert.equal(geocodeRequestSchema.safeParse({ address: 'ab' }).success, false);
    assert.equal(geocodeRequestSchema.safeParse({}).success, false);
  });
});

describe('route parameters', () => {
  test('coerces numeric ids and rejects anything else', () => {
    assert.equal(idParam.safeParse('12').data, 12);
    assert.equal(idParam.safeParse(12).data, 12);
    assert.equal(idParam.safeParse('0').success, false);
    assert.equal(idParam.safeParse('-4').success, false);
    assert.equal(idParam.safeParse('1.5').success, false);
    assert.equal(idParam.safeParse('abc').success, false);
  });
});

describe('error formatting', () => {
  test('reports a field path for each issue so forms can highlight inputs', () => {
    const result = attractionCreateSchema.safeParse({ name: 'X' });
    assert.equal(result.success, false);

    const issues = formatIssues(result.error);
    assert.ok(issues.length > 0);

    const nameIssue = issues.find((issue) => issue.field === 'name');
    assert.ok(nameIssue, 'expected an issue keyed to the name field');
    assert.match(nameIssue.message, /at least 2 characters/);
  });
});
