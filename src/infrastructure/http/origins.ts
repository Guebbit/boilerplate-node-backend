/**
 * @module
 * Which browser origins may call this API with credentials, in one place: the CORS middleware
 * (`app/security.ts`) and the origin guard (`./middlewares/origin.ts`) must agree, or a request CORS
 * would refuse in the browser could still act on the server.
 */

import { siteConfig } from './config';

/**
 * Whether `origin` is one `NODE_CORS_ORIGIN` lists (blank entries dropped, unset read as the
 * developer default, both by the field).
 * Read at call time, so a test that sets the variable afterwards is honoured.
 *
 * @param origin - an `Origin` header value
 */
export const isAllowedOrigin = (origin: string): boolean => {
    return siteConfig().NODE_CORS_ORIGIN.includes(origin);
};
