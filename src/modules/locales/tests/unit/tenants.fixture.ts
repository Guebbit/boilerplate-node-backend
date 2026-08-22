/**
 * The two tenant ids the suite writes rows under — the demo defaults, read from the registry
 * rather than spelled, so a test cannot drift from what the service will accept.
 */
import { backendTenant, frontendTenant } from '../../tenants';

export const BACKEND = backendTenant();
export const FRONTEND = frontendTenant();
