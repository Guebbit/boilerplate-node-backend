/**
 * @module
 * Generic single-cookie access for the small number of places across modules that read one
 * named cookie off an incoming request — the refresh token above all, since it is both the
 * account module's own credential and the SSE-only auth path in `middlewares/authorizations.ts`.
 */

import type { Request } from 'express';

/** The refresh-token cookie name — the credential every refresh-cookie read site consumes. */
export const REFRESH_COOKIE = 'jwt';

/**
 * One named cookie off an incoming request.
 * @param request - the incoming request
 * @param name - the cookie's name
 * @returns the cookie's value, or `undefined` when it was never set
 */
export const cookieOf = (request: Request, name: string): string | undefined =>
    (request.cookies as Record<string, string | undefined>)[name];

/** The refresh-token cookie on an incoming request — see {@link REFRESH_COOKIE}. */
export const readRefreshCookie = (request: Request): string | undefined =>
    cookieOf(request, REFRESH_COOKIE);
