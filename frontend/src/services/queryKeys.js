/**
 * Query keys.
 *
 * Centralised so that mutations invalidate exactly the right caches instead of
 * guessing at string literals across components.
 */
export const queryKeys = {
  me: ['me'],
  profile: ['profile'],

  attractions: (params) => ['attractions', params ?? {}],
  attraction: (id) => ['attraction', String(id)],
  featuredAttractions: ['attractions', 'featured'],
  recentAttractions: ['attractions', 'recent'],
  attractionStats: ['attractions', 'stats'],

  categories: ['categories'],

  savedPlaces: (params) => ['saved-places', params ?? {}],
  itineraries: ['itineraries'],
  itinerary: (id) => ['itinerary', String(id)],

  curatorOverview: ['curator', 'overview'],
  adminOverview: ['admin', 'overview'],
  adminUsers: (params) => ['admin', 'users', params ?? {}],
  adminAuditLogs: (params) => ['admin', 'audit-logs', params ?? {}],
  adminAuditActions: ['admin', 'audit-logs', 'actions'],
  adminCatalogueStats: ['admin', 'catalogue-stats'],
};
