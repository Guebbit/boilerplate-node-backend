/**
 * @module
 * The session cookie: the account module's own credential, and the SSE-only auth path in
 * `middlewares/authorizations.ts`. Reading an arbitrary cookie is `@infrastructure/http/cookies`.
 */

import type { Request } from 'express';
import { cookieOf } from '@infrastructure/http/cookies';

/**
 * The session cookie's name — the credential every session-cookie read site consumes. One neutral
 * name for both session modes: in `jwt` mode it carries the refresh token, in `cookie` mode the
 * session id. The `__Host-` prefix makes a browser refuse the cookie unless it is `Secure`, has
 * `Path=/` and carries no `Domain`, so a sibling subdomain can neither set nor overwrite it.
 * https://developer.mozilla.org/docs/Web/HTTP/Cookies#cookie_prefixes
 */
export const SESSION_COOKIE = '__Host-session';

/** The session cookie on an incoming request — see {@link SESSION_COOKIE}. */
export const readSessionCookie = (request: Pick<Request, 'cookies'>): string | undefined =>
    cookieOf(request, SESSION_COOKIE);
