/**
 * @module
 * Which browser origins may call this API with credentials, in one place: the CORS middleware
 * (`app/security.ts`) and the origin guard (`./middlewares/origin.ts`) must agree, or a request CORS
 * would refuse in the browser could still act on the server.
 */

import { siteConfig } from './config';

/** What an unset `NODE_CORS_ORIGIN` allows, for a developer machine. */
const DEFAULT_ORIGIN = 'http://localhost:8080';

/**
 * Whether `origin` is one `NODE_CORS_ORIGIN` lists (blank entries already dropped by the field).
 * Read at call time, so a test that sets the variable afterwards is honoured.
 *
 * @param origin - an `Origin` header value
 */
export const isAllowedOrigin = (origin: string): boolean => {
    const listed = siteConfig().NODE_CORS_ORIGIN;
    return (listed.length > 0 ? listed : [DEFAULT_ORIGIN]).includes(origin);
};
