import { createApiClient } from '../api.js';
import { endpoints } from '../endpoints.js';
import { authStore } from '../../stores/authStore.js';

/**
 * Process-wide singleton API client. All service modules share this so that
 * concurrent 401s on different endpoints collapse into a single refresh via
 * the api client's `inflightRefresh` promise.
 */
export const apiClient = createApiClient({
  tokens: authStore,
  refreshUrl: endpoints.refreshToken(),
});
