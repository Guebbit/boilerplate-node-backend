/**
 * @module
 * The two app ids the suite writes rows under — the demo defaults, read from the registry
 * rather than spelled, so a test cannot drift from what the service will accept.
 */

import { backendApp, frontendApp } from '../../apps';

/** The demo backend app id, read live rather than spelled. */
export const BACKEND = backendApp();

/** The demo frontend app id, read live rather than spelled. */
export const FRONTEND = frontendApp();
