/**
 * @module
 * The two tenant ids the suite writes rows under — the demo defaults, read from the registry
 * rather than spelled, so a test cannot drift from what the service will accept.
 */

import { backendTenant, frontendTenant } from '../../tenants';

/** The demo backend tenant id, read live rather than spelled. */
export const BACKEND = backendTenant();

/** The demo frontend tenant id, read live rather than spelled. */
export const FRONTEND = frontendTenant();
