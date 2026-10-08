/**
 * Typed wrappers around every API resource.
 *
 * Components import from here rather than building paths by hand, so a route
 * change is a one-line edit and the request shapes stay documented.
 */
import { api, toQueryString } from './api.js';

/* -------------------------------------------------------------------------- */
/* Authentication                                                              */
/* -------------------------------------------------------------------------- */

export const authService = {
  /** Identity probe. Resolves `{ authenticated, user, stats }`. */
  me: () => api.get('/auth/me'),
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  logout: () => api.post('/auth/logout'),
};

/* -------------------------------------------------------------------------- */
/* Attractions                                                                 */
/* -------------------------------------------------------------------------- */

export const attractionService = {
  list: (params = {}, options) => api.get(`/attractions${toQueryString(params)}`, options),
  featured: (limit = 6, options) => api.get(`/attractions/featured?limit=${limit}`, options),
  recent: (limit = 3, options) => api.get(`/attractions/recent?limit=${limit}`, options),
  get: (id, options) => api.get(`/attractions/${id}`, options),
  stats: () => api.get('/attractions/stats'),
  create: (payload) => api.post('/attractions', payload),
  update: (id, payload) => api.patch(`/attractions/${id}`, payload),
  replace: (id, payload) => api.put(`/attractions/${id}`, payload),
  remove: (id) => api.delete(`/attractions/${id}`),
};

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export const categoryService = {
  list: (options) => api.get('/categories', options),
  get: (id) => api.get(`/categories/${id}`),
  create: (payload) => api.post('/categories', payload),
  update: (id, payload) => api.patch(`/categories/${id}`, payload),
  remove: (id) => api.delete(`/categories/${id}`),
};

/* -------------------------------------------------------------------------- */
/* Saved places                                                                */
/* -------------------------------------------------------------------------- */

export const savedPlaceService = {
  list: (params = {}) => api.get(`/saved-places${toQueryString(params)}`),
  save: (attractionId) => api.post('/saved-places', { attractionId }),
  remove: (savedPlaceId) => api.delete(`/saved-places/${savedPlaceId}`),
  /** Toggle helper: unsave by attraction, when the saved record id is unknown. */
  removeByAttraction: (attractionId) => api.delete(`/saved-places/attraction/${attractionId}`),
};

/* -------------------------------------------------------------------------- */
/* Itineraries                                                                 */
/* -------------------------------------------------------------------------- */

export const itineraryService = {
  list: () => api.get('/itineraries'),
  get: (id) => api.get(`/itineraries/${id}`),
  create: (payload) => api.post('/itineraries', payload),
  update: (id, payload) => api.patch(`/itineraries/${id}`, payload),
  remove: (id) => api.delete(`/itineraries/${id}`),

  listItems: (id) => api.get(`/itineraries/${id}/items`),
  addItem: (id, payload) => api.post(`/itineraries/${id}/items`, payload),
  removeItem: (id, itemId) => api.delete(`/itineraries/${id}/items/${itemId}`),
  /** Sends the complete new order; the API rejects partial payloads. */
  reorder: (id, itemIds) => api.patch(`/itineraries/${id}/items/order`, { itemIds }),
};

/* -------------------------------------------------------------------------- */
/* Location                                                                    */
/* -------------------------------------------------------------------------- */

export const locationService = {
  /** User-triggered address lookup, proxied through the backend. */
  geocode: (address) => api.post('/location/geocode', { address }),
  attribution: () => api.get('/location/attribution'),
};

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

export const userService = {
  profile: () => api.get('/users/profile'),
  updateProfile: (payload) => api.patch('/users/profile', payload),
  changePassword: (payload) => api.post('/users/profile/password', payload),
};

/* -------------------------------------------------------------------------- */
/* Curator and administrator                                                   */
/* -------------------------------------------------------------------------- */

export const curatorService = {
  overview: () => api.get('/curator/overview'),
};

export const adminService = {
  overview: () => api.get('/admin/overview'),
  users: (params = {}) => api.get(`/admin/users${toQueryString(params)}`),
  updateUserRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
  removeUser: (id) => api.delete(`/admin/users/${id}`),
  auditLogs: (params = {}) => api.get(`/admin/audit-logs${toQueryString(params)}`),
  auditActions: () => api.get('/admin/audit-logs/actions'),
  catalogueStats: () => api.get('/admin/catalogue-stats'),
};
