import type { NextFunction, Request, Response } from 'express';
import { createLocaleContext, negotiateLocale, runWithLocaleContext } from '@infrastructure/i18n';

/**
 * Negotiates the request's language and runs the rest of the chain inside it.
 *
 * `request.locale` / `request.t` are the explicit form, for a handler that prefers to name what it
 * is resolving against; everything else — services, repositories, Zod thunks — just imports `t`
 * from `@infrastructure/i18n` and gets the same binding ambiently (see that module for how, and for
 * where it stops working).
 *
 * Mounted before the routes. It must run after nothing in particular, but every handler that
 * produces user-facing copy must run after IT.
 *
 * Two response headers, both about caches:
 * - `Content-Language` states what the client actually got, which may not be what it asked for.
 * - `Vary: Accept-Language` tells any cache in front of the API that this header selects the body.
 *   Without it a shared cache answers an Italian request with the English copy it stored a moment
 *   earlier — the same fault the `Vary: Authorization` note in `cache.ts` describes, with a
 *   different header. `response.vary` appends, so CORS's `Vary: Origin` survives.
 */
export const attachLocale = (request: Request, response: Response, next: NextFunction): void => {
    const context = createLocaleContext(negotiateLocale(request.get('accept-language')));

    // On the request for code that has one to hand...
    request.locale = context.locale;
    request.t = context.t;

    response.set('Content-Language', context.locale);
    response.vary('Accept-Language');

    // ...and in async-local storage for code that does not — workers, services, deep helpers.
    runWithLocaleContext(context, next);
};
