/**
 * @module
 * Reading one named cookie off an incoming request. Generic transport plumbing: which cookie is a
 * credential is the caller's business (`@kernel/cookies` names the refresh token).
 */

import type { Request } from 'express';

/**
 * One named cookie off an incoming request.
 * @param request - the incoming request; only its parsed cookies are read, so any typed
 *   `Request<…>` a controller holds fits
 * @param name - the cookie's name
 * @returns the cookie's value, or `undefined` when it was never set or is not a plain string —
 *   cookie-parser turns a `j:`-prefixed value into parsed JSON, an object a caller must never
 *   see as a credential
 */
export const cookieOf = (request: Pick<Request, 'cookies'>, name: string): string | undefined => {
    // A single `as` to widen: the typed `cookies` hides that a `j:` cookie parses to an object.
    const value = (request.cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
};
