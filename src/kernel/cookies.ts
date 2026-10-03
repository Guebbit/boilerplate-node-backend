/**
 * @module
 * The refresh-token cookie: the account module's own credential, and the SSE-only auth path in
 * `middlewares/authorizations.ts`. Reading an arbitrary cookie is `@infrastructure/http/cookies`.
 */

import type { Request } from 'express';
import { cookieOf } from '@infrastructure/http/cookies';

/** The refresh-token cookie name — the credential every refresh-cookie read site consumes. */
export const REFRESH_COOKIE = 'jwt';

/** The refresh-token cookie on an incoming request — see {@link REFRESH_COOKIE}. */
export const readRefreshCookie = (request: Pick<Request, 'cookies'>): string | undefined =>
    cookieOf(request, REFRESH_COOKIE);
