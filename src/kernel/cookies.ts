/**
 * @module
 * The refresh-token cookie: the account module's own credential, and the SSE-only auth path in
 * `middlewares/authorizations.ts`. Reading an arbitrary cookie is `@infrastructure/http/cookies`.
 */

import type { Request } from 'express';
import { cookieOf } from '@infrastructure/http/cookies';

/**
 * The refresh-token cookie name — the credential every refresh-cookie read site consumes. The
 * `__Host-` prefix makes a browser refuse the cookie unless it is `Secure`, has `Path=/` and
 * carries no `Domain`, so a sibling subdomain can neither set nor overwrite it.
 * https://developer.mozilla.org/docs/Web/HTTP/Cookies#cookie_prefixes
 */
export const REFRESH_COOKIE = '__Host-jwt';

/** The refresh-token cookie on an incoming request — see {@link REFRESH_COOKIE}. */
export const readRefreshCookie = (request: Pick<Request, 'cookies'>): string | undefined =>
    cookieOf(request, REFRESH_COOKIE);
